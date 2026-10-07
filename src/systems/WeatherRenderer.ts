import * as THREE from 'three';
import {sampleAtmosphere,type Atmosphere} from '../world/Atmosphere';
import type {WeatherSnapshot} from './WeatherState';
import {createSeededRandom} from '../utils/random';

const GRID=64,SPAN=64,MAX_DROPS=1200;
export class WeatherRenderer {
  private geometry=new THREE.InstancedBufferGeometry();
  private heights=new Float32Array(GRID*GRID);
  private ground=new THREE.DataTexture(this.heights,GRID,GRID,THREE.RedFormat,THREE.FloatType);
  private material:THREE.ShaderMaterial;
  private rain:THREE.Mesh;
  private gridX=Infinity;private gridZ=Infinity;
  private last:Atmosphere|null=null;private rebuilds=0;
  constructor(private scene:THREE.Scene,private sun:THREE.DirectionalLight,private fill:THREE.DirectionalLight,
    private hemisphere:THREE.HemisphereLight,private setSky:(view:Atmosphere)=>void,
    private heightAt:(x:number,z:number)=>number,private roofs:THREE.Box3[]){
    this.ground.minFilter=this.ground.magFilter=THREE.NearestFilter;this.ground.needsUpdate=true;
    this.geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.5,0,0,.5,0,0,.5,1,0,-.5,1,0],3));
    this.geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));this.geometry.setIndex([0,1,2,0,2,3]);
    const rng=createSeededRandom(62091),seeds=new Float32Array(MAX_DROPS*4);
    for(let i=0;i<seeds.length;i++)seeds[i]=rng();this.geometry.setAttribute('aSeed',new THREE.InstancedBufferAttribute(seeds,4));
    this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,toneMapped:false,
      uniforms:{uTime:{value:0},uOrigin:{value:new THREE.Vector3()},uCamera:{value:new THREE.Vector3()},uRain:{value:0},uDay:{value:1},uGround:{value:this.ground},uGrid:{value:new THREE.Vector2()},uSpeed:{value:1}},
      vertexShader:`attribute vec4 aSeed;uniform float uTime,uRain,uSpeed;uniform vec3 uOrigin,uCamera;varying vec2 vUv;varying vec3 vWorld;
       void main(){vec3 fall=vec3(-2.,-22.,-.8);float age=fract(aSeed.z+uTime*(15.+aSeed.w*10.)*uSpeed/30.);
        vec3 center=uOrigin+vec3((aSeed.x-.5)*42.,24.-age*30.,(aSeed.y-.5)*42.)+vec3(-2.,0.,-.8)*age*30./22.;
        vec3 side=cross(normalize(fall),normalize(uCamera-center));if(length(side)<.001)side=vec3(1.,0.,0.);else side=normalize(side);
        vWorld=center+side*position.x*.038+normalize(fall)*position.y*(.6+uRain*.75);vUv=uv;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,
      fragmentShader:`uniform sampler2D uGround;uniform vec2 uGrid;uniform float uRain,uDay;varying vec2 vUv;varying vec3 vWorld;
        void main(){vec2 uv=(vWorld.xz-uGrid)/64.+.5;float ceiling=texture2D(uGround,clamp(uv,0.,1.)).r;
         if(vWorld.y<ceiling+.08)discard;float alpha=(1.-abs(vUv.x-.5)*2.)*sin(vUv.y*3.14159)*(.13+uRain*.16);
         gl_FragColor=vec4(mix(vec3(.18,.29,.43),vec3(.56,.68,.75),uDay),alpha);
         #include <colorspace_fragment>
        }`});
    this.rain=new THREE.Mesh(this.geometry,this.material);this.rain.name='OriginalWeatherRain';this.rain.frustumCulled=false;this.rain.renderOrder=5;this.rain.visible=false;scene.add(this.rain);
  }
  update(weather:WeatherSnapshot,position:THREE.Vector3,camera:THREE.Vector3,reduced:boolean,quality:string){
    const a=this.last=sampleAtmosphere(weather);this.setSky(a);
    const solar=a.sun.y>=0,keyIntensity=solar?2.45*THREE.MathUtils.smoothstep(a.sun.y,.015,.25):.26*THREE.MathUtils.smoothstep(-a.sun.y,.02,.16);
    this.sun.target.position.copy(position);this.sun.position.copy(position).addScaledVector(solar?a.sun:a.moon,100);this.sun.target.updateMatrixWorld();
    this.sun.color.copy(solar?a.sunColor:new THREE.Color('#adcaed'));this.sun.intensity=keyIntensity*(1-weather.cloudCover*.18)*(1-weather.rain*.32);
    this.fill.target.position.copy(position);this.fill.position.copy(position).add(new THREE.Vector3(84,32,-25));this.fill.target.updateMatrixWorld();this.fill.intensity=.4-a.day*.08;
    this.hemisphere.color.copy(a.skyLight);this.hemisphere.groundColor.set(a.day>.2?'#908470':'#4c5367');this.hemisphere.intensity=.65+a.day*.47;
    this.scene.environmentIntensity=.11+a.day*.29;
    if(this.scene.fog){this.scene.fog.color.copy(a.fog);if(this.scene.fog instanceof THREE.FogExp2)this.scene.fog.density=.00075+weather.rain*.0008;}
    if(this.scene.background instanceof THREE.Color)this.scene.background.copy(a.fog);
    const u=this.material.uniforms;u.uTime.value=weather.weatherClock;u.uOrigin.value.copy(position);u.uCamera.value.copy(camera);u.uRain.value=weather.rain;u.uDay.value=a.day;u.uSpeed.value=reduced?.65:1;
    this.geometry.instanceCount=Math.ceil(MAX_DROPS*weather.rain*(quality==='low'?.4:1)*(reduced?.55:1));this.rain.visible=weather.rain>.015;
    if(this.rain.visible)this.updateGround(position);
  }
  private updateGround(p:THREE.Vector3){
    const x=Math.floor(p.x/4)*4,z=Math.floor(p.z/4)*4;if(x===this.gridX&&z===this.gridZ)return;
    this.gridX=x;this.gridZ=z;this.rebuilds++;this.material.uniforms.uGrid.value.set(x,z);
    const nearby=this.roofs.filter(b=>b.max.x>=x-SPAN/2&&b.min.x<=x+SPAN/2&&b.max.z>=z-SPAN/2&&b.min.z<=z+SPAN/2);
    for(let j=0;j<GRID;j++)for(let i=0;i<GRID;i++){
      const px=x+((i+.5)/GRID-.5)*SPAN,pz=z+((j+.5)/GRID-.5)*SPAN;
      let y=Math.max(0,this.heightAt(px,pz));
      for(const roof of nearby)if(px>=roof.min.x&&px<=roof.max.x&&pz>=roof.min.z&&pz<=roof.max.z)y=Math.max(y,roof.max.y);
      this.heights[j*GRID+i]=y;
    }this.ground.needsUpdate=true;
  }
  surfaceAt(x:number,z:number){let y=Math.max(0,this.heightAt(x,z));for(const box of this.roofs)if(x>=box.min.x&&x<=box.max.x&&z>=box.min.z&&z<=box.max.z)y=Math.max(y,box.max.y);return y;}
  diagnostics(){const a=this.last;return {day:a?.day??1,sunY:a?.sun.y??0,moonDirection:a?{x:a.moon.x,y:a.moon.y,z:a.moon.z}:null,rainVisible:this.rain.visible,rainDrops:this.geometry.instanceCount,gridRebuilds:this.rebuilds,rainOrigin:{x:this.material.uniforms.uOrigin.value.x,y:this.material.uniforms.uOrigin.value.y,z:this.material.uniforms.uOrigin.value.z}};}
  dispose(){this.scene.remove(this.rain);this.geometry.dispose();this.material.dispose();this.ground.dispose();}
}

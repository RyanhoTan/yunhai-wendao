import * as THREE from 'three';
import { COAST_GLSL } from './CoastMath';
import {WEATHER_SKY_GLSL,type Atmosphere} from './Atmosphere';
import {moonTextureRotation} from '../assets/EmotiveMoon';

const SKY_GLSL=WEATHER_SKY_GLSL;

/** Original coast; Moon uses the user's requested source appearance and color map. */
export function createCoastalEnvironment(root: THREE.Group, heightAt: (x: number, z: number) => number,moonTexture:THREE.Texture) {
  const sun = new THREE.Vector3(-.84, .46, .25).normalize();
  const uniforms = { uTime: { value: 0 },uWeatherTime:{value:0}, uSun: { value: sun },
    uMoon:{value:new THREE.Vector3(.7,.3,-.2).normalize()},uDay:{value:1},uTwilight:{value:0},uCloudCover:{value:.42},uRain:{value:0},
    uMoonColorMap:{value:moonTexture},uMoonTextureRotation:{value:moonTextureRotation()} };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4500, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms,
    vertexShader: 'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec3 vDirection;uniform float uWeatherTime;${COAST_GLSL}${SKY_GLSL}
      void main(){gl_FragColor=vec4(coastSky(vDirection,uWeatherTime),1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  }));
  sky.name = 'OriginalCoastalSky'; sky.frustumCulled = false; sky.renderOrder = -100;
  root.add(sky);

  // The terrain mesh is the same height function that places the character's feet.
  const sandXs=[-2400,-1200,-650,-400];for(let x=-320;x<=320;x+=2)sandXs.push(x);sandXs.push(400,650,1200,2400);
  const sandVertices:number[]=[],sandIndices:number[]=[];
  for(let j=0;j<=92;j++)for(let i=0;i<sandXs.length;i++){
    const x=sandXs[i],z=136+j*2;sandVertices.push(x,heightAt(x,z),z);
    if(j<92&&i<sandXs.length-1){const a=j*sandXs.length+i,b=a+sandXs.length;sandIndices.push(a,b,a+1,a+1,b,b+1);}
  }
  const sandGeometry=new THREE.BufferGeometry();sandGeometry.setAttribute('position',new THREE.Float32BufferAttribute(sandVertices,3));sandGeometry.setIndex(sandIndices);sandGeometry.computeVertexNormals();
  const sandMaterial = new THREE.MeshStandardMaterial({ color: '#cab79a', roughness: .92 });
  sandMaterial.onBeforeCompile = shader => {
    shader.uniforms.uTime = uniforms.uTime;
    sandMaterial.userData.shader = shader;
    shader.vertexShader = 'varying vec3 vSandPosition;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSandPosition=(modelMatrix*vec4(position,1.0)).xyz;');
    shader.fragmentShader = `varying vec3 vSandPosition;uniform float uTime;${COAST_GLSL}\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 sandP=vSandPosition.xz;float d=shoreDistance(sandP);
      float macro=fbmCoast(sandP*.027),grain=noiseCoast(sandP*5.1);
      float wet=1.0-smoothstep(-14.0,-2.0,d-sin(uTime*.82+sandP.x*.02)*2.2);
      float ripple=sin(sandP.y*21.0+sin(sandP.x*.65)*2.8+macro*6.0);
      vec3 dry=mix(vec3(.52,.40,.27),vec3(.70,.57,.40),macro);
      vec3 damp=mix(vec3(.19,.22,.18),vec3(.34,.30,.23),macro);
      diffuseColor.rgb=mix(dry,damp,wet*.82)*( .94+grain*.10+ripple*.015 );`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mix(.94,.28,wet*.8);');
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      vec3 sandBump=vec3(cos(sandP.y*21.0+sin(sandP.x*.65)*2.8)*.018,0.0,(grain-.5)*.018);
      normal=normalize(normal+mat3(viewMatrix)*sandBump);`);
  };
  sandMaterial.customProgramCacheKey = () => 'original-coast-dry-wet-sand-v1';
  const sand = new THREE.Mesh(sandGeometry, sandMaterial); sand.name = 'WalkableCoastalSand'; sand.receiveShadow = true;
  root.add(sand);

  // Dense shore, coarse open sea: spend vertices where breaking crests are visible.
  const xs = [-2400, -1200, -650, -400];
  for (let x = -320; x <= 320; x += 4) xs.push(x);
  xs.push(400, 650, 1200, 2400);
  const zs: number[] = [];
  for (let z = 166; z <= 326; z += 1.6) zs.push(z);
  zs.push(380, 470, 620, 900, 1400, 2200, 3600);
  const positions: number[] = [], bed: number[] = [], indices: number[] = [];
  for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) {
    positions.push(xs[i], 0, zs[j]); bed.push(heightAt(xs[i], zs[j]));
    if (i < xs.length - 1 && j < zs.length - 1) { const a = j * xs.length + i, b = a + xs.length; indices.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const oceanGeometry = new THREE.BufferGeometry();
  oceanGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  oceanGeometry.setAttribute('sandHeight', new THREE.Float32BufferAttribute(bed, 1)); oceanGeometry.setIndex(indices);
  const ocean = new THREE.Mesh(oceanGeometry, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.FrontSide,
    vertexShader: `attribute float sandHeight;varying vec3 vSeaPosition;varying float vBed;uniform float uTime;${COAST_GLSL}
      void main(){vec3 p=position;p.y=seaHeight(p.xz,uTime);
      vSeaPosition=p;vBed=sandHeight;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
    fragmentShader: `varying vec3 vSeaPosition;varying float vBed;uniform float uTime,uWeatherTime;${COAST_GLSL}${SKY_GLSL}
      void main(){
       vec2 p=vSeaPosition.xz;float d=shoreDistance(p),depth=vSeaPosition.y-vBed;if(depth<=.002)discard;
       float dist=length(cameraPosition-vSeaPosition),e=.14;
       float gx=(seaHeight(p+vec2(e,0),uTime)-seaHeight(p-vec2(e,0),uTime))/(2.0*e);
       float gz=(seaHeight(p+vec2(0,e),uTime)-seaHeight(p-vec2(0,e),uTime))/(2.0*e);
       float near=1.0-smoothstep(20.0,220.0,dist);
       vec2 micro=vec2(sin(p.x*3.8+p.y*1.6+uTime*2.2),cos(p.x*2.1-p.y*4.0+uTime*2.7))*.028*near;
       vec3 n=normalize(vec3((-gx+micro.x)*near,1.0,(-gz+micro.y)*near)),eye=normalize(cameraPosition-vSeaPosition);
       float fresnel=.025+.975*pow(1.0-max(dot(n,eye),0.0),5.0);
       float macro=fbmCoast(p*.04),caustic=pow(max(0.0,1.0-abs(sin(p.x*1.35+uTime*.22)+sin(p.y*1.4-uTime*.27))*.5),12.0)*.04;
       vec3 bedColor=mix(vec3(.25,.26,.18),vec3(.49,.40,.25),macro)+vec3(.4,.7,.5)*caustic;
       vec3 absorption=exp(-vec3(.72,.20,.15)*min(depth/max(.24,dot(n,eye)),18.0));
       vec3 sea=mix(vec3(.023,.13,.18),vec3(.055,.28,.28),exp(-depth*.30));
       vec3 result=bedColor*absorption+sea*(vec3(1.0)-absorption);
       result*=.09+uDay*.91;
       result=mix(result,coastSky(reflect(-eye,n),uWeatherTime),fresnel*.82);
       float sunGlint=pow(max(dot(reflect(-uSun,n),eye),0.0),170.0)*.5*uDay;
       float moonGlint=pow(max(dot(reflect(-uMoon,n),eye),0.0),170.0)*.125*(1.-uDay);
       result+=(vec3(1.0,.84,.61)*sunGlint+vec3(.25,.36,.53)*moonGlint)*(1.-uRain*.7)*(1.-uCloudCover*.5);
       float phase=d*.29+uTime*1.28+p.x*.023;
       float breaker=smoothstep(.73,.98,sin(phase))*smoothstep(.7,3.0,d)*(1.0-smoothstep(26.0,42.0,d));
       float contact=(1.0-smoothstep(.035,.42,depth))*smoothstep(.004,.04,depth);
       vec2 drift=p*vec2(.7,1.8)+vec2(sin(p.y*.18),uTime*.40);
       float lace=fbmCoast(drift),holes=noiseCoast(drift*4.2);
       float foam=smoothstep(.33,.65,lace+(breaker*.40+contact*.43))*(breaker*.84+contact*.91);
       foam*=mix(.65,1.0,holes)*smoothstep(.003,.03,depth);
       result=mix(result,mix(vec3(.075,.115,.17),vec3(.72,.80,.77),uDay),clamp(foam,0.0,.96));
       result=mix(result,mix(vec3(.016,.025,.052),vec3(.47,.62,.70),uDay),1.0-exp(-dist*.00037));
       float alpha=max(mix(.47,1.0,smoothstep(.025,1.8,depth)),foam*.92);
       gl_FragColor=vec4(result,alpha);
       #include <tonemapping_fragment>
       #include <colorspace_fragment>
      }`,
  }));
  ocean.name = 'OriginalBreakingCoastalOcean'; ocean.frustumCulled = false; ocean.renderOrder = 3;
  root.add(ocean);
  return { sky, ocean, sand, update(time: number) { uniforms.uTime.value = time; },
    setWeather(a:Atmosphere,time:number){uniforms.uSun.value.copy(a.sun);uniforms.uMoon.value.copy(a.moon);uniforms.uDay.value=a.day;uniforms.uTwilight.value=a.twilight;uniforms.uCloudCover.value=a.cloudCover;uniforms.uRain.value=a.rain;uniforms.uWeatherTime.value=time;},
    dispose(){moonTexture.dispose();} };
}

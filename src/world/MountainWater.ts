import * as THREE from 'three';
import {JADE_POOL,WATERCOURSE,WATERFALLS,waterSection} from './WaterLayout';

const vertex=`varying vec2 vUv;varying vec3 vWorld;
void main(){vUv=uv;vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`;
const fragment=`uniform float uTime,uDay,uFall;varying vec2 vUv;varying vec3 vWorld;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
void main(){
 float lane=noise(vec2(vUv.x*32.,vUv.y*.27-uTime*2.8));
 float flow=noise(vec2(vUv.x*14.+sin(vUv.y*.4)*.2,vUv.y*.42-uTime*(.85+uFall*2.1)));
 float ripple=sin(vWorld.z*2.2+sin(vWorld.x*1.4+uTime*.5)*2.-uTime*1.3)*sin(vWorld.x*1.7-vWorld.z*.6+uTime*.8);
 float sparkle=pow(max(0.,ripple),7.);
 float edge=smoothstep(.31,.5,abs(vUv.x-.5));
 float foam=mix(edge*.12+sparkle*.13,lane*.65+flow*.25,uFall);
 vec3 col=mix(vec3(.07,.27,.25),vec3(.78,.94,.91),foam);
 col*=.15+uDay*.85;
 gl_FragColor=vec4(col,mix(.88,.82,uFall));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

/** Two merged strips, one pond and one mist batch; animation changes uniforms only. */
export function createMountainWater(root:THREE.Group){
  const group=new THREE.Group();group.name='ShanhaiWatercourse';root.add(group);
  const materials=[0,1].map(fall=>new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms:{uTime:{value:0},uDay:{value:1},uFall:{value:fall}},transparent:true,depthWrite:false,side:THREE.DoubleSide}));
  for(const falling of [false,true]){
    const pos:number[]=[],uv:number[]=[],indices:number[]=[];let length=0;
    for(let i=1;i<WATERCOURSE.length;i++){
      const a=WATERCOURSE[i-1],b=WATERCOURSE[i],dx=b.x-a.x,dz=b.z-a.z,dist=Math.hypot(dx,dz),fall=WATERFALLS.some(f=>f.from===i-1);
      const startLength=length;length+=Math.hypot(dist,b.y-a.y);if(fall!==falling)continue;
      const steps=Math.ceil(dist/1.5),start=pos.length/3,sectionA=waterSection(i-1),sectionB=waterSection(i);
      for(let j=0;j<=steps;j++){
        const t=j/steps,x=a.x+dx*t,z=a.z+dz*t,y=a.y+(b.y-a.y)*t+.035;
        const sx=sectionA.x+(sectionB.x-sectionA.x)*t,sz=sectionA.z+(sectionB.z-sectionA.z)*t;
        for(const side of [-1,1]){pos.push(x+sx*side,y,z+sz*side);uv.push((side+1)/2,startLength+(length-startLength)*t);}
        if(j<steps){const k=start+j*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
      }
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
    const strip=new THREE.Mesh(geo,materials[falling?1:0]);strip.name=falling?'CascadingWater':'FlowingCreek';strip.renderOrder=2;group.add(strip);
  }
  const pond=new THREE.Mesh(new THREE.CircleGeometry(1,64),materials[0]);pond.name='JadePool';pond.rotation.x=-Math.PI/2;pond.scale.set(JADE_POOL.rx,JADE_POOL.rz,1);pond.position.set(JADE_POOL.x,JADE_POOL.y+.035,JADE_POOL.z);pond.renderOrder=1;group.add(pond);
  const mistMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uTime:{value:0},uDay:{value:1}},
    vertexShader:`attribute vec3 offset;attribute float phase;uniform float uTime;varying vec2 vUv;
    void main(){vUv=uv;float t=fract(uTime*.22+phase);vec4 p=viewMatrix*vec4(offset+vec3(sin(phase*20.+uTime)*1.3,t*3.,cos(phase*17.)*.7),1.);p.xy+=position.xy*(1.+t*2.);gl_Position=projectionMatrix*p;}`,
    fragmentShader:`uniform float uDay;varying vec2 vUv;void main(){float alpha=pow(max(0.,1.-length(vUv-.5)*2.),2.)*.22;gl_FragColor=vec4(vec3(.62,.81,.77)*(.18+.82*uDay),alpha);}`});
  const mistGeo=new THREE.InstancedBufferGeometry();const plane=new THREE.PlaneGeometry(1,1);mistGeo.setIndex(plane.index!.clone());mistGeo.setAttribute('position',plane.attributes.position.clone());mistGeo.setAttribute('uv',plane.attributes.uv.clone());plane.dispose();
  const offsets:number[]=[],phases:number[]=[];
  for(const f of WATERFALLS){const p=WATERCOURSE[f.to];for(let i=0;i<8;i++){offsets.push(p.x+(i%4-1.5)*1.5,p.y+.2,p.z+(Math.floor(i/4)-.5)*1.5);phases.push(i/8);}}
  mistGeo.setAttribute('offset',new THREE.InstancedBufferAttribute(new Float32Array(offsets),3));mistGeo.setAttribute('phase',new THREE.InstancedBufferAttribute(new Float32Array(phases),1));mistGeo.instanceCount=phases.length;
  const mist=new THREE.Mesh(mistGeo,mistMaterial);mist.name='WaterfallSpray';mist.frustumCulled=false;mist.renderOrder=3;group.add(mist);
  return{update(time:number){for(const m of [...materials,mistMaterial])m.uniforms.uTime.value=time;},setDay(day:number){for(const m of [...materials,mistMaterial])m.uniforms.uDay.value=day;}};
}

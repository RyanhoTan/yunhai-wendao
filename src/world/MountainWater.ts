import * as THREE from 'three';
import {JADE_POOL,WATERCOURSE,WATERFALLS,waterSection} from './WaterLayout';
import {createWaterUniforms,WATER_SURFACE_GLSL,type WaterUniforms} from './WaterSurface';

const POND_SEGMENTS=64;
const vertex=`attribute float waterDepth;varying vec2 vUv;varying vec3 vWorld,vNormal;varying float vDepth;
void main(){vUv=uv;vDepth=waterDepth;vNormal=normalize(mat3(modelMatrix)*normal);vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`;
const fragment=`uniform float uFall,uPool;varying vec2 vUv;varying vec3 vWorld,vNormal;varying float vDepth;
${WATER_SURFACE_GLSL}
void main(){
 float depth=max(vDepth,.0);if(depth<=.002&&uFall<.5)discard;
 vec2 p=vWorld.xz;float dist=length(cameraPosition-vWorld),near=1.-smoothstep(20.,220.,dist);
 // The pond owns the overlap, so transparent creek triangles cannot tint it twice.
 if(uPool<.5&&uFall<.5&&abs(vWorld.y-${(JADE_POOL.y+.035).toFixed(3)})<.1){
  vec2 pond=(p-vec2(${JADE_POOL.x.toFixed(1)},${JADE_POOL.z.toFixed(1)}))/vec2(${JADE_POOL.rx.toFixed(1)},${JADE_POOL.rz.toFixed(1)});
  float halfSector=3.14159265/${POND_SEGMENTS.toFixed(1)},edge=cos(halfSector)/cos(mod(atan(pond.y,pond.x),halfSector*2.)-halfSector);
  if(length(pond)<edge)discard;
 }
 vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;
 float foam;
 if(uFall>.5){
  // The falling film follows its sloped surface; flat water uses metre-scale ripples.
  float lane=noiseCoast(vec2(vUv.x*48.,vUv.y*.19-uTime*3.4));
  float flow=fbmCoast(vec2(vUv.x*28.+sin(vUv.y*.4)*.4,vUv.y*.28-uTime*2.4));
  vec3 across=length(n.xz)>.01?normalize(vec3(n.z,0.,-n.x)):vec3(1.,0.,0.);
  vec3 down=normalize(cross(n,across));
  n=normalize(n+across*(lane-.5)*.16+down*(flow-.5)*.10);
  foam=.32+smoothstep(.25,.80,lane)*.36+flow*.12;
 }else{
  vec2 micro=waterMicroNormal(p,near);
  vec2 ripple=vec2(cos(dot(p,vec2(.8,.45))-uTime*.9),cos(dot(p,vec2(-.5,1.1))-uTime*1.3))*.12*near;
  n=normalize(n+vec3(micro.x+ripple.x,0.,micro.y+ripple.y));
  float lace=fbmCoast(p*vec2(.7,1.8)+vec2(sin(p.y*.18),uTime*.40));
  float contact=(1.-smoothstep(.035,.17,depth))*smoothstep(.004,.04,depth);
  float impact=0.;
  ${WATERFALLS.map(f=>{const b=WATERCOURSE[f.to];return `impact=max(impact,1.-smoothstep(.8,4.8,length(p-vec2(${b.x.toFixed(1)},${b.z.toFixed(1)}))));`;}).join('\n')}
  foam=smoothstep(.40,.70,lace+impact*.30)*(contact*.40+impact*.65);
 }
 vec3 result=shadeWater(vWorld,n,max(depth,.08),foam);
 gl_FragColor=vec4(result,mix(waterOpacity(depth,foam),.86,uFall));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

/** Two merged strips, one pond and one mist batch; animation changes uniforms only. */
export function createMountainWater(root:THREE.Group,heightAt?:(x:number,z:number)=>number,uniforms:WaterUniforms=createWaterUniforms()){
  const group=new THREE.Group();group.name='ShanhaiWatercourse';root.add(group);
  const materials=[0,1,0].map((fall,i)=>new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms:{...uniforms,uFall:{value:fall},uPool:{value:i===2?1:0}},transparent:true,depthWrite:false,side:THREE.DoubleSide}));
  const sampleDepth=(x:number,y:number,z:number)=>heightAt?y-heightAt(x,z):.535;
  for(const falling of [false,true]){
    const pos:number[]=[],uv:number[]=[],depths:number[]=[],indices:number[]=[];let length=0;
    const across=8,row=across+1;
    for(let i=1;i<WATERCOURSE.length;i++){
      const a=WATERCOURSE[i-1],b=WATERCOURSE[i],dx=b.x-a.x,dz=b.z-a.z,dist=Math.hypot(dx,dz),fall=WATERFALLS.some(f=>f.from===i-1);
      const startLength=length;length+=Math.hypot(dist,b.y-a.y);if(fall!==falling)continue;
      const steps=Math.ceil(dist/1.5),start=pos.length/3,sectionA=waterSection(i-1),sectionB=waterSection(i);
      for(let j=0;j<=steps;j++){
        const t=j/steps,x=a.x+dx*t,z=a.z+dz*t,y=a.y+(b.y-a.y)*t+.035;
        const sx=sectionA.x+(sectionB.x-sectionA.x)*t,sz=sectionA.z+(sectionB.z-sectionA.z)*t;
        for(let k=0;k<=across;k++){
          const side=k/across*2-1,px=x+sx*side,pz=z+sz*side;
          pos.push(px,y,pz);uv.push(k/across,startLength+(length-startLength)*t);depths.push(sampleDepth(px,y,pz));
          if(j<steps&&k<across){const a=start+j*row+k;indices.push(a,a+1,a+row,a+1,a+row+1,a+row);}
        }
      }
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setAttribute('waterDepth',new THREE.Float32BufferAttribute(depths,1));geo.setIndex(indices);geo.computeVertexNormals();
    const strip=new THREE.Mesh(geo,materials[falling?1:0]);strip.name=falling?'CascadingWater':'FlowingCreek';strip.renderOrder=2;group.add(strip);
  }
  const pondGeometry=new THREE.BufferGeometry(),pondPositions:number[]=[0,0,0],pondDepths:number[]=[sampleDepth(JADE_POOL.x,JADE_POOL.y+.035,JADE_POOL.z)],pondUvs:number[]=[.5,.5],pondIndices:number[]=[];
  const rings=8,segments=POND_SEGMENTS;
  for(let ring=1;ring<=rings;ring++)for(let i=0;i<segments;i++){
    const angle=i/segments*Math.PI*2,r=ring/rings,x=Math.cos(angle)*r,z=Math.sin(angle)*r;
    pondPositions.push(x,-z,0);pondUvs.push((x+1)/2,(-z+1)/2);
    pondDepths.push(sampleDepth(JADE_POOL.x+x*JADE_POOL.rx,JADE_POOL.y+.035,JADE_POOL.z+z*JADE_POOL.rz));
    const b=1+(ring-1)*segments+i,next=1+(ring-1)*segments+(i+1)%segments;
    if(ring===1)pondIndices.push(0,next,b);
    else{const a=b-segments,aNext=next-segments;pondIndices.push(a,aNext,b,aNext,next,b);}
  }
  pondGeometry.setAttribute('position',new THREE.Float32BufferAttribute(pondPositions,3));pondGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(pondUvs,2));pondGeometry.setAttribute('waterDepth',new THREE.Float32BufferAttribute(pondDepths,1));pondGeometry.setIndex(pondIndices);pondGeometry.computeVertexNormals();
  const pond=new THREE.Mesh(pondGeometry,materials[2]);pond.name='JadePool';pond.rotation.x=-Math.PI/2;pond.scale.set(JADE_POOL.rx,JADE_POOL.rz,1);pond.position.set(JADE_POOL.x,JADE_POOL.y+.035,JADE_POOL.z);pond.renderOrder=1;group.add(pond);
  const mistMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uTime:uniforms.uTime,uDay:uniforms.uDay},
    vertexShader:`attribute vec3 offset;attribute float phase;uniform float uTime;varying vec2 vUv;
    void main(){vUv=uv;float t=fract(uTime*.22+phase);vec4 p=viewMatrix*vec4(offset+vec3(sin(phase*20.+uTime)*1.3,t*3.,cos(phase*17.)*.7),1.);p.xy+=position.xy*(1.+t*2.);gl_Position=projectionMatrix*p;}`,
    fragmentShader:`uniform float uDay;varying vec2 vUv;void main(){float alpha=pow(max(0.,1.-length(vUv-.5)*2.),2.)*.22;gl_FragColor=vec4(vec3(.62,.81,.77)*(.18+.82*uDay),alpha);}`});
  const mistGeo=new THREE.InstancedBufferGeometry();const plane=new THREE.PlaneGeometry(1,1);mistGeo.setIndex(plane.index!.clone());mistGeo.setAttribute('position',plane.attributes.position.clone());mistGeo.setAttribute('uv',plane.attributes.uv.clone());plane.dispose();
  const offsets:number[]=[],phases:number[]=[];
  for(const f of WATERFALLS){const p=WATERCOURSE[f.to];for(let i=0;i<8;i++){offsets.push(p.x+(i%4-1.5)*1.5,p.y+.2,p.z+(Math.floor(i/4)-.5)*1.5);phases.push(i/8);}}
  mistGeo.setAttribute('offset',new THREE.InstancedBufferAttribute(new Float32Array(offsets),3));mistGeo.setAttribute('phase',new THREE.InstancedBufferAttribute(new Float32Array(phases),1));mistGeo.instanceCount=phases.length;
  const mist=new THREE.Mesh(mistGeo,mistMaterial);mist.name='WaterfallSpray';mist.frustumCulled=false;mist.renderOrder=3;group.add(mist);
  return{update(time:number){uniforms.uTime.value=time;}};
}

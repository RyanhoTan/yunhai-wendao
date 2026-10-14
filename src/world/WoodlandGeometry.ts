import * as THREE from 'three';
import {Writer,sweep,leaf,TAU} from './WoodlandPrimitives';
import {woodlandRandom} from './WoodlandTree';

export {createWoodlandTree,woodlandRandom} from './WoodlandTree';
export type {WoodlandDetail,WoodlandArchitecture,WoodlandTree} from './WoodlandTree';

export function createWoodlandGrass(seed:number,low=false){
  const random=woodlandRandom(seed),writer=new Writer(),count=low?6:11,baseColor=new THREE.Color('#6d853f');
  for(let i=0;i<count;i++){
    const a=i*2.39996+random()*.35,h=.24+random()*.34,w=.018+random()*.024,root=new THREE.Vector3(Math.cos(a)*.25,0,Math.sin(a)*.25),axis=new THREE.Vector3(Math.cos(a),0,Math.sin(a)),cross=new THREE.Vector3(-Math.sin(a),0,Math.cos(a));
    const b0=writer.vertex(root.clone().addScaledVector(cross,-w),baseColor,0,0,0),b1=writer.vertex(root.clone().addScaledVector(cross,w),baseColor,1,0,0),mid=root.clone().addScaledVector(axis,h*.2).add(new THREE.Vector3(0,h*.55,0)),tip=root.clone().addScaledVector(axis,h*.5).add(new THREE.Vector3(0,h,0));
    const m0=writer.vertex(mid.clone().addScaledVector(cross,-w*.65),baseColor.clone().multiplyScalar(1.20),0,.55,.6),m1=writer.vertex(mid.clone().addScaledVector(cross,w*.65),baseColor.clone().multiplyScalar(1.2),1,.55,.6),t=writer.vertex(tip,baseColor.clone().multiplyScalar(1.42),.5,1,1);writer.triangle(b0,b1,m0);writer.triangle(b1,m1,m0);writer.triangle(m0,m1,t);
  }return writer.finish(`OriginalWoodlandGrass_${seed}_${low?'Far':'Near'}`,.08);
}

export function createWoodlandFern(seed:number,low=false){
  const random=woodlandRandom(seed),writer=new Writer(),green=new THREE.Color('#557c3c'),fronds=6;
  for(let f=0;f<fronds;f++){
    const a=f*TAU/fronds+random()*.22,radial=new THREE.Vector3(Math.cos(a),0,Math.sin(a)),lateral=new THREE.Vector3(-Math.sin(a),0,Math.cos(a)),h=.54+random()*.17;
    const points=Array.from({length:5},(_,i)=>radial.clone().multiplyScalar(.63*(i/4)**1.6).add(new THREE.Vector3(0,h*Math.sin(i/4*Math.PI*.72),0)));if(!low||f%2===0)sweep(writer,points,.005,.002,3,green.clone().multiplyScalar(.8));
    const pairs=8;
    for(let p=0;p<pairs;p++){
      const t=.12+p/(pairs-1)*.78,k=t*4,origin=points[Math.floor(k)].clone().lerp(points[Math.ceil(k)],k%1),length=.24*Math.sin(t*Math.PI)*(.90+random()*.15);
      for(const s of [-1,1]){const item={base:origin,axis:lateral.clone().multiplyScalar(s).addScaledVector(radial,.28).add(new THREE.Vector3(0,-.04,0)).normalize(),length,width:length*.21,twist:s*.25,tone:.8+random()*.3};if(!low||(f%2===0&&p%2===0))leaf(writer,item,green,low?2:1);}
    }
  }return writer.finish(`OriginalWoodlandFern_${seed}_${low?'Far':'Near'}`,.08);
}

export function createWoodlandLitter(seed:number){
  const random=woodlandRandom(seed),writer=new Writer(),ochre=new THREE.Color('#928061');
  for(let i=0;i<6;i++){
    const a=random()*TAU,r=random()*.18,at=new THREE.Vector3(Math.cos(a)*r,.009+random()*.006,Math.sin(a)*r);
    leaf(writer,{base:at,axis:new THREE.Vector3(Math.cos(a),.06,Math.sin(a)).normalize(),length:.12+random()*.06,width:.055,twist:(random()-.5)*.35,tone:.76+random()*.34},ochre,1);
  }const geometry=writer.finish('OriginalWoodlandCurledLitter');
  geometry.setAttribute('woodlandWind',new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count),1));
  return geometry;
}

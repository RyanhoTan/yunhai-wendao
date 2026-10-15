import * as THREE from 'three';
import {type WoodlandTree} from './WoodlandTree';

/** One seating rule for legacy groves and new habitat bands. No random draws. */
export function seatWoodlandTree(prototype:WoodlandTree,x:number,z:number,scale:number,yaw:number,dx:number,dz:number,heightAt:(x:number,z:number)=>number){
  const tilt=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(-dx*.14,1,-dz*.14).normalize());
  tilt.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw));
  const position=new THREE.Vector3(x,heightAt(x,z)-.012,z),matrix=new THREE.Matrix4().compose(position,tilt,new THREE.Vector3(scale,scale,scale));
  let sink=0;const vertices=prototype.wood.getAttribute('position'),sample=new THREE.Vector3();
  for(let i=0;i<vertices.count;i++)if(Math.abs(vertices.getY(i))<1e-6){sample.fromBufferAttribute(vertices,i).applyMatrix4(matrix);sink=Math.max(sink,sample.y-heightAt(sample.x,sample.z)+.012);}
  if(sink>.65)return null;
  position.y-=sink;matrix.setPosition(position);
  let radius=prototype.trunkRadius*scale*1.12+.045;const cameraOccluders:THREE.Box3[]=[];
  for(const segment of prototype.trunkSegments){
    const a=new THREE.Vector3().fromArray(segment.a).applyMatrix4(matrix),b=new THREE.Vector3().fromArray(segment.b).applyMatrix4(matrix),thickness=segment.radius*scale;
    cameraOccluders.push(new THREE.Box3().setFromPoints([a,b]).expandByScalar(thickness+.28));
    if(Math.min(a.y,b.y)-position.y<2.6)for(const point of [a,b]){
      const bodyT=THREE.MathUtils.clamp((position.y+2.6-a.y)/Math.max(b.y-a.y,.001),0,1),bodyTop=a.clone().lerp(b,bodyT),sample=point.y>position.y+2.6?bodyTop:point;
      radius=Math.max(radius,Math.hypot(sample.x-x,sample.z-z)+thickness+.025);
    }
  }
  return {y:position.y,matrix,radius,cameraOccluders};
}

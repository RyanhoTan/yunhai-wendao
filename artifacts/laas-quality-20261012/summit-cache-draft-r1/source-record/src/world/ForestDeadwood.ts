import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {woodlandRandom} from './WoodlandGeometry';
import {woodlandCover} from './ForestLayout';
import type {GroundTree} from './GroundCoverPlacement';
import {createForestDeadwoodGeometry} from './ForestDeadwoodGeometry';
import {createForestDeadwoodMaterial} from './ForestDeadwoodMaterial';
import {bodyCollisionMesh,createTransformedBoxBodySampler,PLAYER_BODY,type BodyCollisionMesh} from '../core/StaticBodyCollision';

export type DeadwoodPlacement={seed:number;form:0|1|2;x:number;y:number;z:number;yaw:number;matrix:number[];bounds:number[][];contacts:number[][];minGap:number;maxGap:number;triangles:number};
type DeadwoodTree=GroundTree&{architecture?:number};

/** Persistent decomposing trunks follow existing groves. Each accepted piece
 * has its own actual morphology; static cell merging keeps the draw cost low. */
export function createForestDeadwood(parent:THREE.Group,heightAt:(x:number,z:number)=>number,protectedAt:(x:number,z:number,r:number)=>boolean,trees:readonly DeadwoodTree[],blockedAt:(x:number,y:number,z:number,r:number,bounds?:THREE.Box3)=>boolean){
  const group=new THREE.Group();group.name='ForestDecompositionLayer';parent.add(group);
  const {material,depth,view}=createForestDeadwoodMaterial(),batches=new Map<string,THREE.BufferGeometry[]>(),records:DeadwoodPlacement[]=[],bodySolids:BodyCollisionMesh[]=[],cameraOccluders:THREE.Box3[]=[];
  const random=woodlandRandom(890213),up=new THREE.Vector3(0,1,0),point=new THREE.Vector3(),matrix=new THREE.Matrix4(),normal=new THREE.Vector3();
  let rejectedContacts=0,rejectedObstacles=0,generatedPieces=0;
  for(let i=0;i<trees.length;i++){
    const tree=trees[i],mortality=[.07,.18,.32,.45][tree.architecture??1];if(random()>mortality)continue;
    for(let attempt=0;attempt<4;attempt++){
      const angle=random()*Math.PI*2,distance=3.4+random()*3.8,x=tree.x+Math.cos(angle)*distance,z=tree.z+Math.sin(angle)*distance;
      if(x< -520||x>288||z< -289||z>119||woodlandCover(x,z)<.32||protectedAt(x,z,3.1))continue;
      const h=heightAt(x,z),dx=heightAt(x+.5,z)-heightAt(x-.5,z),dz=heightAt(x,z+.5)-heightAt(x,z-.5);
      if(!Number.isFinite(h+dx+dz)||h<.2||Math.hypot(dx,dz)>.52)continue;
      const yaw=(Math.hypot(dx,dz)>.12&&random()<.65?Math.atan2(dz,-dx):Math.atan2(-.10,.22))+(random()-.5)*1.6+(random()<.5?Math.PI:0);
      generatedPieces++;
      const seed=Math.imul(i+1,7919)+attempt*701,form=(i%3) as 0|1|2,piece=createForestDeadwoodGeometry(seed,form),geometry=piece.geometry,p=geometry.getAttribute('position');
      if(!piece.contactIndices.length||!piece.solidBounds.length)throw new Error('Deadwood needs physical contacts and solid proxies');
      normal.set(-dx,1,-dz).normalize();
      const rotation=new THREE.Quaternion().setFromUnitVectors(up,normal).multiply(new THREE.Quaternion().setFromAxisAngle(up,yaw));
      matrix.compose(new THREE.Vector3(x,h,z),rotation,new THREE.Vector3(1,1,1));
      let sink=0;
      for(const index of piece.contactIndices){point.fromBufferAttribute(p,index).applyMatrix4(matrix);sink=Math.max(sink,point.y-heightAt(point.x,point.z)+.005);}
      if(sink>.12){rejectedContacts++;geometry.dispose();continue;}
      matrix.elements[13]-=sink;
      let minGap=Infinity,maxGap=-Infinity,legal=true;
      const contacts:number[][]=[];
      for(const index of piece.contactIndices){point.fromBufferAttribute(p,index).applyMatrix4(matrix);const gap=point.y-heightAt(point.x,point.z);minGap=Math.min(minGap,gap);maxGap=Math.max(maxGap,gap);contacts.push(point.toArray());}
      if(minGap<-.17||maxGap>.002){rejectedContacts++;geometry.dispose();continue;}
      const bounds=geometry.boundingBox!.clone().applyMatrix4(matrix);
      if(blockedAt(x,h-sink,z,0,bounds)||trees.some(t=>{
        // Closest point on the complete world envelope must clear actual stems.
        const px=THREE.MathUtils.clamp(t.x,bounds.min.x,bounds.max.x),pz=THREE.MathUtils.clamp(t.z,bounds.min.z,bounds.max.z);
        return Math.hypot(px-t.x,pz-t.z)<t.r+.25;
      })){rejectedObstacles++;geometry.dispose();continue;}
      for(let v=0;v<p.count;v++){point.fromBufferAttribute(p,v).applyMatrix4(matrix);if(protectedAt(point.x,point.z,.2)){legal=false;break;}}
      if(!legal){geometry.dispose();continue;}
      const solid=bodyCollisionMesh(piece.solidBounds.map(createTransformedBoxBodySampler(matrix)));
      // Reject overlaps with earlier fallen wood through their physical boxes.
      if(bodySolids.some(other=>{
        const physical=other.bounds.clone();physical.min.add(new THREE.Vector3(PLAYER_BODY.radius,PLAYER_BODY.height,PLAYER_BODY.radius));physical.max.sub(new THREE.Vector3(PLAYER_BODY.radius,0,PLAYER_BODY.radius));return bounds.intersectsBox(physical);
      })){geometry.dispose();continue;}
      bodySolids.push(solid);
      cameraOccluders.push(...piece.solidBounds.map(box=>box.clone().applyMatrix4(matrix)));
      records.push({seed,form,x,y:h-sink,z,yaw,matrix:Array.from(matrix.elements),bounds:[bounds.min.toArray(),bounds.max.toArray()],contacts,minGap,maxGap,triangles:geometry.index!.count/3});
      geometry.applyMatrix4(matrix);geometry.setAttribute('forestCellId',new THREE.Float32BufferAttribute(new Float32Array(p.count),1));
      geometry.setAttribute('deadwoodSeed',new THREE.Float32BufferAttribute(new Float32Array(p.count).fill((seed%104729)/104729),1));
      const key=`${Math.floor(x/24)},${Math.floor(z/24)}`,cell=batches.get(key)??[];cell.push(geometry);batches.set(key,cell);break;
    }
  }
  const meshes:THREE.Mesh[]=[];
  for(const [key,list] of batches){
    const geometry=mergeGeometries(list);if(!geometry)throw new Error('Deadwood cell attributes mismatch');
    geometry.name=`ForestDeadwoodCell_${key}`;geometry.computeBoundingBox();geometry.computeBoundingSphere();list.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(geometry,material);mesh.name=geometry.name;mesh.castShadow=mesh.receiveShadow=true;mesh.customDepthMaterial=depth;group.add(mesh);meshes.push(mesh);
  }
  Object.assign(group.userData,{scope:'Unique static broken/hollow/collapsed decomposing trunks with attached surface ecology, conservative contact and actual physical collision proxies. Preliminary decomposition module; not LAAS acceptance.',placements:records,count:records.length,formCounts:[0,1,2].map(form=>records.filter(record=>record.form===form).length),cells:meshes.length,rejectedContacts,rejectedObstacles,generatedPieces,fadeStart:64,fadeEnd:96});
  const worldBounds=new THREE.Box3();
  return {group,records,bodySolids,cameraOccluders,prepare(camera:THREE.Camera){camera.updateWorldMatrix(true,false);view.setFromMatrixPosition(camera.matrixWorld);group.updateWorldMatrix(true,false);for(const mesh of meshes)mesh.visible=worldBounds.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld).distanceToPoint(view)<=96;}};
}

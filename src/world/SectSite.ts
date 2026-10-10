import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {artGeometry,bake,mesh} from '../assets/ArtKit';
import {bodyCollisionMesh,boxBodySolid,triangleBodySolid,type BodyCollisionMesh} from '../core/StaticBodyCollision';
import {createSectBuilding,getSectBuildingDimensions,type SectRoofTriangle} from './SectArchitecture';
import {SECT_BUILDINGS,SECT_PATHS,SECT_GROUND_Y,SECT_GATE_Y} from './SectLayout';

/** Preserve the material kit's vertex tint while batching neighbouring static buildings. */
function batchCourtyard(root:THREE.Group) {
  root.updateMatrixWorld(true);
  const inverse=root.matrixWorld.clone().invert(),buckets=new Map<THREE.Material,THREE.BufferGeometry[]>();
  const originals=new Set<THREE.BufferGeometry>();
  root.traverse(o=>{if(o instanceof THREE.Mesh&&!Array.isArray(o.material)){
    const geometry=o.geometry.clone().applyMatrix4(inverse.clone().multiply(o.matrixWorld));
    const list=buckets.get(o.material)??[];list.push(geometry);buckets.set(o.material,list);originals.add(o.geometry);
  }});
  // Named anchors retain the individual building positions and metadata for scene tools.
  for(const anchor of root.children)anchor.clear();
  originals.forEach(g=>g.dispose());
  for(const [material,parts] of buckets){
    const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());
    if(!geometry)throw new Error(`Cannot batch sect courtyard ${material.name}`);
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const part=new THREE.Mesh(geometry,material);part.name=`SectCourtyard_${material.name}`;part.castShadow=part.receiveShadow=true;root.add(part);
  }
}

export function createSectSite(root:THREE.Group,heightAt:(x:number,z:number)=>number) {
  const courtyard=new THREE.Group();courtyard.name='SectCourtyardArchitecture';root.add(courtyard);
  const walls:THREE.Box3[]=[],cameraOccluders:THREE.Box3[]=[],bodySolids:BodyCollisionMesh[]=[];
  const metrics:{id:string;name:string;triangles:number;meshes:number}[]=[];
  for(const placement of SECT_BUILDINGS){
    const model=createSectBuilding(placement),dim=getSectBuildingDimensions(placement);
    const base=placement.kind==='gate'?SECT_GATE_Y:SECT_GROUND_Y;
    model.position.set(placement.x,base,placement.z);model.rotation.y=placement.yaw;model.updateMatrixWorld(true);
    (placement.kind==='gate'?root:courtyard).add(model);
    metrics.push({id:placement.id,name:placement.name,...model.userData.architectureMetrics});
    const matrix=model.matrixWorld.clone();
    const box=(x:number,bottom:number,z:number,w:number,h:number,d:number,body=true)=>{
      const bounds=new THREE.Box3(new THREE.Vector3(x-w/2,bottom,z-d/2),new THREE.Vector3(x+w/2,bottom+h,z+d/2)).applyMatrix4(matrix);
      if(body)walls.push(bounds);cameraOccluders.push(bounds);return bounds;
    };
    if(placement.kind==='library'||placement.kind==='alchemy'||placement.kind==='residence'){
      const w=dim.wallWidth,d=dim.wallDepth,h=dim.wallHeight,entry=placement.entryWidth;
      for(const side of [-1,1]){
        box(side*w/2,placement.floor,0,.22,h,d);
        box(side*(w/2+entry/2)/2,placement.floor,d/2,w/2-entry/2,h,.22);
      }
      box(0,placement.floor,-d/2,w,h,.22);
      for(const upper of dim.upperWalls)box(upper.x,upper.bottom,upper.z,upper.width,upper.top-upper.bottom,upper.depth);
      // Front stone rails stop at the actual central stair opening.
      if(placement.kind==='library'||placement.kind==='alchemy'){
        const center=placement.width/4+(placement.kind==='library'?.7:1);
        const length=placement.width/2-(placement.kind==='library'?2:2.6);
        for(const side of [-1,1])box(side*center,placement.floor,placement.depth/2-.1,length,.85,.18);
        if(placement.kind==='library')for(const side of [-1,1])box(side*(placement.width/2-.09),placement.floor,0,.18,.85,placement.depth-.2);
      }
    }
    for(const post of dim.postPositions)box(post.x,post.bottom,post.z,post.r*2,post.top-post.bottom,post.r*2);
    if(placement.kind==='pavilion'){
      const r=placement.width*.36;
      for(let i=0;i<6;i++){
        if(i===1)continue;
        const a=new THREE.Vector3(Math.cos(i*Math.PI/3)*r,placement.floor+ .5,Math.sin(i*Math.PI/3)*r);
        const b=new THREE.Vector3(Math.cos((i+1)*Math.PI/3)*r,placement.floor+ .5,Math.sin((i+1)*Math.PI/3)*r);
        // Small segments closely follow the hexagonal rail without filling its interior.
        for(let k=0;k<6;k++){const p=a.clone().lerp(b,(k+.5)/6);box(p.x,placement.floor,p.z,.48,.83,.22);}
      }
    }
    const localRoofs=model.userData.roofTriangles as SectRoofTriangle[];
    const triangles=localRoofs.map(points=>points.map(v=>v.clone().applyMatrix4(matrix)) as SectRoofTriangle);
    bodySolids.push(bodyCollisionMesh(triangles.map(([a,b,c])=>triangleBodySolid(a,b,c,.20,.035))));
    for(const bounds of model.userData.roofBounds as THREE.Box3[])cameraOccluders.push(bounds.clone().applyMatrix4(matrix));
    // The roof proxy is solely for camera/rain; 3D movement uses the curved triangles above.
    // Local posts and walls already appear in wall collision, preserving the open passage.
    const beamBounds=box(0,placement.floor+dim.wallHeight-.3,0,placement.width,.35,.35,false);
    if(placement.kind==='gate')bodySolids.push(bodyCollisionMesh([boxBodySolid(beamBounds)]));
  }
  batchCourtyard(courtyard);
  const ground=new THREE.Group();ground.name='SectStoneCourtsAndPaths';
  const pavingTile=(x:number,z:number,w:number,d:number,yaw=0)=>{
    const vertices:number[]=[],uv:number[]=[],c=Math.cos(yaw),s=Math.sin(yaw);
    const corners=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([dx,dz])=>({x:x+dx*c+dz*s,z:z-dx*s+dz*c}));
    for(const index of [0,2,1,0,3,2]){const p=corners[index];vertices.push(p.x,heightAt(p.x,p.z)+.026,p.z);uv.push(p.x/3,p.z/3);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
    mesh(ground,geometry,'paleStone',[0,0,0]);
  };
  // Wide central forecourt, keeping the mentor (0,32) and travel axis free of props.
  for(let z=21.5;z<44;z+=1.6)for(let x=-19;x<20;x+=1.8){
    pavingTile(x,z,1.76,1.56);
  }
  for(const route of SECT_PATHS)for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],length=Math.hypot(b.x-a.x,b.z-a.z),count=Math.ceil(length/1.5),yaw=-Math.atan2(b.x-a.x,b.z-a.z);
    for(let j=0;j<count;j++){
      const t=(j+.5)/count,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
      if(Math.abs(x)<19 && z>21.5 && z<43)continue;
      pavingTile(x,z,3.1,length/count-.04,yaw);
    }
  }
  // The west edge meets the existing upper switchback; keep that graded approach open.
  for(const side of [1])for(let i=0;i<7;i++){
    const x=side*(6+i*2.1),z=44.4,y=heightAt(x,z);
    mesh(ground,artGeometry.box,'paleStone',[x,y+.48,z],[.22,.96,.22]);
    mesh(ground,artGeometry.box,'paleStone',[x,y+.94,z],[.32,.14,.32]);
    if(i<6){mesh(ground,artGeometry.box,'paleStone',[x+side*1.05,y+.63,z],[2.1,.12,.18]);
      mesh(ground,artGeometry.box,'paleStone',[x+side*1.05,y+.28,z],[2.1,.1,.16]);}
    walls.push(new THREE.Box3(new THREE.Vector3(x-.14,y,z-.14),new THREE.Vector3(x+.14,y+1,z+.14)));
    if(i<6)walls.push(new THREE.Box3(new THREE.Vector3(Math.min(x,x+side*2.1),y,z-.1),new THREE.Vector3(Math.max(x,x+side*2.1),y+ .8,z+.1)));
  }
  const paving=bake(ground);paving.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=false;});root.add(paving);
  // A handful of stone lights match the reference without obstructing the connecting paths.
  const lights=new THREE.Group();lights.name='SectCourtyardStoneLights';
  for(const [x,z] of [[-18,38],[18,38],[-23,23],[25,23],[19,-13],[33,-21],[-34,27]]){
    const y=heightAt(x,z);
    mesh(lights,artGeometry.box,'paleStone',[x,y+.18,z],[.7,.36,.7]);
    mesh(lights,artGeometry.box,'wood',[x,y+1.15,z],[.12,1.6,.12]);
    mesh(lights,artGeometry.box,'lantern',[x,y+1.9,z],[.36,.6,.36]);
    mesh(lights,artGeometry.cone,'roof',[x,y+2.32,z],[.40,.25,.40],[0,Math.PI/4,0]);
    walls.push(new THREE.Box3(new THREE.Vector3(x-.3,y,z-.3),new THREE.Vector3(x+.3,y+2.4,z+.3)));
  }
  root.add(bake(lights));
  return {walls,cameraOccluders,bodySolids,metrics,drawCalls:courtyard.children.filter(o=>o instanceof THREE.Mesh).length};
}

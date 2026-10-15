import * as THREE from 'three';
import {bodyCollisionMesh,triangleBodySolid,type BodyCollisionMesh,type BodySolid} from '../core/StaticBodyCollision';
import {createRockSurfaceMaterial} from './NaturalLandMaterial';
import {landNoise} from './NaturalTerrain';
import {summitBedRelief} from './SummitStrata';
import {TERRAIN_BOUNDS} from './WorldLayout';

const smooth=THREE.MathUtils.smoothstep;
const bandHeight=1.25;

/** Subdivide steep heightfield triangles in metres of rock face, not metres
 * of horizontal map. Shared elevation cuts join neighbouring faces exactly.
 * The outward skin gives bedding shelves and joints real depth/overhangs. */
export function createGeologicalEscarpments(root:THREE.Group,heightAt:(x:number,z:number)=>number,surfaceExposure:(x:number,y:number,z:number)=>number){
  const group=new THREE.Group();group.name='GeologicalEscarpments';root.add(group);
  const material=createRockSurfaceMaterial(),cameraOccluders:THREE.Box3[]=[],bodySolids:BodyCollisionMesh[]=[];
  type Batch={positions:number[];indices:number[];vertices:Map<string,number>;solids:BodySolid[]};
  const batches=new Map<string,Batch>(),eligible=new Set<string>();let cells=0;
  for(let z=TERRAIN_BOUNDS.minZ+2;z<94;z++)for(let x=TERRAIN_BOUNDS.minX+2;x<TERRAIN_BOUNDS.maxX-2;x++){
    const h=heightAt(x+.5,z+.5);if(h<22||surfaceExposure(x+.5,h,z+.5)<=0)continue;
    const heights=[heightAt(x,z),heightAt(x,z+1),heightAt(x+1,z),heightAt(x+1,z+1)];
    if(Math.max(...heights)-Math.min(...heights)>=1.8)eligible.add(`${x},${z}`);
  }
  const normal=new THREE.Vector3();
  const point=(p:THREE.Vector3)=>{
    // Average the extrusion direction over a rock block. Using the 1m
    // triangulation derivative amplified every column into a thin pleat.
    const e=2.5,gx=(heightAt(p.x+e,p.z)-heightAt(p.x-e,p.z))/(2*e),gz=(heightAt(p.x,p.z+e)-heightAt(p.x,p.z-e))/(2*e),grade=Math.hypot(gx,gz);
    normal.set(-gx,0,-gz).normalize();
    let boundary=1;
    const cx=Math.floor(p.x),cz=Math.floor(p.z);
    // An open skin boundary embeds back into the base rock. The function is
    // identical on both sides of a cell/tile boundary, including partial cuts.
    for(let z=cz-1;z<=cz+1;z++)for(let x=cx-1;x<=cx+1;x++)if(!eligible.has(`${x},${z}`)){
      const distance=Math.hypot(Math.max(x-p.x,0,p.x-x-1),Math.max(z-p.z,0,p.z-z-1));boundary=Math.min(boundary,smooth(distance,0,.45));
    }
    const exposure=smooth(grade,1.6,3.5)*surfaceExposure(p.x,p.y,p.z)*boundary;
    // Bedding is gently inclined and locally interrupted, rather than rings
    // around a cylinder. Water cuts narrow channels across the ledges.
    const bed=p.y*.080+p.x*.012+p.z*.022+landNoise(p.x*.021,p.z*.018)*.30;
    const ledge=landNoise(bed,p.x*.012+p.z*.015+19);
    const bedPhase=bed-Math.floor(bed);
    // A broken lip projects from a bed, then retreats into its weathered
    // face. Local variation prevents a continuous ring around the mountain.
    const lip=(1-smooth(bedPhase,.52,.98))*smooth(bedPhase,0,.30)
      *smooth(landNoise(p.x*.052+p.y*.009+8,p.z*.047-21),-.55,.30);
    // These blocks turn and end with elevation. A nearly height-invariant
    // rib field produced the same vertical pleat through the entire wall.
    const ribs=landNoise(p.x*.033+p.y*.040,p.z*.039-p.y*.032);
    const fracture=landNoise(p.x*.49+p.y*.11+23,p.z*.43-p.y*.08-9);
    const channels=Math.abs(landNoise(p.x*.072+p.z*.015,p.y*.028+p.z*.060));
    const mountainShoulder=(1-smooth(Math.abs(p.x),110,155))*(1-smooth(Math.abs(p.z-7),100,143))*smooth(p.y,32,60);
    // The summit skin follows the same unequal, faulted beds as its mass.
    // Recesses cut into the projected rock volume, with the base behind them.
    const bedDetail=THREE.MathUtils.lerp(ledge*1.6+lip*1.5,summitBedRelief(p.x,p.y,p.z),mountainShoulder);
    let depth=Math.max(.12,1.9+bedDetail+ribs*2.2+fracture*.34-channels*.80)*exposure;
    depth=Math.min(12,depth*(1+mountainShoulder*.60));
    // Large shelves remain embedded, and stop before protected water/building
    // volumes. Road exposure independently preserves walking headroom.
    if(surfaceExposure(p.x+normal.x*depth,p.y,p.z+normal.z*depth)<.02){
      let lo=0,hi=depth;
      for(let i=0;i<10;i++){const m=(lo+hi)*.5;if(surfaceExposure(p.x+normal.x*m,p.y,p.z+normal.z*m)>=.02)lo=m;else hi=m;}
      depth=lo;
    }
    return p.clone().addScaledVector(normal,depth-.025*(1-exposure));
  };
  const clip=(poly:THREE.Vector3[],height:number,above:boolean)=>{
    const result:THREE.Vector3[]=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],insideA=above?a.y>=height:a.y<=height,insideB=above?b.y>=height:b.y<=height;
      if(insideA)result.push(a);
      if(insideA!==insideB)result.push(a.clone().lerp(b,(height-a.y)/(b.y-a.y)));
    }
    return result;
  };
  for(const cell of eligible){
    const [x,z]=cell.split(',').map(Number);
    const corners=[new THREE.Vector3(x,heightAt(x,z),z),new THREE.Vector3(x,heightAt(x,z+1),z+1),new THREE.Vector3(x+1,heightAt(x+1,z),z),new THREE.Vector3(x+1,heightAt(x+1,z+1),z+1)];
    const key=`${Math.floor(x/48)},${Math.floor(z/48)}`;
    const batch:Batch=batches.get(key)??{positions:[],indices:[],vertices:new Map(),solids:[]};batches.set(key,batch);
    const bounds=new Map<number,THREE.Box3>();
    const vertex=(p:THREE.Vector3)=>{
      // Quantise the base coordinate before evaluating the same continuous
      // displacement on shared triangle/tile edges.
      p=new THREE.Vector3(...p.toArray().map(v=>Math.round(v*1e6)/1e6));
      const key=p.toArray().join(','),existing=batch.vertices.get(key);if(existing!==undefined)return {index:existing,point:new THREE.Vector3().fromArray(batch.positions,existing*3)};
      const q=point(p);
      const index=batch.positions.length/3;batch.vertices.set(key,index);batch.positions.push(...q.toArray());return {index,point:q};
    };
    for(const indices of [[0,1,2],[2,1,3]]){
      const triangle=indices.map(i=>corners[i]),lo=Math.min(...triangle.map(p=>p.y)),hi=Math.max(...triangle.map(p=>p.y));
      for(let row=Math.floor(lo/bandHeight);row<=Math.floor(hi/bandHeight);row++){
        const poly=clip(clip(triangle,row*bandHeight,true),(row+1)*bandHeight,false);
        for(let i=1;i<poly.length-1;i++){
          if(new THREE.Vector3().subVectors(poly[i],poly[0]).cross(new THREE.Vector3().subVectors(poly[i+1],poly[0])).lengthSq()<1e-12)continue;
          const a=vertex(poly[0]),b=vertex(poly[i]),c=vertex(poly[i+1]);
          if(new THREE.Vector3().subVectors(b.point,a.point).cross(new THREE.Vector3().subVectors(c.point,a.point)).lengthSq()<1e-12)continue;
          batch.indices.push(a.index,b.index,c.index);
          batch.solids.push(triangleBodySolid(a.point,b.point,c.point,.08,.06));
          const box=bounds.get(row)??new THREE.Box3();box.expandByPoint(a.point).expandByPoint(b.point).expandByPoint(c.point);bounds.set(row,box);
        }
      }
    }
    cameraOccluders.push(...bounds.values());cells++;
  }
  const sharedNormals=new Map<string,THREE.Vector3>();
  for(const batch of batches.values()){
    const keys=Array.from(batch.vertices.keys()),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),face=new THREE.Vector3();
    for(let i=0;i<batch.indices.length;i+=3){
      const ids=batch.indices.slice(i,i+3);a.fromArray(batch.positions,ids[0]*3);b.fromArray(batch.positions,ids[1]*3);c.fromArray(batch.positions,ids[2]*3);face.subVectors(b,a).cross(c.sub(a));
      for(const id of ids){const n=sharedNormals.get(keys[id])??new THREE.Vector3();n.add(face);sharedNormals.set(keys[id],n);}
    }
  }
  for(const [key,batch] of batches){
    if(!batch.indices.length)continue;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(batch.positions,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(batch.positions.length),3));geometry.setIndex(batch.indices);
    const normals=Array.from(batch.vertices.keys()).flatMap(key=>(sharedNormals.get(key)??new THREE.Vector3(0,1,0)).clone().normalize().toArray());geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`GeologicalFace_${key}`;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
    bodySolids.push(bodyCollisionMesh(batch.solids));
  }
  if(!group.children.length)material.dispose();
  group.userData={cells,tiles:group.children.length,triangles:bodySolids.reduce((n,b)=>n+b.solids.length,0),bandHeight,maxOutward:12,coastLimitZ:94};
  return {rainOccluders:cameraOccluders,cameraMeshes:group.children as THREE.Mesh[],bodySolids};
}

import * as THREE from 'three';
import {createGroundCoverGeometry,type GroundCoverKind} from './GroundCoverGeometry';
import {createGroundCoverMaterials} from './GroundCoverMaterials';
import {createGroundPlacementSampler,GROUND_CELL_SIZE,type GroundTree,type GroundPlacement,type GroundSupport} from './GroundCoverPlacement';

const KINDS:GroundCoverKind[]=['grass','sedge','fern','clover','flowers','litter','twig','pebble','mushroom'];
const CACHE_LIMIT=256;

/** Pooled draws retain deterministic world plants. Cache membership changes
 * outside the 24m zero-coverage boundary, rather than swapping nearby patches. */
export function createGroundCover(parent:THREE.Group,heightAt:(x:number,z:number)=>number,protectedAt:(x:number,z:number,r:number)=>boolean,trees:readonly GroundTree[],time:{value:number},blockedAt:(x:number,y:number,z:number,r:number)=>boolean=()=>false){
  const group=new THREE.Group();group.name='EcologicalForestFloor';parent.add(group);
  const {view,materials,depth}=createGroundCoverMaterials(time),supports=new Map<GroundCoverKind,GroundSupport>(),meshes=new Map<GroundCoverKind,THREE.InstancedMesh>();
  for(const [i,kind] of KINDS.entries()){
    const geometry=createGroundCoverGeometry(kind,41713+i*773),p=geometry.getAttribute('position'),roots:THREE.Vector3[]=[];
    let radius=0,minY=Infinity,height=0;
    for(let j=0;j<p.count;j++){minY=Math.min(minY,p.getY(j));height=Math.max(height,p.getY(j));radius=Math.max(radius,Math.hypot(p.getX(j),p.getZ(j)));}
    for(let j=0;j<p.count;j++)if(p.getY(j)<=minY+.0001)roots.push(new THREE.Vector3().fromBufferAttribute(p,j));
    supports.set(kind,{radius,height,roots});
    const capacity=kind==='grass'?14000:kind==='litter'?5000:3000;
    geometry.setAttribute('forestCellId',new THREE.InstancedBufferAttribute(new Float32Array(capacity),1));
    const role=kind==='pebble'?'stone':kind==='litter'||kind==='twig'?'dead':'living';
    const mesh=new THREE.InstancedMesh(geometry,materials.get(role)!,capacity);mesh.name=`EcologicalGround_${kind}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;mesh.visible=false;mesh.receiveShadow=true;
    mesh.castShadow=kind!=='grass'&&kind!=='litter';mesh.customDepthMaterial=depth;
    group.add(mesh);meshes.set(kind,mesh);
  }
  const sample=createGroundPlacementSampler(heightAt,protectedAt,trees,supports,blockedAt);
  const cache=new Map<string,GroundPlacement[]>();let currentKey='';
  const counts=Object.fromEntries(KINDS.map(kind=>[kind,0])) as Record<GroundCoverKind,number>;
  const prepare=(camera:THREE.Camera)=>{
    camera.updateWorldMatrix(true,false);view.setFromMatrixPosition(camera.matrixWorld);
    const cx=Math.floor(view.x/GROUND_CELL_SIZE),cz=Math.floor(view.z/GROUND_CELL_SIZE),key=`${cx},${cz}`;
    if(key===currentKey)return;
    currentKey=key;KINDS.forEach(kind=>{counts[kind]=0;});
    const active=new Set<string>(),centerX=(cx+.5)*GROUND_CELL_SIZE,centerZ=(cz+.5)*GROUND_CELL_SIZE;
    for(let z=cz-4;z<=cz+4;z++)for(let x=cx-4;x<=cx+4;x++){
      const tileKey=`${x},${z}`;active.add(tileKey);let plants=cache.get(tileKey);
      if(!plants){plants=sample(x,z);cache.set(tileKey,plants);}
      for(const plant of plants){
        if(Math.hypot(plant.x-centerX,plant.z-centerZ)>31)continue;
        const mesh=meshes.get(plant.kind)!,index=counts[plant.kind]++;
        if(index>=mesh.instanceMatrix.count)throw new Error(`Ground pool overflow: ${plant.kind}`);
        mesh.setMatrixAt(index,plant.matrix);mesh.setColorAt(index,plant.color);
      }
    }
    for(const [kind,mesh] of meshes){
      mesh.count=counts[kind];mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      if(mesh.count){mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.boundingBox!.expandByScalar(.11);mesh.boundingSphere!.radius+=.11;}
    }
    for(const tileKey of cache.keys()){if(cache.size<=CACHE_LIMIT)break;if(!active.has(tileKey))cache.delete(tileKey);}
    Object.assign(group.userData,{activeCell:key,cachedCells:cache.size,counts:{...counts},fadeStart:16,fadeEnd:24,cellSize:GROUND_CELL_SIZE,drawPools:KINDS.length});
  };
  Object.assign(group.userData,{scope:'Original nearby forest-floor geometry with deterministic habitat patches, root seating and main-camera/shadow distance coverage. Preliminary ecological module; not final visual acceptance.'});
  return {prepare,supports,meshes,cache,counts};
}

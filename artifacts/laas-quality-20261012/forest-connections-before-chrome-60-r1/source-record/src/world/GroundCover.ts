import * as THREE from 'three';
import {createGroundCoverGeometry,type GroundCoverKind} from './GroundCoverGeometry';
import {createGroundCoverMaterials} from './GroundCoverMaterials';
import {createGroundPlacementSampler,GROUND_CELL_SIZE,type GroundTree,type GroundCell,type GroundSupport} from './GroundCoverPlacement';

const KINDS:GroundCoverKind[]=['grass','sedge','fern','clover','flowers','litter','twig','pebble','mushroom','hazel','bramble','bilberry'];
const CACHE_LIMIT=256;
const REPACK_MOVEMENT=.75,CULL_DISTANCE=24+.8;

/** Pooled draws retain deterministic world plants. Cache membership changes
 * outside the 24m zero-coverage boundary, rather than swapping nearby patches. */
export function createGroundCover(parent:THREE.Group,heightAt:(x:number,z:number)=>number,protectedAt:(x:number,z:number,r:number)=>boolean,trees:readonly GroundTree[],time:{value:number},blockedAt:(x:number,y:number,z:number,r:number,bounds?:THREE.Box3)=>boolean=()=>false){
  const group=new THREE.Group();group.name='EcologicalForestFloor';parent.add(group);
  const {view,materials,depth}=createGroundCoverMaterials(time),supports=new Map<GroundCoverKind,GroundSupport>(),meshes=new Map<GroundCoverKind,THREE.InstancedMesh>();
  for(const [i,kind] of KINDS.entries()){
    const geometry=createGroundCoverGeometry(kind,41713+i*773),p=geometry.getAttribute('position'),roots:THREE.Vector3[]=[];
    let radius=0,minY=Infinity,height=0;
    for(let j=0;j<p.count;j++){minY=Math.min(minY,p.getY(j));height=Math.max(height,p.getY(j));radius=Math.max(radius,Math.hypot(p.getX(j),p.getZ(j)));}
    for(let j=0;j<p.count;j++)if(p.getY(j)<=minY+.0001)roots.push(new THREE.Vector3().fromBufferAttribute(p,j));
    supports.set(kind,{radius,height,roots,bounds:geometry.boundingBox!.clone()});
    const capacity=kind==='grass'?50000:kind==='hazel'||kind==='bramble'||kind==='bilberry'?1500:5000;
    geometry.setAttribute('forestCellId',new THREE.InstancedBufferAttribute(new Float32Array(capacity),1));
    const role=kind==='pebble'?'stone':kind==='litter'||kind==='twig'?'dead':'living';
    const mesh=new THREE.InstancedMesh(geometry,materials.get(role)!,capacity);mesh.name=`EcologicalGround_${kind}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;mesh.visible=false;mesh.receiveShadow=true;
    mesh.castShadow=kind!=='grass'&&kind!=='litter';mesh.customDepthMaterial=depth;
    group.add(mesh);meshes.set(kind,mesh);
  }
  const sample=createGroundPlacementSampler(heightAt,protectedAt,trees,supports,blockedAt);
  const cache=new Map<string,GroundCell>();let currentKey='';
  const packedView=new THREE.Vector3(Infinity,Infinity,Infinity);
  const counts=Object.fromEntries(KINDS.map(kind=>[kind,0])) as Record<GroundCoverKind,number>;
  const visibilityBox=new THREE.Box3(),instanceBox=new THREE.Box3(),instanceMatrix=new THREE.Matrix4(),instanceColor=new THREE.Color();
  const warmNextCell=(cx:number,cz:number)=>{
    let next:{x:number;z:number;key:string}|undefined,best=Infinity;
    // Fill one guard-ring cell per frame. A walking boundary then reuses the
    // already seated cells, instead of constructing nine whole strips at once.
    for(let z=cz-5;z<=cz+5;z++)for(let x=cx-5;x<=cx+5;x++){
      if(Math.abs(x-cx)<5&&Math.abs(z-cz)<5)continue;
      const key=`${x},${z}`;if(cache.has(key))continue;
      const distance=Math.hypot((x+.5)*GROUND_CELL_SIZE-view.x,(z+.5)*GROUND_CELL_SIZE-view.z);
      if(distance<best){best=distance;next={x,z,key};}
    }
    if(next)cache.set(next.key,sample(next.x,next.z));
    for(const key of cache.keys()){
      if(cache.size<=CACHE_LIMIT)break;
      const [x,z]=key.split(',').map(Number);if(Math.abs(x-cx)>5||Math.abs(z-cz)>5)cache.delete(key);
    }
    group.userData.cachedCells=cache.size;
  };
  const updateVisibility=()=>{
    group.updateWorldMatrix(true,false);
    for(const mesh of meshes.values())mesh.visible=mesh.count>0&&visibilityBox.copy(mesh.boundingBox!).applyMatrix4(group.matrixWorld).distanceToPoint(view)<=24;
  };
  const prepare=(camera:THREE.Camera)=>{
    camera.updateWorldMatrix(true,false);view.setFromMatrixPosition(camera.matrixWorld);
    const cx=Math.floor(view.x/GROUND_CELL_SIZE),cz=Math.floor(view.z/GROUND_CELL_SIZE),key=`${cx},${cz}`;
    if(key===currentKey&&packedView.distanceToSquared(view)<REPACK_MOVEMENT**2){warmNextCell(cx,cz);updateVisibility();return;}
    packedView.copy(view);
    currentKey=key;KINDS.forEach(kind=>{counts[kind]=0;});
    for(const mesh of meshes.values()){
      mesh.boundingBox??=new THREE.Box3();mesh.boundingBox.makeEmpty();
      mesh.boundingSphere??=new THREE.Sphere();
    }
    const active=new Set<string>();
    for(let z=cz-4;z<=cz+4;z++)for(let x=cx-4;x<=cx+4;x++){
      const tileKey=`${x},${z}`;active.add(tileKey);let cell=cache.get(tileKey);
      if(!cell){cell=sample(x,z);cache.set(tileKey,cell);}
      for(let i=0;i<cell.plants.length;i++){
        const plant=cell.plants[i],b=i*4,s=cell.spheres;
        const dx=s[b]-packedView.x,dy=s[b+1]-packedView.y,dz=s[b+2]-packedView.z;
        // Only wholly zero-coverage plants are culled. The .8m guard exceeds
        // .75m camera travel before rebuilding, so all fragments inside 24m
        // (including offscreen shadow casters) keep their actual geometry.
        if(dx*dx+dy*dy+dz*dz>(CULL_DISTANCE+s[b+3])**2)continue;
        const mesh=meshes.get(plant.kind)!,index=counts[plant.kind]++;
        if(index>=mesh.instanceMatrix.count)throw new Error(`Ground pool overflow: ${plant.kind}`);
        instanceMatrix.fromArray(cell.matrices,plant.matrixOffset);instanceColor.setRGB(plant.r,plant.g,plant.b);
        mesh.setMatrixAt(index,instanceMatrix);mesh.setColorAt(index,instanceColor);
        mesh.boundingBox!.union(instanceBox.copy(mesh.geometry.boundingBox!).applyMatrix4(instanceMatrix));
      }
    }
    for(const [kind,mesh] of meshes){
      mesh.count=counts[kind];mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      if(mesh.count){mesh.boundingBox!.expandByScalar(.11);mesh.boundingBox!.getBoundingSphere(mesh.boundingSphere!);}
    }
    for(const tileKey of cache.keys()){if(cache.size<=CACHE_LIMIT)break;if(!active.has(tileKey))cache.delete(tileKey);}
    Object.assign(group.userData,{activeCell:key,cachedCells:cache.size,counts:{...counts},fadeStart:16,fadeEnd:24,repackMovement:REPACK_MOVEMENT,cullDistance:CULL_DISTANCE,cellSize:GROUND_CELL_SIZE,drawPools:KINDS.length});
    updateVisibility();
    warmNextCell(cx,cz);
  };
  Object.assign(group.userData,{scope:'Original nearby forest-floor geometry with deterministic habitat patches, root seating and main-camera/shadow distance coverage. Preliminary ecological module; not final visual acceptance.'});
  return {prepare,supports,meshes,cache,counts};
}

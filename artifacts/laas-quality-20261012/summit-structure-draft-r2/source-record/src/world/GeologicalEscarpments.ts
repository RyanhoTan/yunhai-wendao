import * as THREE from 'three';
import {triangleBodySolid,type BodyCollisionMesh} from '../core/StaticBodyCollision';
import {createPackedBodyBuilder} from '../core/PackedBodyCollision';
import {createRockSurfaceMaterial} from './NaturalLandMaterial';
import {canonicalGeologicalBase,refineGeologicalFaces,type GeologicalBaseTriangle,type GeologicalFaceOwnership,type GeologicalRefinementVertex} from './GeologicalFaceRefinement';
import {TERRAIN_BOUNDS} from './WorldLayout';
import {createGeologicalDisplacement} from './GeologicalDisplacement';
import {fitGeologicalPatch} from './GeologicalPatch';

const bandHeight=1.25;

/** Subdivide steep heightfield triangles in metres of rock face, not metres
 * of horizontal map. Shared elevation cuts join neighbouring faces exactly.
 * The outward skin gives bedding shelves and joints real depth/overhangs. */
export function createGeologicalEscarpments(root:THREE.Group,heightAt:(x:number,z:number)=>number,surfaceExposure:(x:number,y:number,z:number)=>number,onProgress?:(record:Record<string,unknown>)=>void){
  const group=new THREE.Group();group.name='GeologicalEscarpments';root.add(group);
  const material=createRockSurfaceMaterial(),cameraOccluders:THREE.Box3[]=[],bodySolids:BodyCollisionMesh[]=[];
  type Batch={positions:number[];indices:number[];vertices:Map<string,number>;collision:ReturnType<typeof createPackedBodyBuilder>};
  const batches=new Map<string,Batch>(),eligible=new Set<string>();let cells=0;
  for(let z=TERRAIN_BOUNDS.minZ+2;z<94;z++)for(let x=TERRAIN_BOUNDS.minX+2;x<TERRAIN_BOUNDS.maxX-2;x++){
    const h=heightAt(x+.5,z+.5);if(h<22||surfaceExposure(x+.5,h,z+.5)<=0)continue;
    const heights=[heightAt(x,z),heightAt(x,z+1),heightAt(x+1,z),heightAt(x+1,z+1)];
    if(Math.max(...heights)-Math.min(...heights)>=1.8)eligible.add(`${x},${z}`);
  }
  const point=createGeologicalDisplacement(heightAt,surfaceExposure,eligible);
  const clip=(poly:THREE.Vector3[],height:number,above:boolean)=>{
    const result:THREE.Vector3[]=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],insideA=above?a.y>=height:a.y<=height,insideB=above?b.y>=height:b.y<=height;
      if(insideA)result.push(a);
      if(insideA!==insideB)result.push(a.clone().lerp(b,(height-a.y)/(b.y-a.y)));
    }
    return result;
  };
  const baseFaces:GeologicalBaseTriangle[]=[];
  for(const cell of eligible){
    const [x,z]=cell.split(',').map(Number);
    const corners=[new THREE.Vector3(x,heightAt(x,z),z),new THREE.Vector3(x,heightAt(x,z+1),z+1),new THREE.Vector3(x+1,heightAt(x+1,z),z),new THREE.Vector3(x+1,heightAt(x+1,z+1),z+1)];
    const key=`${Math.floor(x/48)},${Math.floor(z/48)}`;
    for(const indices of [[0,1,2],[2,1,3]]){
      const triangle=indices.map(i=>corners[i]),lo=Math.min(...triangle.map(p=>p.y)),hi=Math.max(...triangle.map(p=>p.y));
      for(let row=Math.floor(lo/bandHeight);row<=Math.floor(hi/bandHeight);row++){
        const poly=clip(clip(triangle,row*bandHeight,true),(row+1)*bandHeight,false);
        for(let i=1;i<poly.length-1;i++){
          if(new THREE.Vector3().subVectors(poly[i],poly[0]).cross(new THREE.Vector3().subVectors(poly[i+1],poly[0])).lengthSq()<1e-12)continue;
          const metadata:GeologicalFaceOwnership={batch:key,cell,row};
          baseFaces.push({base:[poly[0],poly[i],poly[i+1]],metadata});
        }
      }
    }
    cells++;
  }
  // This module refines the main mountain, keeping other land and the coast
  // at their existing resolution. All main-mountain tiles share decisions.
  // Lock only edges shared with the unchanged outer mesh to keep it conforming.
  const inPatch=(t:GeologicalBaseTriangle)=>t.base.every(p=>p.x>=-170&&p.x<=170&&p.z>=-160&&p.z<=94);
  const fitted=fitGeologicalPatch(baseFaces,inPatch,p=>point(new THREE.Vector3(p.x,p.y,p.z)));
  const {patch,outer,protectedEdgeKeys}=fitted;
  onProgress?.({phase:'base',inputTriangles:baseFaces.length,patchTriangles:patch.length,outerTriangles:outer.length,protectedEdges:protectedEdgeKeys.size,patchBoundary:fitted.stats});
  const refined=refineGeologicalFaces(patch,p=>point(new THREE.Vector3(p.x,p.y,p.z)),{maxIterations:16,maxTriangles:1000000,protectedEdgeKeys,onInputConsumed:()=>{baseFaces.length=0;patch.length=0;}});
  onProgress?.({phase:'refined',...refined.stats});
  const boundaryVertices=new Map<string,GeologicalRefinementVertex>();
  for(const edge of protectedEdgeKeys)for(const key of edge.split('|')){const vertex=refined.vertexCache.get(key);if(vertex)boundaryVertices.set(key,vertex);}
  refined.vertexCache.clear();
  const refinedBounds=new Map<string,THREE.Box3>();
  const append=(triangle:{metadata:GeologicalFaceOwnership;vertices:readonly GeologicalRefinementVertex[]})=>{
    const {metadata,vertices}=triangle,[a,b,c]=vertices;
    if(new THREE.Vector3().subVectors(b.world,a.world).cross(new THREE.Vector3().subVectors(c.world,a.world)).lengthSq()<1e-12)return;
    const batch:Batch=batches.get(metadata.batch)??{positions:[],indices:[],vertices:new Map(),collision:createPackedBodyBuilder()};batches.set(metadata.batch,batch);
    for(const vertex of vertices){
      let index=batch.vertices.get(vertex.key);
      if(index===undefined){index=batch.positions.length/3;batch.vertices.set(vertex.key,index);batch.positions.push(...vertex.world.toArray());}
      batch.indices.push(index);
    }
    batch.collision.append(triangleBodySolid(a.world,b.world,c.world,.08,.06));
    const boundsKey=`${metadata.cell}/${metadata.row}`,box=refinedBounds.get(boundsKey)??new THREE.Box3();
    for(const vertex of vertices)box.expandByPoint(vertex.world);
    refinedBounds.set(boundsKey,box);
  };
  for(let i=0;i<refined.triangles.length;i++){
    append(refined.triangles[i]);
    // Release each authoring face as its runtime representation is built.
    delete refined.triangles[i];
  }
  const outerVertices=new Map<string,GeologicalRefinementVertex>();
  for(const t of outer){
    const vertices=t.base.map(p=>{const base=canonicalGeologicalBase(p),key=base.toArray().join(',');let vertex=outerVertices.get(key)??boundaryVertices.get(key);
      if(!vertex){vertex={key,base,world:point(base)};outerVertices.set(key,vertex);}return vertex;});
    append({metadata:t.metadata,vertices});
  }
  const unrefinedOuterTriangles=outer.length;
  // Collision faces already own their points; release authoring/probe data
  // before allocating GPU buffers and cross-tile normals.
  outerVertices.clear();boundaryVertices.clear();refined.triangles.length=0;
  baseFaces.length=0;patch.length=0;outer.length=0;
  for(const bounds of refinedBounds.values())cameraOccluders.push(bounds);
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
    bodySolids.push(batch.collision.finish());
  }
  if(!group.children.length)material.dispose();
  group.userData={cells,tiles:group.children.length,triangles:bodySolids.reduce((n,b)=>n+b.solids.length+(b.packed?.count??0),0),bodyCollisionStorage:'packed-float64',bodyCollisionBytes:bodySolids.reduce((n,b)=>n+(b.packed?.chunks.reduce((sum,chunk)=>sum+chunk.byteLength,0)??0),0),bandHeight,maxOutward:12,coastLimitZ:94,refinement:{...refined.stats,scope:'main-mountain-with-conforming-border',seedBounds:{minX:-170,maxX:170,minZ:-160,maxZ:94},patchBoundary:fitted.stats,unrefinedOuterTriangles}};
  return {rainOccluders:cameraOccluders,cameraMeshes:group.children as THREE.Mesh[],bodySolids};
}

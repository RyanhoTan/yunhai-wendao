import * as THREE from 'three';
import {canonicalGeologicalBase,canonicalGeologicalEdgeKey,GEOLOGICAL_MAX_EDGE_LENGTH,GEOLOGICAL_MAX_MIDPOINT_ERROR,type GeologicalBaseTriangle,type GeologicalPointResolver} from './GeologicalFaceRefinement';

/** Move the resolution seam away from curved edges. A fixed coarse edge with
 * excessive curvature can make its fine neighbours mathematically unable to
 * converge. Add its actual adjacent source faces, keeping all source topology. */
export function fitGeologicalPatch(input:readonly GeologicalBaseTriangle[],select:(face:GeologicalBaseTriangle)=>boolean,resolve:GeologicalPointResolver,maxAddedFaces=20000){
  const patch=input.filter(select),selectedEdges=new Set<string>();
  const edges=(t:GeologicalBaseTriangle)=>[0,1,2].map(i=>canonicalGeologicalEdgeKey(t.base[i],t.base[(i+1)%3]));
  for(const face of patch)for(const key of edges(face))selectedEdges.add(key);
  type Outer={face:GeologicalBaseTriangle;keys:string[]};
  const outer=new Set<Outer>(),cells=new Map<string,Set<Outer>>(),owners=new Map<string,Set<Outer>>();
  for(const face of input){
    if(select(face))continue;
    const record={face,keys:edges(face)},cell=cells.get(face.metadata.cell)??new Set<Outer>();cell.add(record);cells.set(face.metadata.cell,cell);outer.add(record);
    for(const key of record.keys)if(selectedEdges.has(key)){const list=owners.get(key)??new Set<Outer>();list.add(record);owners.set(key,list);}
  }
  selectedEdges.clear();
  const protectedEdgeKeys=new Set(owners.keys()),pending=[...protectedEdgeKeys],checked=new Map<string,{length:number;error:number}>();
  const vertices=new Map<string,{base:THREE.Vector3;world:THREE.Vector3}>();
  const vertex=(key:string)=>{let v=vertices.get(key);if(!v){const base=new THREE.Vector3(...key.split(',').map(Number) as [number,number,number]);v={base,world:resolve(base.clone()).clone()};vertices.set(key,v);}return v;};
  const inspect=(key:string)=>{
    let m=checked.get(key);if(m)return m;
    const [ka,kb]=key.split('|'),a=vertex(ka),b=vertex(kb),mid=canonicalGeologicalBase(a.base.clone().add(b.base).multiplyScalar(.5));
    m={length:a.world.distanceTo(b.world),error:resolve(mid).distanceTo(a.world.clone().add(b.world).multiplyScalar(.5))};checked.set(key,m);return m;
  };
  const adjacent=(key:string)=>{
    const a=vertex(key.split('|')[0]).base,cx=Math.floor(a.x),cz=Math.floor(a.z),found=new Set<Outer>();
    for(let z=cz-1;z<=cz+1;z++)for(let x=cx-1;x<=cx+1;x++)for(const record of cells.get(`${x},${z}`)??[])if(record.keys.includes(key))found.add(record);
    return found;
  };
  let addedFaces=0;
  for(let i=0;i<pending.length;i++){
    const key=pending[i];if(!protectedEdgeKeys.has(key))continue;
    const m=inspect(key);if(m.length<=GEOLOGICAL_MAX_EDGE_LENGTH&&m.error<=GEOLOGICAL_MAX_MIDPOINT_ERROR)continue;
    const neighbours=owners.get(key);if(!neighbours||addedFaces+neighbours.size>maxAddedFaces)continue;
    const updated=new Set<string>();
    for(const record of neighbours){
      if(!outer.delete(record))continue;
      cells.get(record.face.metadata.cell)!.delete(record);patch.push(record.face);addedFaces++;
      for(const edge of record.keys)updated.add(edge);
    }
    for(const edge of updated){
      const remaining=adjacent(edge);
      if(remaining.size){owners.set(edge,remaining);protectedEdgeKeys.add(edge);pending.push(edge);}
      else{owners.delete(edge);protectedEdgeKeys.delete(edge);}
    }
  }
  let unresolvedLength=0,unresolvedCurvature=0,maxLength=0,maxError=0;
  for(const key of protectedEdgeKeys){const m=inspect(key);maxLength=Math.max(maxLength,m.length);maxError=Math.max(maxError,m.error);unresolvedLength+=Number(m.length>GEOLOGICAL_MAX_EDGE_LENGTH);unresolvedCurvature+=Number(m.error>GEOLOGICAL_MAX_MIDPOINT_ERROR);}
  const bounds=new THREE.Box3(),actualCells=new Set<string>();
  for(const face of patch){actualCells.add(face.metadata.cell);for(const p of face.base)bounds.expandByPoint(p);}
  const stats={addedFaces,actualCells:actualCells.size,actualBaseBounds:patch.length?{min:bounds.min.toArray(),max:bounds.max.toArray()}:null,protectedEdges:protectedEdgeKeys.size,unresolvedLength,unresolvedCurvature,maxLength,maxError,converged:unresolvedLength===0&&unresolvedCurvature===0,maxAddedFaces};
  return {patch,outer:[...outer].map(r=>r.face),protectedEdgeKeys,stats};
}

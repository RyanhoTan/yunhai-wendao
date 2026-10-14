import type {Box3} from 'three';

const cellSize=16;
const indices=new WeakMap<readonly Box3[],{count:number;cells:Map<string,Box3[]>}>();

/** Static world bounds are shared by camera and rain. Query only intersecting
 * horizontal cells so finely subdivided rock faces do not require a world scan.
 * Boxes remain immutable after indexing; replace the array to move/replace
 * bounds. Appending during world assembly is detected by the array length. */
export function nearbyStaticOccluders(boxes:readonly Box3[],minX:number,maxX:number,minZ:number,maxZ:number){
  let index=indices.get(boxes);
  if(!index||index.count!==boxes.length){
    const cells=new Map<string,Box3[]>();
    for(const box of boxes)for(let z=Math.floor(box.min.z/cellSize);z<=Math.floor(box.max.z/cellSize);z++)for(let x=Math.floor(box.min.x/cellSize);x<=Math.floor(box.max.x/cellSize);x++){
      const key=`${x},${z}`,list=cells.get(key)??[];list.push(box);cells.set(key,list);
    }
    index={count:boxes.length,cells};indices.set(boxes,index);
  }
  const found=new Set<Box3>();
  for(let z=Math.floor(minZ/cellSize);z<=Math.floor(maxZ/cellSize);z++)for(let x=Math.floor(minX/cellSize);x<=Math.floor(maxX/cellSize);x++)for(const box of index.cells.get(`${x},${z}`)??[])
    if(box.min.x<=maxX&&box.max.x>=minX&&box.min.z<=maxZ&&box.max.z>=minZ)found.add(box);
  return found;
}

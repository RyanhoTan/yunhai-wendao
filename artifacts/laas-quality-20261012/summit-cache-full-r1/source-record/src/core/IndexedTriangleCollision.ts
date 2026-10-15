import {Box3,Vector3} from 'three';
import {PLAYER_BODY,triangleBodySolid} from './StaticBodyCollision';
import type {BodyCollisionMesh,BodySolid} from './StaticBodyCollision';

export type IndexedTriangleData={
  /** Immutable geometry buffers; shared with the caller, without copying. */
  positions:Float64Array;indices:Uint32Array;count:number;below:number;above:number;
  cellSize:number;minCellX:number;minCellZ:number;width:number;depth:number;
  /** CSR grid: triangleIds[cellOffsets[cell] ... cellOffsets[cell+1]]. */
  cellOffsets:Uint32Array;triangleIds:Uint32Array;
};
type Inset={min:{x:number;y:number;z:number};max:{x:number;y:number;z:number}};
const CELL_SIZE=4;
const MAX_GRID_CELLS=2_000_000;

/** Matches setFromPoints(a,b,c), then min.add(-r,-below-height,-r)
 * and max.add(r,above,r), in the original SAT constructor's arithmetic order. */
function expandedBounds(positions:Float64Array,indices:Uint32Array,id:number,below:number,above:number,out:Float64Array):void{
  const offset=id*3,a=indices[offset]*3,b=indices[offset+1]*3,c=indices[offset+2]*3,radius=PLAYER_BODY.radius;
  out[0]=Math.min(positions[a],positions[b],positions[c])+(-radius);
  out[1]=Math.min(positions[a+1],positions[b+1],positions[c+1])+(-below-PLAYER_BODY.height);
  out[2]=Math.min(positions[a+2],positions[b+2],positions[c+2])+(-radius);
  out[3]=Math.max(positions[a],positions[b],positions[c])+radius;
  out[4]=Math.max(positions[a+1],positions[b+1],positions[c+1])+above;
  out[5]=Math.max(positions[a+2],positions[b+2],positions[c+2])+radius;
}

/** No SAT objects or per-triangle bounds remain resident. Geometry and player
 * dimensions must stay immutable after building this spatial index. Dense
 * grid area is bounded; exceptionally large triangles can still produce many
 * cell references. Storage bytes are the sum of the four typed-array views. */
export function createIndexedTriangleCollision(
  positions:Float64Array,
  indices:Uint32Array,
  minInset=.08,
  maxInset=.06,
):BodyCollisionMesh&{indexedTriangles:IndexedTriangleData}{
  if(positions.length%3||indices.length%3)throw new RangeError('Indexed collision buffers must contain complete XYZ vertices and triangle triples.');
  if(!Number.isFinite(minInset)||!Number.isFinite(maxInset))throw new RangeError('Indexed collision slab depths must be finite.');
  for(const value of positions)if(!Number.isFinite(value))throw new RangeError('Indexed collision positions must be finite.');
  const vertexCount=positions.length/3,count=indices.length/3;
  for(const index of indices)if(index>=vertexCount)throw new RangeError('Indexed collision triangle references a missing vertex.');
  const bounds=new Box3(),scratch=new Float64Array(6);
  for(let id=0;id<count;id++){
    expandedBounds(positions,indices,id,minInset,maxInset,scratch);
    bounds.min.set(Math.min(bounds.min.x,scratch[0]),Math.min(bounds.min.y,scratch[1]),Math.min(bounds.min.z,scratch[2]));
    bounds.max.set(Math.max(bounds.max.x,scratch[3]),Math.max(bounds.max.y,scratch[4]),Math.max(bounds.max.z,scratch[5]));
  }
  const minCellX=count?Math.floor(bounds.min.x/CELL_SIZE):0,minCellZ=count?Math.floor(bounds.min.z/CELL_SIZE):0;
  const maxCellX=count?Math.floor(bounds.max.x/CELL_SIZE):-1,maxCellZ=count?Math.floor(bounds.max.z/CELL_SIZE):-1;
  const width=maxCellX-minCellX+1,depth=maxCellZ-minCellZ+1,cells=width*depth;
  if(!Number.isSafeInteger(minCellX)||!Number.isSafeInteger(minCellZ)||!Number.isSafeInteger(maxCellX)||!Number.isSafeInteger(maxCellZ)
    ||!Number.isSafeInteger(cells)||cells>MAX_GRID_CELLS)throw new RangeError('Indexed collision XZ grid exceeds its supported area.');
  const counts=new Uint32Array(cells),cellOffsets=new Uint32Array(cells+1);
  for(let id=0;id<count;id++){
    expandedBounds(positions,indices,id,minInset,maxInset,scratch);
    const loX=Math.floor(scratch[0]/CELL_SIZE)-minCellX,hiX=Math.floor(scratch[3]/CELL_SIZE)-minCellX,loZ=Math.floor(scratch[2]/CELL_SIZE)-minCellZ,hiZ=Math.floor(scratch[5]/CELL_SIZE)-minCellZ;
    for(let z=loZ;z<=hiZ;z++)for(let x=loX;x<=hiX;x++)counts[z*width+x]++;
  }
  let references=0;
  for(let cell=0;cell<cells;cell++){
    cellOffsets[cell]=references;references+=counts[cell];
    if(references>0xffffffff)throw new RangeError('Indexed collision cell references exceed Uint32 capacity.');
  }
  cellOffsets[cells]=references;
  const triangleIds=new Uint32Array(references);counts.fill(0);
  for(let id=0;id<count;id++){
    expandedBounds(positions,indices,id,minInset,maxInset,scratch);
    const loX=Math.floor(scratch[0]/CELL_SIZE)-minCellX,hiX=Math.floor(scratch[3]/CELL_SIZE)-minCellX,loZ=Math.floor(scratch[2]/CELL_SIZE)-minCellZ,hiZ=Math.floor(scratch[5]/CELL_SIZE)-minCellZ;
    for(let z=loZ;z<=hiZ;z++)for(let x=loX;x<=hiX;x++){
      const cell=z*width+x;triangleIds[cellOffsets[cell]+counts[cell]++]=id;
    }
  }
  return {bounds,solids:[],indexedTriangles:{positions,indices,count,below:minInset,above:maxInset,cellSize:CELL_SIZE,minCellX,minCellZ,width,depth,cellOffsets,triangleIds}};
}

/** Grid selection includes the original expanded footprint, also for negative
 * insets that expand a query's effective reach. Candidates are deduplicated and
 * visited in original triangle order, preserving SAT sweep tie decisions.
 * Insets affect only the prefilter; visitors receive the original SAT bounds. */
export function visitIndexedTriangleSolids(data:IndexedTriangleData,query:Box3,visitor:(solid:BodySolid)=>boolean,inset?:Inset):boolean{
  if(!data.count)return false;
  const insetMinX=inset?.min.x??0,insetMinY=inset?.min.y??0,insetMinZ=inset?.min.z??0;
  const insetMaxX=inset?.max.x??0,insetMaxY=inset?.max.y??0,insetMaxZ=inset?.max.z??0;
  const qx0=query.min.x+insetMaxX,qx1=query.max.x-insetMinX,qz0=query.min.z+insetMaxZ,qz1=query.max.z-insetMinZ;
  // Inverse floating-point addition can round across a cell boundary even
  // when the original bounds-minus-inset predicate includes the contact.
  // Widen only this broad phase; the exact original predicate below decides.
  const guard=(value:number,shift:number,translated:number)=>!shift||!Number.isFinite(translated)?0:4*Number.EPSILON*(Math.abs(value)+Math.abs(shift)+1);
  const gx0=guard(query.min.x,insetMaxX,qx0),gx1=guard(query.max.x,insetMinX,qx1),gz0=guard(query.min.z,insetMaxZ,qz0),gz1=guard(query.max.z,insetMinZ,qz1);
  const x0=Math.floor(Math.min(qx0-gx0,qx1-gx1)/data.cellSize)-data.minCellX,x1=Math.floor(Math.max(qx0+gx0,qx1+gx1)/data.cellSize)-data.minCellX;
  const z0=Math.floor(Math.min(qz0-gz0,qz1-gz1)/data.cellSize)-data.minCellZ,z1=Math.floor(Math.max(qz0+gz0,qz1+gz1)/data.cellSize)-data.minCellZ;
  const loX=Number.isNaN(x0)?0:Math.max(0,x0),hiX=Number.isNaN(x1)?data.width-1:Math.min(data.width-1,x1);
  const loZ=Number.isNaN(z0)?0:Math.max(0,z0),hiZ=Number.isNaN(z1)?data.depth-1:Math.min(data.depth-1,z1);
  const candidates=new Set<number>();
  for(let z=loZ;z<=hiZ;z++)for(let x=loX;x<=hiX;x++){
    const cell=z*data.width+x;
    for(let i=data.cellOffsets[cell];i<data.cellOffsets[cell+1];i++)candidates.add(data.triangleIds[i]);
  }
  const ids=Array.from(candidates).sort((a,b)=>a-b),scratch=new Float64Array(6);
  let a:Vector3|undefined,b:Vector3|undefined,c:Vector3|undefined;
  for(const id of ids){
    expandedBounds(data.positions,data.indices,id,data.below,data.above,scratch);
    if(query.max.x>=scratch[0]+insetMinX&&query.min.x<=scratch[3]-insetMaxX
      &&query.max.y>=scratch[1]+insetMinY&&query.min.y<=scratch[4]-insetMaxY
      &&query.max.z>=scratch[2]+insetMinZ&&query.min.z<=scratch[5]-insetMaxZ){
      a??=new Vector3();b??=new Vector3();c??=new Vector3();const offset=id*3;
      a.fromArray(data.positions,data.indices[offset]*3);b.fromArray(data.positions,data.indices[offset+1]*3);c.fromArray(data.positions,data.indices[offset+2]*3);
      if(visitor(triangleBodySolid(a,b,c,data.below,data.above)))return true;
    }
  }
  return false;
}

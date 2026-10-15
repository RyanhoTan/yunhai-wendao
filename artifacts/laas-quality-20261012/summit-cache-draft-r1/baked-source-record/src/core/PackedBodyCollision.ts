import {Box3} from 'three';
import type {BodyCollisionMesh,BodySolid} from './StaticBodyCollision';

/** Each used chunk contains complete records, without trailing padding:
 * [axisCount, minX, minY, minZ, maxX, maxY, maxZ, ...x,y,z,min,max]. */
export type PackedBodyData={chunks:readonly Float64Array[];count:number};
type Inset={min:{x:number;y:number;z:number};max:{x:number;y:number;z:number}};
const CHUNK_DOUBLES=8192;
const HEADER_DOUBLES=7;
const AXIS_DOUBLES=5;

/** Copies a solid immediately. No authoring Box3/Axis references survive an
 * append, and finish never flattens the chunks into another world-size array. */
export function createPackedBodyBuilder():{append(solid:BodySolid):void;finish():BodyCollisionMesh}{
  const bounds=new Box3(),chunks:Float64Array[]=[];
  let current:Float64Array|undefined,used=0,count=0,result:BodyCollisionMesh|undefined;
  return {
    append(solid){
      if(result)throw new Error('Cannot append to a finished packed body builder.');
      const axisCount=solid.axes.length,size=HEADER_DOUBLES+AXIS_DOUBLES*axisCount;
      if(size>CHUNK_DOUBLES)throw new RangeError('A packed body solid must fit in one 8192-double chunk.');
      if(!current||used+size>current.length){
        if(current&&used)chunks.push(current.subarray(0,used));
        current=new Float64Array(CHUNK_DOUBLES);used=0;
      }
      const min=solid.bounds.min,max=solid.bounds.max;
      current[used++]=axisCount;
      current[used++]=min.x;current[used++]=min.y;current[used++]=min.z;
      current[used++]=max.x;current[used++]=max.y;current[used++]=max.z;
      for(const axis of solid.axes){
        current[used++]=axis.x;current[used++]=axis.y;current[used++]=axis.z;
        current[used++]=axis.min;current[used++]=axis.max;
      }
      bounds.union(solid.bounds);count++;
    },
    finish(){
      if(!result){
        if(current&&used)chunks.push(current.subarray(0,used));
        current=undefined;used=0;
        result={bounds,solids:[],packed:{chunks,count}};
      }
      return result;
    },
  };
}

/** Visits intersecting records in append order. Bounds/axes are read live
 * from the supplied Float64 chunks on every query. Only a bounds hit allocates
 * the query-local view: one Box3 and a reusable high-water-mark Axis pool.
 * The visitor must neither retain nor modify that borrowed view. Returning
 * true stops immediately. Insets affect broad-phase testing, not decoded data.
 * Data must retain the valid, complete-record layout produced by the builder. */
export function visitPackedBodySolids(
  data:PackedBodyData,
  query:Box3,
  visitor:(solid:BodySolid)=>boolean,
  inset?:Inset,
):boolean{
  const minInsetX=inset?.min.x??0,minInsetY=inset?.min.y??0,minInsetZ=inset?.min.z??0;
  const maxInsetX=inset?.max.x??0,maxInsetY=inset?.max.y??0,maxInsetZ=inset?.max.z??0;
  const pool:BodySolid['axes']=[];
  let view:BodySolid|undefined,records=0;
  for(const chunk of data.chunks){
    for(let offset=0;offset<chunk.length&&records<data.count;records++){
      const axisCount=chunk[offset],next=offset+HEADER_DOUBLES+axisCount*AXIS_DOUBLES;
      const minX=chunk[offset+1],minY=chunk[offset+2],minZ=chunk[offset+3],maxX=chunk[offset+4],maxY=chunk[offset+5],maxZ=chunk[offset+6];
      if(query.max.x>=minX+minInsetX&&query.min.x<=maxX-maxInsetX
        &&query.max.y>=minY+minInsetY&&query.min.y<=maxY-maxInsetY
        &&query.max.z>=minZ+minInsetZ&&query.min.z<=maxZ-maxInsetZ){
        view??={bounds:new Box3(),axes:[]};
        view.bounds.min.set(minX,minY,minZ);view.bounds.max.set(maxX,maxY,maxZ);
        view.axes.length=axisCount;
        for(let i=0,index=offset+HEADER_DOUBLES;i<axisCount;i++,index+=AXIS_DOUBLES){
          const axis=pool[i]??(pool[i]={x:0,y:0,z:0,min:0,max:0});
          axis.x=chunk[index];axis.y=chunk[index+1];axis.z=chunk[index+2];axis.min=chunk[index+3];axis.max=chunk[index+4];
          view.axes[i]=axis;
        }
        if(visitor(view))return true;
      }
      offset=next;
    }
    if(records===data.count)break;
  }
  return false;
}

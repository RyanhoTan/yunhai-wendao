import {expect,test} from '@playwright/test';
import {Box3,Vector3} from 'three';
import {createPackedBodyBuilder,visitPackedBodySolids,type PackedBodyData} from '../src/core/PackedBodyCollision';
import {bodyCollisionMesh,bodyPointBlocked,boxBodySolid,constrainBodySolids,triangleBodySolid,type BodySolid} from '../src/core/StaticBodyCollision';
import {createGroundObstacleQuery} from '../src/world/GroundCoverObstacles';

const box=(minX:number,minY:number,minZ:number,maxX:number,maxY:number,maxZ:number)=>new Box3(new Vector3(minX,minY,minZ),new Vector3(maxX,maxY,maxZ));
const all=()=>box(-Infinity,-Infinity,-Infinity,Infinity,Infinity,Infinity);
const record=(solid:BodySolid)=>[solid.axes.length,...solid.bounds.min.toArray(),...solid.bounds.max.toArray(),...solid.axes.flatMap(a=>[a.x,a.y,a.z,a.min,a.max])];
const snapshot=(solid:BodySolid)=>({bounds:[...solid.bounds.min.toArray(),...solid.bounds.max.toArray()],axes:solid.axes.map(a=>({...a}))});
const bits=(values:readonly number[])=>Array.from(new BigUint64Array(new Float64Array(values).buffer));
const pack=(solids:BodySolid[])=>{const builder=createPackedBodyBuilder();solids.forEach(solid=>builder.append(solid));return builder.finish();};

test('packing preserves every Float64 bit and union bounds while owning no source solid references',()=>{
  const solids=[
    triangleBodySolid(new Vector3(-3.125,.03125,1/3),new Vector3(2.1,Math.PI,-2.7),new Vector3(.125,4.01,5.3),.08,.06),
    boxBodySolid(box(-2,-1,-3,4,6,8)),
    {bounds:box(-1,0,-2,2,3,5),axes:[{x:-0,y:Number.MIN_VALUE,z:Number.EPSILON,min:-Math.PI,max:Math.PI}]},
  ],expected=solids.flatMap(record),expectedBounds=bodyCollisionMesh(solids).bounds.clone(),builder=createPackedBodyBuilder();
  solids.forEach(solid=>builder.append(solid));
  solids[0].bounds.min.set(-10000,-10000,-10000);solids[0].axes[0].x=12345;
  const mesh=builder.finish(),data=mesh.packed!;
  expect(mesh.solids).toEqual([]);expect(data.count).toBe(3);expect(mesh.bounds.equals(expectedBounds)).toBe(true);
  expect(bits(data.chunks.flatMap(chunk=>Array.from(chunk)))).toEqual(bits(expected));
  expect(builder.finish()).toBe(mesh);expect(()=>builder.append(solids[1])).toThrow(/finished/);
});

test('chunk rollover keeps whole variable-length records in order without padding records or flattening',()=>{
  const builder=createPackedBodyBuilder(),expected:number[][]=[];
  for(let i=0;i<600;i++){
    const solid={bounds:box(i*.125,-i*.25,-3,i*.125+2,3,i*.5+1),axes:Array.from({length:i%13+1},(_,j)=>({x:(i+1)/(j+3),y:-j*.125,z:-0,min:-i-j/3,max:i+j/7}))};
    expected.push(record(solid));builder.append(solid);
  }
  const data=builder.finish().packed!;expect(data.count).toBe(600);expect(data.chunks.length).toBeGreaterThan(1);
  let count=0;
  for(const chunk of data.chunks){
    expect(chunk.length).toBeLessThanOrEqual(8192);expect(chunk.buffer.byteLength).toBe(8192*8);
    let offset=0;
    while(offset<chunk.length){const length=7+chunk[offset]*5;expect(offset+length).toBeLessThanOrEqual(chunk.length);expect(bits(Array.from(chunk.subarray(offset,offset+length)))).toEqual(bits(expected[count++]));offset+=length;}
    expect(offset).toBe(chunk.length);
  }
  expect(count).toBe(600);let visited=0;visitPackedBodySolids(data,all(),()=>{visited++;return false;});expect(visited).toBe(600);
});

test('query broad phase matches inclusive original bounds, including nonuniform insets and touching planes',()=>{
  const solids=[boxBodySolid(box(-2,0,0,0,2,2)),boxBodySolid(box(0,0,0,2,2,2)),boxBodySolid(box(3,-2,-1,5,4,3))],data=pack(solids).packed!;
  const queries=[box(0,0,0,0,0,0),box(.2,.3,.4,1.8,1.5,1.7),box(-4,-4,-4,-3,-3,-3),box(5.55,4,3.55,5.55,4,3.55),all()];
  for(const inset of [undefined,{min:{x:.1,y:.2,z:.3},max:{x:.4,y:.15,z:.25}},{min:{x:-.5,y:-.1,z:-.2},max:{x:-.2,y:-.3,z:-.4}}])for(const query of queries){
    const expected=solids.filter(solid=>{
      const bounds=solid.bounds.clone();if(inset){bounds.min.add(new Vector3(inset.min.x,inset.min.y,inset.min.z));bounds.max.sub(new Vector3(inset.max.x,inset.max.y,inset.max.z));}return bounds.intersectsBox(query);
    }).map(snapshot),actual:ReturnType<typeof snapshot>[]=[];
    expect(visitPackedBodySolids(data,query,solid=>{actual.push(snapshot(solid));return false;},inset)).toBe(false);
    expect(actual).toEqual(expected);
  }
});

test('visitor reads live packed bounds and axis values and does not cache decoded query results',()=>{
  const data=pack([{bounds:box(0,0,0,1,1,1),axes:[{x:1,y:0,z:0,min:0,max:1}]}]).packed!,chunk=data.chunks[0];
  let visited=0;visitPackedBodySolids(data,box(0,0,0,1,1,1),()=>{visited++;return false;});expect(visited).toBe(1);
  chunk[1]=5;chunk[4]=6;chunk[7]=Math.PI;chunk[10]=-0;chunk[11]=1/3;
  visitPackedBodySolids(data,box(0,0,0,1,1,1),()=>{visited++;return false;});expect(visited).toBe(1);
  visitPackedBodySolids(data,box(5,0,0,6,1,1),solid=>{expect(solid.bounds.min.x).toBe(5);expect(solid.bounds.max.x).toBe(6);expect(bits([solid.axes[0].x,solid.axes[0].min,solid.axes[0].max])).toEqual(bits([Math.PI,-0,1/3]));visited++;return false;});
  expect(visited).toBe(2);
});

test('one query reuses one borrowed solid/axis pool and true stops at the first hit',()=>{
  const counts=[13,1,0,7,13],solids=counts.map(count=>({bounds:box(0,0,0,1,1,1),axes:Array.from({length:count},(_,i)=>({x:1,y:0,z:0,min:-i,max:i+1}))})),data=pack(solids).packed!;
  const views=new WeakSet<object>(),axisPool=new WeakSet<object>();let uniqueViews=0,uniqueAxes=0,hits=0;
  visitPackedBodySolids(data,all(),solid=>{
    if(!views.has(solid)){views.add(solid);uniqueViews++;}expect(solid.axes.length).toBe(counts[hits]);
    for(const axis of solid.axes)if(!axisPool.has(axis)){axisPool.add(axis);uniqueAxes++;}
    hits++;return false;
  });
  expect(hits).toBe(counts.length);expect(uniqueViews).toBe(1);expect(uniqueAxes).toBe(13);
  let early=0;expect(visitPackedBodySolids(data,all(),()=>{early++;return true;})).toBe(true);expect(early).toBe(1);
  let miss=0;expect(visitPackedBodySolids(data,box(100,100,100,101,101,101),()=>{miss++;return true;})).toBe(false);expect(miss).toBe(0);
  const limited:PackedBodyData={chunks:data.chunks,count:1};let limitedHits=0;visitPackedBodySolids(limited,all(),()=>{limitedHits++;return false;});expect(limitedHits).toBe(1);
});

test('empty builder returns an empty union and oversized records fail before changing builder contents',()=>{
  const empty=createPackedBodyBuilder().finish();expect(empty.bounds.isEmpty()).toBe(true);expect(empty.solids).toEqual([]);expect(empty.packed).toEqual({chunks:[],count:0});
  expect(visitPackedBodySolids(empty.packed!,all(),()=>true)).toBe(false);
  const builder=createPackedBodyBuilder(),solid={bounds:box(0,0,0,1,1,1),axes:Array.from({length:1638},()=>({x:1,y:0,z:0,min:0,max:1}))};
  expect(()=>builder.append(solid)).toThrow(/fit/);expect(builder.finish().packed!.count).toBe(0);
});

test('packed and original SAT data produce identical point and continuous-sweep results',()=>{
  const solids=[
    boxBodySolid(box(-3,0,-3,3,1,3)),boxBodySolid(box(2,1,-2,2.3,7,2)),
    triangleBodySolid(new Vector3(-4,1,-2),new Vector3(-1,4,-2),new Vector3(-1,4,2),.08,.06),
    triangleBodySolid(new Vector3(-4,1,-2),new Vector3(-1,4,2),new Vector3(-4,1,2),.08,.06),
  ],original=bodyCollisionMesh(solids),packed=pack(solids);
  for(let z=-4;z<=4;z++)for(let y=-1;y<=8;y++)for(let x=-4;x<=4;x++){
    const p=new Vector3(x*.75,y*.75,z*.75);expect(bodyPointBlocked([packed],p)).toBe(bodyPointBlocked([original],p));
  }
  for(const [from,to] of [[[-5,2,0],[5,2,0]],[[0,8,0],[0,-3,0]],[[0,2,-5],[0,2,5]],[[-5,5,1],[3,1,-1]],[[1.4,1.01,0],[3.1,4,0]]]){
    const previous=new Vector3().fromArray(from),a=new Vector3().fromArray(to),b=a.clone();
    expect(constrainBodySolids([packed],previous,a)).toBe(constrainBodySolids([original],previous,b));expect(bits(a.toArray())).toEqual(bits(b.toArray()));
  }
  let seed=79231;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<1000;i++){
    const previous=new Vector3(rand()*12-6,rand()*12-3,rand()*12-6),a=new Vector3(rand()*12-6,rand()*12-3,rand()*12-6),b=a.clone();
    expect(constrainBodySolids([packed],previous,a)).toBe(constrainBodySolids([original],previous,b));expect(bits(a.toArray())).toEqual(bits(b.toArray()));
  }
});

test('plant-volume obstacle queries unexpand packed slabs exactly like original oblique SAT',()=>{
  const solids=[boxBodySolid(box(-1,0,-1,1,1,1)),triangleBodySolid(new Vector3(-3,0,-3),new Vector3(3,5,-2),new Vector3(2,3,3),.08,.06)],original=createGroundObstacleQuery([],[bodyCollisionMesh(solids)]),packed=createGroundObstacleQuery([],[pack(solids)]);
  let hits=0;
  for(let z=-5;z<=5;z++)for(let x=-5;x<=5;x++)for(let y=-1;y<=6;y++){
    const radius=.15+((x+z+20)%4)*.2,bounds=box(x*.6-radius,y*.7-.12,z*.6-radius,x*.6+radius,y*.7+1.3,z*.6+radius),expected=original(x*.6,y*.7,z*.6,radius,bounds);
    expect(packed(x*.6,y*.7,z*.6,radius,bounds)).toBe(expected);hits+=Number(expected);
  }
  expect(hits).toBeGreaterThan(20);
});

import {expect,test} from '@playwright/test';
import {Box3,Vector3} from 'three';
import {createIndexedTriangleCollision,visitIndexedTriangleSolids,type IndexedTriangleData} from '../src/core/IndexedTriangleCollision';
import {bodyCollisionMesh,bodyPointBlocked,constrainBodySolids,triangleBodySolid,type BodySolid} from '../src/core/StaticBodyCollision';
import {createGroundObstacleQuery} from '../src/world/GroundCoverObstacles';

const box=(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number)=>new Box3(new Vector3(x0,y0,z0),new Vector3(x1,y1,z1));
const all=()=>box(-Infinity,-Infinity,-Infinity,Infinity,Infinity,Infinity);
const bits=(values:readonly number[])=>Array.from(new BigUint64Array(new Float64Array(values).buffer));
const numeric=(solid:BodySolid)=>[...solid.bounds.min.toArray(),...solid.bounds.max.toArray(),solid.axes.length,...solid.axes.flatMap(a=>[a.x,a.y,a.z,a.min,a.max])];
function oldSolids(data:IndexedTriangleData):BodySolid[]{
  return Array.from({length:data.count},(_,id)=>triangleBodySolid(new Vector3().fromArray(data.positions,data.indices[id*3]*3),new Vector3().fromArray(data.positions,data.indices[id*3+1]*3),new Vector3().fromArray(data.positions,data.indices[id*3+2]*3),data.below,data.above));
}
function expectedHits(solids:BodySolid[],query:Box3,inset?:{min:{x:number;y:number;z:number};max:{x:number;y:number;z:number}}){
  return solids.filter(solid=>{const b=solid.bounds.clone();if(inset){b.min.add(new Vector3(inset.min.x,inset.min.y,inset.min.z));b.max.sub(new Vector3(inset.max.x,inset.max.y,inset.max.z));}return b.intersectsBox(query);});
}
function fixture(){
  const positions=new Float64Array([-12.2,2,-8.1,8.4,3,-8.1,-4.7,4,9.3, 4,0,4,4,5,4,4,0,8, -4,0,-4,-4,0,-4,-4,0,-4, .123456789012345,6.123456789012345,-.23456789012345,1.23456789012345,8.3456789012345,-.3456789012345,.4567890123456,6.4567890123456,1.5678901234567]);
  // Source order deliberately differs from spatial order. Triangles span many
  // cells and include a vertical face and a degenerate point.
  return createIndexedTriangleCollision(positions,new Uint32Array([9,10,11,0,1,2,6,7,8,3,4,5]));
}

test('indexed collision preserves Float64 inputs, exact SAT data and union bounds',()=>{
  const mesh=fixture(),data=mesh.indexedTriangles,expected=oldSolids(data),actual:bigint[][]=[];
  expect(mesh.solids).toEqual([]);expect(data.count).toBe(4);expect(mesh.bounds.equals(bodyCollisionMesh(expected).bounds)).toBe(true);
  visitIndexedTriangleSolids(data,all(),solid=>{actual.push(bits(numeric(solid)));return false;});
  expect(actual).toEqual(expected.map(solid=>bits(numeric(solid))));
  const positions=new Float64Array(data.positions),indices=new Uint32Array(data.indices),borrowed=createIndexedTriangleCollision(positions,indices).indexedTriangles;
  expect(borrowed.positions).toBe(positions);expect(borrowed.indices).toBe(indices);expect(Array.from(data.positions)).not.toEqual(Array.from(new Float32Array(data.positions)));
  const bytes=data.positions.byteLength+data.indices.byteLength+data.cellOffsets.byteLength+data.triangleIds.byteLength;
  expect(bytes).toBeLessThan(10000);expect(data.triangleIds.length).toBeGreaterThan(data.count);
});

test('expanded bounds grid includes negative cells, touching faces and body-radius-only contacts',()=>{
  const mesh=fixture(),data=mesh.indexedTriangles,solids=oldSolids(data);
  const queries=[
    box(4.55,-1,4,4.55,6,8),box(-4.55,-1.88,-4.55,-4.55,-1.88,-4.55),box(-4,0,-4,-4,0,-4),
    box(8.95,0,-8.1,8.95,6,-8.1),box(-12.75,0,-8.1,-12.75,6,-8.1),all(),
  ];
  for(const query of queries){const actual:bigint[][]=[];visitIndexedTriangleSolids(data,query,solid=>{actual.push(bits(numeric(solid)));return false;});expect(actual).toEqual(expectedHits(solids,query).map(solid=>bits(numeric(solid))));}
});

test('nonuniform positive and negative insets only filter original bounds, including inverted effective query spans',()=>{
  const data=fixture().indexedTriangles,solids=oldSolids(data),insets=[
    {min:{x:.55,y:1.88,z:.55},max:{x:.55,y:.06,z:.55}},
    {min:{x:-6,y:-2,z:-5},max:{x:-5,y:-1,z:-7}},
    {min:{x:6,y:0,z:6},max:{x:6,y:0,z:6}},
  ],queries=[box(3.8,0,3.8,4.2,4,4.2),box(-18,-3,-13,-17,7,-12),box(-1,0,-1,1,8,1),all()];
  for(const inset of insets)for(const query of queries){
    const actual:bigint[][]=[];visitIndexedTriangleSolids(data,query,solid=>{actual.push(bits(numeric(solid)));return false;},inset);
    expect(actual).toEqual(expectedHits(solids,query,inset).map(solid=>bits(numeric(solid))));
  }
});

test('spanning triangles are deduplicated, source order is retained and true stops immediately',()=>{
  const data=fixture().indexedTriangles,expected=oldSolids(data);let count=0;
  visitIndexedTriangleSolids(data,all(),solid=>{expect(bits(numeric(solid))).toEqual(bits(numeric(expected[count++])));return false;});expect(count).toBe(data.count);
  let early=0;expect(visitIndexedTriangleSolids(data,all(),solid=>{expect(bits(numeric(solid))).toEqual(bits(numeric(expected[0])));early++;return true;})).toBe(true);expect(early).toBe(1);
  let miss=0;expect(visitIndexedTriangleSolids(data,box(100,100,100,101,101,101),()=>{miss++;return true;})).toBe(false);expect(miss).toBe(0);
});

test('deterministic random boxes match full original traversal bit for bit',()=>{
  let state=185517;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const coordinates:number[]=[];
  for(let i=0;i<120;i++){const x=random()*80-40,y=random()*30-8,z=random()*80-40;for(let corner=0;corner<3;corner++)coordinates.push(x+(random()-.5)*6,y+(random()-.5)*5,z+(random()-.5)*6);}
  const mesh=createIndexedTriangleCollision(new Float64Array(coordinates),new Uint32Array(Array.from({length:coordinates.length/3},(_,i)=>i))),data=mesh.indexedTriangles,solids=oldSolids(data);
  expect(mesh.bounds.equals(bodyCollisionMesh(solids).bounds)).toBe(true);
  for(let i=0;i<300;i++){
    const x=random()*100-50,y=random()*35-10,z=random()*100-50,sx=random()*12,sy=random()*6,sz=random()*12,query=box(x,y,z,x+sx,y+sy,z+sz);
    const inset=i%3===0?{min:{x:-2*random(),y:.2*random(),z:-2*random()},max:{x:.5*random(),y:.1*random(),z:.5*random()}}:undefined,actual:bigint[][]=[];
    visitIndexedTriangleSolids(data,query,solid=>{actual.push(bits(numeric(solid)));return false;},inset);
    expect(actual).toEqual(expectedHits(solids,query,inset).map(solid=>bits(numeric(solid))));
  }
});

test('empty geometry and invalid or impractically sparse buffers are handled explicitly',()=>{
  const empty=createIndexedTriangleCollision(new Float64Array(),new Uint32Array());expect(empty.bounds.isEmpty()).toBe(true);expect(empty.indexedTriangles.count).toBe(0);expect(visitIndexedTriangleSolids(empty.indexedTriangles,all(),()=>true)).toBe(false);
  expect(()=>createIndexedTriangleCollision(new Float64Array([0]),new Uint32Array())).toThrow(/triples/);
  expect(()=>createIndexedTriangleCollision(new Float64Array([0,0,0]),new Uint32Array([0,0,1]))).toThrow(/missing/);
  expect(()=>createIndexedTriangleCollision(new Float64Array([NaN,0,0]),new Uint32Array())).toThrow(/finite/);
  expect(()=>createIndexedTriangleCollision(new Float64Array([0,0,0,1e8,0,1e8,0,0,1]),new Uint32Array([0,1,2]))).toThrow(/grid/);
});

test('rounded inverse inset contacts cannot skip a neighbouring grid cell',()=>{
  // Expanded maxX is the representable value immediately below -64. The
  // original subtraction includes contact, while its inverse rounds to -64
  // and would select the next grid cell without the broad-phase guard.
  const x=-64.55000000000001,rightInset=.4471428571428575,mesh=createIndexedTriangleCollision(new Float64Array([x,0,0,-80,1,0,-80,0,1]),new Uint32Array([0,1,2])),solid=oldSolids(mesh.indexedTriangles)[0];
  const contact=solid.bounds.max.x-rightInset,query=box(contact,-.1,0,contact+2,1,1),inset={min:{x:0,y:0,z:0},max:{x:rightInset,y:0,z:0}};let hits=0;
  expect(solid.bounds.max.x).toBe(-64.00000000000001);expect(contact+rightInset).toBe(-64);
  expect(Math.floor((contact+rightInset)/4)).toBeGreaterThan(Math.floor(solid.bounds.max.x/4));
  expect(expectedHits([solid],query,inset).length).toBe(1);
  visitIndexedTriangleSolids(mesh.indexedTriangles,query,actual=>{expect(bits(numeric(actual))).toEqual(bits(numeric(solid)));hits++;return false;},inset);
  expect(hits).toBe(1);
});

test('actual point, sweep and ground-obstacle callers match original SAT objects for deterministic random probes',()=>{
  const positions:number[]=[],indices:number[]=[],width=8;
  for(let z=0;z<=width;z++)for(let x=0;x<=width;x++)positions.push((x-4)*2,.12*(x-4)*2+.1*Math.sin(z*.7),(z-4)*2);
  for(let z=0;z<width;z++)for(let x=0;x<width;x++){
    const a=z*(width+1)+x,b=a+1,c=a+width+1,d=c+1;indices.push(a,b,c,b,d,c);
  }
  const face=(a:number[],b:number[],c:number[])=>{const start=positions.length/3;positions.push(...a,...b,...c);indices.push(start,start+1,start+2);};
  face([1.5,0,-5],[1.5,7,-5],[1.5,7,5]);face([1.5,0,-5],[1.5,7,5],[1.5,0,5]);
  face([-5,4.7,-5],[5,4.7,-5],[-5,4.7,5]);face([5,4.7,-5],[5,4.7,5],[-5,4.7,5]);
  const mesh=createIndexedTriangleCollision(new Float64Array(positions),new Uint32Array(indices)),original=bodyCollisionMesh(oldSolids(mesh.indexedTriangles));
  const oldGround=createGroundObstacleQuery([], [original]),indexedGround=createGroundObstacleQuery([], [mesh]);
  let state=804411;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  let pointHits=0,sweepHits=0,groundHits=0;
  for(let i=0;i<1000;i++){
    const point=new Vector3(random()*24-12,random()*12-4,random()*24-12),expected=bodyPointBlocked([original],point);
    expect(bodyPointBlocked([mesh],point)).toBe(expected);pointHits+=Number(expected);
  }
  for(let i=0;i<300;i++){
    const previous=new Vector3(random()*22-11,random()*12-3,random()*22-11),a=previous.clone().add(new Vector3(random()*12-6,random()*16-8,random()*12-6)),b=a.clone();
    const expected=constrainBodySolids([original],previous,a);expect(constrainBodySolids([mesh],previous,b)).toBe(expected);expect(bits(b.toArray())).toEqual(bits(a.toArray()));sweepHits+=Number(expected);
  }
  for(let i=0;i<600;i++){
    const x=random()*22-11,y=random()*10-2,z=random()*22-11,r=.02+random()*1.2;
    const bounds=i%2?undefined:box(x-r,y-.07-r*.3,z-r*.6,x+r*.8,y+.25+r,z+r),expected=oldGround(x,y,z,r,bounds);
    expect(indexedGround(x,y,z,r,bounds)).toBe(expected);groundHits+=Number(expected);
  }
  expect(pointHits).toBeGreaterThan(0);expect(pointHits).toBeLessThan(1000);expect(sweepHits).toBeGreaterThan(0);expect(groundHits).toBeGreaterThan(0);expect(groundHits).toBeLessThan(600);
  const data=mesh.indexedTriangles,storageBytes=data.positions.byteLength+data.indices.byteLength+data.cellOffsets.byteLength+data.triangleIds.byteLength;
  console.log(JSON.stringify({oracle:'actual-object-vs-indexed-callers',pointProbes:1000,pointHits,sweepProbes:300,sweepHits,groundProbes:600,groundHits,triangles:data.count,cellReferences:data.triangleIds.length,storageBytes}));
});

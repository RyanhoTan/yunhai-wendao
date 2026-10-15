# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: indexed-triangle-collision.spec.ts >> rounded inverse inset contacts cannot skip a neighbouring grid cell
- Location: tests/indexed-triangle-collision.spec.ts:85:1

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Test source

```ts
  1   | import {expect,test} from '@playwright/test';
  2   | import {Box3,Vector3} from 'three';
  3   | import {createIndexedTriangleCollision,visitIndexedTriangleSolids,type IndexedTriangleData} from '../src/core/IndexedTriangleCollision';
  4   | import {bodyCollisionMesh,bodyPointBlocked,constrainBodySolids,triangleBodySolid,type BodySolid} from '../src/core/StaticBodyCollision';
  5   | import {createGroundObstacleQuery} from '../src/world/GroundCoverObstacles';
  6   | 
  7   | const box=(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number)=>new Box3(new Vector3(x0,y0,z0),new Vector3(x1,y1,z1));
  8   | const all=()=>box(-Infinity,-Infinity,-Infinity,Infinity,Infinity,Infinity);
  9   | const bits=(values:readonly number[])=>Array.from(new BigUint64Array(new Float64Array(values).buffer));
  10  | const numeric=(solid:BodySolid)=>[...solid.bounds.min.toArray(),...solid.bounds.max.toArray(),solid.axes.length,...solid.axes.flatMap(a=>[a.x,a.y,a.z,a.min,a.max])];
  11  | function oldSolids(data:IndexedTriangleData):BodySolid[]{
  12  |   return Array.from({length:data.count},(_,id)=>triangleBodySolid(new Vector3().fromArray(data.positions,data.indices[id*3]*3),new Vector3().fromArray(data.positions,data.indices[id*3+1]*3),new Vector3().fromArray(data.positions,data.indices[id*3+2]*3),data.below,data.above));
  13  | }
  14  | function expectedHits(solids:BodySolid[],query:Box3,inset?:{min:{x:number;y:number;z:number};max:{x:number;y:number;z:number}}){
  15  |   return solids.filter(solid=>{const b=solid.bounds.clone();if(inset){b.min.add(new Vector3(inset.min.x,inset.min.y,inset.min.z));b.max.sub(new Vector3(inset.max.x,inset.max.y,inset.max.z));}return b.intersectsBox(query);});
  16  | }
  17  | function fixture(){
  18  |   const positions=new Float64Array([-12.2,2,-8.1,8.4,3,-8.1,-4.7,4,9.3, 4,0,4,4,5,4,4,0,8, -4,0,-4,-4,0,-4,-4,0,-4, .123456789012345,6.123456789012345,-.23456789012345,1.23456789012345,8.3456789012345,-.3456789012345,.4567890123456,6.4567890123456,1.5678901234567]);
  19  |   // Source order deliberately differs from spatial order. Triangles span many
  20  |   // cells and include a vertical face and a degenerate point.
  21  |   return createIndexedTriangleCollision(positions,new Uint32Array([9,10,11,0,1,2,6,7,8,3,4,5]));
  22  | }
  23  | 
  24  | test('indexed collision preserves Float64 inputs, exact SAT data and union bounds',()=>{
  25  |   const mesh=fixture(),data=mesh.indexedTriangles,expected=oldSolids(data),actual:bigint[][]=[];
  26  |   expect(mesh.solids).toEqual([]);expect(data.count).toBe(4);expect(mesh.bounds.equals(bodyCollisionMesh(expected).bounds)).toBe(true);
  27  |   visitIndexedTriangleSolids(data,all(),solid=>{actual.push(bits(numeric(solid)));return false;});
  28  |   expect(actual).toEqual(expected.map(solid=>bits(numeric(solid))));
  29  |   const positions=new Float64Array(data.positions),indices=new Uint32Array(data.indices),borrowed=createIndexedTriangleCollision(positions,indices).indexedTriangles;
  30  |   expect(borrowed.positions).toBe(positions);expect(borrowed.indices).toBe(indices);expect(Array.from(data.positions)).not.toEqual(Array.from(new Float32Array(data.positions)));
  31  |   const bytes=data.positions.byteLength+data.indices.byteLength+data.cellOffsets.byteLength+data.triangleIds.byteLength;
  32  |   expect(bytes).toBeLessThan(10000);expect(data.triangleIds.length).toBeGreaterThan(data.count);
  33  | });
  34  | 
  35  | test('expanded bounds grid includes negative cells, touching faces and body-radius-only contacts',()=>{
  36  |   const mesh=fixture(),data=mesh.indexedTriangles,solids=oldSolids(data);
  37  |   const queries=[
  38  |     box(4.55,-1,4,4.55,6,8),box(-4.55,-1.88,-4.55,-4.55,-1.88,-4.55),box(-4,0,-4,-4,0,-4),
  39  |     box(8.95,0,-8.1,8.95,6,-8.1),box(-12.75,0,-8.1,-12.75,6,-8.1),all(),
  40  |   ];
  41  |   for(const query of queries){const actual:bigint[][]=[];visitIndexedTriangleSolids(data,query,solid=>{actual.push(bits(numeric(solid)));return false;});expect(actual).toEqual(expectedHits(solids,query).map(solid=>bits(numeric(solid))));}
  42  | });
  43  | 
  44  | test('nonuniform positive and negative insets only filter original bounds, including inverted effective query spans',()=>{
  45  |   const data=fixture().indexedTriangles,solids=oldSolids(data),insets=[
  46  |     {min:{x:.55,y:1.88,z:.55},max:{x:.55,y:.06,z:.55}},
  47  |     {min:{x:-6,y:-2,z:-5},max:{x:-5,y:-1,z:-7}},
  48  |     {min:{x:6,y:0,z:6},max:{x:6,y:0,z:6}},
  49  |   ],queries=[box(3.8,0,3.8,4.2,4,4.2),box(-18,-3,-13,-17,7,-12),box(-1,0,-1,1,8,1),all()];
  50  |   for(const inset of insets)for(const query of queries){
  51  |     const actual:bigint[][]=[];visitIndexedTriangleSolids(data,query,solid=>{actual.push(bits(numeric(solid)));return false;},inset);
  52  |     expect(actual).toEqual(expectedHits(solids,query,inset).map(solid=>bits(numeric(solid))));
  53  |   }
  54  | });
  55  | 
  56  | test('spanning triangles are deduplicated, source order is retained and true stops immediately',()=>{
  57  |   const data=fixture().indexedTriangles,expected=oldSolids(data);let count=0;
  58  |   visitIndexedTriangleSolids(data,all(),solid=>{expect(bits(numeric(solid))).toEqual(bits(numeric(expected[count++])));return false;});expect(count).toBe(data.count);
  59  |   let early=0;expect(visitIndexedTriangleSolids(data,all(),solid=>{expect(bits(numeric(solid))).toEqual(bits(numeric(expected[0])));early++;return true;})).toBe(true);expect(early).toBe(1);
  60  |   let miss=0;expect(visitIndexedTriangleSolids(data,box(100,100,100,101,101,101),()=>{miss++;return true;})).toBe(false);expect(miss).toBe(0);
  61  | });
  62  | 
  63  | test('deterministic random boxes match full original traversal bit for bit',()=>{
  64  |   let state=185517;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  65  |   const coordinates:number[]=[];
  66  |   for(let i=0;i<120;i++){const x=random()*80-40,y=random()*30-8,z=random()*80-40;for(let corner=0;corner<3;corner++)coordinates.push(x+(random()-.5)*6,y+(random()-.5)*5,z+(random()-.5)*6);}
  67  |   const mesh=createIndexedTriangleCollision(new Float64Array(coordinates),new Uint32Array(Array.from({length:coordinates.length/3},(_,i)=>i))),data=mesh.indexedTriangles,solids=oldSolids(data);
  68  |   expect(mesh.bounds.equals(bodyCollisionMesh(solids).bounds)).toBe(true);
  69  |   for(let i=0;i<300;i++){
  70  |     const x=random()*100-50,y=random()*35-10,z=random()*100-50,sx=random()*12,sy=random()*6,sz=random()*12,query=box(x,y,z,x+sx,y+sy,z+sz);
  71  |     const inset=i%3===0?{min:{x:-2*random(),y:.2*random(),z:-2*random()},max:{x:.5*random(),y:.1*random(),z:.5*random()}}:undefined,actual:bigint[][]=[];
  72  |     visitIndexedTriangleSolids(data,query,solid=>{actual.push(bits(numeric(solid)));return false;},inset);
  73  |     expect(actual).toEqual(expectedHits(solids,query,inset).map(solid=>bits(numeric(solid))));
  74  |   }
  75  | });
  76  | 
  77  | test('empty geometry and invalid or impractically sparse buffers are handled explicitly',()=>{
  78  |   const empty=createIndexedTriangleCollision(new Float64Array(),new Uint32Array());expect(empty.bounds.isEmpty()).toBe(true);expect(empty.indexedTriangles.count).toBe(0);expect(visitIndexedTriangleSolids(empty.indexedTriangles,all(),()=>true)).toBe(false);
  79  |   expect(()=>createIndexedTriangleCollision(new Float64Array([0]),new Uint32Array())).toThrow(/triples/);
  80  |   expect(()=>createIndexedTriangleCollision(new Float64Array([0,0,0]),new Uint32Array([0,0,1]))).toThrow(/missing/);
  81  |   expect(()=>createIndexedTriangleCollision(new Float64Array([NaN,0,0]),new Uint32Array())).toThrow(/finite/);
  82  |   expect(()=>createIndexedTriangleCollision(new Float64Array([0,0,0,1e8,0,1e8,0,0,1]),new Uint32Array([0,1,2]))).toThrow(/grid/);
  83  | });
  84  | 
  85  | test('rounded inverse inset contacts cannot skip a neighbouring grid cell',()=>{
  86  |   let contacts=0;
  87  |   for(let n=-12;n<=12;n++)for(const rightInset of [.1,.2,.3,.4,.55]){
  88  |     const x=3.45+n*Number.EPSILON,mesh=createIndexedTriangleCollision(new Float64Array([x,0,0,x,1,0,x,0,1]),new Uint32Array([0,1,2])),solid=oldSolids(mesh.indexedTriangles)[0];
  89  |     const contact=solid.bounds.max.x-rightInset;
  90  |     if(Math.floor((contact+rightInset)/4)<=Math.floor(solid.bounds.max.x/4))continue;
  91  |     const query=box(contact,-.1,0,contact+.5,1,1),inset={min:{x:0,y:0,z:0},max:{x:rightInset,y:0,z:0}};let hits=0;
  92  |     expect(expectedHits([solid],query,inset).length).toBe(1);
  93  |     visitIndexedTriangleSolids(mesh.indexedTriangles,query,actual=>{expect(bits(numeric(actual))).toEqual(bits(numeric(solid)));hits++;return false;},inset);
  94  |     expect(hits).toBe(1);contacts++;
  95  |   }
> 96  |   expect(contacts).toBeGreaterThan(0);
      |                    ^ Error: expect(received).toBeGreaterThan(expected)
  97  | });
  98  | 
  99  | test('actual point, sweep and ground-obstacle callers match original SAT objects for deterministic random probes',()=>{
  100 |   const positions:number[]=[],indices:number[]=[],width=8;
  101 |   for(let z=0;z<=width;z++)for(let x=0;x<=width;x++)positions.push((x-4)*2,.12*(x-4)*2+.1*Math.sin(z*.7),(z-4)*2);
  102 |   for(let z=0;z<width;z++)for(let x=0;x<width;x++){
  103 |     const a=z*(width+1)+x,b=a+1,c=a+width+1,d=c+1;indices.push(a,b,c,b,d,c);
  104 |   }
  105 |   const face=(a:number[],b:number[],c:number[])=>{const start=positions.length/3;positions.push(...a,...b,...c);indices.push(start,start+1,start+2);};
  106 |   face([1.5,0,-5],[1.5,7,-5],[1.5,7,5]);face([1.5,0,-5],[1.5,7,5],[1.5,0,5]);
  107 |   face([-5,4.7,-5],[5,4.7,-5],[-5,4.7,5]);face([5,4.7,-5],[5,4.7,5],[-5,4.7,5]);
  108 |   const mesh=createIndexedTriangleCollision(new Float64Array(positions),new Uint32Array(indices)),original=bodyCollisionMesh(oldSolids(mesh.indexedTriangles));
  109 |   const oldGround=createGroundObstacleQuery([], [original]),indexedGround=createGroundObstacleQuery([], [mesh]);
  110 |   let state=804411;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  111 |   let pointHits=0,sweepHits=0,groundHits=0;
  112 |   for(let i=0;i<1000;i++){
  113 |     const point=new Vector3(random()*24-12,random()*12-4,random()*24-12),expected=bodyPointBlocked([original],point);
  114 |     expect(bodyPointBlocked([mesh],point)).toBe(expected);pointHits+=Number(expected);
  115 |   }
  116 |   for(let i=0;i<300;i++){
  117 |     const previous=new Vector3(random()*22-11,random()*12-3,random()*22-11),a=previous.clone().add(new Vector3(random()*12-6,random()*16-8,random()*12-6)),b=a.clone();
  118 |     const expected=constrainBodySolids([original],previous,a);expect(constrainBodySolids([mesh],previous,b)).toBe(expected);expect(bits(b.toArray())).toEqual(bits(a.toArray()));sweepHits+=Number(expected);
  119 |   }
  120 |   for(let i=0;i<600;i++){
  121 |     const x=random()*22-11,y=random()*10-2,z=random()*22-11,r=.02+random()*1.2;
  122 |     const bounds=i%2?undefined:box(x-r,y-.07-r*.3,z-r*.6,x+r*.8,y+.25+r,z+r),expected=oldGround(x,y,z,r,bounds);
  123 |     expect(indexedGround(x,y,z,r,bounds)).toBe(expected);groundHits+=Number(expected);
  124 |   }
  125 |   expect(pointHits).toBeGreaterThan(0);expect(pointHits).toBeLessThan(1000);expect(sweepHits).toBeGreaterThan(0);expect(groundHits).toBeGreaterThan(0);expect(groundHits).toBeLessThan(600);
  126 |   const data=mesh.indexedTriangles,storageBytes=data.positions.byteLength+data.indices.byteLength+data.cellOffsets.byteLength+data.triangleIds.byteLength;
  127 |   console.log(JSON.stringify({oracle:'actual-object-vs-indexed-callers',pointProbes:1000,pointHits,sweepProbes:300,sweepHits,groundProbes:600,groundHits,triangles:data.count,cellReferences:data.triangleIds.length,storageBytes}));
  128 | });
  129 | 
```
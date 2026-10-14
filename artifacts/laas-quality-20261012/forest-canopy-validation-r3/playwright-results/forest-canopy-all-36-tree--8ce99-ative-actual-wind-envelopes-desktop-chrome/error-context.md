# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: forest-canopy.spec.ts >> all 36 tree buffers have physical leaves, fixed roots and conservative actual wind envelopes
- Location: tests/forest-canopy.spec.ts:56:1

# Error details

```
Error: Refusing to overwrite an earlier canopy run
```

# Test source

```ts
  1   | import {expect,test} from '@playwright/test';
  2   | import * as THREE from 'three';
  3   | import {createHash} from 'node:crypto';
  4   | import {mkdir,readFile,writeFile} from 'node:fs/promises';
  5   | import {createWoodlandTree,type WoodlandArchitecture,type WoodlandDetail,type WoodlandTree} from '../src/world/WoodlandTree';
  6   | import {createWoodlandPopulation} from '../src/world/WoodlandPopulation';
  7   | import {createWoodlandRenderCells} from '../src/world/WoodlandRenderCells';
  8   | import {createWoodlandLodField} from '../src/world/WoodlandLOD';
  9   | import {createWoodlandMaterials} from '../src/world/WoodlandMaterials';
  10  | 
  11  | // These tests allocate no browser/WebGL renderer. CPU bounds and envelopes do
  12  | // not establish aesthetic quality, screen-space dither quality or GPU timing.
  13  | test.describe.configure({mode:'serial'});
  14  | test.setTimeout(180000);
  15  | const stage=process.env.FOREST_CANOPY_VALIDATION_STAGE??`forest-canopy-validation-${Date.now()}`;
  16  | if(!/^forest-canopy-validation-[a-z0-9-]+$/.test(stage))throw new Error('Invalid canopy evidence directory');
  17  | const out=`artifacts/laas-quality-20261012/${stage}`;
  18  | const sourceFiles=[...['WoodlandTree','WoodlandPrimitives','WoodlandGeometry','WoodlandPopulation','WoodlandLOD','WoodlandMaterials','WoodlandRenderCells','NaturalForest','ForestLayout','WorldLayout','World'].map(n=>`src/world/${n}.ts`),'src/game/Game.ts'];
  19  | const report:Record<string,unknown>={complete:false,fullRequiredVisualCoverage:false,visualAcceptance:false,scope:'Independent CPU geometry, foundations, continuous LOD and main/shadow field checks; no visual acceptance or GPU measurement.',tests:[],sourceHashes:{}};
  20  | const results:{name:string;status:string;errors:string[]}[]=[];
  21  | const prototypes:WoodlandTree[][]=[];
  22  | const disposeGeometry=new Set<THREE.BufferGeometry>(),disposeMaterial=new Set<THREE.Material>(),disposeTexture=new Set<THREE.Texture>();
  23  | const track=(p:WoodlandTree)=>{disposeGeometry.add(p.wood);disposeGeometry.add(p.leaves);return p;};
  24  | const save=()=>writeFile(`${out}/status.json`,JSON.stringify({...report,tests:results},null,2)+'\n');
  25  | 
  26  | test.beforeAll(async()=>{
  27  |   await mkdir(out,{recursive:true});
> 28  |   try{await readFile(`${out}/status.json`);throw new Error('Refusing to overwrite an earlier canopy run');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      |                                                  ^ Error: Refusing to overwrite an earlier canopy run
  29  |   report.sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
  30  |   await save();
  31  |   for(let kind=0;kind<3;kind++)for(let architecture=0;architecture<4;architecture++){
  32  |     // Hold the species seed fixed across architectures: simple scale or yaw
  33  |     // changes must not masquerade as four independent branching structures.
  34  |     prototypes.push([0,1,2].map(detail=>track(createWoodlandTree(kind,1289+kind*181,detail as WoodlandDetail,architecture as WoodlandArchitecture))));
  35  |   }
  36  | });
  37  | test.afterEach(async({},info)=>{results.push({name:info.title,status:info.status??'unknown',errors:info.errors.map(e=>e.message??String(e))});await save();});
  38  | test.afterAll(async()=>{
  39  |   const end=Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
  40  |   report.sourceHashesAtEnd=end;report.sourcesStable=JSON.stringify(end)===JSON.stringify(report.sourceHashes);
  41  |   report.complete=results.length===4&&results.every(r=>r.status==='passed')&&report.sourcesStable===true;
  42  |   disposeGeometry.forEach(g=>g.dispose());disposeMaterial.forEach(m=>m.dispose());disposeTexture.forEach(t=>t.dispose());await save();
  43  | });
  44  | 
  45  | function vertices(g:THREE.BufferGeometry){return g.getAttribute('position');}
  46  | function rawBox(g:THREE.BufferGeometry){const box=new THREE.Box3(),p=vertices(g),v=new THREE.Vector3();for(let i=0;i<p.count;i++)box.expandByPoint(v.fromBufferAttribute(p,i));return box;}
  47  | function components(g:THREE.BufferGeometry):number[][]{
  48  |   const p=vertices(g),index=g.getIndex()!,parent=Int32Array.from({length:p.count},(_,i)=>i);
  49  |   const find=(i:number):number=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  50  |   for(let i=0;i<index.count;i+=3){const a=find(index.getX(i));parent[find(index.getX(i+1))]=a;parent[find(index.getX(i+2))]=a;}
  51  |   const groups=new Map<number,number[]>();for(let i=0;i<p.count;i++){const key=find(i),list=groups.get(key)??[];list.push(i);groups.set(key,list);}return [...groups.values()];
  52  | }
  53  | function componentBox(g:THREE.BufferGeometry,ids:number[]){const box=new THREE.Box3(),p=vertices(g),v=new THREE.Vector3();ids.forEach(i=>box.expandByPoint(v.fromBufferAttribute(p,i)));return box;}
  54  | const triangles=(g:THREE.BufferGeometry)=>(g.getIndex()?.count??vertices(g).count)/3;
  55  | 
  56  | test('all 36 tree buffers have physical leaves, fixed roots and conservative actual wind envelopes',async()=>{
  57  |   const rows:unknown[]=[];let invalid=0,boundsFailures=0,rootFailures=0,rootVertices=0,leafDiameters:number[]=[];
  58  |   const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),delta=new THREE.Vector3();
  59  |   for(let id=0;id<prototypes.length;id++)for(let detail=0;detail<3;detail++){
  60  |     const prototype=prototypes[id][detail];let checked=0,rootComponentCount=0;
  61  |     for(const g of [prototype.wood,prototype.leaves]){
  62  |       const p=vertices(g),wind=g.getAttribute('woodlandWind'),sway=g.getAttribute('woodlandSway'),normal=g.getAttribute('normal'),uv=g.getAttribute('uv'),index=g.getIndex()!;
  63  |       expect(wind.count).toBe(p.count);expect(sway.count).toBe(p.count);expect(normal.count).toBe(p.count);expect(uv.count).toBe(p.count);expect(index.count%3).toBe(0);
  64  |       const box=g.boundingBox!,sphere=g.boundingSphere!;
  65  |       for(let i=0;i<p.count;i++){
  66  |         a.fromBufferAttribute(p,i);b.fromBufferAttribute(normal,i);const w=wind.getX(i),s=sway.getX(i);
  67  |         if(!Number.isFinite(a.lengthSq()+b.lengthSq()+w+s)||Math.abs(b.length()-1)>1e-4||w<0||w>1||s<0||s>1)invalid++;
  68  |         // World-wind maximum is .269m X / .128m Z at unit weights. The
  69  |         // production tree's minimum scale is .82; use its inverse to bound
  70  |         // every vertex in local coordinates, including its sphere's corners.
  71  |         for(const sx of [-1,1])for(const sz of [-1,1]){
  72  |           delta.set(sx*(.22*s+.049*w)/.82,0,sz*(.10*s+.028*w)/.82);c.copy(a).add(delta);
  73  |           if(!box.containsPoint(c)||sphere.distanceToPoint(c)>1e-5)boundsFailures++;
  74  |         }
  75  |         checked++;
  76  |       }
  77  |       for(let i=0;i<index.count;i+=3){
  78  |         const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];if(ids.some(n=>n<0||n>=p.count)){invalid++;continue;}
  79  |         a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]).sub(a);c.fromBufferAttribute(p,ids[2]).sub(a);if(b.cross(c).lengthSq()<1e-16)invalid++;
  80  |       }
  81  |     }
  82  |     const p=vertices(prototype.wood),wind=prototype.wood.getAttribute('woodlandWind'),sway=prototype.wood.getAttribute('woodlandSway');
  83  |     for(const ids of components(prototype.wood)){
  84  |       const box=componentBox(prototype.wood,ids);
  85  |       // Root sweeps are actual disconnected low wood meshes; this does not
  86  |       // depend on authored branch names or a stored common bounding sphere.
  87  |       if(box.min.y<1e-6&&box.max.y<.8){rootComponentCount++;for(const i of ids){rootVertices++;if(wind.getX(i)!==0||sway.getX(i)!==0)rootFailures++;}}
  88  |     }
  89  |     for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i))<1e-6){rootVertices++;if(wind.getX(i)!==0||sway.getX(i)!==0)rootFailures++;}
  90  |     expect(rawBox(prototype.wood).min.y,'actual trunk base reaches the origin').toBeCloseTo(0,6);
  91  |     if(detail<2)expect(rootComponentCount,'near and mid preserve physical fixed root sweeps').toBeGreaterThanOrEqual(4);
  92  |     expect(prototype.trunkSegments.length).toBeGreaterThan(3);expect(prototype.trunkSegments[0].a[1]).toBe(0);
  93  |     if(detail===0){
  94  |       const leafPoints=vertices(prototype.leaves),parts=components(prototype.leaves);expect(parts.length).toBe(prototype.leafCount);
  95  |       for(const ids of parts){
  96  |         let diameter=0;for(const i of ids)for(const j of ids){a.fromBufferAttribute(leafPoints,i);b.fromBufferAttribute(leafPoints,j);diameter=Math.max(diameter,a.distanceTo(b));}leafDiameters.push(diameter);
  97  |         if(ids.length<4||diameter<.06||diameter>.35)invalid++;
  98  |       }
  99  |     }
  100 |     rows.push({kind:id>>2,architecture:id%4,detail,vertices:checked,woodTriangles:triangles(prototype.wood),leafTriangles:triangles(prototype.leaves),rawLeafBounds:rawBox(prototype.leaves),rootComponents:rootComponentCount});
  101 |   }
  102 |   leafDiameters=leafDiameters.sort((a,b)=>a-b);
  103 |   report.geometry={rows,invalid,boundsFailures,rootFailures,rootVertices,nearPhysicalLeaves:leafDiameters.length,leafDiameterMetres:{min:leafDiameters[0],median:leafDiameters[Math.floor(leafDiameters.length*.5)],p99:leafDiameters[Math.floor(leafDiameters.length*.99)],max:leafDiameters.at(-1)},limits:'All actual vertices; conservative coefficient envelope, not a GPU wind simulation. Triangle totals are recorded, not raised into an aesthetic threshold.'};await save();
  104 |   expect(invalid,'finite attributes, unit normals, valid triangles and leaf dimensions').toBe(0);expect(boundsFailures,'actual wind envelope remains in the returned common box AND sphere').toBe(0);expect(rootFailures,'all physical root components and ground-contact vertices remain fixed').toBe(0);expect(rootVertices).toBeGreaterThan(100);
  105 | });
  106 | 
  107 | function supports(g:THREE.BufferGeometry,yMin:number,yMax:number){
  108 |   const p=vertices(g),directions=Array.from({length:16},(_,i)=>[Math.cos(i*Math.PI/8),Math.sin(i*Math.PI/8)]),global=new Array<number>(16).fill(-Infinity),bands=Array.from({length:8},()=>new Array<number>(16).fill(-Infinity));
  109 |   for(let i=0;i<p.count;i++){
  110 |     directions.forEach(([x,z],j)=>{global[j]=Math.max(global[j],p.getX(i)*x+p.getZ(i)*z);});
  111 |   }
  112 |   // Proxy triangles may cross an entire band without placing a vertex in it.
  113 |   // Clip the actual indexed surface to each height slab, avoiding a false
  114 |   // silhouette gap from comparing only vertex counts at different densities.
  115 |   const clip=(poly:number[][],y:number,above:boolean)=>{
  116 |     const result:number[][]=[];
  117 |     for(let i=0;i<poly.length;i++){
  118 |       const a=poly[i],b=poly[(i+1)%poly.length],insideA=above?a[1]>=y:a[1]<=y,insideB=above?b[1]>=y:b[1]<=y;
  119 |       if(insideA)result.push(a);
  120 |       if(insideA!==insideB){const t=(y-a[1])/(b[1]-a[1]);result.push(a.map((v,j)=>v+(b[j]-v)*t));}
  121 |     }
  122 |     return result;
  123 |   };
  124 |   const index=g.getIndex()!,span=(yMax-yMin)/8;
  125 |   for(let i=0;i<index.count;i+=3){
  126 |     const triangle=[0,1,2].map(j=>{const id=index.getX(i+j);return [p.getX(id),p.getY(id),p.getZ(id)];}),lo=Math.min(...triangle.map(v=>v[1])),hi=Math.max(...triangle.map(v=>v[1]));
  127 |     for(let band=Math.max(0,Math.floor((lo-yMin)/span));band<=Math.min(7,Math.floor((hi-yMin)/span));band++){
  128 |       const polygon=clip(clip(triangle,yMin+span*band,true),yMin+span*(band+1),false);
```
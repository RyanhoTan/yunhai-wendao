# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: geology.spec.ts >> sculpted escarpments have real detail, remain outside full road width and retain sect foundations
- Location: tests/geology.spec.ts:13:1

# Error details

```
Error: 99% of new cliff facets are below 3m in actual surface space

expect(received).toBeLessThan(expected)

Expected: < 3
Received:   3.2825268541878407
```

# Test source

```ts
  1  | import {expect,test} from '@playwright/test';
  2  | import * as THREE from 'three';
  3  | import {mkdir,writeFile} from 'node:fs/promises';
  4  | import {createGeologicalEscarpments} from '../src/world/GeologicalEscarpments';
  5  | import {createLimestoneOutcrops} from '../src/world/LimestoneOutcrops';
  6  | import {terrainSurfaceHeight,terrainHeight,protectedPoint,rockSurfaceExposure} from '../src/world/World';
  7  | import {SECT_ASCENT,FOREST_APPROACH,MOUNTAIN_CIRCUIT,WEST_VALLEY_ROUTE} from '../src/world/WorldLayout';
  8  | import {SECT_BUILDINGS,SECT_GROUND_Y,sectWorld} from '../src/world/SectLayout';
  9  | import {nearbyStaticOccluders} from '../src/core/StaticOccluderIndex';
  10 | import {constrainCameraBoom} from '../src/core/CameraBoom';
  11 | import {bodyPointBlocked} from '../src/core/StaticBodyCollision';
  12 | 
  13 | test('sculpted escarpments have real detail, remain outside full road width and retain sect foundations',async()=>{
  14 |   test.setTimeout(120000);
  15 |   const stage=process.env.GEOLOGY_VALIDATION_STAGE??'geology-validation';if(!/^[a-z0-9-]+$/.test(stage))throw new Error('Invalid geology validation stage');
  16 |   const validationDirectory=`artifacts/laas-quality-20261012/${stage}`;
  17 |   const root=new THREE.Group(),skin=createGeologicalEscarpments(root,terrainSurfaceHeight,rockSurfaceExposure),outcrops=createLimestoneOutcrops(root,terrainSurfaceHeight,protectedPoint,[]);
  18 |   root.updateMatrixWorld(true);
  19 |   const group=root.getObjectByName('GeologicalEscarpments')!,longEdges:number[]=[],point=new THREE.Vector3();
  20 |   let largestOutward=0,vertices=0,invalid=0;
  21 |   const normals=new THREE.Vector3();
  22 |   group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;
  23 |     const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal'),index=o.geometry.getIndex()!;
  24 |     for(let i=0;i<p.count;i++){
  25 |       point.fromBufferAttribute(p,i);normals.fromBufferAttribute(n,i);
  26 |       if(!Number.isFinite(point.lengthSq())||Math.abs(normals.length()-1)>1e-4||!o.geometry.boundingBox!.containsPoint(point))invalid++;
  27 |       // Horizontal displacement from the heightfield is a real rock shelf.
  28 |       const difference=Math.abs(point.y-terrainSurfaceHeight(point.x,point.z));largestOutward=Math.max(largestOutward,difference);vertices++;
  29 |     }
  30 |     for(let i=0;i<index.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,index.getX(i)),b=new THREE.Vector3().fromBufferAttribute(p,index.getX(i+1)),c=new THREE.Vector3().fromBufferAttribute(p,index.getX(i+2));longEdges.push(Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a)));}
  31 |   });
  32 |   expect(largestOutward,'rock skin must visibly depart from the old planar heightfield').toBeGreaterThan(.3);
  33 |   expect(invalid,'all skin vertices/normals/bounds are valid').toBe(0);
  34 |   expect(vertices).toBeGreaterThan(10000);longEdges.sort((a,b)=>a-b);
> 35 |   expect(longEdges[Math.floor(longEdges.length*.99)],'99% of new cliff facets are below 3m in actual surface space').toBeLessThan(3);
     |                                                                                                                      ^ Error: 99% of new cliff facets are below 3m in actual surface space
  36 |   let roadSamples=0,blocked=0,blockedSolids=0;const failures:unknown[]=[];
  37 |   const body=new THREE.Box3(),obstacles=outcrops.walls;
  38 |   for(const route of [SECT_ASCENT,FOREST_APPROACH,MOUNTAIN_CIRCUIT,WEST_VALLEY_ROUTE])for(let i=1;i<route.length;i++){
  39 |     const a=route[i-1],b=route[i],length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length/.2);
  40 |     for(let j=0;j<=steps;j++)for(const offset of [-4,-2,0,2,4]){
  41 |       const x=a.x+(b.x-a.x)*j/steps-(b.z-a.z)/length*offset,z=a.z+(b.z-a.z)*j/steps+(b.x-a.x)/length*offset,y=terrainHeight(x,z);
  42 |       body.min.set(x-.55,y,z-.55);body.max.set(x+.55,y+1.8,z+.55);
  43 |       const hit=[...nearbyStaticOccluders(obstacles,body.min.x,body.max.x,body.min.z,body.max.z)].find(w=>w.intersectsBox(body));
  44 |       if(hit){blocked++;if(failures.length<20)failures.push({x,y,z,offset,bounds:hit});}roadSamples++;
  45 |       point.set(x,y,z);
  46 |       if(bodyPointBlocked(skin.bodySolids,point))blockedSolids++;
  47 |     }
  48 |   }
  49 |   await mkdir(validationDirectory,{recursive:true});
  50 |   await writeFile(`${validationDirectory}/corridor.json`,JSON.stringify({roadSamples,blocked,blockedSolids,failures},null,2));
  51 |   expect(blocked,'rock body bounds leave five full-width walking lanes clear').toBe(0);
  52 |   expect(blockedSolids,'same-face expanded SAT solids also leave all five walking lanes clear').toBe(0);
  53 |   const ray=new THREE.Raycaster(),normal=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  54 |   let boomChecks=0;
  55 |   // An actual near cliff triangle must stop a camera approaching its front.
  56 |   for(const mesh of skin.cameraMeshes){
  57 |     const p=mesh.geometry.getAttribute('position'),index=mesh.geometry.getIndex()!;
  58 |     if(index.count<3)continue;
  59 |     a.fromBufferAttribute(p,index.getX(Math.floor(index.count/6)*3));b.fromBufferAttribute(p,index.getX(Math.floor(index.count/6)*3+1));c.fromBufferAttribute(p,index.getX(Math.floor(index.count/6)*3+2));
  60 |     normal.subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize();const center=a.clone().add(b).add(c).multiplyScalar(1/3),target=center.clone().addScaledVector(normal,2),desired=center.clone().addScaledVector(normal,-1);
  61 |     ray.set(target,normal.clone().negate());const first=ray.intersectObjects(skin.cameraMeshes,false)[0];if(!first||first.distance>2.1)continue;
  62 |     constrainCameraBoom(target,desired,[],()=>-100,skin.cameraMeshes);expect(desired.distanceTo(target)).toBeLessThan(first.distance);boomChecks++;
  63 |   }
  64 |   expect(boomChecks).toBeGreaterThan(20);
  65 |   for(const building of SECT_BUILDINGS.filter(b=>b.kind!=='gate'))for(const [x,z] of [[0,0],[-2,-2],[2,2]]){
  66 |     const p=sectWorld(building,x,z);expect(terrainSurfaceHeight(p.x,p.z)).toBeCloseTo(SECT_GROUND_Y,4);
  67 |   }
  68 |   const report={...group.userData,vertices,largestHeightDeparture:largestOutward,p99FacetEdge:longEdges[Math.floor(longEdges.length*.99)],roadSamples,blocked,blockedSolids,boomChecks,outcrops:root.getObjectByName('OriginalLimestoneOutcrops')!.userData};
  69 |   await mkdir(validationDirectory,{recursive:true});await writeFile(`${validationDirectory}/geometry.json`,JSON.stringify(report,null,2));
  70 |   const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  71 | });
  72 | 
```
# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: geology.spec.ts >> sculpted escarpments have real detail, remain outside full road width and retain sect foundations
- Location: tests/geology.spec.ts:14:1

# Error details

```
Error: unlocked edges of the main-mountain patch must meet the unchanged detail limits

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Test source

```ts
  1  | import {expect,test} from '@playwright/test';
  2  | import * as THREE from 'three';
  3  | import {mkdir,writeFile} from 'node:fs/promises';
  4  | import {writeFileSync} from 'node:fs';
  5  | import {createGeologicalEscarpments} from '../src/world/GeologicalEscarpments';
  6  | import {createLimestoneOutcrops} from '../src/world/LimestoneOutcrops';
  7  | import {terrainSurfaceHeight,terrainHeight,protectedPoint,rockSurfaceExposure} from '../src/world/World';
  8  | import {SECT_ASCENT,FOREST_APPROACH,MOUNTAIN_CIRCUIT,WEST_VALLEY_ROUTE} from '../src/world/WorldLayout';
  9  | import {SECT_BUILDINGS,SECT_GROUND_Y,sectWorld} from '../src/world/SectLayout';
  10 | import {nearbyStaticOccluders} from '../src/core/StaticOccluderIndex';
  11 | import {constrainCameraBoom} from '../src/core/CameraBoom';
  12 | import {bodyPointBlocked} from '../src/core/StaticBodyCollision';
  13 | 
  14 | test('sculpted escarpments have real detail, remain outside full road width and retain sect foundations',async()=>{
  15 |   test.setTimeout(120000);
  16 |   const stage=process.env.GEOLOGY_VALIDATION_STAGE??'geology-validation';if(!/^[a-z0-9-]+$/.test(stage))throw new Error('Invalid geology validation stage');
  17 |   const validationDirectory=`artifacts/laas-quality-20261012/${stage}`;
  18 |   await mkdir(validationDirectory,{recursive:true});
  19 |   const root=new THREE.Group(),skin=createGeologicalEscarpments(root,terrainSurfaceHeight,rockSurfaceExposure,record=>writeFileSync(`${validationDirectory}/construction-${record.phase}.json`,JSON.stringify({...record,heap:process.memoryUsage()},null,2))),outcrops=createLimestoneOutcrops(root,terrainSurfaceHeight,protectedPoint,[]);
  20 |   root.updateMatrixWorld(true);
  21 |   const group=root.getObjectByName('GeologicalEscarpments')!,longEdges:number[]=[],point=new THREE.Vector3();
  22 |   await mkdir(validationDirectory,{recursive:true});
  23 |   await writeFile(`${validationDirectory}/refinement.json`,JSON.stringify(group.userData.refinement,null,2));
  24 |   expect(group.userData.refinement.patchBoundary.converged,'coarse neighbours at the patch seam must meet the same geometric limits').toBe(true);
> 25 |   expect(group.userData.refinement.converged,'unlocked edges of the main-mountain patch must meet the unchanged detail limits').toBe(true);
     |                                                                                                                                 ^ Error: unlocked edges of the main-mountain patch must meet the unchanged detail limits
  26 |   let largestOutward=0,vertices=0,invalid=0;
  27 |   const normals=new THREE.Vector3();
  28 |   group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;
  29 |     const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal'),index=o.geometry.getIndex()!;
  30 |     for(let i=0;i<p.count;i++){
  31 |       point.fromBufferAttribute(p,i);normals.fromBufferAttribute(n,i);
  32 |       if(!Number.isFinite(point.lengthSq())||Math.abs(normals.length()-1)>1e-4||!o.geometry.boundingBox!.containsPoint(point))invalid++;
  33 |       // Horizontal displacement from the heightfield is a real rock shelf.
  34 |       const difference=Math.abs(point.y-terrainSurfaceHeight(point.x,point.z));largestOutward=Math.max(largestOutward,difference);vertices++;
  35 |     }
  36 |     for(let i=0;i<index.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,index.getX(i)),b=new THREE.Vector3().fromBufferAttribute(p,index.getX(i+1)),c=new THREE.Vector3().fromBufferAttribute(p,index.getX(i+2));longEdges.push(Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a)));}
  37 |   });
  38 |   expect(largestOutward,'rock skin must visibly depart from the old planar heightfield').toBeGreaterThan(.3);
  39 |   expect(invalid,'all skin vertices/normals/bounds are valid').toBe(0);
  40 |   expect(vertices).toBeGreaterThan(10000);longEdges.sort((a,b)=>a-b);
  41 |   expect(longEdges[Math.floor(longEdges.length*.99)],'99% of new cliff facets are below 3m in actual surface space').toBeLessThan(3);
  42 |   let roadSamples=0,blocked=0,blockedSolids=0;const failures:unknown[]=[];
  43 |   const body=new THREE.Box3(),obstacles=outcrops.walls;
  44 |   for(const route of [SECT_ASCENT,FOREST_APPROACH,MOUNTAIN_CIRCUIT,WEST_VALLEY_ROUTE])for(let i=1;i<route.length;i++){
  45 |     const a=route[i-1],b=route[i],length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length/.2);
  46 |     for(let j=0;j<=steps;j++)for(const offset of [-4,-2,0,2,4]){
  47 |       const x=a.x+(b.x-a.x)*j/steps-(b.z-a.z)/length*offset,z=a.z+(b.z-a.z)*j/steps+(b.x-a.x)/length*offset,y=terrainHeight(x,z);
  48 |       body.min.set(x-.55,y,z-.55);body.max.set(x+.55,y+1.8,z+.55);
  49 |       const hit=[...nearbyStaticOccluders(obstacles,body.min.x,body.max.x,body.min.z,body.max.z)].find(w=>w.intersectsBox(body));
  50 |       if(hit){blocked++;if(failures.length<20)failures.push({x,y,z,offset,bounds:hit});}roadSamples++;
  51 |       point.set(x,y,z);
  52 |       if(bodyPointBlocked(skin.bodySolids,point))blockedSolids++;
  53 |     }
  54 |   }
  55 |   await mkdir(validationDirectory,{recursive:true});
  56 |   await writeFile(`${validationDirectory}/corridor.json`,JSON.stringify({roadSamples,blocked,blockedSolids,failures},null,2));
  57 |   expect(blocked,'rock body bounds leave five full-width walking lanes clear').toBe(0);
  58 |   expect(blockedSolids,'same-face expanded SAT solids also leave all five walking lanes clear').toBe(0);
  59 |   const ray=new THREE.Raycaster(),normal=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  60 |   let boomChecks=0;
  61 |   // An actual near cliff triangle must stop a camera approaching its front.
  62 |   for(const mesh of skin.cameraMeshes){
  63 |     const p=mesh.geometry.getAttribute('position'),index=mesh.geometry.getIndex()!;
  64 |     if(index.count<3)continue;
  65 |     a.fromBufferAttribute(p,index.getX(Math.floor(index.count/6)*3));b.fromBufferAttribute(p,index.getX(Math.floor(index.count/6)*3+1));c.fromBufferAttribute(p,index.getX(Math.floor(index.count/6)*3+2));
  66 |     normal.subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize();const center=a.clone().add(b).add(c).multiplyScalar(1/3),target=center.clone().addScaledVector(normal,2),desired=center.clone().addScaledVector(normal,-1);
  67 |     ray.set(target,normal.clone().negate());const first=ray.intersectObjects(skin.cameraMeshes,false)[0];if(!first||first.distance>2.1)continue;
  68 |     constrainCameraBoom(target,desired,[],()=>-100,skin.cameraMeshes);expect(desired.distanceTo(target)).toBeLessThan(first.distance);boomChecks++;
  69 |   }
  70 |   expect(boomChecks).toBeGreaterThan(20);
  71 |   for(const building of SECT_BUILDINGS.filter(b=>b.kind!=='gate'))for(const [x,z] of [[0,0],[-2,-2],[2,2]]){
  72 |     const p=sectWorld(building,x,z);expect(terrainSurfaceHeight(p.x,p.z)).toBeCloseTo(SECT_GROUND_Y,4);
  73 |   }
  74 |   const report={...group.userData,vertices,largestHeightDeparture:largestOutward,p99FacetEdge:longEdges[Math.floor(longEdges.length*.99)],roadSamples,blocked,blockedSolids,boomChecks,outcrops:root.getObjectByName('OriginalLimestoneOutcrops')!.userData};
  75 |   await mkdir(validationDirectory,{recursive:true});await writeFile(`${validationDirectory}/geometry.json`,JSON.stringify(report,null,2));
  76 |   const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  77 | });
  78 | 
```
import {expect,test} from '@playwright/test';
import * as THREE from 'three';
import {mkdir,writeFile} from 'node:fs/promises';
import {createGeologicalEscarpments} from '../src/world/GeologicalEscarpments';
import {createLimestoneOutcrops} from '../src/world/LimestoneOutcrops';
import {terrainSurfaceHeight,terrainHeight,protectedPoint,rockSurfaceExposure} from '../src/world/World';
import {SECT_ASCENT,FOREST_APPROACH,MOUNTAIN_CIRCUIT,WEST_VALLEY_ROUTE} from '../src/world/WorldLayout';
import {SECT_BUILDINGS,SECT_GROUND_Y,sectWorld} from '../src/world/SectLayout';
import {nearbyStaticOccluders} from '../src/core/StaticOccluderIndex';
import {constrainCameraBoom} from '../src/core/CameraBoom';
import {bodyPointBlocked} from '../src/core/StaticBodyCollision';

test('sculpted escarpments have real detail, remain outside full road width and retain sect foundations',async()=>{
  test.setTimeout(120000);
  const stage=process.env.GEOLOGY_VALIDATION_STAGE??'geology-validation';if(!/^[a-z0-9-]+$/.test(stage))throw new Error('Invalid geology validation stage');
  const validationDirectory=`artifacts/laas-quality-20261012/${stage}`;
  const root=new THREE.Group(),skin=createGeologicalEscarpments(root,terrainSurfaceHeight,rockSurfaceExposure),outcrops=createLimestoneOutcrops(root,terrainSurfaceHeight,protectedPoint,[]);
  root.updateMatrixWorld(true);
  const group=root.getObjectByName('GeologicalEscarpments')!,longEdges:number[]=[],point=new THREE.Vector3();
  let largestOutward=0,vertices=0,invalid=0;
  const normals=new THREE.Vector3();
  group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;
    const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal'),index=o.geometry.getIndex()!;
    for(let i=0;i<p.count;i++){
      point.fromBufferAttribute(p,i);normals.fromBufferAttribute(n,i);
      if(!Number.isFinite(point.lengthSq())||Math.abs(normals.length()-1)>1e-4||!o.geometry.boundingBox!.containsPoint(point))invalid++;
      // Horizontal displacement from the heightfield is a real rock shelf.
      const difference=Math.abs(point.y-terrainSurfaceHeight(point.x,point.z));largestOutward=Math.max(largestOutward,difference);vertices++;
    }
    for(let i=0;i<index.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,index.getX(i)),b=new THREE.Vector3().fromBufferAttribute(p,index.getX(i+1)),c=new THREE.Vector3().fromBufferAttribute(p,index.getX(i+2));longEdges.push(Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a)));}
  });
  expect(largestOutward,'rock skin must visibly depart from the old planar heightfield').toBeGreaterThan(.3);
  expect(invalid,'all skin vertices/normals/bounds are valid').toBe(0);
  expect(vertices).toBeGreaterThan(10000);longEdges.sort((a,b)=>a-b);
  expect(longEdges[Math.floor(longEdges.length*.99)],'99% of new cliff facets are below 3m in actual surface space').toBeLessThan(3);
  let roadSamples=0,blocked=0,blockedSolids=0;const failures:unknown[]=[];
  const body=new THREE.Box3(),obstacles=outcrops.walls;
  for(const route of [SECT_ASCENT,FOREST_APPROACH,MOUNTAIN_CIRCUIT,WEST_VALLEY_ROUTE])for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length/.2);
    for(let j=0;j<=steps;j++)for(const offset of [-4,-2,0,2,4]){
      const x=a.x+(b.x-a.x)*j/steps-(b.z-a.z)/length*offset,z=a.z+(b.z-a.z)*j/steps+(b.x-a.x)/length*offset,y=terrainHeight(x,z);
      body.min.set(x-.55,y,z-.55);body.max.set(x+.55,y+1.8,z+.55);
      const hit=[...nearbyStaticOccluders(obstacles,body.min.x,body.max.x,body.min.z,body.max.z)].find(w=>w.intersectsBox(body));
      if(hit){blocked++;if(failures.length<20)failures.push({x,y,z,offset,bounds:hit});}roadSamples++;
      point.set(x,y,z);
      if(bodyPointBlocked(skin.bodySolids,point))blockedSolids++;
    }
  }
  await mkdir(validationDirectory,{recursive:true});
  await writeFile(`${validationDirectory}/corridor.json`,JSON.stringify({roadSamples,blocked,blockedSolids,failures},null,2));
  expect(blocked,'rock body bounds leave five full-width walking lanes clear').toBe(0);
  expect(blockedSolids,'same-face expanded SAT solids also leave all five walking lanes clear').toBe(0);
  const ray=new THREE.Raycaster(),normal=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  let boomChecks=0;
  // An actual near cliff triangle must stop a camera approaching its front.
  for(const mesh of skin.cameraMeshes){
    const p=mesh.geometry.getAttribute('position'),index=mesh.geometry.getIndex()!;
    if(index.count<3)continue;
    a.fromBufferAttribute(p,index.getX(Math.floor(index.count/6)*3));b.fromBufferAttribute(p,index.getX(Math.floor(index.count/6)*3+1));c.fromBufferAttribute(p,index.getX(Math.floor(index.count/6)*3+2));
    normal.subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize();const center=a.clone().add(b).add(c).multiplyScalar(1/3),target=center.clone().addScaledVector(normal,2),desired=center.clone().addScaledVector(normal,-1);
    ray.set(target,normal.clone().negate());const first=ray.intersectObjects(skin.cameraMeshes,false)[0];if(!first||first.distance>2.1)continue;
    constrainCameraBoom(target,desired,[],()=>-100,skin.cameraMeshes);expect(desired.distanceTo(target)).toBeLessThan(first.distance);boomChecks++;
  }
  expect(boomChecks).toBeGreaterThan(20);
  for(const building of SECT_BUILDINGS.filter(b=>b.kind!=='gate'))for(const [x,z] of [[0,0],[-2,-2],[2,2]]){
    const p=sectWorld(building,x,z);expect(terrainSurfaceHeight(p.x,p.z)).toBeCloseTo(SECT_GROUND_Y,4);
  }
  const report={...group.userData,vertices,largestHeightDeparture:largestOutward,p99FacetEdge:longEdges[Math.floor(longEdges.length*.99)],roadSamples,blocked,blockedSolids,boomChecks,outcrops:root.getObjectByName('OriginalLimestoneOutcrops')!.userData};
  await mkdir(validationDirectory,{recursive:true});await writeFile(`${validationDirectory}/geometry.json`,JSON.stringify(report,null,2));
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
});

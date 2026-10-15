import {expect,test} from '@playwright/test';
import * as THREE from 'three';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createGeologicalSurface} from '../src/world/GeologicalSurface';
import {decodeGeologicalSurface} from '../src/world/GeologicalSurfaceData';
import {createLimestoneOutcrops} from '../src/world/LimestoneOutcrops';
import {terrainSurfaceHeight,terrainHeight,protectedPoint} from '../src/world/World';
import {SECT_ASCENT,FOREST_APPROACH,MOUNTAIN_CIRCUIT,WEST_VALLEY_ROUTE} from '../src/world/WorldLayout';
import {SECT_BUILDINGS,SECT_GROUND_Y,SECT_GATE_Y,sectWorld,sectLocal} from '../src/world/SectLayout';
import {nearbyStaticOccluders} from '../src/core/StaticOccluderIndex';
import {constrainCameraBoom} from '../src/core/CameraBoom';
import {bodyPointBlocked} from '../src/core/StaticBodyCollision';

test('sculpted escarpments have real detail, remain outside full road width and retain sect foundations',async()=>{
  test.setTimeout(120000);
  const stage=process.env.GEOLOGY_VALIDATION_STAGE??'geology-validation';if(!/^[a-z0-9-]+$/.test(stage))throw new Error('Invalid geology validation stage');
  const validationDirectory=`artifacts/laas-quality-20261012/${stage}`;
  await mkdir(validationDirectory,{recursive:true});
  const started=performance.now();
  const phase=(name:string)=>writeFileSync(`${validationDirectory}/phase-${name}.json`,JSON.stringify({phase:name,milliseconds:performance.now()-started,heap:process.memoryUsage()},null,2));
  execFileSync(process.execPath,['scripts/bake-geological-surface.mjs','--check'],{stdio:'pipe'});
  const manifest=JSON.parse(await readFile('public/assets/terrain/geological/manifest.json','utf8'));
  const bytes=await readFile(`public/assets/terrain/geological/${manifest.file}`),data=decodeGeologicalSurface(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const root=new THREE.Group(),skin=createGeologicalSurface(root,data),outcrops=createLimestoneOutcrops(root,terrainSurfaceHeight,protectedPoint,[]);
  phase('assembled');
  root.updateMatrixWorld(true);
  const group=root.getObjectByName('GeologicalEscarpments')!,longEdges:number[]=[],point=new THREE.Vector3();
  await mkdir(validationDirectory,{recursive:true});
  await writeFile(`${validationDirectory}/refinement.json`,JSON.stringify(group.userData.refinement,null,2));
  expect(group.userData.refinement.patchBoundary.converged,'coarse neighbours at the patch seam must meet the same geometric limits').toBe(true);
  expect(group.userData.refinement.converged,'unlocked edges of the main-mountain patch must meet the unchanged detail limits').toBe(true);
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
  phase('geometry');
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
  phase('corridor');
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
  phase('camera');
  for(const building of SECT_BUILDINGS.filter(b=>b.kind!=='gate'))for(const [x,z] of [[0,0],[-2,-2],[2,2]]){
    const p=sectWorld(building,x,z);expect(terrainSurfaceHeight(p.x,p.z)).toBeCloseTo(SECT_GROUND_Y,4);
  }
  // Check actual rendered triangles in each rotated building interior and the
  // gate passage. Height samples and a binary mask alone cannot prove this.
  let architectureTriangleChecks=0,architectureIntrusions=0,architectureBodySamples=0;
  const triangle=new THREE.Triangle(),volume=new THREE.Box3(),worldVolume=new THREE.Box3();
  for(const building of SECT_BUILDINGS){
    const gate=building.kind==='gate',halfX=gate?building.entryWidth/2-.4:building.width/2-.4,halfZ=building.depth/2+(gate?1:-.4),floor=(gate?SECT_GATE_Y:SECT_GROUND_Y)+building.floor;
    volume.min.set(-halfX,floor+.02,-halfZ);volume.max.set(halfX,floor+2.2,halfZ);worldVolume.makeEmpty();
    for(const x of [-halfX,halfX])for(const z of [-halfZ,halfZ]){const p=sectWorld(building,x,z);worldVolume.expandByPoint(new THREE.Vector3(p.x,volume.min.y,p.z)).expandByPoint(new THREE.Vector3(p.x,volume.max.y,p.z));}
    for(const mesh of skin.cameraMeshes){
      if(!worldVolume.intersectsBox(mesh.geometry.boundingBox!))continue;
      const position=mesh.geometry.getAttribute('position'),index=mesh.geometry.getIndex()!;
      for(let i=0;i<index.count;i+=3){
        for(const [j,p] of [[0,triangle.a],[1,triangle.b],[2,triangle.c]] as const){p.fromBufferAttribute(position,index.getX(i+j));const local=sectLocal(building,p.x,p.z);p.set(local.x,p.y,local.z);}
        architectureTriangleChecks++;if(volume.intersectsTriangle(triangle))architectureIntrusions++;
      }
    }
    for(const x of [-halfX*.8,0,halfX*.8])for(const z of [-halfZ*.8,0,halfZ*.8]){const p=sectWorld(building,x,z);point.set(p.x,Math.max(floor,terrainHeight(p.x,p.z)),p.z);expect(bodyPointBlocked(skin.bodySolids,point),`${building.id} walking volume is clear of actual cliff SAT`).toBe(false);architectureBodySamples++;}
  }
  expect(architectureTriangleChecks).toBeGreaterThan(0);
  expect(architectureIntrusions,'actual cliff triangles do not enter building interiors or the gate passage').toBe(0);
  phase('architecture');
  const report={...group.userData,vertices,largestHeightDeparture:largestOutward,p99FacetEdge:longEdges[Math.floor(longEdges.length*.99)],roadSamples,blocked,blockedSolids,boomChecks,architectureTriangleChecks,architectureIntrusions,architectureBodySamples,outcrops:root.getObjectByName('OriginalLimestoneOutcrops')!.userData};
  await mkdir(validationDirectory,{recursive:true});await writeFile(`${validationDirectory}/geometry.json`,JSON.stringify(report,null,2));
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
});

import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {bodyPointBlocked,bodyCollisionMesh} from '../src/core/StaticBodyCollision';
import {terrainHeight} from '../src/world/World';
import {SECT_ASCENT,FOREST_APPROACH,MOUNTAIN_CIRCUIT,WEST_VALLEY_ROUTE} from '../src/world/WorldLayout';

test('actual constructed deadwood stays grounded, leaves full roads clear and stops real walking at each form',async({page})=>{
  test.setTimeout(180000);
  const stage=process.env.DEADWOOD_RUNTIME_STAGE??`deadwood-runtime-${Date.now()}`;
  if(!/^deadwood-runtime-[a-z0-9-]+$/.test(stage))throw new Error('Invalid deadwood stage');
  const out=`artifacts/laas-quality-20261012/${stage}`;await mkdir(out,{recursive:false});
  const files=['src/world/ForestDeadwood.ts','src/world/ForestDeadwoodGeometry.ts','src/world/ForestDeadwoodMaterial.ts','src/world/World.ts','src/world/TerrainField.ts','src/world/WoodlandPrimitives.ts','src/world/GroundCoverObstacles.ts','src/world/NaturalForest.ts','src/core/StaticBodyCollision.ts','src/game/Game.ts','src/game/DeadwoodQualityPose.ts','src/main.ts','src/vite-env.d.ts','tests/deadwood-runtime.spec.ts'];
  const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
  const errors:string[]=[],report:Record<string,unknown>={complete:false,sourceHashes:await hashes(),scope:'Actual constructed placement/contact/collision data, full eight-metre routes, ordinary close cameras and real W contact per form. Does not establish all-world free exploration or motion AA.'};
  const save=()=>writeFile(`${out}/status.json`,JSON.stringify({...report,errors},null,2)+'\n');await save();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    await page.goto('/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('quality-floor-noon'));
    const snapshot=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.inspectDecomposition(true));
    expect(snapshot.placements.length).toBeGreaterThan(10);
    for(const form of [0,1,2])expect(snapshot.placements.filter(piece=>piece.form===form).length).toBeGreaterThan(0);
    const meshes=Array.from(new Set(snapshot.solids.map(s=>s.seed)),seed=>bodyCollisionMesh(snapshot.solids.filter(s=>s.seed===seed).map(s=>({bounds:new THREE.Box3(new THREE.Vector3().fromArray(s.bounds[0]),new THREE.Vector3().fromArray(s.bounds[1])),axes:s.axes}))));
    let contacts=0,maxGap=-Infinity,minGap=Infinity;
    for(const piece of snapshot.placements){expect(piece.contacts.length).toBeGreaterThan(0);for(const p of piece.contacts){expect(p.every(Number.isFinite)).toBe(true);const gap=p[1]-terrainHeight(p[0],p[2]);maxGap=Math.max(maxGap,gap);minGap=Math.min(minGap,gap);contacts++;}}
    expect(contacts).toBeGreaterThan(snapshot.placements.length);expect(maxGap).toBeLessThan(.003);expect(minGap).toBeGreaterThan(-.171);
    let roadSamples=0,blocked=0;
    for(const route of [SECT_ASCENT,FOREST_APPROACH,MOUNTAIN_CIRCUIT,WEST_VALLEY_ROUTE])for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i],length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length/.2);
      for(let j=0;j<=steps;j++)for(const offset of [-4,-2,0,2,4]){
        const x=a.x+(b.x-a.x)*j/steps-(b.z-a.z)/length*offset,z=a.z+(b.z-a.z)*j/steps+(b.x-a.x)/length*offset;
        if(bodyPointBlocked(meshes,new THREE.Vector3(x,terrainHeight(x,z),z)))blocked++;roadSamples++;
      }
    }
    report.geometry={snapshot,contacts,minGap,maxGap,roadSamples,blocked};await save();expect(blocked).toBe(0);
    const forms=[];
    for(const form of [0,1,2]){
      const ack=await page.evaluate(f=>window.__THREE_GAME_TEST_HOOKS__!.setState(`deadwood-${f}-noon`),form);
      const piece=snapshot.placements.find(p=>p.seed===ack.decompositionSeed)!;expect(piece?.form).toBe(form);
      await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setReducedMotion(false));
      const start=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);await page.screenshot({path:`${out}/form-${form}-before.png`});
      const samples=[];await page.keyboard.down('KeyW');
      try{for(let i=0;i<12;i++){await page.waitForTimeout(150);const d=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);samples.push(d.player.position);expect(bodyPointBlocked(meshes,new THREE.Vector3(d.player.position.x,d.player.position.y,d.player.position.z))).toBe(false);}}
      finally{await page.keyboard.up('KeyW');}
      const end=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);await page.screenshot({path:`${out}/form-${form}-contact.png`});
      expect(end.flying).toBe(false);expect(Math.abs(end.player.position.y-terrainHeight(end.player.position.x,end.player.position.z))).toBeLessThan(.08);
      expect(Math.hypot(end.player.position.x-start.player.position.x,end.player.position.z-start.player.position.z),'real W actually approaches the selected fallen trunk').toBeGreaterThan(.15);
      // Continuous collision allows tangential sliding along an irregular
      // trunk. Check its exact boundary, rather than requiring stationary XY.
      const contactSamples=[...samples.slice(-3),end.player.position].map(point=>snapshot.solids.filter(s=>s.seed===piece.seed).some(s=>s.axes.every(axis=>{const projection=point.x*axis.x+point.y*axis.y+point.z*axis.z;return projection>=axis.min-.025&&projection<=axis.max+.025;})));
      const contact=contactSamples.every(Boolean),orbit:typeof end.camera[]=[];
      forms.push({form,seed:piece.seed,contact,contactSamples,start,end,samples,orbit});report.forms=forms;await save();
      expect(contact,'late feet remain at the exact selected trunk boundary while stopped or sliding tangentially').toBe(true);
      await page.mouse.move(640,340);await page.mouse.down({button:'right'});
      try{for(let i=0;i<12;i++){
        await page.mouse.move(640+Math.sin(i*.4)*160,340+Math.sin(i*.3)*55,{steps:3});await page.waitForTimeout(80);const d=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
        const target=new THREE.Vector3(d.camera.target.x,d.camera.target.y,d.camera.target.z),camera=new THREE.Vector3(d.camera.position.x,d.camera.position.y,d.camera.position.z),delta=camera.clone().sub(target),length=delta.length(),ray=new THREE.Ray(target,delta.normalize());
        let intrusions=0;
        for(const b of snapshot.cameraBounds){const box=new THREE.Box3(new THREE.Vector3().fromArray(b[0]),new THREE.Vector3().fromArray(b[1])).expandByScalar(.18);if(box.containsPoint(target))continue;const hit=ray.intersectBox(box,new THREE.Vector3());if(hit&&hit.distanceTo(target)<length-.03)intrusions++;}
        expect(intrusions,'ordinary camera boom remains on the player side of deadwood proxies').toBe(0);orbit.push(d.camera);
      }}
      finally{await page.mouse.up({button:'right'});}
      await page.screenshot({path:`${out}/form-${form}-orbit.png`});await save();
    }
    report.forms=forms;report.sourceHashesAtEnd=await hashes();expect(report.sourceHashesAtEnd).toEqual(report.sourceHashes);expect(errors).toEqual([]);
    report.complete=true;await save();
  }catch(error){report.failure=String(error);await save();throw error;}
});

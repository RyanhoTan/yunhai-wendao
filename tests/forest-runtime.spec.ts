import {expect,test} from '@playwright/test';
import * as THREE from 'three';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createWoodlandPopulation} from '../src/world/WoodlandPopulation';
import {protectedPoint,terrainHeight} from '../src/world/World';
import {LAND_QUALITY_VIEWS} from '../src/world/LandQualityViews';

test.use({video:'off'});
test('real forest walking, trunk camera clearance and canopy flight remain stable',async({page})=>{
  test.setTimeout(240000);
  const stage=process.env.FOREST_RUNTIME_STAGE??`forest-runtime-${Date.now()}`;
  if(!/^forest-runtime-[a-z0-9-]+$/.test(stage))throw new Error('Invalid forest runtime stage');
  const out=`artifacts/laas-quality-20261012/${stage}`;await mkdir(out,{recursive:false});
  const sourceFiles=['NaturalForest','WoodlandGeometry','WoodlandTree','WoodlandPrimitives','WoodlandPopulation','WoodlandMaterials','WoodlandRenderCells','WoodlandLOD','ForestLayout','LandQualityViews','World','GroundCover','GroundCoverGeometry','GroundCoverPlacement','GroundCoverMaterials','GroundCoverObstacles','GroundCoverage','TerrainField','GroundUnderstoryGeometry','ForestFloorMaterial','NaturalLandMaterial'].map(name=>`src/world/${name}.ts`).concat(['src/game/Game.ts','src/core/CameraBoom.ts','src/core/StaticOccluderIndex.ts','tests/forest-runtime.spec.ts']);
  const hashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
  const sourceHashes=await hashes(),population=createWoodlandPopulation(terrainHeight,protectedPoint);
  const boxes=population.cameraOccluders;
  // The renderer uses conservative stem segment boxes. These checks establish
  // clearance from those collision envelopes, not a pixel-perfect bark contact.
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const report:Record<string,unknown>={complete:false,sourceHashes,scope:'Real WASD forest travel, 24 real right-mouse camera samples against actual stem envelopes, canopy flight with discrete travel frames and landing. Does not establish all-route free exploration, airborne trunk body collision or motion antialiasing quality.'};
  const save=()=>writeFile(`${out}/status.json`,JSON.stringify({...report,errors},null,2)+'\n');await save();
  const state=()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
  try{
    await page.goto('/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('quality-forest-noon'));
    await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setReducedMotion(false));
    const start=await state(),walk=[];
    await page.keyboard.down('KeyW');
    try{for(let i=0;i<12;i++){await page.waitForTimeout(200);const d=await state();walk.push(d);await page.screenshot({path:`${out}/walk-${String(i).padStart(2,'0')}.png`});}}
    finally{await page.keyboard.up('KeyW');}
    await expect.poll(async()=>{const d=await state();return d.player.speed;}).toBeLessThan(.1);
    const end=await state();expect(Math.hypot(end.player.position.x-start.player.position.x,end.player.position.z-start.player.position.z)).toBeGreaterThan(8);
    for(const d of walk){expect(d.flying).toBe(false);expect(Math.abs(d.player.position.y-d.coast.ground)).toBeLessThan(.08);expect(d.health).toBe(130);}
    report.walk={start,end,samples:walk};await save();
    // This close view uses the ordinary player camera and real mouse input.
    await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('quality-floor-noon'));
    const orbit=[];await page.mouse.move(640,340);await page.mouse.down({button:'right'});
    try{for(let i=0;i<24;i++){
      await page.mouse.move(640+Math.sin(i*.35)*230,340+Math.sin(i*.27)*90,{steps:4});await page.waitForTimeout(100);const d=await state();
      const camera=new THREE.Vector3(d.camera.position.x,d.camera.position.y,d.camera.position.z),target=new THREE.Vector3(d.camera.target.x,d.camera.target.y,d.camera.target.z),delta=camera.clone().sub(target),length=delta.length(),ray=new THREE.Ray(target,delta.normalize());
      expect(Number.isFinite(length)).toBe(true);expect(length).toBeGreaterThan(.20);let blocked=0;
      for(const box of boxes){const expanded=box.clone().expandByScalar(.15);if(expanded.containsPoint(target))continue;const hit=ray.intersectBox(expanded,new THREE.Vector3());if(hit&&hit.distanceTo(target)<length-.03)blocked++;}
      expect(blocked,`ordinary camera sample ${i} stays outside conservative stem envelopes`).toBe(0);
      orbit.push(d.camera);if(i%4===0)await page.screenshot({path:`${out}/trunk-orbit-${i}.png`});
    }}finally{await page.mouse.up({button:'right'});}
    report.trunkOrbit={samples:orbit,envelopes:boxes.length};await save();
    await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('quality-forest-noon'));
    await page.keyboard.press('KeyF');await page.keyboard.down('Space');
    try{await page.waitForFunction(()=>{const d=window.__THREE_GAME_DIAGNOSTICS__!;return d.flying&&d.player.position.y-d.coast.ground>20;},null,{timeout:45000});}finally{await page.keyboard.up('Space');}
    const flight=await state();await page.screenshot({path:`${out}/canopy-flight.png`});expect(flight.health).toBe(130);
    const travel=[];await page.keyboard.down('KeyW');
    try{for(let i=0;i<8;i++){await page.waitForTimeout(200);travel.push(await state());await page.screenshot({path:`${out}/flight-travel-${i}.png`});}}
    finally{await page.keyboard.up('KeyW');}
    const far=await state();expect(Math.hypot(far.player.position.x-flight.player.position.x,far.player.position.z-flight.player.position.z)).toBeGreaterThan(30);
    await page.keyboard.down('KeyS');
    try{await page.waitForFunction(p=>{const q=window.__THREE_GAME_DIAGNOSTICS__!.player.position;return Math.hypot(q.x-p.x,q.z-p.z)<4;},flight.player.position,{timeout:20000});}
    finally{await page.keyboard.up('KeyS');}
    await page.keyboard.down('KeyC');try{await page.waitForFunction(()=>{const d=window.__THREE_GAME_DIAGNOSTICS__!;return d.player.position.y-d.coast.ground<3;},null,{timeout:45000});}finally{await page.keyboard.up('KeyC');}
    await page.keyboard.press('KeyF');await page.waitForFunction(()=>{const d=window.__THREE_GAME_DIAGNOSTICS__!;return !d.flying&&Math.abs(d.player.position.y-d.coast.ground)<.05;});
    const landed=await state();expect(Math.abs(landed.player.position.y-landed.coast.ground)).toBeLessThan(.05);await page.screenshot({path:`${out}/landed.png`});
    report.flight={flight,travel,far,landed};report.fixedView=LAND_QUALITY_VIEWS['quality-floor-noon'];report.sourceHashesAtEnd=await hashes();
    expect(report.sourceHashesAtEnd).toEqual(sourceHashes);expect(errors).toEqual([]);report.complete=true;await save();
  }catch(error){report.error=String(error);await save();throw error;}
  finally{population.prototypes.flat().forEach(p=>{p.wood.dispose();p.leaves.dispose();});[...population.grass,...population.ferns,population.litter].forEach(g=>g.dispose());}
});

import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {Box3,Group,Mesh,Raycaster,Vector3} from 'three';
import {SECT_BUILDINGS,SECT_GATE_Y,SECT_GROUND_Y,sectWorld,sectProtected} from '../src/world/SectLayout';
import {createSectBuilding,getSectBuildingDimensions} from '../src/world/SectArchitecture';
import {createSectSite} from '../src/world/SectSite';
import {terrainHeight,terrainSurfaceHeight} from '../src/world/World';
import {constrainCameraBoom} from '../src/core/CameraBoom';
import {createNaturalTerrain} from '../src/world/NaturalTerrain';
import {walk} from './helpers/navigation';

const OUT='artifacts/sect-expansion-20261010';
test('sect overview, library and gate retain their visual layout',async({page})=>{
  test.setTimeout(100000);await page.goto('/?test=1');
  for(const state of ['sect-site-overview','sect-site-library','sect-site-gate']){
    await page.evaluate(async state=>{const hooks=window.__THREE_GAME_TEST_HOOKS__!;await hooks.setPausedForScreenshot(false);await hooks.seed(42);await hooks.setState(state);await hooks.setPausedForScreenshot(true);await hooks.setReducedMotion(true);await document.fonts.ready;},state);
    await expect(page).toHaveScreenshot(`${state}.png`,{maxDiffPixelRatio:.012,animations:'disabled',timeout:30000});
  }
});

test('buildings follow the reference and every actual entrance tread agrees with feet height',async()=>{
  const library=SECT_BUILDINGS[0],alchemy=SECT_BUILDINGS[1],pavilion=SECT_BUILDINGS[5];
  expect(library.x).toBeLessThan(-20);expect(alchemy.x).toBeGreaterThan(20);expect(pavilion.z).toBeGreaterThan(library.z+12);expect(pavilion.x).toBeLessThan(library.x);
  const root=new Group(),site=createSectSite(root,terrainHeight);
  expect(site.metrics).toHaveLength(7);expect(site.metrics.reduce((n,b)=>n+b.triangles,0)).toBeLessThan(100000);
  expect(site.drawCalls).toBeLessThan(12);
  await mkdir(OUT,{recursive:true});await writeFile(`${OUT}/architecture-metrics.json`,JSON.stringify({buildings:site.metrics,courtyardMaterialDraws:site.drawCalls,roofBodyTriangles:site.bodySolids.reduce((n,b)=>n+b.solids.length,0)},null,2));
  for(const p of SECT_BUILDINGS){
    const model=createSectBuilding(p),dim=getSectBuildingDimensions(p),base=p.kind==='gate'?SECT_GATE_Y:SECT_GROUND_Y;
    model.position.set(p.x,base,p.z);model.rotation.y=p.yaw;model.updateMatrixWorld(true);
    const ray=new Raycaster();
    for(let i=0;i<dim.stairCount;i++){
      const z=dim.stairStart+dim.stairDepth-(i+.5)*dim.stairDepth/dim.stairCount,q=sectWorld(p,0,z);
      ray.set(new Vector3(q.x,base+2,q.z),new Vector3(0,-1,0));
      const hit=ray.intersectObject(model,true)[0];expect(hit,`${p.id} tread ${i}`).toBeDefined();
      expect(terrainHeight(q.x,q.z),`${p.id} tread ${i} matches visual`).toBeCloseTo(hit.point.y,5);
      expect(sectProtected(q.x,q.z,1)).toBe(true);
    }
    const center=sectWorld(p,0,0);expect(terrainHeight(center.x,center.z)).toBeCloseTo(base+p.floor,4);
    const entry=sectWorld(p,0,dim.stairStart+3);
    ray.set(new Vector3(entry.x,base+p.floor+1.4,entry.z),new Vector3(-Math.sin(p.yaw),0,-Math.cos(p.yaw)));
    const first=ray.intersectObject(model,true)[0];
    if(p.kind==='library'||p.kind==='alchemy'||p.kind==='residence')expect(first?.distance,`${p.id} central doorway remains open`).toBeGreaterThan(dim.stairStart+dim.wallDepth/2+2.8);
    model.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});
  }
  // The plaza and mentor axis are unobstructed below head height.
  for(const z of [24,29,32,36,40,48]){
    const body=new Box3(new Vector3(-.55,90,z-.55),new Vector3(.55,91.8,z+.55));
    expect(site.walls.some(w=>w.intersectsBox(body)),`central route at ${z}`).toBe(false);
  }
  for(let z=-18;z<=29;z+=.5){
    const body=new Box3(new Vector3(15.45,90,z-.55),new Vector3(16.55,91.8,z+.55));
    expect(site.walls.some(w=>w.intersectsBox(body)),`rear courtyard path at ${z}`).toBe(false);
  }
  root.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});
});

test('ground stays below foundations, pavilion approach is grounded and camera avoids the upper roof',()=>{
  const ground=new Group();createNaturalTerrain(ground,terrainSurfaceHeight,()=>Infinity);ground.updateMatrixWorld(true);
  const ray=new Raycaster(new Vector3(-35.1,95,8),new Vector3(0,-1,0));
  expect(ray.intersectObject(ground,true)[0].point.y).toBeCloseTo(terrainHeight(-35.1,8),3);
  const gate=SECT_BUILDINGS[6],edge=gate.width/2-.1;for(const x of [-edge,0,edge])for(const z of [-1,0,1]){
    const point=sectWorld(gate,x,z);expect(terrainHeight(point.x,point.z)).toBeCloseTo(SECT_GATE_Y+gate.floor,5);
  }
  const pavilion=SECT_BUILDINGS[5],toe=getSectBuildingDimensions(pavilion).stairStart+2.4;
  const before=sectWorld(pavilion,0,toe+.1);expect(terrainHeight(before.x,before.z)).toBeCloseTo(90,3);
  const root=new Group(),site=createSectSite(root,terrainHeight),target=new Vector3(-35,98.6,2),desired=new Vector3(-30.75736,100.2,6.24264);
  const distance=target.distanceTo(desired);constrainCameraBoom(target,desired,site.cameraOccluders,terrainHeight);
  expect(target.distanceTo(desired)).toBeLessThan(distance-1);
  for(const group of [root,ground])group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});
});

test('real input enters library and alchemy, rear walls stop movement, and interior saves resume',async({page})=>{
  test.setTimeout(150000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await mkdir(OUT,{recursive:true});await page.goto('/?test=1');const result=[];
  for(const state of ['library','alchemy']){
    await page.evaluate(state=>window.__THREE_GAME_TEST_HOOKS__!.setState(`sect-site-${state}`),state);
    const p=SECT_BUILDINGS[state==='library'?0:1];
    await walk(page,p.x,p.z+1.8);await page.waitForTimeout(300);
    const inside=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position);
    expect(inside.y).toBeCloseTo(SECT_GROUND_Y+p.floor,1);
    await page.screenshot({path:`${OUT}/input-${state}-inside.png`});
    await page.keyboard.down('KeyW');await page.waitForTimeout(1600);await page.keyboard.up('KeyW');
    const stopped=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position);
    expect(stopped.z).toBeGreaterThan(p.z-(p.depth/2-.65)+.5);expect(stopped.z).toBeLessThan(p.z-2);
    await walk(page,p.x,p.z+1.8);await page.waitForTimeout(350);
    const saved=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position);
    await page.keyboard.press('Escape');await page.locator('[data-action=save]').click();await page.reload();await page.locator('[data-action=continue]').click();
    await expect.poll(()=>page.evaluate(saved=>{const p=window.__THREE_GAME_DIAGNOSTICS__!.player.position;return Math.hypot(p.x-saved.x,p.z-saved.z);},saved)).toBeLessThan(.3);
    const resumed=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position);
    expect(Math.hypot(resumed.x-saved.x,resumed.z-saved.z)).toBeLessThan(.3);expect(resumed.y).toBeCloseTo(saved.y,1);
    result.push({state,inside,stopped,saved,resumed});
  }
  await writeFile(`${OUT}/interior-input.json`,JSON.stringify({result,errors},null,2));expect(errors).toEqual([]);
});

test('real input reaches all three residences, pavilion and walks through the aligned mountain gate',async({page})=>{
  test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await mkdir(OUT,{recursive:true});
  await page.goto('/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('sect-summit'));
  const visited=[];
  for(const target of [[0,40],[0,29],[16,29],[16,15],[16,0],[16,-18],[22,-18],[22,-27],[22,-18],[38,-18],[38,-29],[38,-18],[36,-12],[42,-12]]){
    await walk(page,target[0],target[1]);const d=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
    expect(d.flying).toBe(false);expect(d.player.position.y).toBeCloseTo(terrainHeight(d.player.position.x,d.player.position.z),1);visited.push(d.player.position);
  }
  const pavilion=SECT_BUILDINGS[5];await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('sect-site-pavilion'));await walk(page,pavilion.x,pavilion.z);await page.waitForTimeout(250);
  expect((await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position)).y).toBeCloseTo(90.6,1);
  await page.screenshot({path:`${OUT}/input-pavilion-inside.png`});
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('sect-site-gate'));
  const gate=SECT_BUILDINGS[6],exit=sectWorld(gate,0,-8);await walk(page,exit.x,exit.z);
  const afterGate=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position);
  expect(Math.hypot(afterGate.x-exit.x,afterGate.z-exit.z)).toBeLessThan(1.1);
  await writeFile(`${OUT}/courtyard-input.json`,JSON.stringify({visited,afterGate,errors},null,2));expect(errors).toEqual([]);
});

test('real descent rests on the library roof, ascent clears it and lower sky remains traversable',async({page})=>{
  await page.goto('/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('sect-site-library-roof'));
  await page.keyboard.down('KeyC');await page.waitForTimeout(2200);await page.keyboard.up('KeyC');
  const rest=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);expect(rest.flying).toBe(true);expect(rest.player.position.y).toBeGreaterThan(101.6);
  await page.keyboard.down('Space');await page.waitForTimeout(1400);await page.keyboard.up('Space');
  const lifted=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);expect(lifted.player.position.y).toBeGreaterThan(rest.player.position.y+5);
  await mkdir(OUT,{recursive:true});await page.screenshot({path:`${OUT}/input-library-roof.png`});
  await writeFile(`${OUT}/roof-input.json`,JSON.stringify({rest:rest.player,lifted:lifted.player},null,2));
});

import {expect,test,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import * as THREE from 'three';
import {createTown} from '../src/world/Town';
import {TOWN,TOWN_SHOPS} from '../src/world/TownLayout';
import {terrainHeight} from '../src/world/World';

test.use({video:{mode:'on',size:{width:1280,height:720}}});

test('all twelve shop entrances are open and backed by solid walls',()=>{
  const root=new THREE.Group(),town=createTown(root);
  expect(town.shopCount).toBe(12);
  root.updateMatrixWorld(true);
  const detailMeshes:THREE.Mesh[]=[];root.traverse(o=>{if(o instanceof THREE.Mesh&&o.name.startsWith('TownStreetDetail'))detailMeshes.push(o);});
  const interior=new THREE.Vector3(TOWN_SHOPS[1].x-3.7,TOWN.groundY+1.8,TOWN_SHOPS[1].z),ray=new THREE.Raycaster(interior,new THREE.Vector3(0,1,0));
  const ceiling=ray.intersectObjects(detailMeshes.filter(m=>(m.material as THREE.Material).name==='town_timber'),false)[0];
  expect(ceiling,'one-storey shop has a visible downward-facing roof underside').toBeDefined();expect(ceiling.face!.normal.y).toBeLessThan(-.2);
  ray.set(interior,new THREE.Vector3(0,-1,0));const floor=ray.intersectObjects(detailMeshes.filter(m=>(m.material as THREE.Material).name==='town_stone'),false)[0];
  expect(floor).toBeDefined();const finish=floor.point.y-terrainHeight(floor.point.x,floor.point.z);expect(finish).toBeGreaterThan(.003);expect(finish).toBeLessThan(.035);
  for(const s of TOWN_SHOPS){
    // A capsule-sized sample follows the actual entrance aisle into each shop.
    for(let distance=-2;distance<=5;distance+=.25){
      const x=s.x+s.side*distance,z=s.z;
      const intersects=town.walls.some(w=>TOWN.groundY+1.8>w.min.y&&TOWN.groundY<w.max.y&&x>w.min.x-.55&&x<w.max.x+.55&&z>w.min.z-.55&&z<w.max.z+.55);
      expect(intersects,`shop ${s.index}, aisle ${distance}m`).toBe(false);
    }
    const rearX=s.x+s.side*s.depth;
    expect(town.walls.some(w=>w.containsPoint(new THREE.Vector3(rearX,TOWN.groundY+1,s.z)))).toBe(true);
  }
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
});

const walk=async(page:Page,x:number,z:number,steps=100,tolerance=.65)=>{
  let held:string[]=[];
  for(let step=0;step<steps;step++){
    const p=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player),dx=x-p.position.x,dz=z-p.position.z;
    if(Math.hypot(dx,dz)<tolerance){for(const key of held)await page.keyboard.up(key);return true;}
    const right=Math.cos(p.yaw)*dx-Math.sin(p.yaw)*dz,forward=-Math.sin(p.yaw)*dx-Math.cos(p.yaw)*dz,next:string[]=[];
    if(Math.abs(right)>.3)next.push(right>0?'KeyD':'KeyA');if(Math.abs(forward)>.3)next.push(forward>0?'KeyW':'KeyS');
    for(const key of held)if(!next.includes(key))await page.keyboard.up(key);for(const key of next)if(!held.includes(key))await page.keyboard.down(key);held=next;
    await page.waitForTimeout(90);
  }
  for(const key of held)await page.keyboard.up(key);return false;
};

test('real movement traverses the street, enters both shop rows and respects rear walls',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('town'));
  await page.waitForTimeout(350);await page.keyboard.down('KeyW');
  const performanceSample=await page.evaluate(()=>new Promise(resolve=>{
    const start=performance.now(),frames:number[]=[],renderMax={calls:0,triangles:0,geometries:0,textures:0};let previous=start;
    const tick=(time:number)=>{frames.push(time-previous);previous=time;const r=window.__THREE_GAME_DIAGNOSTICS__!.renderer;for(const key of ['calls','triangles','geometries','textures'] as const)renderMax[key]=Math.max(renderMax[key],r[key]);
      const elapsed=performance.now()-start;if(elapsed<2000)requestAnimationFrame(tick);else{frames.sort((a,b)=>a-b);resolve({durationMs:elapsed,frames:frames.length,fps:frames.length*1000/elapsed,p95FrameMs:frames[Math.floor(frames.length*.95)],renderMax});}};requestAnimationFrame(tick);
  }));await page.keyboard.up('KeyW');
  expect(await walk(page,125,115.5)).toBe(true);
  expect(await walk(page,115,115.5)).toBe(true);await page.screenshot({path:'artifacts/qa/town-interior-west.png'});
  expect(await walk(page,125,115.5)).toBe(true);
  expect(await walk(page,135,115.5)).toBe(true);await page.screenshot({path:'artifacts/qa/town-interior-east.png'});
  expect(await walk(page,143,115.5,25,.4)).toBe(false);
  const blocked=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position);
  expect(blocked.x).toBeLessThan(138.3);
  expect(await walk(page,125,115.5)).toBe(true);
  expect(await walk(page,125,42,180)).toBe(true);await page.screenshot({path:'artifacts/qa/town-real-street.png'});
  const diagnostics=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
  const gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas')!.getContext('webgl2')!,ext=gl.getExtension('WEBGL_debug_renderer_info')!;return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;});
  await writeFile('artifacts/qa/town-input-metrics.json',JSON.stringify({gpu,performanceValid:!/swiftshader|software|llvmpipe/i.test(gpu),performanceSample,route:'south entry → west wine shop → east general store → blocked rear wall → north gate',physics:diagnostics.physics,finalPosition:diagnostics.player.position,health:diagnostics.health,errors},null,2));expect(errors).toEqual([]);
  const video=page.video()!;await page.context().close();await video.saveAs('artifacts/qa/town-exploration.webm');
});

test('town navigation and an indoor saved position survive reload',async({page})=>{
  await page.goto('/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('town-shop'));
  await expect(page.locator('[data-field=location]')).toContainText('溪月茶舍');
  await page.keyboard.press('KeyM');const row=page.locator('.landmark-row').filter({hasText:'听潮坊'});
  await expect(row).toContainText('可探索市集');await page.screenshot({path:'artifacts/qa/town-map.png'});await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:'山川舆图'})).not.toBeVisible();
  await page.keyboard.press('Escape');await page.locator('[data-action=save]').click();
  const before=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position);
  await page.reload();await page.locator('[data-action=continue]').click();
  await expect(page.locator('[data-field=location]')).toContainText('溪月茶舍');
  const after=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position);
  expect(Math.hypot(before.x-after.x,before.z-after.z)).toBeLessThan(.5);
  expect(await walk(page,125,65.5)).toBe(true);
});

test('sword flight clears the town, with landing directed onto the street',async({page})=>{
  await page.goto('/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('town-flight'));
  await page.keyboard.press('KeyF');expect(await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.flying)).toBe(true);
  await expect(page.locator('[data-field=toast]')).toContainText('移到长街');
  expect(await walk(page,125,65.5,80)).toBe(true);await page.keyboard.press('KeyF');
  await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.flying)).toBe(false);
  await page.waitForTimeout(500);expect((await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position)).y).toBeCloseTo(TOWN.groundY,1);
});

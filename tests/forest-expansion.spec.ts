import {expect,test,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {terrainHeight} from '../src/world/World';
import {WORLD_LIMITS,FOREST_APPROACH} from '../src/world/WorldLayout';

test.use({video:'off',trace:'off'});

async function walk(page:Page,x:number,z:number){
  let held:string[]=[];
  for(let i=0;i<150;i++){
    const p=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player),dx=x-p.position.x,dz=z-p.position.z;
    if(Math.hypot(dx,dz)<.65){for(const key of held)await page.keyboard.up(key);return;}
    const right=Math.cos(p.yaw)*dx-Math.sin(p.yaw)*dz,forward=-Math.sin(p.yaw)*dx-Math.cos(p.yaw)*dz,next:string[]=[];
    if(Math.abs(right)>.25)next.push(right>0?'KeyD':'KeyA');if(Math.abs(forward)>.25)next.push(forward>0?'KeyW':'KeyS');
    for(const key of held)if(!next.includes(key))await page.keyboard.up(key);for(const key of next)if(!held.includes(key))await page.keyboard.down(key);held=next;
    await page.waitForTimeout(90);
  }
  for(const key of held)await page.keyboard.up(key);
  throw new Error(`Forest route did not reach ${x}, ${z}`);
}

test('walk beyond the old boundary into the new forest and restore an outdoor save',async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('forest-entry'));
  const start=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position);expect(start.x).toBeGreaterThan(-294);
  await mkdir('artifacts/qa/forest-expansion-frames',{recursive:true});const frames:string[]=[],route:{x:number;y:number;z:number}[]=[];
  for(const p of FOREST_APPROACH.slice(3)){
    await walk(page,p.x,p.z);route.push(await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position));
  }
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(true));
  const path='artifacts/qa/forest-expansion-frames/inside.png';await page.screenshot({path});frames.push(path);
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(false));
  const inside=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
  expect(inside.player.position.x).toBeLessThan(-390);expect(inside.flying).toBe(false);expect(inside.health).toBe(130);
  await page.waitForTimeout(300);
  const grounded=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position);expect(Math.abs(grounded.y-terrainHeight(grounded.x,grounded.z))).toBeLessThan(.18);
  await expect(page.locator('[data-field=location]')).toContainText('苍翠林');
  await page.keyboard.press('KeyM');await expect(page.locator('.landmark-row').filter({hasText:'苍翠林'})).toContainText('可探索森林');await page.screenshot({path:'artifacts/qa/forest-expansion-map.png'});
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'山川舆图'})).not.toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.phase)).toBe('playing');
  await page.keyboard.press('Escape');await page.locator('[data-action=save]').click();
  await page.reload();await page.locator('[data-action=continue]').click();
  const restored=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position);expect(Math.hypot(restored.x-grounded.x,restored.z-grounded.z)).toBeLessThan(.5);
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(true));await page.screenshot({path:'artifacts/qa/forest-expansion-restored.png'});await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(false));
  await walk(page,-384,-142);expect(await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position.x)).toBeLessThan(-300);
  await writeFile('artifacts/qa/forest-expansion-walk-metrics.json',JSON.stringify({start,route,inside:inside.player.position,restored,frames,errors},null,2));expect(errors).toEqual([]);
});

test('sword flight explores new forest canopy and respects the expanded west boundary',async({page})=>{
  test.setTimeout(120000);
  await page.goto('/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('forest-canopy'));
  await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.elapsed),{timeout:30000}).toBeGreaterThan(.6);
  await page.keyboard.down('KeyW');await page.keyboard.down('ShiftLeft');await page.keyboard.down('Space');
  const performanceSample=await page.evaluate(()=>new Promise(resolve=>{const start=performance.now(),frames:number[]=[],renderMax={calls:0,triangles:0,geometries:0,textures:0};let previous=start;
    const tick=(time:number)=>{frames.push(time-previous);previous=time;const r=window.__THREE_GAME_DIAGNOSTICS__!.renderer;for(const key of ['calls','triangles','geometries','textures'] as const)renderMax[key]=Math.max(renderMax[key],r[key]);const elapsed=performance.now()-start;
      if(elapsed<2200)requestAnimationFrame(tick);else{frames.sort((a,b)=>a-b);resolve({durationMs:elapsed,frames:frames.length,fps:frames.length*1000/elapsed,p95FrameMs:frames[Math.floor(frames.length*.95)],renderMax});}};requestAnimationFrame(tick);
  }));await page.keyboard.up('Space');
  await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position.x),{timeout:15000}).toBeLessThan(WORLD_LIMITS.minX+.01);
  await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
  const d=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);expect(d.flying).toBe(true);expect(d.player.position.x).toBeGreaterThanOrEqual(WORLD_LIMITS.minX);
  const gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas')!.getContext('webgl2')!,e=gl.getExtension('WEBGL_debug_renderer_info')!;return gl.getParameter(e.UNMASKED_RENDERER_WEBGL) as string;});
  await page.screenshot({path:'artifacts/qa/forest-expansion-flight.png'});
  await writeFile('artifacts/qa/forest-expansion-flight-metrics.json',JSON.stringify({gpu,performanceValid:!/swiftshader|software|llvmpipe/i.test(gpu),performanceSample,position:d.player.position,bounds:WORLD_LIMITS},null,2));
});

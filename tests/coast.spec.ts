import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import { PNG } from 'pngjs';
import { shorelineAt, safeCoastalPosition } from '../src/world/CoastMath';

const state = (page: import('@playwright/test').Page) => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!);

test('low sword flight collides with tall rocks, while flight above crowns stays clear',async({page})=>{
  await page.goto('/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('coast-rock-flight'));
  await page.waitForTimeout(600);const low=await state(page);
  expect(Math.hypot(low.player.position.x-175,low.player.position.z-(shorelineAt(175)-6))).toBeGreaterThan(3);
  await page.keyboard.press('Escape');await page.locator('[data-action=save]').click();await page.reload();await page.locator('[data-action=continue]').click();
  const initial=(await state(page)).player.position;await page.waitForTimeout(500);const settled=(await state(page)).player.position;
  expect(Math.hypot(initial.x-settled.x,initial.z-settled.z),'reload does not push the character out of a rock').toBeLessThan(.1);
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('coast-over-rock'));await page.waitForTimeout(500);
  const high=await state(page);expect(Math.abs(high.player.position.x-175)).toBeLessThan(.1);expect(Math.abs(high.player.position.z-(shorelineAt(175)-6))).toBeLessThan(.1);
});

test('coastal grounded save recovery accepts land and moves offshore positions to dry sand', () => {
  for (const x of [-294,-120,0,120,294]) {
    expect(safeCoastalPosition(x,50)).toEqual({x,z:50});
    expect(safeCoastalPosition(x,shorelineAt(x)+80).z).toBe(shorelineAt(x)-5);
  }
  const avoidRock=(x:number,z:number)=>Math.hypot(x-175,z-(shorelineAt(175)-6))>8;
  const recovered=safeCoastalPosition(175,shorelineAt(175)+24,avoidRock);
  expect(avoidRock(recovered.x,recovered.z)).toBe(true);
});

test('walk from the sect to the beach, wade safely, and orbit the camera with real input', async ({page}) => {
  test.setTimeout(65000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?test=1');await page.locator('[data-action=new-game]').click();
  const start=await state(page);
  await page.keyboard.down('KeyS');
  await expect.poll(()=>state(page).then(s=>s.player.position.z),{timeout:45000}).toBeGreaterThan(208);
  await page.waitForTimeout(900);await page.keyboard.up('KeyS');
  const wade=await state(page);
  expect(wade.player.position.z).toBeLessThanOrEqual(wade.coast.shoreline+13.05);
  expect(wade.coast.waterDepth).toBeLessThan(.8);expect(wade.health).toBe(start.health);
  expect(Math.abs(wade.player.position.y-wade.coast.ground)).toBeLessThan(.1);
  await page.mouse.move(640,350);await page.mouse.down({button:'right'});await page.mouse.move(1100,350,{steps:12});await page.mouse.up({button:'right'});
  await expect.poll(()=>state(page).then(s=>s.player.yaw)).not.toBe(start.player.yaw);
  await fs.mkdir('artifacts/qa',{recursive:true});await page.screenshot({path:'artifacts/qa/coast-real-wading.png'});
  await page.keyboard.press('KeyM');await expect(page.getByRole('dialog',{name:'山川舆图'})).toContainText('听潮海岸');
  await fs.writeFile('artifacts/qa/coast-traversal.json',JSON.stringify({start,wade,errors},null,2));expect(errors).toEqual([]);
});

test('offshore sword flight, saved reload, exhaustion return, and animated surf', async ({browser}) => {
  test.setTimeout(60000);
  const context=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:'artifacts/qa/coast-video',size:{width:1280,height:720}}});
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const samples:{label:string;state:ThreeGameDiagnostics}[]=[];
  await page.goto('/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('coast-flight'));
  await page.keyboard.press('KeyF');expect((await state(page)).flying).toBe(true);
  await page.keyboard.down('KeyD');await page.keyboard.down('Space');await page.waitForTimeout(1000);await page.keyboard.up('KeyD');await page.keyboard.up('Space');
  samples.push({label:'offshore-flight',state:await state(page)});expect(samples[0].state.player.position.y).toBeGreaterThan(5);
  await page.keyboard.press('Escape');await page.locator('[data-action=save]').click();await page.reload();await page.locator('[data-action=continue]').click();
  const restored=await state(page);expect(restored.flying).toBe(false);expect(restored.coast.ground).toBeGreaterThan(0);
  samples.push({label:'restored-on-sand',state:restored});
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('coast-exhausted'));
  await expect.poll(()=>state(page).then(s=>s.coast.returningToShore)).toBe(true);
  samples.push({label:'exhaustion-return',state:await state(page)});
  await expect.poll(()=>state(page).then(s=>s.flying),{timeout:15000}).toBe(false);
  const landed=await state(page);expect(landed.coast.ground).toBeGreaterThan(-.81);expect(landed.player.position.y).toBeGreaterThan(-.81);
  samples.push({label:'safe-shallow-landing',state:landed});
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('coast'));
  const before=PNG.sync.read(await page.locator('#game-canvas').screenshot());await page.waitForTimeout(1300);
  const after=PNG.sync.read(await page.locator('#game-canvas').screenshot());
  let changed=0,total=0;
  // Isolate the water strip; omit the hero and the HUD.
  for(let y=Math.floor(before.height*.39);y<before.height*.49;y++)for(let x=Math.floor(before.width*.67);x<before.width*.85;x++){
    const i=(y*before.width+x)*4;total++;if(Math.abs(before.data[i]-after.data[i])+Math.abs(before.data[i+1]-after.data[i+1])+Math.abs(before.data[i+2]-after.data[i+2])>18)changed++;
  }
  expect(changed/total).toBeGreaterThan(.015);
  await page.keyboard.down('KeyW');await page.waitForTimeout(850);await page.keyboard.up('KeyW');await page.screenshot({path:'artifacts/qa/coast-surf-motion.png'});
  const gpu=await page.evaluate(()=>{const gl=document.querySelector<HTMLCanvasElement>('#game-canvas')!.getContext('webgl2')!,ext=gl.getExtension('WEBGL_debug_renderer_info')!;return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);});
  await fs.writeFile('artifacts/qa/coast-motion.json',JSON.stringify({gpu,samples,surfChangedPixelRatio:changed/total,errors},null,2));expect(errors).toEqual([]);
  const video=page.video()!;await context.close();await video.saveAs('artifacts/qa/coast-motion.webm');
});

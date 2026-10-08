import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs/promises';
import {SAVE_KEY} from '../src/game/Save';
import {PNG} from 'pngjs';
const state=(p:Page)=>p.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
const setup=(p:Page,s:string)=>p.evaluate(n=>window.__THREE_GAME_TEST_HOOKS__!.setState(n),s);
async function frame(page:Page,name:string){
  const data=await page.locator('#game-canvas').screenshot({type:'jpeg',quality:90});
  await fs.mkdir('artifacts/qa/weather-frames',{recursive:true});await fs.writeFile(`artifacts/qa/weather-frames/${name}.jpg`,data);
}
async function endRange(page:Page,name:string,key:'Home'|'End'){const control=page.locator(`[data-weather=${name}]`);await expect(control).toBeVisible();await control.focus();await expect(control).toBeFocused();await page.keyboard.press(key);}
test.use({timezoneId:'Asia/Shanghai',trace:'off',video:'off'});

test('actual local wall clock updates across midnight and daytime while game is paused',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-10-07T15:59:50Z'));await page.goto('/?test=1');
  await expect(page.locator('[data-action=new-game]')).toBeVisible();
  await expect.poll(()=>state(page).then(s=>s.weather.hour)).toBeGreaterThan(23.99);
  expect((await state(page)).weather.day).toBeLessThan(.02);
  await page.locator('[data-action=new-game]').click();await page.keyboard.press('Escape');
  await page.clock.setFixedTime(new Date('2026-10-07T16:00:10Z'));
  await expect.poll(()=>state(page).then(s=>s.weather.hour)).toBeLessThan(.01);
  await page.clock.setFixedTime(new Date('2026-10-08T04:00:00Z'));
  await expect.poll(()=>state(page).then(s=>s.weather.day)).toBeGreaterThan(.95);
  expect((await state(page)).phase).toBe('paused');
});

test('weather panel controls time clouds rain and random weather with real input and independent persistence',async({page})=>{
  test.setTimeout(160000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?test=1');await page.locator('[data-action=new-game]').click();
  const saved=await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY);
  await page.keyboard.press('KeyP');await expect(page.locator('#weather-panel')).toBeVisible();
  await page.setViewportSize({width:1024,height:768});const box=await page.locator('#weather-panel').boundingBox();expect(box!.x).toBeGreaterThan(600);expect(box!.x+box!.width).toBeLessThanOrEqual(1024);expect(box!.y+box!.height).toBeLessThanOrEqual(768);
  const before=await state(page);await page.waitForTimeout(300);const frozen=await state(page);expect(frozen.elapsed).toBe(before.elapsed);expect(frozen.weather.weatherClock).toBeGreaterThan(before.weather.weatherClock);
  await page.mouse.move(520,320);await page.mouse.down({button:'right'});await page.mouse.move(610,340,{steps:5});await page.mouse.up({button:'right'});
  await expect.poll(()=>state(page).then(s=>s.player.yaw)).not.toBe(before.player.yaw);
  await expect.poll(()=>page.evaluate(()=>Boolean(document.activeElement?.closest('#weather-panel')))).toBe(true);
  await endRange(page,'hour','End');await expect.poll(()=>state(page).then(s=>s.weather.hour)).toBeGreaterThan(23.9);expect((await state(page)).weather.timeMode).toBe('manual');
  await endRange(page,'cloud-cover','Home');await expect.poll(()=>state(page).then(s=>s.weather.cloudCover)).toBe(0);
  await endRange(page,'rain','End');await expect.poll(()=>state(page).then(s=>s.weather.rain)).toBe(1);expect((await state(page)).weather.rainVisible).toBe(true);
  await page.locator('[data-weather=preset-rain]').click();await page.locator('[data-weather=random]').check();
  await expect.poll(()=>state(page).then(s=>s.weather.randomWeather)).toBe(true);const random=await state(page);expect(random.weather.randomWeather).toBe(true);expect(random.weather.nextChange).toBeGreaterThan(119);expect(random.weather.nextChange).toBeLessThanOrEqual(240);
  await page.evaluate(seconds=>window.__THREE_GAME_TEST_HOOKS__!.advanceWeather(seconds),random.weather.nextChange+.1);
  expect((await state(page)).weather.nextChange).toBeGreaterThan(119);expect((await state(page)).weather.hour).toBeGreaterThan(23.9);
  // A random value can round to the slider's existing zero, so first make a real change.
  await endRange(page,'rain','End');await expect.poll(()=>state(page).then(s=>s.weather.rain)).toBe(1);
  await endRange(page,'rain','Home');await expect.poll(()=>state(page).then(s=>s.weather.rain)).toBe(0);expect((await state(page)).weather.randomWeather).toBe(false);
  await frame(page,'panel-night');await page.keyboard.press('KeyP');await expect(page.locator('#weather-panel')).toBeHidden();
  const start=(await state(page)).player.position;await page.keyboard.down('KeyD');try{await expect.poll(()=>state(page).then(s=>Math.hypot(s.player.position.x-start.x,s.player.position.z-start.z))).toBeGreaterThan(.7);}finally{await page.keyboard.up('KeyD');}
  expect(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY)).toBe(saved);
  await page.reload();await expect(page.locator('[data-action=continue]')).toBeVisible();expect((await state(page)).weather.timeMode).toBe('manual');expect((await state(page)).weather.hour).toBeGreaterThan(23.9);
  await page.keyboard.press('KeyP');await page.locator('[data-weather=time-mode]').selectOption('real');await expect.poll(()=>state(page).then(s=>s.weather.timeMode)).toBe('real');
  const live=await state(page);expect(errors).toEqual([]);await fs.writeFile('artifacts/qa/weather-panel-input.json',JSON.stringify({before,frozen,random,live,errors},null,2));
});

test('rain follows walking and flight, stops below shop ceilings, and reuses resources',async({page})=>{
  test.setTimeout(160000);await page.goto('/?test=1');await setup(page,'weather-rain');const start=await state(page);
  await page.keyboard.down('KeyD');try{await expect.poll(()=>state(page).then(s=>Math.hypot(s.player.position.x-start.player.position.x,s.player.position.z-start.player.position.z))).toBeGreaterThan(1);}finally{await page.keyboard.up('KeyD');}
  const walk=await state(page);expect(walk.weather.rainOrigin.x).toBeCloseTo(walk.player.renderPosition.x,5);await frame(page,'rain-walk');
  await setup(page,'weather-flight-rain');await page.keyboard.down('Space');await page.waitForTimeout(350);await page.keyboard.up('Space');const flight=await state(page);expect(flight.flying).toBe(true);expect(flight.weather.rainOrigin.y).toBeCloseTo(flight.player.renderPosition.y,5);expect(flight.player.position.y).toBeGreaterThan(12);await frame(page,'rain-flight');
  await setup(page,'weather-town-rain');const roof=await state(page);expect(roof.weather.roofHeight).toBeGreaterThan(roof.player.position.y+3);
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(true));
  const wall=async()=>{const png=PNG.sync.read(await page.locator('#game-canvas').screenshot());return Buffer.concat(Array.from({length:100},(_,y)=>png.data.subarray(((y+240)*png.width+820)*4,((y+240)*png.width+980)*4)));};
  const first=await wall();await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.advanceWeather(2));const second=await wall();expect(second).toEqual(first);
  await frame(page,'rain-shop');
  for(let i=0;i<3;i++){await setup(page,'weather-rain');await page.waitForTimeout(90);}const warm=await state(page);
  for(let i=0;i<5;i++){await setup(page,i%2?'weather-rain':'weather-night');await page.waitForTimeout(90);}await setup(page,'weather-rain');await page.waitForTimeout(120);const end=await state(page);
  expect(end.renderer.geometries).toBe(warm.renderer.geometries);expect(end.renderer.textures).toBe(warm.renderer.textures);await fs.writeFile('artifacts/qa/weather-rain-input.json',JSON.stringify({walk,flight,roof,indoorPixelChanges:0,warm:warm.renderer,end:end.renderer},null,2));
});

test('shield and real attacks remain usable during rainy night',async({page})=>{
  await page.goto('/?test=1');await setup(page,'pulse-combat');const before=await state(page);await page.keyboard.press('KeyP');
  await endRange(page,'hour','Home');await page.locator('[data-weather=preset-rain]').click();await page.keyboard.press('KeyP');
  await page.keyboard.press('Digit3');await page.keyboard.press('KeyZ');await expect.poll(()=>state(page).then(s=>s.shield.active)).toBe(true);
  await page.keyboard.press('KeyT');await expect.poll(()=>state(page).then(s=>s.elemental.hits)).toBeGreaterThan(0);
  const hit=await state(page);expect(hit.weather.day).toBeLessThan(.02);expect(hit.weather.rainVisible).toBe(true);expect(hit.shield.active).toBe(true);expect(hit.enemies.some((e,i)=>e.health<before.enemies[i].health)).toBe(true);await frame(page,'night-combat');
  await fs.writeFile('artifacts/qa/weather-combat-input.json',JSON.stringify({before,hit},null,2));
});

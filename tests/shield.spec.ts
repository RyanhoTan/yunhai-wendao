import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs/promises';
const state=(page:Page)=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
const setup=(page:Page,name:string)=>page.evaluate(n=>window.__THREE_GAME_TEST_HOOKS__!.setState(n),name);
async function frame(page:Page,name:string){const data=await page.evaluate(()=>new Promise<string>(resolve=>requestAnimationFrame(()=>resolve(document.querySelector<HTMLCanvasElement>('#game-canvas')!.toDataURL('image/jpeg',.9)))));await fs.mkdir('artifacts/qa/shield-frames',{recursive:true});await fs.writeFile(`artifacts/qa/shield-frames/${name}.jpg`,Buffer.from(data.split(',')[1],'base64'));}
test.use({trace:'off',video:'off'});
test('constrained shop camera remains inside a rendered shield',async({page})=>{
  await page.goto('/?test=1');await page.locator('[data-action=new-game]').click();await setup(page,'shield-inside');await expect.poll(()=>state(page).then(s=>s.shield.cameraInside)).toBe(true);
  expect((await state(page)).shield.active).toBe(true);expect((await state(page)).shield.visible).toBe(true);await frame(page,'inside');
});
test('five shields use real selection and Z, keep cast element and follow walking and flight',async({page})=>{
  test.setTimeout(180_000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?test=1');await page.locator('[data-action=new-game]').click();const samples=[];
  const elements=['metal','wood','water','fire','earth'],colors=['#ffe4a3','#74dc8c','#64cfff','#ff624e','#c8a16b'];
  for(let i=0;i<5;i++){await setup(page,'shield-bare');await page.keyboard.press(`Digit${i+1}`);const before=await state(page);await page.keyboard.press('KeyZ');await expect.poll(()=>state(page).then(s=>s.shield.opacity)).toBeGreaterThan(.6);
    const cast=await state(page);expect(cast.shield.active).toBe(true);expect(cast.shield.element).toBe(elements[i]);expect(cast.shield.color).toBe(colors[i]);expect(cast.qi).toBeLessThan(before.qi-12);expect(cast.shield.capacity).toBe(42);expect(cast.shield.maxCapacity).toBe(42);
    await page.keyboard.press(`Digit${i===4?1:i+2}`);await page.keyboard.press('KeyZ');expect((await state(page)).shield.element).toBe(elements[i]);expect((await state(page)).shield.cooldown).toBeGreaterThan(8);samples.push(cast);
  }
  const initial=await state(page);await page.keyboard.down('KeyD');try{await expect.poll(()=>state(page).then(s=>s.player.position.x)).toBeGreaterThan(initial.player.position.x+.7);}finally{await page.keyboard.up('KeyD');}
  const walk=await state(page);expect(walk.shield.position.x).toBeCloseTo(walk.player.position.x,5);expect(walk.shield.position.y-walk.player.position.y).toBeCloseTo(1.5,5);await frame(page,'walk');
  await setup(page,'flight');await page.keyboard.press('Digit3');await page.keyboard.press('KeyZ');await page.keyboard.down('KeyW');await page.keyboard.down('Space');await page.waitForTimeout(350);await page.keyboard.up('Space');await page.keyboard.up('KeyW');const flight=await state(page);
  expect(flight.flying).toBe(true);expect(flight.shield.active).toBe(true);expect(flight.shield.position.z).toBeCloseTo(flight.player.position.z,5);expect(flight.shield.position.y-flight.player.position.y).toBeCloseTo(1.5,5);expect(flight.shield.capacity).toBe(60);await frame(page,'flight');expect(errors).toEqual([]);
  await fs.writeFile('artifacts/qa/shield-input.json',JSON.stringify({samples,walk,flight,errors},null,2));
});
test('real guardian strikes consume shield and overflow into health',async({page})=>{
  await page.goto('/?test=1');await page.locator('[data-action=new-game]').click();await setup(page,'shield-pressure');const before=await state(page);await page.keyboard.press('KeyZ');
  await expect.poll(()=>state(page).then(s=>s.shield.absorbed),{timeout:7000}).toBe(28);const first=await state(page);expect(first.health).toBe(before.health);expect(first.shield.capacity).toBe(14);await frame(page,'first-hit');
  await expect.poll(()=>state(page).then(s=>s.shield.hits),{timeout:7000}).toBe(2);const broken=await state(page);expect(broken.shield.absorbed).toBe(42);expect(broken.shield.active).toBe(false);expect(broken.health).toBe(before.health-14);expect(broken.shield.cooldown).toBeGreaterThan(0);await frame(page,'broken');
  await fs.writeFile('artifacts/qa/shield-damage.json',JSON.stringify({before,first,broken},null,2));
});
test('shield respects pause, low qi, expiry and retry, with stable shared resources',async({page})=>{
  await page.goto('/?test=1');await page.locator('[data-action=new-game]').click();await setup(page,'shield-low-qi');await page.keyboard.press('KeyZ');expect((await state(page)).shield.active).toBe(false);expect((await state(page)).shield.cooldown).toBe(0);
  await setup(page,'shield-bare');await page.keyboard.press('Escape');await page.keyboard.press('KeyZ');await page.locator('[data-action=resume]').click();expect((await state(page)).shield.active).toBe(false);
  await page.keyboard.press('KeyZ');await expect.poll(()=>state(page).then(s=>s.shield.active)).toBe(true);await page.keyboard.press('Escape');const paused=(await state(page)).shield;await page.waitForTimeout(300);expect((await state(page)).shield).toEqual(paused);await page.locator('[data-action=resume]').click();
  await expect.poll(()=>state(page).then(s=>s.shield.active),{timeout:9000}).toBe(false);await expect.poll(()=>state(page).then(s=>s.shield.visible)).toBe(false);
  await setup(page,'fail');await page.locator('[data-action=retry]').click();const reset=(await state(page)).shield;expect(reset.capacity).toBe(0);expect(reset.cooldown).toBe(0);expect(reset.visible).toBe(false);
  for(let i=0;i<4;i++){await setup(page,'shield-bare');await page.keyboard.press('KeyZ');await page.waitForTimeout(90);}await setup(page,'shield-bare');await page.waitForTimeout(150);const warm=await state(page);
  for(let i=0;i<4;i++){await setup(page,'shield-bare');await page.keyboard.press('KeyZ');await page.waitForTimeout(90);}await setup(page,'shield-bare');await page.waitForTimeout(150);const end=await state(page);
  expect(end.renderer.geometries).toBe(warm.renderer.geometries);expect(end.renderer.textures).toBe(warm.renderer.textures);await fs.writeFile('artifacts/qa/shield-lifecycle.json',JSON.stringify({paused,reset,warm:warm.renderer,end:end.renderer},null,2));
});

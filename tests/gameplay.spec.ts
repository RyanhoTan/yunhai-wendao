import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
const held = new WeakMap<Page,Set<string>>();
async function keys(page:Page, next:string[]) { const prev=held.get(page)??new Set<string>(); for(const key of prev)if(!next.includes(key))await page.keyboard.up(key);for(const key of next)if(!prev.has(key))await page.keyboard.down(key);held.set(page,new Set(next)); }
const state=(page:Page)=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
async function travel(page:Page,x:number,z:number,tolerance=1.6) {
  let previous=Infinity,stuck=0;
  for(let step=0;step<650;step++) {
    const s=await state(page); if(s.failed)throw new Error('Died while travelling');
    if(s.health<65&&s.pills>0)await page.keyboard.press('KeyH');
    if(!s.flying){const nearby=s.enemies.filter(e=>!e.dead&&e.id!==14).some(e=>Math.hypot(e.position.x-s.player.position.x,e.position.z-s.player.position.z)<12);if(nearby){await page.keyboard.press('KeyR');if(step%15===0)await page.keyboard.press('KeyQ');}}
    const dx=x-s.player.position.x,dz=z-s.player.position.z,d=Math.hypot(dx,dz);
    if(d<tolerance){await keys(page,[]);await page.waitForTimeout(180);return;}
    if(Math.abs(previous-d)<.08)stuck++;else stuck=0;previous=d;
    const right=Math.cos(s.player.yaw)*dx-Math.sin(s.player.yaw)*dz,forward=-Math.sin(s.player.yaw)*dx-Math.cos(s.player.yaw)*dz;
    const next=[];if(Math.abs(right)>.9)next.push(right>0?'KeyD':'KeyA');if(Math.abs(forward)>.9)next.push(forward>0?'KeyW':'KeyS');
    if(stuck>14){await keys(page,['KeyD']);await page.waitForTimeout(550);stuck=0;}else await keys(page,next);
    await page.waitForTimeout(140);
  }
  await keys(page,[]);throw new Error(`Navigation failed at ${x},${z}: ${JSON.stringify((await state(page)).player)}`);
}
async function fight(page:Page,id:number) {
  for(let n=0;n<200;n++){
    const s=await state(page),e=s.enemies.find(e=>e.id===id)!;if(e.dead){await keys(page,[]);return;}if(s.failed)throw new Error(`Died fighting enemy ${id}`);
    if(s.health<65 && s.pills>0)await page.keyboard.press('KeyH');
    const dx=e.position.x-s.player.position.x,dz=e.position.z-s.player.position.z,d=Math.hypot(dx,dz);
    if(d>3.0){const right=Math.cos(s.player.yaw)*dx-Math.sin(s.player.yaw)*dz,forward=-Math.sin(s.player.yaw)*dx-Math.cos(s.player.yaw)*dz;const next=[];if(Math.abs(right)>.6)next.push(right>0?'KeyD':'KeyA');if(Math.abs(forward)>.6)next.push(forward>0?'KeyW':'KeyS');await keys(page,next);}else await keys(page,[]);
    await page.mouse.click(640,375);if(n%12===0)await page.keyboard.press('KeyQ');await page.waitForTimeout(130);
  }
  throw new Error(`Enemy ${id} survived real-input attacks`);
}

test('complete first chapter through real controls and reload the saved result',async({page},info)=>{
  test.setTimeout(420000); const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?test=1');await page.locator('[data-action=new-game]').click();const start=await state(page);
  console.log('chapter: entered valley');
  await travel(page,0,34);await expect.poll(()=>page.locator('[data-field=interact-text]').innerText()).toContain('沈清尘');
  await page.keyboard.press('KeyE');await page.locator('[data-action=dialog-next]').click();
  for(const [x,z] of [[-15,12],[13,4],[-9,-13]]){if(z<0)await travel(page,20,-9,2);await travel(page,x,z);await page.keyboard.press('KeyE');await page.waitForTimeout(160);}
  await expect.poll(()=>state(page).then(s=>s.herbs)).toBe(3);
  console.log('chapter: herbs gathered');
  await travel(page,-19,-9,2);await travel(page,-19,25,2);await travel(page,0,34);await page.keyboard.press('KeyE');await page.locator('[data-action=dialog-next]').click();await page.keyboard.press('KeyB');
  await expect.poll(()=>state(page).then(s=>s.realm)).toBe(1);
  console.log('chapter: sword flight unlocked');
  await page.keyboard.press('KeyI');await page.locator('[data-action=brew]').click();await expect.poll(()=>state(page).then(s=>s.herbs)).toBe(0);await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'乾坤袋'})).not.toBeVisible();
  for(const route of [{x:-110,z:-70,ids:[4,5,6]},{x:105,z:-135,ids:[7,8,9]},{x:0,z:-245,ids:[10,11,12]}]){
    await page.keyboard.press('KeyF');await expect.poll(()=>state(page).then(s=>s.flying)).toBe(true);
    await travel(page,route.x,route.z,2);await page.keyboard.press('KeyF');await page.waitForTimeout(600);
    for(const id of route.ids)await fight(page,id);
    await travel(page,route.x,route.z,2);await page.keyboard.press('KeyE');await page.waitForTimeout(200);
    console.log(`chapter: shrine ${route.x},${route.z} active ${(await state(page)).shrines}`);
    if(route.x===-110){await page.keyboard.press('KeyF');await travel(page,-145,-105,2);await page.keyboard.press('KeyF');await page.waitForTimeout(600);await page.keyboard.press('KeyE');await page.waitForTimeout(200);}
  }
  await expect.poll(()=>state(page).then(s=>s.shrines.every(Boolean))).toBe(true);
  await travel(page,0,-264);await fight(page,14);await page.keyboard.press('KeyB');
  await expect.poll(()=>state(page).then(s=>s.complete)).toBe(true);
  console.log('chapter: guardian defeated, foundation established');
  await page.screenshot({path:'artifacts/qa/real-input-completion.png'});
  const end=await state(page);await fs.mkdir('artifacts/qa',{recursive:true});await fs.writeFile('artifacts/qa/bot-metrics.json',JSON.stringify({seed:42,framesAdvanced:end.frame-start.frame,distanceFromStart:Math.hypot(end.player.position.x-start.player.position.x,end.player.position.z-start.player.position.z),kills:end.score,quest:end.quest,realm:end.realm,health:end.health,errors},null,2));
  await page.reload();await page.locator('[data-action=continue]').click();await expect.poll(()=>state(page).then(s=>s.realm)).toBe(2);await expect.poll(()=>state(page).then(s=>s.complete)).toBe(true);
  await page.keyboard.press('KeyJ');await expect(page.locator('.journal-memories')).toContainText('遗落灵匣');await expect(page.locator('.journal-memories')).toContainText('筑基成功');
  expect(errors).toEqual([]);await info.attach('completion-metrics',{path:'artifacts/qa/bot-metrics.json',contentType:'application/json'});
});

test('combat pressure, real failure and retry preserve progress',async({page})=>{
  test.setTimeout(60000);await page.goto('/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('combat'));
  await expect.poll(()=>state(page).then(s=>s.health),{timeout:20000}).toBeLessThan(100);
  await expect.poll(()=>state(page).then(s=>s.failed),{timeout:40000}).toBe(true);
  await page.locator('[data-action=retry]').click();await expect.poll(()=>state(page).then(s=>s.phase)).toBe('playing');expect((await state(page)).health).toBe(100);expect((await state(page)).quest).toBe(1);
  await page.keyboard.down('KeyW');await page.waitForTimeout(500);await page.keyboard.up('KeyW');expect((await state(page)).player.position.z).toBeLessThan(49);
});

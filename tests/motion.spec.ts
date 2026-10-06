import {expect,test,type Page} from '@playwright/test';
import fs from 'node:fs/promises';

test.use({video:{mode:'on',size:{width:1280,height:720}}});
const state=(page:Page)=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
test('unpaused locomotion, contact, spell, dodge and sword-flight motion',async({page})=>{
  const samples:{label:string;state:ThreeGameDiagnostics}[]=[];
  const capture=async(label:string)=>{samples.push({label,state:await state(page)});await page.screenshot({path:`artifacts/qa/motion-${label}.png`});};
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await fs.mkdir('artifacts/qa',{recursive:true});
  await page.goto('/?test=1');await page.locator('[data-action=new-game]').click();
  await expect.poll(()=>state(page).then(s=>s.audio.state)).toBe('running');
  await expect.poll(()=>state(page).then(s=>s.audio.ambience)).toBe(true);
  await page.keyboard.down('KeyW');
  const frameSamples=await page.evaluate(()=>new Promise<{frameMs:number;fps:number;legRange:number;distance:number}>(resolve=>{
    const start=performance.now(),initial=window.__THREE_GAME_DIAGNOSTICS__!.player.position.z,legs:number[]=[];let frames=0;
    const tick=()=>{frames++;legs.push(window.__THREE_GAME_DIAGNOSTICS__!.animation.leftLeg);const duration=performance.now()-start;if(duration<1800)requestAnimationFrame(tick);else resolve({frameMs:duration/frames,fps:frames*1000/duration,legRange:Math.max(...legs)-Math.min(...legs),distance:initial-window.__THREE_GAME_DIAGNOSTICS__!.player.position.z});};requestAnimationFrame(tick);
  }));
  await capture('run');await page.keyboard.up('KeyW');await page.waitForTimeout(350);await capture('idle');
  expect(frameSamples.legRange).toBeGreaterThan(.5);expect(frameSamples.distance).toBeGreaterThan(5);
  await page.keyboard.press('Escape');await page.locator('[data-action=settings]').click();await page.locator('[data-action=reduced-motion]').click();await page.locator('.panel-close').click();
  await page.keyboard.down('KeyD');const leg1=(await state(page)).animation.leftLeg;await page.waitForTimeout(200);const leg2=(await state(page)).animation.leftLeg;await page.keyboard.up('KeyD');expect(Math.abs(leg1-leg2)).toBeGreaterThan(.05);
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('combat'));
  await page.keyboard.down('KeyW');await page.waitForTimeout(420);await page.keyboard.up('KeyW');
  const before=(await state(page)).enemies[0].health;
  await page.keyboard.press('KeyR');
  const contactSamples=[];
  for(let i=0;i<8;i++){await page.waitForTimeout(40);contactSamples.push((await state(page)).animation);if(i===3)await capture('sword-contact');}
  expect((await state(page)).enemies[0].health).toBeLessThan(before);
  const contacts=contactSamples.filter(s=>s.attackTime>=.12&&s.attackTime<=.24);expect(contacts.length).toBeGreaterThan(0);expect(contacts.every(s=>s.swordTip.z<0)).toBe(true);
  await page.keyboard.press('KeyQ');await page.waitForTimeout(120);await capture('spell');
  await page.keyboard.down('KeyD');await page.keyboard.press('Shift');await page.waitForTimeout(70);
  const dodge1=(await state(page)).animation;expect(dodge1.motion).toBe('crouchSlash');
  await page.waitForTimeout(70);const dodge2=(await state(page)).animation;expect(dodge2.motionTime).toBeGreaterThan(dodge1.motionTime);
  await capture('dodge');await page.keyboard.up('KeyD');
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('flight'));await page.keyboard.press('KeyF');await page.waitForTimeout(650);await capture('landed');
  await page.keyboard.press('KeyF');await page.keyboard.down('KeyW');await page.keyboard.down('Space');await page.keyboard.down('Shift');await page.waitForTimeout(900);await capture('flight');await page.keyboard.up('Shift');await page.keyboard.up('Space');await page.keyboard.up('KeyW');
  expect((await state(page)).flying).toBe(true);expect(Math.abs((await state(page)).animation.flightSupportGap)).toBeLessThan(.01);await page.keyboard.press('KeyF');await page.waitForTimeout(900);await capture('flight-recovery');expect((await state(page)).flying).toBe(false);
  await page.keyboard.press('Escape');await expect(page.locator('[data-action=resume]')).toBeVisible();expect((await state(page)).audio.ambience).toBe(false);
  const gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas')!.getContext('webgl2')!,ext=gl.getExtension('WEBGL_debug_renderer_info')!;return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;});
  await fs.writeFile('artifacts/qa/motion-metrics.json',JSON.stringify({gpu,performanceValid:!/swiftshader|software|llvmpipe/i.test(gpu),frameSamples,contactSamples,samples,errors},null,2));expect(errors).toEqual([]);
  const video=page.video()!;await page.context().close();await video.saveAs('artifacts/qa/hero-motion.webm');
});

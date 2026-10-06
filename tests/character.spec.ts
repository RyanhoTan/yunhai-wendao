import {expect,test} from '@playwright/test';

test('character assets finish before state acknowledgement and render both sides',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route('**/assets/character/body.glb',async route=>{await new Promise(resolve=>setTimeout(resolve,300));await route.continue();});
  await page.goto('/?test=1');
  await page.evaluate(async()=>{await window.__THREE_GAME_TEST_HOOKS__!.setState('character-front');await window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(true);await window.__THREE_GAME_TEST_HOOKS__!.setReducedMotion(true);});
  const animation=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.animation);
  expect(animation.bones).toBe(30);expect(animation.clips).toEqual(expect.arrayContaining(['idle','walk','run','slash','float','land']));
  expect(animation.motion).toBe('idle');await expect(page.locator('.character-loading')).toHaveCount(0);
  await page.screenshot({path:'artifacts/qa/character-front.png'});
  await page.evaluate(async()=>{await window.__THREE_GAME_TEST_HOOKS__!.setState('character-back');await window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(true);await window.__THREE_GAME_TEST_HOOKS__!.setReducedMotion(true);});
  await page.screenshot({path:'artifacts/qa/character-back.png'});
  await page.evaluate(async()=>{await window.__THREE_GAME_TEST_HOOKS__!.setState('character-portrait');await window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(true);await window.__THREE_GAME_TEST_HOOKS__!.setReducedMotion(true);});
  await page.screenshot({path:'artifacts/qa/character-portrait.png'});expect(errors).toEqual([]);
});

test('pause freezes the actual skeleton and resume restores imported gait',async({page})=>{
  await page.goto('/?test=1');await page.locator('[data-action=new-game]').click();
  await page.keyboard.down('KeyW');await page.waitForTimeout(350);await page.keyboard.press('Escape');await page.keyboard.up('KeyW');
  const pose=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.animation);
  expect(pose.motion).toBe('run');await page.waitForTimeout(250);
  expect(await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.animation)).toEqual(pose);
  await page.locator('[data-action=resume]').click();await page.keyboard.down('KeyW');await page.waitForTimeout(200);
  const resumed=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.animation);await page.keyboard.up('KeyW');
  expect(resumed.leftLeg).not.toBe(pose.leftLeg);expect(resumed.motion).toBe('run');
});

test('missing character assets expose an actionable retry',async({page})=>{
  await page.route('**/assets/character/body.glb',route=>route.fulfill({status:503,body:'unavailable'}));
  await page.goto('/');await expect(page.getByRole('button',{name:'重新加载',exact:true})).toBeVisible();
  await expect(page.locator('[data-action=new-game]')).toHaveCount(0);await page.unroute('**/assets/character/body.glb');
  await page.getByRole('button',{name:'重新加载',exact:true}).click();await expect(page.locator('[data-action=new-game]')).toBeVisible();
});

test('sword flight supports the boot and real damage removes the flying sword on death',async({page})=>{
  await page.goto('/?test=1');await page.locator('[data-action=new-game]').click();
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('flight'));
  await expect.poll(()=>page.evaluate(()=>Math.abs(window.__THREE_GAME_DIAGNOSTICS__!.animation.flightSupportGap))).toBeLessThan(.01);
  expect(await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.animation.flyingSwordVisible)).toBe(true);
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('flight-danger'));
  await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.failed)).toBe(true);
  const death=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
  expect(death.flying).toBe(false);expect(death.animation.flyingSwordVisible).toBe(false);expect(death.animation.motion).toBe('idle');
});

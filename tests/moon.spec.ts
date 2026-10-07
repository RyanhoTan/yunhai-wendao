import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

test.use({trace:'off',video:'off'});
test('source moon image loads before playable scene and survives real cloud controls',async({page})=>{
  test.setTimeout(160000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  let held=false,requests=0,release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  await page.route('**/assets/moon/moon-color-4k.jpg',async route=>{requests++;held=true;await gate;await route.continue();});
  const response=page.waitForResponse(r=>r.url().endsWith('/assets/moon/moon-color-4k.jpg'));
  await page.goto('/?test=1',{waitUntil:'domcontentloaded'});await expect.poll(()=>held).toBe(true);
  await expect(page.locator('.character-loading')).toBeVisible();await expect(page.locator('[data-action=new-game]')).toHaveCount(0);
  // Freeze the title animation during the loading check on the memory-constrained workstation.
  const frozen=page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(true));
  release();const loaded=await response;expect(loaded.status()).toBe(200);await frozen;
  const bytes=await loaded.body(),original=await fs.readFile('public/assets/moon/moon-color-4k.jpg');expect(bytes.equals(original)).toBe(true);
  await page.locator('[data-action=new-game]').focus();await page.keyboard.press('Enter');
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('weather-night'));
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(true));
  const state=()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);const before=await state();
  await page.locator('[data-action=weather]').focus();await page.keyboard.press('Enter');await expect(page.locator('#weather-panel')).toBeVisible();
  await page.locator('[data-weather=cloud-cover]').focus();await page.keyboard.press('End');await expect(page.locator('[data-weather=cloud-cover-value]')).toHaveText('100%');
  await page.keyboard.press('Home');await expect(page.locator('[data-weather=cloud-cover-value]')).toHaveText('0%');
  // Publish a current snapshot after real slider input without depending on the background RAF cadence.
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.advanceWeather(0));
  expect((await state()).weather.cloudCover).toBe(0);
  await page.keyboard.press('KeyP');await expect(page.locator('#weather-panel')).toBeHidden();
  const after=await state();expect(after.renderer.textures).toBe(before.renderer.textures);expect(requests).toBe(1);expect(errors).toEqual([]);
  await fs.writeFile('artifacts/qa/emotive-moon-input.json',JSON.stringify({status:loaded.status(),imageBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),requests,before,after,errors},null,2));
});

test('failed moon image reports a retry and reload starts normally',async({page})=>{
  test.setTimeout(160000);
  let requests=0;await page.route('**/assets/moon/moon-color-4k.jpg',async route=>{if(++requests===1)await route.abort();else await route.continue();});
  await page.goto('/?test=1');await expect(page.getByText('游戏资源未能加载，请重试。')).toBeVisible();
  await expect(page.locator('[data-action=new-game]')).toHaveCount(0);
  await page.getByRole('button',{name:'重新加载',exact:true}).click();
  await page.waitForFunction(()=>Boolean(window.__THREE_GAME_TEST_HOOKS__));
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(true));
  await expect(page.locator('[data-action=new-game]')).toBeVisible({timeout:30000});
  expect(requests).toBe(2);
  await fs.writeFile('artifacts/qa/emotive-moon-retry.json',JSON.stringify({forcedFirstRequestFailure:true,requests,reloadRecovered:true},null,2));
});

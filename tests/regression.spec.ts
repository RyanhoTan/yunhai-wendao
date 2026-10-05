import {expect,test} from '@playwright/test';
test('early crafting reserves quest herbs, and damaged saves fall back to title',async({page})=>{
  await page.goto('/?test=1');
  await page.evaluate(()=>localStorage.setItem('yunhai-wendao-save-v1',JSON.stringify({version:1,position:{x:0,y:2,z:34},health:100,qi:100,xp:0,realm:0,quest:0,herbs:3,pills:2,stones:0,kills:0,shrines:[false,false,false],collected:[0,1,2],defeated:[],treasures:[]})));
  await page.reload();await page.locator('[data-action=continue]').click();await page.keyboard.press('KeyI');await page.locator('[data-action=brew]').click();expect(await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.herbs)).toBe(3);
  await page.keyboard.press('Escape');await expect(page.locator('.ink-panel')).not.toBeVisible();await page.keyboard.press('KeyE');await page.locator('[data-action=dialog-next]').click();await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.quest)).toBe(1);
  await page.keyboard.press('KeyI');await page.locator('[data-action=brew]').click();expect(await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.herbs)).toBe(3);
  await page.reload();await page.evaluate(()=>localStorage.setItem('yunhai-wendao-save-v1','{damaged'));
  await page.reload();await expect(page.locator('[data-action=continue]')).not.toBeVisible();await expect(page.locator('[data-action=new-game]')).toBeVisible();
});

test('production hides test helpers unless explicitly requested',async({page})=>{await page.goto('/');expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__)).toBeUndefined();expect(await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__)).toBeUndefined();});

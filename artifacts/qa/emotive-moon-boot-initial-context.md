# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: moon.spec.ts >> source moon image loads before playable scene and survives real cloud and camera controls
- Location: tests/moon.spec.ts:6:1

# Error details

```
Test timeout of 80000ms exceeded.
```

```
Error: locator.click: Test timeout of 80000ms exceeded.
Call log:
  - waiting for locator('[data-action=new-game]')
    - locator resolved to <button data-action="new-game" class="ink-button primary">…</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic "云海问道游戏场景" [ref=e3]
  - generic:
    - generic:
      - generic:
        - generic:
          - generic:
            - text: 云
            - text: 岚
          - generic: 一剑入山海 · 一念问长生
        - heading "云海 问道" [level=1]:
          - generic: 云海
          - generic: 问道
        - generic: 云岚初境
        - paragraph:
          - text: 山门之外，万里云生。
          - text: 执剑行走山海，寻灵脉，证筑基。
        - generic:
          - button "踏入仙途" [ref=e4] [cursor=pointer]:
            - generic [ref=e5]: 踏入仙途
            - generic [ref=e6]: ◇
          - button "声音与画质 →" [ref=e7] [cursor=pointer]
        - generic:
          - generic: 自由探索
          - generic: ◇
          - generic: 御剑凌空
          - generic: ◇
          - generic: 即时战斗
          - generic: ◇
          - generic: 境界突破
      - generic:
        - generic: 云岚山脉
        - generic: 原创单机修仙 · 第一章
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import fs from 'node:fs/promises';
  3  | import {createHash} from 'node:crypto';
  4  | 
  5  | test.use({trace:'off',video:'off'});
  6  | test('source moon image loads before playable scene and survives real cloud and camera controls',async({page})=>{
  7  |   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  8  |   let held=false,requests=0,release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  9  |   await page.route('**/assets/moon/moon-color-4k.jpg',async route=>{requests++;held=true;await gate;await route.continue();});
  10 |   const response=page.waitForResponse(r=>r.url().endsWith('/assets/moon/moon-color-4k.jpg'));
  11 |   await page.goto('/?test=1',{waitUntil:'domcontentloaded'});await expect.poll(()=>held).toBe(true);
  12 |   await expect(page.locator('.character-loading')).toBeVisible();await expect(page.locator('[data-action=new-game]')).toHaveCount(0);
  13 |   release();const loaded=await response;expect(loaded.status()).toBe(200);
  14 |   const bytes=await loaded.body(),original=await fs.readFile('public/assets/moon/moon-color-4k.jpg');expect(bytes.equals(original)).toBe(true);
> 15 |   await page.locator('[data-action=new-game]').click();
     |                                                ^ Error: locator.click: Test timeout of 80000ms exceeded.
  16 |   await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('weather-night'));
  17 |   const state=()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);const before=await state();
  18 |   await page.keyboard.press('KeyP');await expect(page.locator('#weather-panel')).toBeVisible();
  19 |   await page.locator('[data-weather=cloud-cover]').focus();await page.keyboard.press('End');await expect.poll(()=>state().then(s=>s.weather.cloudCover)).toBe(1);
  20 |   await page.keyboard.press('Home');await expect.poll(()=>state().then(s=>s.weather.cloudCover)).toBe(0);
  21 |   await page.mouse.move(530,320);await page.mouse.down({button:'right'});await page.mouse.move(610,330,{steps:4});await page.mouse.up({button:'right'});
  22 |   await expect.poll(()=>state().then(s=>s.player.yaw)).not.toBe(before.player.yaw);
  23 |   await page.keyboard.press('KeyP');await expect(page.locator('#weather-panel')).toBeHidden();
  24 |   const after=await state();expect(after.renderer.textures).toBe(before.renderer.textures);expect(requests).toBe(1);expect(errors).toEqual([]);
  25 |   await fs.writeFile('artifacts/qa/emotive-moon-input.json',JSON.stringify({status:loaded.status(),imageBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),requests,before,after,errors},null,2));
  26 | });
  27 | 
  28 | test('failed moon image reports a retry and reload starts normally',async({page})=>{
  29 |   let requests=0;await page.route('**/assets/moon/moon-color-4k.jpg',async route=>{if(++requests===1)await route.abort();else await route.continue();});
  30 |   await page.goto('/?test=1');await expect(page.getByText('游戏资源未能加载，请重试。')).toBeVisible();
  31 |   await expect(page.locator('[data-action=new-game]')).toHaveCount(0);
  32 |   await page.getByRole('button',{name:'重新加载',exact:true}).click();await expect(page.locator('[data-action=new-game]')).toBeVisible();
  33 |   expect(requests).toBe(2);
  34 |   await fs.writeFile('artifacts/qa/emotive-moon-retry.json',JSON.stringify({forcedFirstRequestFailure:true,requests,reloadRecovered:true},null,2));
  35 | });
  36 | 
```
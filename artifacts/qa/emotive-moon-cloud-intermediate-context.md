# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: moon.spec.ts >> source moon image loads before playable scene and survives real cloud and camera controls
- Location: tests/moon.spec.ts:6:1

# Error details

```
Error: Timeout 10000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - main [ref=e2]:
    - generic "云海问道游戏场景" [ref=e3]
  - generic:
    - generic:
      - region "角色状态":
        - generic:
          - img
          - generic: 气
        - generic:
          - generic:
            - strong: 练气初期
            - generic: 云岚弟子
          - generic:
            - generic: 气血
            - generic: 100 / 100
          - generic:
            - generic: 灵气
            - generic: 100 / 100
          - generic:
            - generic: 修为 0 / 60
      - region "当前目标":
        - generic: 第一章 · 云岚初境
        - heading "采药历练" [level=2]
        - paragraph: 采集青灵草 0/3 · 靠近后按 E
        - button "修行札记 J" [ref=e4] [cursor=pointer]:
          - text: 修行札记
          - generic [ref=e5]: J
      - region "地图与菜单":
        - generic:
          - generic: 北
          - generic "当前位置小地图"
          - button "打开云岚山地图，M 键" [ref=e6] [cursor=pointer]
        - generic: 听潮海岸 · 沙滩
        - generic:
          - img
          - generic: "0"
          - generic: 灵石
        - navigation:
          - button "天气调试，P 键" [ref=e7] [cursor=pointer]: ☁
          - button "地图，M 键" [ref=e8] [cursor=pointer]:
            - img [ref=e9]
          - button "札记，J 键" [ref=e11] [cursor=pointer]:
            - img [ref=e12]
          - button "背包，I 键" [ref=e14] [cursor=pointer]:
            - img [ref=e15]
          - button "暂停，Esc 键" [ref=e17] [cursor=pointer]:
            - img [ref=e18]
      - generic "五行选择":
        - button "1 金" [pressed] [ref=e20] [cursor=pointer]:
          - generic [ref=e21]: "1"
          - text: 金
        - button "2 木" [ref=e22] [cursor=pointer]:
          - generic [ref=e23]: "2"
          - text: 木
        - button "3 水" [ref=e24] [cursor=pointer]:
          - generic [ref=e25]: "3"
          - text: 水
        - button "4 火" [ref=e26] [cursor=pointer]:
          - generic [ref=e27]: "4"
          - text: 火
        - button "5 土" [ref=e28] [cursor=pointer]:
          - generic [ref=e29]: "5"
          - text: 土
        - generic: 金 · 飞剑
        - button "Z 护盾" [ref=e30] [cursor=pointer]:
          - generic [ref=e31]: Z
          - generic [ref=e32]: 护盾
      - generic "动作快捷键":
        - generic:
          - generic:
            - img
          - generic:
            - generic: 剑斩
            - generic: 左键
        - generic:
          - generic:
            - img
          - generic:
            - generic: 御雷
            - generic: Q
        - generic:
          - generic:
            - img
          - generic:
            - generic: 五行诀
            - generic: T
        - generic:
          - generic:
            - img
          - generic:
            - generic: 归墟
            - generic: G
        - generic:
          - generic:
            - img
          - generic:
            - generic: 灵压
            - generic: V
        - generic:
          - generic:
            - img
          - generic:
            - generic: 闪避
            - generic: Shift
        - generic:
          - generic:
            - img
            - generic: 未习得
          - generic:
            - generic: 御剑
            - generic: F
        - generic:
          - generic:
            - img
          - generic:
            - generic: 突破
            - generic: B
        - generic:
          - generic:
            - img
          - generic:
            - generic: 服丹
            - generic: H
          - generic: "2"
      - generic: W A S D 移动 · 右键拖动视角 · 滚轮远近
  - dialog "观天调候" [ref=e33]:
    - banner [ref=e34]:
      - generic [ref=e35]:
        - generic [ref=e36]: 开发预览 · 云岚天象
        - heading "观天调候" [level=2] [ref=e37]
      - button "关闭天气面板，P 或 Esc 键" [ref=e38] [cursor=pointer]: ×
    - generic [ref=e39]:
      - generic [ref=e40]:
        - generic [ref=e41]:
          - generic [ref=e42]: 世界时刻
          - strong [ref=e43]: 03:00
        - generic [ref=e44]:
          - generic [ref=e45]: 阴
          - generic [ref=e46]: 手动预览
      - paragraph [ref=e47]: 本机时区 Asia/Shanghai
      - generic [ref=e48]:
        - generic [ref=e49]: 昼夜来源
        - combobox "昼夜来源" [ref=e50] [cursor=pointer]:
          - option "现实同步"
          - option "手动预览" [selected]
      - generic [ref=e51]:
        - generic [ref=e52]:
          - text: 昼夜时刻
          - status [ref=e53]: 03:00
        - slider "昼夜时刻" [ref=e54] [cursor=pointer]: "3"
        - generic [ref=e55]:
          - generic [ref=e56]: 子夜
          - generic [ref=e57]: 正午
          - generic [ref=e58]: 子夜
      - paragraph [ref=e59]: 正在预览所选时刻；选择现实同步可恢复。
      - generic [ref=e60]:
        - generic [ref=e61]:
          - text: 云量
          - status [ref=e62]: 100%
        - slider "云量" [active] [ref=e63] [cursor=pointer]: "1"
      - generic [ref=e64]:
        - generic [ref=e65]:
          - text: 雨量
          - status [ref=e66]: 0%
        - slider "雨量" [ref=e67] [cursor=pointer]: "0"
      - group "天气快捷预设" [ref=e68]:
        - button "晴空" [ref=e69] [cursor=pointer]
        - button "阴云" [pressed] [ref=e70] [cursor=pointer]
        - button "落雨" [ref=e71] [cursor=pointer]
      - generic [ref=e72] [cursor=pointer]:
        - generic [ref=e73]:
          - strong [ref=e74]: 随机天气
          - generic [ref=e75]: 每 2–4 分钟自然过渡
        - checkbox "随机天气" [ref=e76]
      - paragraph [ref=e77]: 手动调节云量、雨量或预设会关闭随机天气。
      - paragraph [ref=e78]: 随机变化由游戏生成；现实同步只同步昼夜。
    - contentinfo [ref=e79]:
      - generic [ref=e80]: 调候时暂停战斗
      - generic [ref=e81]:
        - generic [ref=e82]: P
        - text: /
        - generic [ref=e83]: Esc
        - text: 收起
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import fs from 'node:fs/promises';
  3  | import {createHash} from 'node:crypto';
  4  | 
  5  | test.use({trace:'off',video:'off'});
  6  | test('source moon image loads before playable scene and survives real cloud and camera controls',async({page})=>{
  7  |   test.setTimeout(160000);
  8  |   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  9  |   let held=false,requests=0,release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  10 |   await page.route('**/assets/moon/moon-color-4k.jpg',async route=>{requests++;held=true;await gate;await route.continue();});
  11 |   const response=page.waitForResponse(r=>r.url().endsWith('/assets/moon/moon-color-4k.jpg'));
  12 |   await page.goto('/?test=1',{waitUntil:'domcontentloaded'});await expect.poll(()=>held).toBe(true);
  13 |   await expect(page.locator('.character-loading')).toBeVisible();await expect(page.locator('[data-action=new-game]')).toHaveCount(0);
  14 |   // Freeze the title animation during the loading check on the memory-constrained workstation.
  15 |   const frozen=page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(true));
  16 |   release();const loaded=await response;expect(loaded.status()).toBe(200);await frozen;
  17 |   const bytes=await loaded.body(),original=await fs.readFile('public/assets/moon/moon-color-4k.jpg');expect(bytes.equals(original)).toBe(true);
  18 |   await page.locator('[data-action=new-game]').focus();await page.keyboard.press('Enter');
  19 |   await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('weather-night'));
  20 |   await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(false));
  21 |   const state=()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);const before=await state();
  22 |   await page.keyboard.press('KeyP');await expect(page.locator('#weather-panel')).toBeVisible();
> 23 |   await page.locator('[data-weather=cloud-cover]').focus();await page.keyboard.press('End');await expect.poll(()=>state().then(s=>s.weather.cloudCover)).toBe(1);
     |                                                                                                                                                          ^ Error: Timeout 10000ms exceeded while waiting on the predicate
  24 |   await page.keyboard.press('Home');await expect.poll(()=>state().then(s=>s.weather.cloudCover)).toBe(0);
  25 |   await page.mouse.move(530,320);await page.mouse.down({button:'right'});await page.mouse.move(610,330,{steps:4});await page.mouse.up({button:'right'});
  26 |   await expect.poll(()=>state().then(s=>s.player.yaw)).not.toBe(before.player.yaw);
  27 |   await page.keyboard.press('KeyP');await expect(page.locator('#weather-panel')).toBeHidden();
  28 |   const after=await state();expect(after.renderer.textures).toBe(before.renderer.textures);expect(requests).toBe(1);expect(errors).toEqual([]);
  29 |   await fs.writeFile('artifacts/qa/emotive-moon-input.json',JSON.stringify({status:loaded.status(),imageBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),requests,before,after,errors},null,2));
  30 | });
  31 | 
  32 | test('failed moon image reports a retry and reload starts normally',async({page})=>{
  33 |   test.setTimeout(160000);
  34 |   let requests=0;await page.route('**/assets/moon/moon-color-4k.jpg',async route=>{if(++requests===1)await route.abort();else await route.continue();});
  35 |   await page.goto('/?test=1');await expect(page.getByText('游戏资源未能加载，请重试。')).toBeVisible();
  36 |   await expect(page.locator('[data-action=new-game]')).toHaveCount(0);
  37 |   await page.getByRole('button',{name:'重新加载',exact:true}).click();
  38 |   await page.waitForFunction(()=>Boolean(window.__THREE_GAME_TEST_HOOKS__));
  39 |   await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(true));
  40 |   await expect(page.locator('[data-action=new-game]')).toBeVisible({timeout:30000});
  41 |   expect(requests).toBe(2);
  42 |   await fs.writeFile('artifacts/qa/emotive-moon-retry.json',JSON.stringify({forcedFirstRequestFailure:true,requests,reloadRecovered:true},null,2));
  43 | });
  44 | 
```
import { expect, test } from '@playwright/test';

test('map and minimap paint on their first visible frame and after reopening', async ({page}) => {
  await page.goto('/?test=1');
  for (const name of ['flight', 'map', 'active-play', 'map']) {
    const pixels = await page.evaluate(async state => {
      const hooks = window.__THREE_GAME_TEST_HOOKS__!;
      await hooks.setPausedForScreenshot(false);
      await hooks.setState(state);
      await hooks.setPausedForScreenshot(true);
      return Array.from(document.querySelectorAll<HTMLCanvasElement>('.minimap, .world-map'))
        .filter(canvas => canvas.getBoundingClientRect().width > 0)
        .map(canvas => {
          const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
          let opaque = 0, bright = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 240) opaque++;
            if (data[i] > 130 && data[i + 1] > 130 && data[i + 2] > 110 && data[i + 3] > 240) bright++;
          }
          return {name: canvas.className, opaque: opaque / (data.length / 4), bright};
        });
    }, name);
    expect(pixels.length).toBe(name === 'map' ? 2 : 1);
    for (const canvas of pixels) {
      expect(canvas.opaque, `${name}: ${canvas.name} must contain painted terrain`).toBeGreaterThan(canvas.name === 'world-map' ? .99 : .7);
      expect(canvas.bright, `${name}: ${canvas.name} must contain visible landmarks/player`).toBeGreaterThan(10);
    }
  }
  await page.screenshot({path:'artifacts/qa/map-first-paint.png'});
});

test('title settings preserve a prior save and dialogue cannot lose its callback', async ({page}) => {
  await page.goto('/?test=1');
  await page.locator('[data-action=new-game]').click();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await page.keyboard.up('KeyW');
  await page.reload();
  const saved = await page.evaluate(()=>localStorage.getItem('yunhai-wendao-save-v1'));
  await page.locator('[data-action=settings]').click();
  for(const key of ['KeyI','KeyM','KeyJ']) await page.keyboard.press(key);
  await expect(page.getByRole('dialog',{name:'静心调息'})).toBeVisible();
  await page.reload();
  expect(await page.evaluate(()=>localStorage.getItem('yunhai-wendao-save-v1'))).toBe(saved);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(()=>document.activeElement?.tagName)).toBe('BUTTON');
  await page.locator('[data-action=continue]').click();
  for(let n=0;n<100;n++){
    const s=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
    if(s.interaction.includes('沈清尘'))break;
    await page.keyboard.down(s.player.position.z>32?'KeyW':'KeyS');await page.waitForTimeout(180);await page.keyboard.up('KeyW');await page.keyboard.up('KeyS');
  }
  await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.interaction)).toContain('沈清尘');
  await page.keyboard.up('KeyW');await page.keyboard.press('KeyE');
  await expect(page.locator('[data-action=dialog-next]')).toBeVisible();
  await page.keyboard.press('KeyM');
  await expect(page.locator('[data-action=dialog-next]')).toBeVisible();
  await page.locator('[data-action=dialog-next]').click();
  await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.quest)).toBe(1);
});

test('desktop start, camera, pause, panels and settings remain usable', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?test=1');
  await expect(page.getByRole('button', { name: '踏入仙途', exact: true })).toBeVisible();
  await page.locator('[data-action=settings]').click();
  await expect(page.getByRole('dialog', { name: '静心调息' })).toBeVisible();
  await page.locator('.panel-close').click();
  await expect(page.getByRole('button', { name: '踏入仙途', exact: true })).toBeVisible();
  await page.locator('[data-action=new-game]').click();
  const before = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.player.position.z);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await page.keyboard.up('KeyW');
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.player.position.z)).toBeLessThan(before - 0.7);
  await page.mouse.move(700,350); await page.mouse.down({button:'right'}); await page.mouse.move(790,375,{steps:5}); await page.mouse.up({button:'right'});
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.player.yaw)).not.toBe(0);
  await page.mouse.wheel(0,200);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'继续行走',exact:true})).toBeVisible();
  const frozen = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.elapsed);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.elapsed)).toBe(frozen);
  await page.locator('[data-action=resume]').click();
  for (const [key,name] of [['KeyM','山川舆图'],['KeyJ','修行札记'],['KeyI','乾坤袋']] as const) {
    await page.keyboard.press(key); await expect(page.getByRole('dialog',{name})).toBeVisible();
    await page.screenshot({path:`artifacts/qa/${name}.png`}); await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name})).not.toBeVisible();
  }
  await page.keyboard.press('Escape'); await page.locator('[data-action=settings]').click();
  await page.locator('[data-action=mute]').click();
  await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.audio.muted)).toBe(true);
  await page.locator('[data-action="quality:low"]').click();
  await expect(page.locator('[data-action="quality:low"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('[data-action=reduced-motion]').click();
  await expect(page.locator('#game-ui')).toHaveClass(/reduced-motion/);
  await page.locator('.panel-close').click();
  await page.setViewportSize({width:1024,height:768});
  await page.keyboard.press('KeyM');
  const bounds = await page.locator('.ink-panel').boundingBox();
  expect(bounds!.x).toBeGreaterThan(0); expect(bounds!.y).toBeGreaterThan(0); expect(bounds!.x+bounds!.width).toBeLessThan(1025); expect(bounds!.y+bounds!.height).toBeLessThan(769);
  const mapBounds = await page.locator('.world-map').boundingBox();
  const bodyBounds = await page.locator('.map-panel .panel-body').boundingBox();
  expect(mapBounds!.y + mapBounds!.height).toBeLessThanOrEqual(bodyBounds!.y + bodyBounds!.height);
  expect(await page.locator('.map-panel .panel-body').evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
  await page.screenshot({path:'artifacts/qa/laptop-map.png'});
  await info.attach('runtime-errors',{body:JSON.stringify(errors),contentType:'application/json'});
  expect(errors).toEqual([]);
});

import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// The local Wayland/GBM driver crashes when recreating a second WebGL popup.
// X11 uses the same hardware GPU and keeps this multi-tab check reliable.
test.use({ launchOptions: { args: ['--ozone-platform=x11'] } });

test('title and pause links return to the existing game with its state intact', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [], gameRequests: string[] = [], directory = 'artifacts/mountain-model-20261010/navigation';
  await mkdir(directory, { recursive: true });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => gameRequests.push(request.url()));
  await page.goto('/?test');
  await expect(page.locator('[data-action=new-game]')).toBeVisible();
  const link = page.getByRole('link', { name: '山体模型' });
  await expect(link).toHaveAttribute('target', '_blank'); await expect(link).toHaveAttribute('rel', 'noopener');
  await expect(link).toBeInViewport();
  await page.screenshot({ path: `${directory}/title.png` });
  const takeState = () => page.evaluate(() => {
    const d = window.__THREE_GAME_DIAGNOSTICS__!;
    return { position: d.player.position, phase: d.phase, quest: d.quest, realm: d.realm, xp: d.xp,
      health: d.health, qi: d.qi, herbs: d.herbs, pills: d.pills, flying: d.flying,
      storage: Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)])) };
  });
  const titleState = await takeState();
  const titlePopupPromise = page.waitForEvent('popup'); await link.click(); const titlePopup = await titlePopupPromise;
  titlePopup.on('pageerror', error => errors.push(error.message));
  await expect(titlePopup.locator('#triangle-count')).toHaveText(/^[\d,]+$/);
  await expect(titlePopup).toHaveURL(/mountain-model\.html\?from=game$/);
  const titleClose = titlePopup.waitForEvent('close'); await titlePopup.getByRole('link', { name: '← 返回游戏' }).click(); await titleClose;
  await page.bringToFront(); expect(await takeState()).toEqual(titleState);

  await page.locator('[data-action=new-game]').click();
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.phase)).toBe('playing');
  const beforeWalk = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.player.position);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(420); await page.keyboard.up('KeyW');
  const afterWalk = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.player.position);
  expect(Math.hypot(afterWalk.x - beforeWalk.x, afterWalk.z - beforeWalk.z)).toBeGreaterThan(.1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '静心养息' })).toBeVisible();
  await page.locator('[data-action=save]').click();
  await page.screenshot({ path: `${directory}/paused.png` });
  const pausedState = await takeState();
  const popupPromise = page.waitForEvent('popup'); await page.getByRole('link', { name: '山体模型' }).click(); const popup = await popupPromise;
  popup.on('pageerror', error => errors.push(error.message));
  await expect(popup.locator('#triangle-count')).toHaveText(/^[\d,]+$/);
  await popup.getByRole('button', { name: '俯视路线' }).click();
  await popup.getByLabel('线框查看', { exact: true }).check();
  await popup.screenshot({ path: `${directory}/preview.png` });
  const closed = popup.waitForEvent('close'); await popup.getByRole('link', { name: '← 返回游戏' }).click(); await closed;
  await page.bringToFront(); const returnedState = await takeState(); expect(returnedState).toEqual(pausedState);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.phase)).toBe('playing');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(300); await page.keyboard.up('KeyW');
  const resumed = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.player.position);
  expect(Math.hypot(resumed.x - returnedState.position.x, resumed.z - returnedState.position.z)).toBeGreaterThan(.1);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${directory}/returned.png` });
  expect(gameRequests.filter(url => /mountainModel-[^/]+\.(?:js|css)|\/src\/models\/SectMountainModel/.test(url))).toEqual([]);
  expect(errors).toEqual([]);
  const gpu = await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>('#game-canvas')!.getContext('webgl2')!;
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable';
  });
  await writeFile(`${directory}/evidence.json`, JSON.stringify({ titleState, pausedState, returnedState, beforeWalk, afterWalk, resumed,
    originalPagePreserved: !page.isClosed(), previewPopupsClosed: titlePopup.isClosed() && popup.isClosed(), gpu, errors }, null, 2) + '\n');
});

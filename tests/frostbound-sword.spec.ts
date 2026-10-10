import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const OUT = 'artifacts/frostbound-sword-20261010/game';
test.use({ video: { mode: 'on', size: { width: 1280, height: 720 } } });

test('textured sword loads before state acknowledgement', async ({ page }) => {
  await page.route('**/assets/weapons/frostbound-arcblade.glb', async route => {
    await new Promise(resolve => setTimeout(resolve, 300)); await route.continue();
  });
  await page.goto('/?test=1');
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('character-front'));
  expect(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.animation.weapon)).toBe('frostbound-arcblade');

});

test('missing sword assets offer a retry before the game starts', async ({ page }) => {
  await page.route('**/assets/weapons/frostbound-arcblade.glb', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.goto('/'); await expect(page.getByRole('button', { name: '重新加载', exact: true })).toBeVisible();
  await expect(page.locator('[data-action=new-game]')).toHaveCount(0);
  await page.unroute('**/assets/weapons/frostbound-arcblade.glb');
  await page.getByRole('button', { name: '重新加载', exact: true }).click();
  await expect(page.locator('[data-action=new-game]')).toBeVisible();
});

for (const id of ['jade-blossom', 'shadowbound-wanderer']) {
  test(`${id} holds Frostbound through real attacks, sword flight and landing`, async ({ page }) => {
    await mkdir(OUT, { recursive: true });
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(value => localStorage.setItem('yunhai-wendao-character-v1', value), id);
    await page.goto('/?test=1'); await page.locator('[data-action=new-game]').click();
    const state = () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!);
    expect((await state()).animation.weapon).toBe('frostbound-arcblade');
    await page.keyboard.down('KeyW'); await page.waitForTimeout(700); await page.keyboard.up('KeyW');
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('combat'));
    await page.keyboard.down('KeyW'); await page.waitForTimeout(420); await page.keyboard.up('KeyW');
    const health = (await state()).enemies[0].health; await page.mouse.click(790, 390);
    await expect.poll(() => state().then(s => s.enemies[0].health)).toBeLessThan(health);
    await page.screenshot({ path: `${OUT}/${id}-attack.png` });
    expect((await state()).animation.weapon).toBe('frostbound-arcblade');
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('flight'));
    await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
    expect((await state()).animation.flyingSwordVisible).toBe(true);
    expect(Math.abs((await state()).animation.flightSupportGap)).toBeLessThan(.01);
    await page.screenshot({ path: `${OUT}/${id}-flight-input.png` });
    await page.keyboard.press('KeyF'); await expect.poll(() => state().then(s => s.flying)).toBe(false);
    expect((await state()).animation.weapon).toBe('frostbound-arcblade');
    expect((await state()).animation.flyingSwordVisible).toBe(false);
    expect(errors).toEqual([]);
    await writeFile(`${OUT}/${id}-input.json`, JSON.stringify({ state: await state(), errors }, null, 2));
    const video = page.video()!; await page.context().close(); await video.saveAs(`${OUT}/${id}-input.webm`);
  });
}

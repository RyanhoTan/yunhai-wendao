import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const OUT = 'artifacts/character-switch-20261009';
const CHOICE = 'yunhai-wendao-character-v1';
test.use({ video: { mode: 'on', size: { width: 1280, height: 720 } } });
const diagnostics = (page: Page) => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!);
const chooser = (page: Page) => page.getByRole('dialog', { name: '角色选择', exact: true });
const select = async (page: Page, id: string) => {
  await chooser(page).locator(`[data-action="character:${id}"]`).click();
  await expect.poll(() => diagnostics(page).then(s => s.animation.model)).toBe(id);
};
const progress = (s: ThreeGameDiagnostics) => ({
  position: s.player.position, renderPosition: s.player.renderPosition, yaw: s.player.yaw,
  health: s.health, qi: s.qi, xp: s.xp, realm: s.realm, quest: s.quest, herbs: s.herbs,
  pills: s.pills, kills: s.kills, shrines: s.shrines, flying: s.flying,
  elapsed: s.elapsed, combat: s.combat, elemental: s.elemental,
  enemies: s.enemies.map(e => ({ id: e.id, health: e.health, dead: e.dead, position: e.position })),
});

test('title selection persists the appearance and invalid choices recover safely', async ({ page }) => {
  await page.goto('/?test=1');
  const titleEntry = page.locator('.title-character-choice');
  await titleEntry.click();
  await expect(chooser(page)).toBeVisible();
  await expect(chooser(page).locator('[data-action="character:jade-blossom"]')).toBeDisabled();
  await select(page, 'shadowbound-wanderer');
  await expect(chooser(page).locator('[data-character=shadowbound-wanderer]')).toHaveClass(/is-current/);
  const pose = (await diagnostics(page)).animation;
  expect(pose.sourceClip).toBe('rest-pose'); expect(pose.motionTime).toBe(0);
  expect(pose.clips).not.toContain('idle'); expect(pose.clips).not.toContain('float');
  await page.keyboard.press('Escape');
  await expect(titleEntry).toBeFocused();
  expect((await diagnostics(page)).phase).toBe('title');
  await page.reload(); await expect(page.locator('[data-action=new-game]')).toBeVisible();
  expect((await diagnostics(page)).animation.model).toBe('shadowbound-wanderer');
  await page.evaluate(key => localStorage.setItem(key, 'untrusted-unknown-character'), CHOICE);
  await page.reload(); await expect(page.locator('[data-action=new-game]')).toBeVisible();
  expect((await diagnostics(page)).animation.model).toBe('jade-blossom');
});

test('switching only changes appearance while preserving a real saved journey and renderer resources', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yunhai-wendao-save-v1', JSON.stringify({
    version: 1, position: { x: 116, y: 3.4, z: 65.5 }, health: 81, qi: 62, xp: 47,
    realm: 1, quest: 3, herbs: 4, pills: 6, stones: 38, kills: 2,
    shrines: [true, false, false], collected: [0, 1, 2, 3], defeated: [0, 1], treasures: [0],
  })));
  await page.goto('/?test=1'); await page.locator('[data-action=continue]').click();
  await page.locator('.character-hud-button').click();
  const before = await diagnostics(page), saved = await page.evaluate(() => localStorage.getItem('yunhai-wendao-save-v1'));
  await select(page, 'shadowbound-wanderer');
  expect(progress(await diagnostics(page))).toEqual(progress(before));
  expect(await page.evaluate(() => localStorage.getItem('yunhai-wendao-save-v1'))).toBe(saved);
  await select(page, 'jade-blossom'); await page.waitForTimeout(120);
  const warm = (await diagnostics(page)).renderer;
  for (let i = 0; i < 10; i++) await select(page, i % 2 === 0 ? 'shadowbound-wanderer' : 'jade-blossom');
  await page.waitForTimeout(120); const after = await diagnostics(page);
  expect(progress(after)).toEqual(progress(before));
  expect(after.renderer.geometries).toBe(warm.geometries); expect(after.renderer.textures).toBe(warm.textures);
  await writeFile(`${OUT}/switch-preservation.json`, JSON.stringify({ before, after, warm, unchangedSave: true }, null, 2));
  await page.keyboard.press('Escape');
  await expect(page.locator('.character-hud-button')).toBeFocused();
});

test('the character panel is usable at desktop, laptop and narrow viewports', async ({ page }) => {
  await page.goto('/?test=1');
  await expect(page.locator('[data-action=new-game]')).toBeVisible();
  for (const [name, width, height] of [['desktop', 1280, 720], ['laptop', 1024, 768], ['narrow', 390, 844]] as const) {
    await page.setViewportSize({ width, height }); await page.keyboard.press('KeyK');
    const dialog = chooser(page); await expect(dialog).toBeVisible();
    await expect(dialog.locator('.panel-close')).toBeFocused();
    const bounds = await dialog.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
    await expect.poll(() => dialog.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    for (let i = 0; i < 7; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement?.closest('.characters-panel'))).toBe(true); }
    await page.screenshot({ path: `${OUT}/panel-${name}.png` });
    await select(page, name === 'laptop' ? 'jade-blossom' : 'shadowbound-wanderer');
    await expect(dialog.locator('.panel-close')).toBeInViewport();
    if (name === 'narrow') await page.screenshot({ path: `${OUT}/panel-narrow-selected.png` });
    await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  }
});

test('the new appearance retains native attacks, wall blocking and flight with its original static pose', async ({ page }) => {
  test.setTimeout(100_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const samples: { label: string; state: ThreeGameDiagnostics }[] = [];
  const capture = async (label: string) => { samples.push({ label, state: await diagnostics(page) }); await page.screenshot({ path: `${OUT}/native-${label}.png` }); };
  await page.goto('/?test=1'); await expect(page.locator('[data-action=new-game]')).toBeVisible();
  await page.keyboard.press('KeyK'); await select(page, 'shadowbound-wanderer');
  await page.keyboard.press('Escape'); await page.locator('[data-action=new-game]').click();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(700); await capture('run'); await page.keyboard.up('KeyW');
  expect(samples[0].state.animation.sourceClip).toBe('Running');
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('combat'));
  await page.keyboard.down('KeyW'); await page.waitForTimeout(420); await page.keyboard.up('KeyW');
  const health = (await diagnostics(page)).enemies[0].health; await page.keyboard.press('KeyR');
  await expect.poll(() => diagnostics(page).then(s => s.enemies[0].health)).toBeLessThan(health); await capture('attack');
  expect(samples.at(-1)!.state.animation.sourceClip).toBe('Triple_Combo_Attack');
  await page.waitForTimeout(450); await page.keyboard.press('Shift'); await page.waitForTimeout(100); await capture('dash');
  expect(samples.at(-1)!.state.animation.sourceClip).toBe('Jump_Over_Obstacle_2');
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('town-shop'));
  // Follow the current camera axes towards the west shop's actual solid rear wall.
  let held: string[] = [];
  for (let i = 0; i < 32; i++) {
    const p = (await diagnostics(page)).player, dx = 108 - p.position.x, dz = 65.5 - p.position.z;
    const right = Math.cos(p.yaw) * dx - Math.sin(p.yaw) * dz, forward = -Math.sin(p.yaw) * dx - Math.cos(p.yaw) * dz;
    const next: string[] = []; if (Math.abs(right) > .3) next.push(right > 0 ? 'KeyD' : 'KeyA'); if (Math.abs(forward) > .3) next.push(forward > 0 ? 'KeyW' : 'KeyS');
    for (const key of held) if (!next.includes(key)) await page.keyboard.up(key); for (const key of next) if (!held.includes(key)) await page.keyboard.down(key);
    held = next; await page.waitForTimeout(80);
  }
  for (const key of held) await page.keyboard.up(key);
  await capture('wall'); const blocked = samples.at(-1)!.state.player.position;
  expect(blocked.x).toBeGreaterThan(111.9); expect(blocked.x).toBeLessThan(112.5);
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('flight'));
  await page.keyboard.press('KeyK'); const flightBefore = await diagnostics(page);
  await select(page, 'jade-blossom'); expect(progress(await diagnostics(page))).toEqual(progress(flightBefore));
  await select(page, 'shadowbound-wanderer'); expect(progress(await diagnostics(page))).toEqual(progress(flightBefore));
  await page.keyboard.press('KeyK'); await expect(chooser(page)).not.toBeVisible();
  await expect.poll(() => diagnostics(page).then(s => s.phase)).toBe('playing');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(650); await page.keyboard.up('KeyW');
  await capture('flight'); const flight = samples.at(-1)!.state;
  expect(flight.flying).toBe(true); expect(flight.animation.sourceClip).toBe('rest-pose'); expect(flight.animation.motionTime).toBe(0);
  expect(Math.abs(flight.animation.flightSupportGap)).toBeLessThan(.01);
  expect(flight.player.position.z).toBeLessThan(flightBefore.player.position.z - 3);
  await page.keyboard.press('KeyF'); await page.waitForTimeout(600); await capture('landed');
  expect(samples.at(-1)!.state.flying).toBe(false); expect(errors).toEqual([]);
  await writeFile(`${OUT}/native-input.json`, JSON.stringify({ samples, errors }, null, 2));
  const video=page.video()!;await page.context().close();await video.saveAs(`${OUT}/native-motion.webm`);
});

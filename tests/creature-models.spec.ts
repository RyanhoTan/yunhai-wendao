import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';

const root = 'artifacts/creature-models-20261008';
test.use({ video: { mode: 'on', size: { width: 1280, height: 720 } } });
const state = async (page: import('@playwright/test').Page) => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!);

for (const species of ['wolf', 'beast'] as const) test(`${species} model animates, blocks real movement, takes melee hits, dies and stays defeated after reload`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?test=1');
  await page.evaluate(name => window.__THREE_GAME_TEST_HOOKS__!.setState(name), `${species}-contact`);
  const before = await state(page), id = before.enemies.find(e => !e.dead)!.id;
  expect(before.enemies[id].species).toBe(species); expect(before.enemies[id].model!.clips).toHaveLength(3);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(850); await page.keyboard.up('KeyW'); await page.waitForTimeout(200);
  const contact = await state(page); expect(contact.enemies[id].bodyClearance).toBeGreaterThanOrEqual(-1e-6);
  expect(contact.combat.bodyBlocks).toBeGreaterThan(0);
  await page.screenshot({ path: `${root}/${species}-contact.png` });
  await page.mouse.click(640, 375); await expect.poll(() => state(page).then(s => s.enemies[id].health)).toBe(27);
  await expect(page.locator('[data-field=enemy-name]')).toHaveText(species === 'wolf' ? '苍狼妖兽' : '赤脊兽');
  await page.screenshot({ path: `${root}/${species}-hit.png` });
  await page.waitForTimeout(650); expect((await state(page)).combat.swordHits).toBe(1);
  await page.keyboard.press('KeyR'); await expect.poll(() => state(page).then(s => s.enemies[id].dead)).toBe(true);
  await page.waitForTimeout(450); await page.keyboard.down('KeyW'); await page.waitForTimeout(1000); await page.keyboard.up('KeyW');
  const after = await state(page); expect(after.player.position.z).toBeLessThan(before.enemies[id].position.z - 1);
  await page.reload(); await page.locator('[data-action=continue]').click();
  expect((await state(page)).enemies[id].dead).toBe(true);

  // Normal AI drives the actual source walk/attack clips in an unpaused scene.
  await page.evaluate(name => window.__THREE_GAME_TEST_HOOKS__!.setState(name), `${species}-chase`);
  await expect.poll(() => state(page).then(s => s.enemies[id].model!.motion)).toBe('walk');
  const walked = await state(page); await page.waitForTimeout(180);
  expect((await state(page)).enemies[id].model!.motionTime).not.toBe(walked.enemies[id].model!.motionTime);
  await page.screenshot({ path: `${root}/${species}-walk.png` });
  await page.evaluate(name => window.__THREE_GAME_TEST_HOOKS__!.setState(name), `${species}-attack`);
  await page.keyboard.down('KeyW');
  const attackSamples = await page.evaluate(id => new Promise<{ health: number; motionTime: number; windup: number; motion: string }[]>(resolve => {
    const samples: { health: number; motionTime: number; windup: number; motion: string }[] = [], start = performance.now();
    const tick = () => { const s = window.__THREE_GAME_DIAGNOSTICS__!, e = s.enemies[id]; samples.push({ health: s.health, motionTime: e.model!.motionTime, windup: e.windup, motion: e.model!.motion }); if (performance.now() - start < 1300) requestAnimationFrame(tick); else resolve(samples); }; requestAnimationFrame(tick);
  }), id);
  await page.keyboard.up('KeyW');
  const damage = attackSamples.findIndex(s => s.health < 130); expect(damage).toBeGreaterThan(0);
  const contactPose = attackSamples[damage]; expect(contactPose.motion).toBe('attack');
  expect(contactPose.motionTime).toBeGreaterThan(species === 'wolf' ? .68 : .54);
  expect(contactPose.motionTime).toBeLessThan(species === 'wolf' ? .9 : .8);
  expect(attackSamples.slice(damage).some(s => s.motion === 'attack' && s.motionTime > contactPose.motionTime)).toBe(true);
  await page.screenshot({ path: `${root}/${species}-attack-recovery.png` });
  // Default combat encounter contains both new species and the original foxes.
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('boss'));
  expect((await state(page)).enemies.filter(e => e.model?.loaded).length).toBe(6);
  expect(errors).toEqual([]);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(`${root}/${species}-input.json`, JSON.stringify({ before, contact, walked, after, attackSamples, errors }, null, 2));
  const video = page.video()!; await page.context().close(); await video.saveAs(`${root}/${species}-motion.webm`);
});

test('creature loading failure displays a retry and never starts invisible enemies', async ({ page }) => {
  await page.route('**/assets/creatures/beast.glb', route => route.abort());
  await page.goto('/'); await expect(page.getByText('游戏资源未能加载，请重试。')).toBeVisible();
  expect(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__)).toBeUndefined();
  await page.unroute('**/assets/creatures/beast.glb'); await page.getByRole('button', { name: '重新加载' }).click();
  await expect(page.locator('[data-action=new-game]')).toBeVisible();
});

import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import { creatureContact, swordCanHit } from '../src/systems/CreatureInteraction';

const state = (page: Page) => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!);
const setup = async (page: Page, name = 'creature-contact') => {
  await page.goto('/?test=1');
  await page.evaluate(name => window.__THREE_GAME_TEST_HOOKS__!.setState(name), name);
};
const target = (s: ThreeGameDiagnostics) => s.enemies.find(e => !e.dead)!;
test.use({ video: { mode: 'on', size: { width: 1280, height: 720 } } });

test('body proxies rotate, separate exact overlaps and permit flight above them; sword checks range and arc', () => {
  const origin = { x: 0, y: 0, z: 0 };
  expect(creatureContact({ x: 0, y: 0, z: -1.6 }, origin, 0, 'spirit')!.clearance).toBeLessThan(0);
  expect(creatureContact({ x: -1.6, y: 0, z: 0 }, origin, Math.PI / 2, 'spirit')!.clearance).toBeLessThan(0);
  const centre = creatureContact(origin, origin, 0, 'spirit')!;
  expect(Number.isFinite(centre.nx)).toBe(true);
  expect(Math.hypot(centre.nx, centre.nz)).toBeCloseTo(1);
  expect(creatureContact({ x: 0, y: 2, z: 0 }, origin, 0, 'spirit')).toBeNull();
  expect(creatureContact({ x: 0, y: 4, z: 0 }, origin, 0, 'guardian')!.clearance).toBeLessThan(0);
  expect(swordCanHit(origin, 0, { x: 0, y: 0, z: -3 }, 'spirit')).toBe(true);
  expect(swordCanHit(origin, 0, { x: 0, y: 0, z: 3 }, 'spirit')).toBe(false);
  expect(swordCanHit(origin, 0, { x: 0, y: 0, z: -3.9 }, 'spirit')).toBe(false);
  expect(swordCanHit(origin, 0, { x: 0, y: 5, z: -1 }, 'spirit')).toBe(false);
});

test('real walking and dash stop at the fox, sideways movement goes around, attacks damage once and death clears the body', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await setup(page);
  const before = await state(page), enemy = target(before);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1100); await page.keyboard.up('KeyW');
  await page.waitForTimeout(200);
  const stopped = await state(page);
  expect(stopped.player.position.z).toBeGreaterThan(enemy.position.z + 1.3);
  expect(target(stopped).bodyClearance).toBeGreaterThanOrEqual(-1e-6);
  expect(stopped.combat.bodyBlocks).toBeGreaterThan(0);
  await page.keyboard.down('KeyW'); await page.keyboard.press('Shift'); await page.waitForTimeout(350); await page.keyboard.up('KeyW');
  const dashed = await state(page);
  expect(dashed.player.position.z).toBeGreaterThan(enemy.position.z + 1.3);
  expect(target(dashed).bodyClearance).toBeGreaterThanOrEqual(-1e-6);
  await page.screenshot({ path: 'artifacts/creature-interaction-20261008/fox-contact.png' });
  // Strafe completely around the body and cross its original centre line.
  await page.keyboard.down('KeyD'); await page.waitForTimeout(450); await page.keyboard.up('KeyD'); await page.waitForTimeout(180);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(750); await page.keyboard.up('KeyW');
  expect((await state(page)).player.position.z).toBeLessThan(enemy.position.z - 1);

  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('creature-contact'));
  await page.keyboard.down('KeyW'); await page.waitForTimeout(650); await page.keyboard.up('KeyW'); await page.waitForTimeout(180);
  const hp = target(await state(page)).health;
  await page.mouse.click(640, 375);
  // Spam during the cooldown: this must remain a single 38-point contact.
  await page.keyboard.press('KeyR'); await page.waitForTimeout(70); await page.keyboard.press('KeyR');
  await expect.poll(() => state(page).then(s => target(s).health)).toBe(hp - 38);
  await page.screenshot({ path: 'artifacts/creature-interaction-20261008/fox-hit.png' });
  await page.waitForTimeout(230);
  const hit = await state(page);
  expect(hit.combat.swordHits).toBe(1);
  expect(target(hit).health).toBe(hp - 38);
  await expect(page.locator('[data-field=enemy-fill]')).toHaveAttribute('style', /41\.538/);
  await page.waitForTimeout(200); await page.keyboard.press('KeyR');
  await expect.poll(() => state(page).then(s => s.enemies[0].dead)).toBe(true);
  const dead = await state(page);
  expect(dead.combat.swordHits).toBe(2); expect(dead.enemies[0].health).toBe(0);
  await page.waitForTimeout(350);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(700); await page.keyboard.up('KeyW');
  expect((await state(page)).player.position.z).toBeLessThan(enemy.position.z - 1);
  expect(errors).toEqual([]);
  await fs.mkdir('artifacts/creature-interaction-20261008', { recursive: true });
  await fs.writeFile('artifacts/creature-interaction-20261008/input-metrics.json', JSON.stringify({ before, stopped, dashed, hit, dead, after: await state(page), errors }, null, 2));
  const video = page.video()!; await page.context().close();
  await video.saveAs('artifacts/creature-interaction-20261008/walk-attack.webm');
});

test('stone guardian blocks while sealed, has a hittable boundary when unsealed, flight clears fox and out-of-range attacks miss', async ({ page }) => {
  await setup(page, 'guardian-sealed');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1000); await page.keyboard.up('KeyW'); await page.waitForTimeout(200);
  const sealed = await state(page); expect(target(sealed).bodyClearance).toBeGreaterThanOrEqual(-1e-6);
  expect(sealed.combat.bodyBlocks).toBeGreaterThan(0);
  await page.keyboard.press('KeyR'); await page.waitForTimeout(600); expect(target(await state(page)).health).toBe(500);
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('guardian-contact'));
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1000); await page.keyboard.up('KeyW'); await page.waitForTimeout(200);
  await page.keyboard.press('KeyR'); await expect.poll(() => state(page).then(s => target(s).health)).toBe(462);
  await page.screenshot({ path: 'artifacts/creature-interaction-20261008/guardian-hit.png' });
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('creature-flight'));
  const e = target(await state(page));
  await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await page.keyboard.up('KeyW');
  expect((await state(page)).player.position.z).toBeLessThan(e.position.z - 2);
  expect((await state(page)).combat.bodyBlocks).toBe(0);
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('creature-contact'));
  await page.keyboard.press('KeyR'); await page.waitForTimeout(600);
  expect(target(await state(page)).health).toBe(65); expect((await state(page)).combat.swordHits).toBe(0);
});

test('normal enemy pursuit and turning keep bodies separate without moving an idle player', async ({ page }) => {
  await setup(page, 'combat');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(800); await page.keyboard.up('KeyW');
  await page.waitForTimeout(350);
  const stopped = await state(page);
  const samples = await page.evaluate(() => new Promise<ThreeGameDiagnostics[]>(resolve => {
    const samples: ThreeGameDiagnostics[] = [], start = performance.now();
    const tick = () => { samples.push(window.__THREE_GAME_DIAGNOSTICS__!); if (performance.now() - start < 1000) requestAnimationFrame(tick); else resolve(samples); };
    requestAnimationFrame(tick);
  }));
  expect(samples.length).toBeGreaterThan(10);
  for (const s of samples) {
    expect(s.enemies[0].bodyClearance).toBeGreaterThanOrEqual(-1e-6);
    expect(Math.hypot(s.player.position.x - stopped.player.position.x, s.player.position.z - stopped.player.position.z)).toBeLessThan(.01);
  }
  await page.keyboard.down('KeyD'); await page.waitForTimeout(600); await page.keyboard.up('KeyD');
  await page.waitForTimeout(300);
  expect((await state(page)).enemies[0].bodyClearance).toBeGreaterThanOrEqual(-1e-6);
  await page.screenshot({ path: 'artifacts/creature-interaction-20261008/normal-pursuit.png' });
});

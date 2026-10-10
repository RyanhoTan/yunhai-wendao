import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { Vector3 } from 'three';
import { constrainBodySolids, PLAYER_BODY } from '../src/core/StaticBodyCollision';
import { MAIN_HALL, hallRoofPoint, mainHallCollision } from '../src/world/MainHall';
import { SECT_SUMMIT } from '../src/world/WorldLayout';

const evidence = 'artifacts/main-hall-roof-collision-20261010';
const meshes = mainHallCollision(SECT_SUMMIT.height, SECT_SUMMIT.z).bodySolids;

test('continuous roof sweeps stop above and below every hip, even across a whole roof in one step', () => {
  for (const [index, roof] of [MAIN_HALL.lowerRoof, MAIN_HALL.upperRoof].entries()) {
    for (let face = 0; face < 4; face++) for (const u of [-.9, 0, .9]) for (const t of [.25, .6, .95]) {
      const surface = hallRoofPoint(roof, face, u, t).add(new Vector3(0, SECT_SUMMIT.height, SECT_SUMMIT.z));
      const fromAbove = surface.clone().add(new Vector3(0, 4, 0)), descending = surface.clone().add(new Vector3(0, -4, 0));
      expect(constrainBodySolids([meshes[index]], fromAbove, descending)).toBe(true);
      expect(descending.y).toBeGreaterThan(surface.y + .08);
      const fromBelow = surface.clone().add(new Vector3(0, -5, 0)), ascending = surface.clone().add(new Vector3(0, 5, 0));
      expect(constrainBodySolids([meshes[index]], fromBelow, ascending)).toBe(true);
      expect(ascending.y + PLAYER_BODY.height).toBeLessThan(surface.y - .15);
    }
  }
  const inside = new Vector3(0, 91.3, 10), walking = new Vector3(0, 91.3, 4);
  expect(constrainBodySolids(meshes, inside, walking)).toBe(false);
  expect(walking.z).toBe(4);
  const high = new Vector3(20, 108, 7), across = new Vector3(-20, 108, 7);
  expect(constrainBodySolids(meshes, high, across)).toBe(false);
  expect(across.x).toBe(-20);
});

test('roof edges and the upper loft stop sideways flight without blocking clear space', () => {
  for (const side of [-1, 1]) {
    const start = new Vector3(side * 20, 96.3, 7), end = new Vector3(-side * 20, 96.3, 7);
    expect(constrainBodySolids(meshes, start, end)).toBe(true);
    expect(end.x * side).toBeGreaterThan(MAIN_HALL.lowerRoof.width / 2 + .5);
    const loftStart = new Vector3(side * 12, 100, 7), loftEnd = new Vector3(0, 100, 7);
    expect(constrainBodySolids(meshes, loftStart, loftEnd)).toBe(true);
    expect(loftEnd.x * side).toBeGreaterThan(6.19);
  }
});

test('real flight input hits the eaves and underside, lands on both roofs and can fly clear again', async ({ page }) => {
  test.setTimeout(100000);
  const errors: string[] = [], samples: unknown[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await mkdir(evidence, { recursive: true });
  await page.goto('/?test=1');
  const state = async (view: string) => {
    await page.evaluate(view => window.__THREE_GAME_TEST_HOOKS__!.setState(`main-hall-${view}`), view);
    await page.waitForTimeout(150);
  };
  const hold = async (keys: string[], ms: number) => {
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    for (const key of keys) await page.keyboard.up(key);
  };
  const capture = async (name: string) => {
    const diagnostics = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!);
    samples.push({ name, player: diagnostics.player, flying: diagnostics.flying, renderer: diagnostics.renderer });
    await page.screenshot({ path: `${evidence}/${name}.png` });
    return diagnostics;
  };
  await state('roof-side'); await hold(['KeyW', 'ShiftLeft'], 900);
  const side = await capture('side-blocked');
  expect(side.player.position.x).toBeGreaterThan(13.4); expect(side.player.position.x).toBeLessThan(14);
  await state('roof-under'); await hold(['Space'], 1800);
  const under = await capture('underside-blocked');
  const underside = hallRoofPoint(MAIN_HALL.lowerRoof, 0, 0, (7.5 - 3.7) / (9.4 - 3.7)).y + SECT_SUMMIT.height;
  expect(under.player.position.y + PLAYER_BODY.height).toBeLessThan(underside - .15);
  expect(under.player.position.y).toBeGreaterThan(94.5);
  await hold(['KeyC'], 500);
  expect((await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.player.position.y))).toBeLessThan(under.player.position.y - .2);
  await state('roof-lower'); await hold(['KeyC'], 1800);
  const lower = await capture('lower-roof-contact');
  expect(lower.player.position.y).toBeGreaterThan(97); expect(lower.player.position.y).toBeLessThan(98.5);
  await page.keyboard.press('KeyF'); await page.waitForTimeout(600);
  const landed = await capture('lower-roof-landed');
  expect(landed.flying).toBe(false); expect(landed.player.position.y).toBeCloseTo(lower.player.position.y, 1);
  await hold(['KeyS'], 1400); await page.waitForTimeout(600);
  const off = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!);
  expect(off.player.position.z).toBeGreaterThan(20); expect(off.player.position.y).toBeLessThan(92);
  await state('roof-upper'); await hold(['KeyC'], 2000);
  const upper = await capture('upper-roof-contact');
  expect(upper.player.position.y).toBeGreaterThan(103); expect(upper.player.position.y).toBeLessThan(105);
  await hold(['Space'], 700);
  expect((await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.player.position.y))).toBeGreaterThan(upper.player.position.y + 1);
  await state('roof-clear'); await hold(['KeyW', 'ShiftLeft'], 1000);
  const clear = await capture('clear-overflight'); expect(clear.player.position.x).toBeLessThan(-10);
  expect(errors).toEqual([]);
  await writeFile(`${evidence}/real-input.json`, JSON.stringify({ samples, errors }, null, 2));
});

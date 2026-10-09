import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { Box3, Raycaster, Vector3, Mesh } from 'three';
import { MAIN_HALL, hallRoofPoint, mainHallCollision, createMainHallModel, mainHallStairHeight } from '../src/world/MainHall';
import { terrainHeight } from '../src/world/World';
import { SECT_SUMMIT } from '../src/world/WorldLayout';
import { walk } from './helpers/navigation';

test('four roof hips join at identical seams and the entrance remains open in collision', () => {
  for (const roof of [MAIN_HALL.lowerRoof, MAIN_HALL.upperRoof]) for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    expect(hallRoofPoint(roof, 0, 1, t).distanceTo(hallRoofPoint(roof, 1, 1, t))).toBeLessThan(.00001);
    expect(hallRoofPoint(roof, 0, -1, t).distanceTo(hallRoofPoint(roof, 3, 1, t))).toBeLessThan(.00001);
    expect(hallRoofPoint(roof, 2, 1, t).distanceTo(hallRoofPoint(roof, 1, -1, t))).toBeLessThan(.00001);
  }
  const collision = mainHallCollision(90, 7);
  expect(collision.walls.some(w => w.min.x < 0 && w.max.x > 0 && w.min.z < 12.92 && w.max.z > 12.92 && w.min.y < 94 && w.max.y > 94)).toBe(false);
  expect(collision.walls.some(w => w.min.x < 5 && w.max.x > 5 && w.min.z < 12.92 && w.max.z > 12.92)).toBe(true);
  const model = createMainHallModel(); let triangles = 0;
  model.traverse(o => { if ('geometry' in o) { const g = o.geometry as import('three').BufferGeometry; triangles += (g.index?.count ?? g.attributes.position.count) / 3; } });
  expect(triangles).toBeLessThan(90000);
  expect(model.children.map(p => p.name)).toEqual(expect.arrayContaining(['front-doors','brackets','lower-tiles','upper-tiles','railings']));
});

test('walking height agrees with every visible stair tread and the upper storey meets its skirt roof', () => {
  const stairs=MAIN_HALL.stairs,model=createMainHallModel(),ray=new Raycaster();
  for(let i=0;i<stairs.count;i++) {
    const z=stairs.startZ-i*stairs.spacing;
    const tread=mainHallStairHeight(0,z)!;
    expect(tread).toBeCloseTo((i+1)*stairs.rise,6);
    // At the last tread the overlapping top terrace remains the highest visible surface.
    const visibleTop=Math.max(tread,z<=9.2?MAIN_HALL.floor:0);
    expect(terrainHeight(0,z+SECT_SUMMIT.z)-SECT_SUMMIT.height).toBeCloseTo(visibleTop,6);
    model.updateMatrixWorld(true);ray.set(new Vector3(0,3,z),new Vector3(0,-1,0));
    const treadHit=ray.intersectObjects([model.getObjectByName('stairs')!,model.getObjectByName('foundation')!],true)[0];
    expect(treadHit.point.y).toBeCloseTo(visibleTop,5);
  }
  const base=new Box3().setFromObject(model.getObjectByName('upper-walls')!);
  expect(base.min.y).toBeLessThan(hallRoofPoint(MAIN_HALL.lowerRoof,0,0,0).y+.02);
  model.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});
});

test('rear skirting stands clear of plaster on both faces after semantic batching', () => {
  for (const batch of [false,true]) {
    const model=createMainHallModel({batch}),ray=new Raycaster();model.updateMatrixWorld(true);
    const facades=model.getObjectByName('facades')!;
    for(const side of [-1,1])for(const x of [-6,0,6])for(const y of [1.4,1.5,1.6]) {
      ray.set(new Vector3(x,y,side>0?0:-8),new Vector3(0,0,-side));
      const hits=ray.intersectObject(facades,true);
      const hitFor=(name:string)=>hits.find(hit=>((hit.object as Mesh).material as import('three').Material).name===name);
      const plaster=hitFor('MainHall_lime_plaster'),skirting=hitFor('MainHall_lattice_wood');
      expect(plaster).toBeDefined();expect(skirting).toBeDefined();
      expect(plaster!.distance-skirting!.distance,'the timber face must project beyond plaster to avoid z-fighting').toBeGreaterThan(.03);
    }
    model.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});
  }
});

test('real input enters the redesigned hall, is stopped by the rear wall, saves and resumes', async ({ page }) => {
  test.setTimeout(100000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?test=1'); await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('main-hall-entry'));
  await mkdir('artifacts/main-hall-20261009/game', { recursive: true });
  await walk(page, 0, 10);
  const entry = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!);
  expect(Math.abs(entry.player.position.y - terrainHeight(entry.player.position.x, entry.player.position.z))).toBeLessThan(.08);
  await page.screenshot({ path: 'artifacts/main-hall-20261009/game/inside.png' });
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1700); await page.keyboard.up('KeyW');
  const stopped = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!);
  expect(stopped.player.position.z).toBeGreaterThan(SECT_SUMMIT.z - MAIN_HALL.frontWall + .4);
  expect(stopped.player.position.z).toBeLessThan(4);
  // Save clear of wall contact; legacy save recovery deliberately adds a safety margin there.
  await walk(page,0,8);
  await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.speed)).toBeLessThan(.05);
  const saved=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player);
  await page.keyboard.press('Escape'); await page.locator('[data-action=save]').click(); await page.reload(); await page.locator('[data-action=continue]').click();
  const resumed = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!);
  expect(Math.hypot(resumed.player.position.x - saved.position.x, resumed.player.position.z - saved.position.z)).toBeLessThan(.15);
  await walk(page, 0, 23);
  await writeFile('artifacts/main-hall-20261009/game/entry-input.json', JSON.stringify({ entry: entry.player, stopped: stopped.player, resumed: resumed.player, errors }, null, 2));
  expect(errors).toEqual([]);
});

test('new frontage and side windows stop real movement and all game views render', async ({ page }) => {
  test.setTimeout(90000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?test=1');
  await mkdir('artifacts/main-hall-20261009/game', { recursive: true });
  const captures=[];
  for (const view of ['front','rear','side','flight']) {
    await page.evaluate(view => window.__THREE_GAME_TEST_HOOKS__!.setState(`main-hall-${view}`), view);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `artifacts/main-hall-20261009/game/${view}.png` });
    captures.push({ view, renderer: await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.renderer) });
  }
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('main-hall-side'));
  await page.keyboard.down('KeyW'); await page.waitForTimeout(2400); await page.keyboard.up('KeyW');
  const blocked = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.player.position);
  expect(blocked.x).toBeGreaterThan(12.3);
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('main-hall-frontage'));
  await page.keyboard.down('KeyW');await page.waitForTimeout(1500);await page.keyboard.up('KeyW');
  const frontage=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position);
  expect(frontage.z).toBeGreaterThan(13.5);expect(frontage.z).toBeLessThan(14.5);
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('main-hall-sidewall'));
  await page.keyboard.down('KeyW');await page.waitForTimeout(1300);await page.keyboard.up('KeyW');
  const sidewall=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position);
  expect(sidewall.x).toBeLessThan(9.15);expect(sidewall.x).toBeGreaterThan(8.7);
  await writeFile('artifacts/main-hall-20261009/game/views.json', JSON.stringify({ captures, blocked, frontage, sidewall, errors }, null, 2));
  expect(errors).toEqual([]);
});

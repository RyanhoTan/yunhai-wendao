import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const out = 'artifacts/frostbound-sword-20261010/model'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', headless: false });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 1200 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${process.argv[2] ?? 'http://127.0.0.1:5188'}/frostbound-sword.html?capture=1`);
  await page.waitForFunction(() => !!window.__SWORD_PREVIEW__);
  for (const view of ['front', 'three-quarter', 'rear', 'close', 'flight']) {
    await page.evaluate(v => window.__SWORD_PREVIEW__.setView(v), view);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: `${out}/${view}.png` });
  }
  const result = await page.evaluate(() => {
    const q = window.__SWORD_PREVIEW__; q.setView('front');
    const materials = [], geometries = new Set();
    q.held.traverse(n => {
      if (!n.isMesh) return; geometries.add(n.geometry);
      materials.push({ name: n.material.name, metalness: n.material.metalness, roughness: n.material.roughness,
        maps: ['map', 'normalMap', 'roughnessMap'].map(key => ({ key, width: n.material[key]?.image?.width, height: n.material[key]?.image?.height })) });
    });
    const a = q.held.getObjectByName('FrostboundArcbladeMesh');
    const b = q.makeFrostboundSword().getObjectByName('FrostboundArcbladeMesh');
    const f = q.flight.getObjectByName('FrostboundArcbladeMesh');
    q.held.updateMatrixWorld(true); q.flight.updateMatrixWorld(true);
    const ray = new q.THREE.Raycaster(), hits = [];
    for (const x of [-.065, 0, .065]) {
      ray.set(new q.THREE.Vector3(x, 1.1 / 3.2, .1), new q.THREE.Vector3(0, 0, -1));
      hits.push(ray.intersectObject(q.flight, true)[0]?.point.z ?? null);
    }
    return { calls: q.renderer.info.render.calls, triangles: a.geometry.index.count / 3,
      geometries: geometries.size, deckZ: q.flight.userData.deckZ, weapon: q.held.userData.weapon, materials,
      sharedGeometry: a.geometry === b.geometry, sharedMaterial: a.material === b.material && a.material === f.material,
      sharedIndices: a.geometry.index === f.geometry.index, sharedUVs: a.geometry.attributes.uv === f.geometry.attributes.uv,
      separateFlightPositions: a.geometry.attributes.position !== f.geometry.attributes.position,
      tip: q.held.getObjectByName('SwordTipSocket').getWorldPosition(new q.THREE.Vector3()).toArray(),
      grip: q.held.getObjectByName('SwordGripSocket').getWorldPosition(new q.THREE.Vector3()).toArray(), hits };
  });
  await writeFile(`${out}/model.json`, `${JSON.stringify({ ...result, errors }, null, 2)}\n`);
  console.log(JSON.stringify({ ...result, errors }));
  assert.deepEqual(errors, []); assert.equal(result.triangles, 116344);
  for (const key of ['sharedGeometry', 'sharedMaterial', 'sharedIndices', 'sharedUVs', 'separateFlightPositions']) assert.equal(result[key], true, key);
  assert.equal(result.tip[1], 1.04); assert.deepEqual(result.grip, [0, .03, 0]);
  assert(result.hits.every(z => z !== null));
  assert(Math.abs(result.deckZ - Math.max(...result.hits)) < 1e-6);
  for (const material of result.materials) for (const map of material.maps) assert.deepEqual([map.width, map.height], [2048, 2048]);
} finally { await browser.close(); }

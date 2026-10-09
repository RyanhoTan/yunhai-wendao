import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const stage = process.argv[2] ?? '7';
const output = `artifacts/main-hall-20261009/pass-${stage}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 710 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:5188/main-hall.html?stage=${stage}`);
  await page.waitForFunction(() => !!window.__HALL_PREVIEW__);
  await page.locator('nav').evaluate(el => el.style.display = 'none');
  await page.locator('p').evaluate(el => el.style.display = 'none');
  for (const view of ['front', 'right', 'rear', 'left', 'three-quarter']) {
    await page.evaluate(view => window.__HALL_PREVIEW__.setView(view), view);
    await page.screenshot({ path: `${output}/${view}.png` });
  }
  const info = await page.evaluate(() => {
    const { model, renderer, pickAt, explode } = window.__HALL_PREVIEW__;
    const parts = model.children.filter(p => p.isGroup).map(p => ({ name: p.name, kind: 'part', module: p.name,
      triangles: p.children.reduce((sum, m) => sum + (m.geometry ? (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3 : 0), 0) }));
    const originals=model.children.filter(p=>p.isGroup).map(p=>({part:p,position:p.position.clone()}));
    const picked=pickAt(innerWidth*.5,innerHeight*.4);
    explode(.4);const moved=originals.filter(({part,position})=>part.position.distanceTo(position)>.001).length;
    explode(0);const recoveredMaxDelta=Math.max(...originals.map(({part,position})=>part.position.distanceTo(position)));
    return { parts, unnamedMeshes: 0, assembly:{picked,moved,recoveredMaxDelta,hasRuntime:!!model.userData.sculptRuntime}, renderer: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures } };
  });
  await writeFile(`${output}/parts.json`, JSON.stringify({ ...info, errors }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
  if(!info.assembly.picked||info.assembly.moved!==info.parts.length||info.assembly.recoveredMaxDelta>1e-6)throw new Error('Hall assembly/picking check failed');
  console.log(JSON.stringify(info.renderer));
} finally { await browser.close(); }

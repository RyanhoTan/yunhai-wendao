import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.MOUNTAIN_PREVIEW_URL ?? 'http://127.0.0.1:5188';
const directory = 'artifacts/mountain-model-20261010';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', headless: false });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => requests.push(request.url()));
  await page.goto(`${base}/mountain-model.html?test`);
  await page.waitForFunction(() => window.__MOUNTAIN_PREVIEW__);
  for (const view of ['road', 'front', 'side', 'top', 'summit', 'bottom']) {
    await page.evaluate(view => window.__MOUNTAIN_PREVIEW__.setView(view), view);
    await page.screenshot({ path: `${directory}/${view}.png` });
  }
  await page.getByLabel('线框查看', { exact: true }).check();
  await page.screenshot({ path: `${directory}/wireframe.png` });
  await page.getByRole('button', { name: '重置视角与图层' }).click();
  const canvas = page.locator('#mountain-canvas'), box = await canvas.boundingBox();
  const before = await page.evaluate(() => window.__MOUNTAIN_PREVIEW__.camera.position.toArray());
  await page.mouse.move(box.x + box.width * .45, box.y + box.height * .45); await page.mouse.down();
  await page.mouse.move(box.x + box.width * .6, box.y + box.height * .52, { steps: 15 }); await page.mouse.up();
  await page.mouse.wheel(0, -140); await canvas.focus(); await page.keyboard.press('ArrowRight');
  const after = await page.evaluate(() => window.__MOUNTAIN_PREVIEW__.camera.position.toArray());
  await page.screenshot({ path: `${directory}/mouse-keyboard.png` });
  await page.getByRole('button', { name: '重置视角与图层' }).click();
  await page.getByLabel('竖向岩柱', { exact: true }).uncheck();
  await page.getByLabel('坡脚碎石', { exact: true }).uncheck();
  await page.screenshot({ path: `${directory}/body-road.png` });
  await page.getByRole('button', { name: '重置视角与图层' }).click();
  const stats = await page.evaluate(() => {
    const { model, renderer } = window.__MOUNTAIN_PREVIEW__, gl = renderer.getContext();
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return { ...model.stats, calls: renderer.info.render.calls, renderedTriangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      gpu: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable' };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '山路全景', exact: true }).click(); await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `${directory}/mobile.png`, fullPage: true });
  const report = { ...stats, errors, input: { before, after, changed: JSON.stringify(before) !== JSON.stringify(after) },
    referenceGLBLoaded: requests.some(url => url.includes('.glb')), gameResourcesLoaded: requests.some(url => /\/src\/game\/|\/src\/main\.ts|\/assets\/game-/.test(url)) };
  await writeFile(`${directory}/evidence.json`, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
} finally { await browser.close(); }

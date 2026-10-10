import { test, expect } from '@playwright/test';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import type * as THREE from 'three';
import type { createSectMountainModel } from '../src/models/SectMountainModel';

test.use({ launchOptions: { args: ['--ozone-platform=x11'] } });
type PreviewWindow = Window & { __MOUNTAIN_PREVIEW__: {
  model: ReturnType<typeof createSectMountainModel>;
  renderer: THREE.WebGLRenderer;
  setView(view: string): void;
} };

test('LAAS-inspired terrain materials compile, remain stable and render every preview view', async ({ page }) => {
  const directory = 'artifacts/mountain-material-laas-20261010', errors: string[] = [], resources: string[] = [];
  await mkdir(directory, { recursive: true });
  await copyFile('artifacts/mountain-model-20261010/road.png', `${directory}/before-road.png`);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => resources.push(request.url()));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/mountain-model.html?test');
  await expect(page.locator('#triangle-count')).toHaveText('156,848');
  for (const view of ['road', 'front', 'side', 'top', 'summit', 'bottom']) {
    await page.evaluate(view => (window as unknown as PreviewWindow).__MOUNTAIN_PREVIEW__.setView(view), view);
    await page.screenshot({ path: `${directory}/${view}.png` });
  }
  const inspect = () => page.evaluate(() => {
    const { model, renderer } = (window as unknown as PreviewWindow).__MOUNTAIN_PREVIEW__;
    const gl = renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
    const programs = renderer.info.programs ?? [];
    return { ...model.stats, calls: renderer.info.render.calls, renderedTriangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      shaderPrograms: programs.length,
      failedPrograms: programs.filter(program => (program as unknown as { diagnostics?: { runnable: boolean } }).diagnostics?.runnable === false).length,
      gpu: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) as string : 'unavailable' };
  });
  await page.getByRole('button', { name: '山路全景', exact: true }).click();
  const before = await inspect();
  for (let i = 0; i < 3; i++) {
    await page.getByLabel('线框查看', { exact: true }).check();
    await page.getByLabel('线框查看', { exact: true }).uncheck();
    await page.getByLabel('竖向岩柱', { exact: true }).uncheck();
    await page.getByLabel('竖向岩柱', { exact: true }).check();
  }
  const after = await inspect();
  expect(after.failedPrograms).toBe(0); expect(after.shaderPrograms).toBeGreaterThanOrEqual(3);
  expect(after.textures).toBe(before.textures); expect(after.geometries).toBe(before.geometries);
  expect(after.calls).toBe(6); expect(after.triangles).toBe(156848);
  await page.getByLabel('线框查看', { exact: true }).check();
  await page.screenshot({ path: `${directory}/wireframe.png` });
  await page.getByRole('button', { name: '重置视角与图层' }).click();
  const canvas = page.locator('#mountain-canvas'), box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * .48, box.y + box.height * .5); await page.mouse.down();
  await page.mouse.move(box.x + box.width * .56, box.y + box.height * .47, { steps: 12 }); await page.mouse.up();
  await page.mouse.wheel(0, -130); await canvas.focus(); await page.keyboard.press('ArrowRight');
  await page.screenshot({ path: `${directory}/mouse-keyboard.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '重置视角与图层' }).click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `${directory}/mobile.png`, fullPage: true });
  expect(errors).toEqual([]);
  expect(resources.filter(url => /\.glb(?:\?|$)|\/assets\/game-/.test(url))).toEqual([]);
  await writeFile(`${directory}/evidence.json`, JSON.stringify({ before, after, errors,
    reference: 'https://github.com/Braffolk/fable5-world-demo', referenceCommit: 'fd75fdb718996908aad3d22b59dfa297dc94298d',
    geometryChanged: false, gameResourcesLoaded: false, display: 'X11' }, null, 2) + '\n');
});

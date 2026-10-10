import { test, expect } from '@playwright/test';
import { Raycaster, Vector3 } from 'three';
import { createSectMountainModel } from '../src/models/SectMountainModel';

test('paving stays on the actual mountain triangles through every switchback', () => {
  const model = createSectMountainModel(), ray = new Raycaster();
  try {
    for (let i = 0; i <= 90; i++) {
      const t = i / 90, point = model.curve.getPoint(t), tangent = model.curve.getTangent(t);
      const side = new Vector3(-tangent.z, 0, tangent.x).normalize();
      for (const offset of [-3.4, 0, 3.4]) {
        const position = point.clone().addScaledVector(side, offset);
        ray.set(new Vector3(position.x, 120, position.z), new Vector3(0, -1, 0));
        const body = ray.intersectObject(model.layers.body)[0], paving = ray.intersectObject(model.layers.road)[0];
        expect(body, `body at ${i}:${offset}`).toBeTruthy();
        expect(paving, `road at ${i}:${offset}`).toBeTruthy();
        expect(paving.point.y - body.point.y).toBeCloseTo(.09, 4);
        expect(paving.face!.normal.y, `road slope at ${i}:${offset}`).toBeGreaterThan(.65);
      }
    }
    expect(model.stats.triangles).toBeLessThan(175000);
    expect(model.stats.meshes).toBe(5);
  } finally { model.dispose(); }
});

test('preview controls work without loading game or reference GLB resources', async ({ page }) => {
  const resources: string[] = [], errors: string[] = [];
  page.on('request', request => resources.push(request.url())); page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => localStorage.setItem('mountain-preview-isolation-check', 'unchanged'));
  await page.goto('/mountain-model.html?test');
  await expect(page.locator('#triangle-count')).not.toHaveText('—');
  await expect(page.getByRole('heading', { name: '云岚叠嶂' })).toBeVisible();
  for (const name of ['岩壁正面', '侧面层次', '俯视路线', '山顶近看', '底部结构', '山路全景']) {
    const button = page.getByRole('button', { name, exact: true }); await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
  const pose = () => page.evaluate(() => {
    const preview = (window as unknown as { __MOUNTAIN_PREVIEW__: { camera: { position: Vector3 } } }).__MOUNTAIN_PREVIEW__;
    return preview.camera.position.toArray();
  });
  const initial = await pose(), canvas = page.locator('#mountain-canvas'), box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5); await page.mouse.down();
  await page.mouse.move(box.x + box.width * .6, box.y + box.height * .6, { steps: 12 }); await page.mouse.up();
  expect(await pose()).not.toEqual(initial);
  const rotated = await pose(); await page.mouse.wheel(0, -180); await expect.poll(pose).not.toEqual(rotated);
  await canvas.focus(); const zoomed = await pose(); await page.keyboard.press('ArrowLeft'); expect(await pose()).not.toEqual(zoomed);
  await page.getByLabel('折返山路', { exact: true }).uncheck(); await page.getByLabel('竖向岩柱', { exact: true }).uncheck();
  await page.getByLabel('线框查看', { exact: true }).check();
  await page.getByRole('button', { name: '重置视角与图层' }).click();
  await expect(page.getByLabel('折返山路', { exact: true })).toBeChecked();
  await expect(page.getByLabel('竖向岩柱', { exact: true })).toBeChecked();
  await expect(page.getByLabel('线框查看', { exact: true })).not.toBeChecked();
  expect(await pose()).toEqual(initial);
  expect(await page.evaluate(() => localStorage.getItem('mountain-preview-isolation-check'))).toBe('unchanged');
  expect(resources.filter(url => /\.glb(?:\?|$)|\/src\/game\/|\/src\/main\.ts|\/assets\/game-/.test(url))).toEqual([]);
  expect(await page.evaluate(() => '__THREE_GAME__' in window || '__THREE_GAME_TEST_HOOKS__' in window)).toBe(false);
  expect(errors).toEqual([]);
});

test('narrow preview keeps the canvas and all controls reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/mountain-model.html');
  await expect(page.locator('#triangle-count')).not.toHaveText('—');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('link', { name: '← 返回游戏' })).toBeInViewport();
  await expect(page.locator('#mountain-canvas')).toBeInViewport();
  await page.getByRole('button', { name: '俯视路线' }).click();
  await page.getByLabel('线框查看', { exact: true }).check();
  await page.getByRole('button', { name: '重置视角与图层' }).click();
  await expect(page.getByLabel('线框查看', { exact: true })).not.toBeChecked();
  await expect(page.getByRole('link', { name: '← 返回游戏' })).toHaveAttribute('href', './index.html');
});

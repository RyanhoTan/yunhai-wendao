import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs/promises';

const out = 'artifacts/movement-jitter-20261008';
test.use({ video: { mode: 'on', size: { width: 1280, height: 720 } } });

async function sampleMotion(page: Page) {
  return page.evaluate(() => new Promise<{ t:number;frame:number;physicsZ:number;renderZ:number;targetZ:number;speed:number }[]>(resolve => {
    const samples: { t:number;frame:number;physicsZ:number;renderZ:number;targetZ:number;speed:number }[] = [];
    const tick = (t:number) => {
      const d = window.__THREE_GAME_DIAGNOSTICS__!;
      samples.push({ t, frame:d.frame, physicsZ:d.player.position.z, renderZ:d.player.renderPosition.z, targetZ:d.camera.target.z, speed:d.player.speed });
      if (samples.length < 120) requestAnimationFrame(tick); else resolve(samples);
    };
    requestAnimationFrame(tick);
  }));
}

test('real movement and camera follow interpolate at high and uneven frame cadence', async ({ page }) => {
  const errors:string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // A repeatable render clock, independent of the display's refresh rate.
  await page.addInitScript(() => {
    const clockWindow = window as unknown as Window & { __movementFrameMs:number[] };
    clockWindow.__movementFrameMs = [1000 / 144];
    const nativeRaf = window.requestAnimationFrame.bind(window);
    let previous = -1, clock = 0, frame = 0;
    window.requestAnimationFrame = callback => nativeRaf(t => {
      if (t !== previous) {
        previous = t;
        const cadence = clockWindow.__movementFrameMs;
        clock += cadence[frame++ % cadence.length];
      }
      callback(clock);
    });
  });
  await fs.mkdir(out, { recursive:true });
  await page.goto('/?test=1');
  await page.locator('[data-action=new-game]').click();
  const reports = [];
  for (const scenario of ['walk', 'flight', 'uneven'] as const) {
    if (scenario === 'flight') await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('flight'));
    if (scenario === 'uneven') await page.evaluate(() => {
      (window as unknown as Window & { __movementFrameMs:number[] }).__movementFrameMs = [4, 8, 24, 7, 12, 6];
    });
    await page.keyboard.down('KeyS');
    await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.player.speed)).toBeGreaterThan(scenario === 'walk' ? 6.79 : 19.99);
    const samples = await sampleMotion(page);
    await page.keyboard.up('KeyS');
    const deltas = samples.slice(1).map((s,i) => ({ render:s.renderZ-samples[i].renderZ, physics:s.physicsZ-samples[i].physicsZ, dt:(s.t-samples[i].t)/1000 }));
    const frozenPhysicsFrames = deltas.filter(d => Math.abs(d.physics) < 1e-8).length;
    const frozenRenderFrames = deltas.filter(d => Math.abs(d.render) < 1e-8).length;
    expect(frozenPhysicsFrames).toBeGreaterThan(10);
    expect(frozenRenderFrames).toBe(0);
    for (const d of deltas) expect(d.render / d.dt).toBeCloseTo(scenario === 'walk' ? 6.8 : 20, 2);
    for (const s of samples) expect(s.targetZ).toBe(s.renderZ);
    reports.push({scenario,frozenPhysicsFrames,frozenRenderFrames,samples});
    await page.screenshot({path:`${out}/${scenario}.png`});
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-action=resume]')).toBeVisible();
  const paused = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.player.renderPosition);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.player.renderPosition)).toEqual(paused);
  await page.locator('[data-action=resume]').click();
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setState('coast'));
  const reset = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!);
  expect(reset.player.renderPosition).toEqual(reset.player.position);
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(true));
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!.player.renderPosition)).toEqual(reset.player.position);
  const gpu = await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>('#game-canvas')!.getContext('webgl2')!;
    const ext = gl.getExtension('WEBGL_debug_renderer_info')!;
    return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
  });
  expect(errors).toEqual([]);
  await fs.writeFile(`${out}/after.json`, JSON.stringify({gpu,reports,errors},null,2)+'\n');
  const video = page.video()!;
  await page.context().close();
  await video.saveAs(`${out}/movement.webm`);
});

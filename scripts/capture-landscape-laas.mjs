import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { inspectPage, readManifestCaptures, summarize } from './inspect-threejs-canvas.mjs';

const stage = process.argv[2] ?? 'after';
if (!/^(before|vegetation|after)(-r\d+)?$/.test(stage)) throw new Error('Unknown capture stage');
const inputOnly = process.argv.includes('--input-only');
const targetUrl = process.argv[3]?.startsWith('http') ? process.argv[3] : 'http://127.0.0.1:4194/?test=1';
const directory = `artifacts/landscape-laas-20261010/${stage}`;
const states = ['woodland-floor', 'woodland-meadow', 'forest-canopy', 'natural-land', 'sect-panorama', 'mountain-vista', 'landscape-overview', 'landscape-map-view'];
const manifest = {
  version: 1, runId: `landscape-laas-20261010-${stage}`,
  captures: states.map(state => ({ mode: 'desktop', state, report: `${directory}/${state}.json` })),
};
await mkdir(directory, { recursive: true });
await writeFile(`${directory}/evidence.json`, `${JSON.stringify(manifest, null, 2)}\n`);
let browser = await chromium.launch({ channel: 'chromium', headless: false, args: inputOnly ? [] : ['--ozone-platform=x11'] });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  let page = await context.newPage();
  if (inputOnly) await page.goto(targetUrl);
  for (const capture of inputOnly ? [] : readManifestCaptures(manifest)) {
    await page.bringToFront();
    const report = await inspectPage(page, { ...capture, url: targetUrl, seed: 42, wait: 0, timeoutMs: 30_000 });
    await writeFile(capture.reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(summarize(report, capture.reportPath));
    if (!report.result?.ok || report.consoleErrorCount || report.pageErrorCount) process.exitCode = 1;
  }
  if (stage !== 'before') {
    if (!inputOnly) {
      await browser.close();
      browser = await chromium.launch({ channel: 'chromium', headless: false });
      page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      await page.goto(targetUrl);
    }
    await page.evaluate(async () => { await window.__THREE_GAME_TEST_HOOKS__.setState('forest-entry'); await window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(false); });
    const warmFrame = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.frame);
    await page.waitForFunction(frame => window.__THREE_GAME_DIAGNOSTICS__.frame > frame + 8, warmFrame, { timeout: 20_000 });
    const start = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.player.position);
    await page.keyboard.down('KeyW');
    await page.waitForFunction(start => { const p = window.__THREE_GAME_DIAGNOSTICS__.player.position; return Math.hypot(p.x-start.x,p.z-start.z) > 8; }, start, { timeout: 20_000 });
    await page.keyboard.up('KeyW');
    const walked = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    await page.screenshot({ path: `${directory}/real-walk.png` });
    await page.keyboard.press('KeyF'); await page.keyboard.down('Space'); await page.keyboard.down('KeyW');
    await page.waitForFunction(() => { const d=window.__THREE_GAME_DIAGNOSTICS__; return d.flying && d.player.position.y-d.coast.ground > 15; }, null, { timeout: 20_000 });
    await page.keyboard.up('Space'); await page.keyboard.up('KeyW');
    await page.mouse.move(620, 330); await page.mouse.down({ button: 'right' }); await page.mouse.move(790, 355, { steps: 12 }); await page.mouse.up({ button: 'right' });
    const flown = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    await page.screenshot({ path: `${directory}/real-flight.png` });
    const distance = Math.hypot(walked.player.position.x - start.x, walked.player.position.z - start.z);
    await writeFile(`${directory}/real-input.json`, `${JSON.stringify({ start, walked, flown, distance }, null, 2)}\n`);
    if (distance < 2 || !flown.flying || flown.player.position.y - flown.coast.ground < 10) throw new Error('Real movement/flight did not progress');
    console.log(`Real input: walked ${distance.toFixed(2)}m; flight clearance ${(flown.player.position.y - flown.coast.ground).toFixed(2)}m`);
  }
} finally { await browser.close(); }

import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { inspectPage, readManifestCaptures, summarize } from './inspect-threejs-canvas.mjs';

const stage = process.argv[2] ?? 'after';
if (!/^(before|vegetation|after)(-r\d+)?$/.test(stage)) throw new Error('Unknown capture stage');
const directory = `artifacts/landscape-laas-20261010/${stage}`;
const states = ['woodland-floor', 'woodland-meadow', 'forest-canopy', 'natural-land', 'sect-panorama', 'mountain-vista'];
const manifest = {
  version: 1, runId: `landscape-laas-20261010-${stage}`,
  captures: states.map(state => ({ mode: 'desktop', state, report: `${directory}/${state}.json` })),
};
await mkdir(directory, { recursive: true });
await writeFile(`${directory}/evidence.json`, `${JSON.stringify(manifest, null, 2)}\n`);
const browser = await chromium.launch({ channel: 'chromium', headless: false, args: ['--ozone-platform=x11'] });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  for (const capture of readManifestCaptures(manifest)) {
    const report = await inspectPage(page, { ...capture, url: process.argv[3] ?? 'http://127.0.0.1:4194/?test=1', seed: 42, wait: 0 });
    await writeFile(capture.reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(summarize(report, capture.reportPath));
    if (!report.result?.ok || report.consoleErrorCount || report.pageErrorCount) process.exitCode = 1;
  }
  if (stage !== 'before') {
    await page.evaluate(async () => { await window.__THREE_GAME_TEST_HOOKS__.setState('forest-entry'); await window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(false); });
    const start = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.player.position);
    await page.keyboard.down('KeyW'); await page.waitForTimeout(1800); await page.keyboard.up('KeyW');
    const walked = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    await page.screenshot({ path: `${directory}/real-walk.png` });
    await page.keyboard.press('KeyF'); await page.keyboard.down('Space'); await page.keyboard.down('KeyW');
    await page.waitForTimeout(1800); await page.keyboard.up('Space'); await page.keyboard.up('KeyW');
    await page.mouse.move(620, 330); await page.mouse.down({ button: 'right' }); await page.mouse.move(790, 355, { steps: 12 }); await page.mouse.up({ button: 'right' });
    const flown = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    await page.screenshot({ path: `${directory}/real-flight.png` });
    const distance = Math.hypot(walked.player.position.x - start.x, walked.player.position.z - start.z);
    if (distance < 2 || !flown.flying || flown.player.position.y - flown.coast.ground < 10) throw new Error('Real movement/flight did not progress');
    await writeFile(`${directory}/real-input.json`, `${JSON.stringify({ start, walked, flown, distance }, null, 2)}\n`);
    console.log(`Real input: walked ${distance.toFixed(2)}m; flight clearance ${(flown.player.position.y - flown.coast.ground).toFixed(2)}m`);
  }
} finally { await browser.close(); }

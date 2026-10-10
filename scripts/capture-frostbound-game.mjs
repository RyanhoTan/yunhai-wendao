import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { inspectPage, readManifestCaptures, summarize } from './inspect-threejs-canvas.mjs';

const directory = 'artifacts/frostbound-sword-20261010';
await mkdir(`${directory}/game`, { recursive: true });
const manifest = JSON.parse(await readFile(`${directory}/evidence.json`, 'utf8'));
const browser = await chromium.launch({ channel: 'chromium', headless: false });
try {
  for (const capture of readManifestCaptures(manifest)) {
    const character = manifest.captures.find(c => c.report === capture.reportPath).character;
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await context.addInitScript(id => localStorage.setItem('yunhai-wendao-character-v1', id), character);
    const page = await context.newPage();
    const report = await inspectPage(page, { ...capture, url: process.argv[2] ?? 'http://127.0.0.1:4194/?test=1', seed: 42, wait: 0 });
    const animation = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.animation);
    if (animation.model !== character || animation.weapon !== 'frostbound-arcblade') throw new Error('Capture used the wrong character or sword');
    await writeFile(capture.reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(summarize(report, capture.reportPath));
    if (!report.result?.ok || report.consoleErrorCount || report.pageErrorCount) process.exitCode = 1;
    await context.close();
  }
} finally { await browser.close(); }

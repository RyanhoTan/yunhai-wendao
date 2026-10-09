import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { inspectPage, readManifestCaptures, summarize } from './inspect-threejs-canvas.mjs';

// Set the same validated appearance preference used by the player panel. The
// existing scene hooks still arrange and acknowledge each real game state.
const url = process.argv[2] ?? 'http://127.0.0.1:5188/?test=1';
const directory = 'artifacts/character-switch-20261009';
const manifest = JSON.parse(await readFile(`${directory}/evidence.json`, 'utf8'));
const browser = await chromium.launch({ channel: 'chromium', headless: false });
try {
  for (const capture of readManifestCaptures(manifest)) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => localStorage.setItem('yunhai-wendao-character-v1', 'shadowbound-wanderer'));
    const page = await context.newPage();
    const report = await inspectPage(page, { ...capture, url, seed: 42, wait: 0 });
    const model = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.animation.model);
    if (model !== 'shadowbound-wanderer') throw new Error(`Wrong capture model: ${model}`);
    await writeFile(capture.reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(summarize(report, capture.reportPath));
    if (!report.result?.ok || report.consoleErrorCount || report.pageErrorCount) process.exitCode = 1;
    await context.close();
  }
  const page = await browser.newPage();
  const videoUrl = new URL(`${directory}/native-motion.webm`, url).href;
  await page.goto(videoUrl);
  const sheet = await page.evaluate(async () => {
    const video = document.querySelector('video');
    if (!video) throw new Error('Motion recording did not load');
    if (video.readyState < 1) await new Promise((resolve, reject) => {
      video.addEventListener('loadedmetadata', resolve, { once: true });
      video.addEventListener('error', reject, { once: true });
    });
    video.pause();
    const times = Array.from({ length: 12 }, (_, i) => video.duration * (.14 + i * .073));
    const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 3 * 300;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#102a25'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < times.length; i++) {
      await new Promise(resolve => { video.addEventListener('seeked', resolve, { once: true }); video.currentTime = times[i]; });
      const x = (i % 4) * 480, y = Math.floor(i / 4) * 300;
      ctx.drawImage(video, x, y, 480, 270); ctx.fillStyle = '#f0ddb1'; ctx.font = '16px sans-serif';
      ctx.fillText(`${times[i].toFixed(2)} s`, x + 12, y + 290);
    }
    return canvas.toDataURL('image/png');
  });
  await writeFile(`${directory}/motion-sheet.png`, Buffer.from(sheet.split(',')[1], 'base64'));
} finally {
  await browser.close();
}

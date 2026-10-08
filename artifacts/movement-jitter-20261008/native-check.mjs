// Run from the repository root after npm run build, with preview on port 4194.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const out = 'artifacts/movement-jitter-20261008';
const browser = await chromium.launch({ headless:false, channel:'chromium' });
try {
  const page = await browser.newPage({ viewport:{width:1280,height:720} });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:4194/?test=1');
  await page.locator('[data-action=new-game]').click();
  await page.waitForTimeout(500);
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(600);
  const samples = await page.evaluate(() => new Promise(resolve => {
    const start = performance.now(), samples = [];
    const tick = t => {
      const d = window.__THREE_GAME_DIAGNOSTICS__;
      samples.push({t,frame:d.frame,physicsZ:d.player.position.z,renderZ:d.player.renderPosition.z,targetZ:d.camera.target.z,speed:d.player.speed});
      if (t-start < 1500) requestAnimationFrame(tick); else resolve(samples);
    };
    requestAnimationFrame(tick);
  }));
  await page.keyboard.up('KeyS');
  const unique = samples.filter((s,i) => i === 0 || s.frame !== samples[i-1].frame);
  const deltas = unique.slice(1).map((s,i) => ({physics:s.physicsZ-unique[i].physicsZ,render:s.renderZ-unique[i].renderZ}));
  const frozenPhysicsFrames = deltas.filter(d => Math.abs(d.physics) < 1e-8).length;
  const frozenRenderFrames = deltas.filter(d => Math.abs(d.render) < 1e-8).length;
  assert.equal(frozenRenderFrames, 0);
  assert.ok(deltas.every(d => d.render > 0));
  assert.ok(unique.every(s => s.targetZ === s.renderZ));
  await page.screenshot({path:`${out}/native-after.png`});
  // Turn beyond 90 degrees, then walk with the actual new view direction.
  await page.mouse.move(640,350); await page.mouse.down({button:'right'});
  await page.mouse.move(1040,350,{steps:16}); await page.mouse.up({button:'right'});
  await page.keyboard.down('KeyW'); await page.waitForTimeout(650); await page.keyboard.up('KeyW');
  await page.screenshot({path:`${out}/native-turned.png`});
  const gpu = await page.evaluate(() => {
    const gl = document.querySelector('#game-canvas').getContext('webgl2');
    return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
  });
  assert.deepEqual(errors, []);
  const result = {gpu,frames:unique.length,durationMs:unique.at(-1).t-unique[0].t,frozenPhysicsFrames,frozenRenderFrames,minRenderStep:Math.min(...deltas.map(d=>d.render)),maxRenderStep:Math.max(...deltas.map(d=>d.render)),errors,samples:unique};
  await fs.writeFile(`${out}/native-after.json`,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({...result,samples:undefined}));
} finally { await browser.close(); }

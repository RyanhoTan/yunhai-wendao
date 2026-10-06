import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const browser=await chromium.launch({headless:false,channel:'chromium'});
try {
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:4194/?test=1');await page.locator('[data-action=new-game]').click();
  // Warm the same scene before measuring; startup upload and swap pressure are separate costs.
  for(let i=0;i<3;i++){await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setState('field-combat'));await page.waitForTimeout(1200);}
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setState('field-combat'));
  await page.keyboard.press('Digit4');for(const key of ['KeyT','KeyG','KeyV'])await page.keyboard.press(key);
  await page.waitForFunction(()=>{const e=window.__THREE_GAME_DIAGNOSTICS__.elemental;return e.pulseCooldown>0&&e.casts===1&&e.vortex!==null;});
  const startEffects=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__.elemental);
  const sample=await page.evaluate(()=>new Promise(resolve=>{
    const start=performance.now(),intervals=[],max={calls:0,triangles:0,geometries:0,textures:0};let frames=0,last=start;
    const tick=()=>{
      const now=performance.now();intervals.push(now-last);last=now;frames++;
      const d=window.__THREE_GAME_DIAGNOSTICS__;for(const key of Object.keys(max))max[key]=Math.max(max[key],d.renderer[key]);
      if(now-start<2200)requestAnimationFrame(tick);else{intervals.sort((a,b)=>a-b);resolve({durationMs:now-start,frames,fps:frames*1000/(now-start),p95FrameMs:intervals[Math.floor(intervals.length*.95)],peak:max,end:{phase:d.phase,health:d.health,qi:d.qi,elemental:d.elemental}});}
    };requestAnimationFrame(tick);
  }));
  const gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);});
  const report={runtimeCommit:'829a891',viewport:{width:1280,height:720},gpu,hardwareValid:!/swiftshader|llvmpipe|software/i.test(gpu),inputs:['Digit4','KeyT','KeyG','KeyV'],warmupRounds:3,startEffects,...sample,errors};
  await writeFile('artifacts/qa/elemental-performance.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));if(errors.length||!report.hardwareValid||sample.end.phase!=='playing')process.exitCode=1;
} finally {await browser.close();}

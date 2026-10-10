import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const directory='artifacts/terrain-pipeline/concepts/sect-mountain-v1/mountain-body/meshy-review';
const browser=await chromium.launch({channel:'chromium',headless:false});
try {
  const page=await browser.newPage({viewport:{width:1200,height:800},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const source of process.argv.slice(2).length?process.argv.slice(2):['remeshed','raw','packed']) {
    await page.goto(`http://127.0.0.1:5198/${directory}/index.html?source=${source}`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!!window.__TERRAIN_REVIEW__,null,{timeout:60000});
    for(const view of ['overview','rear','side','top','low','bottom']) {
      await page.evaluate(view=>window.__TERRAIN_REVIEW__.setView(view),view);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.screenshot({path:resolve(directory,`${source}-${view}.png`)});
    }
    const stats=await page.evaluate(()=>({...window.__TERRAIN_REVIEW__.stats,render:{calls:window.__TERRAIN_REVIEW__.renderer.info.render.calls,triangles:window.__TERRAIN_REVIEW__.renderer.info.render.triangles}}));
    await writeFile(resolve(directory,`${source}-stats.json`),JSON.stringify({...stats,errors},null,2)+'\n');
    console.log(JSON.stringify({source,...stats,errors}));
  }
} finally {await browser.close();}

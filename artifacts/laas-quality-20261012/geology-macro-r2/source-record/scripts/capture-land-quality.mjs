import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {inspectPage,summarize} from './inspect-threejs-canvas.mjs';

const stage=process.argv[2]??'before';
if(!/^[a-z0-9-]+$/.test(stage))throw new Error('Invalid stage');
const url=process.argv[3]??'http://127.0.0.1:4194/?test=1';
const directory=`artifacts/laas-quality-20261012/${stage}`;
const states=['quality-forest-noon','quality-floor-noon','quality-road-noon','quality-sect-golden','quality-valley-golden','coast','coast-rocks','coast-flight'];
await mkdir(directory,{recursive:false});
const runId=`land-quality-20261012-${stage}-${Date.now()}`;
const manifest={version:1,runId,captures:states.map(state=>({mode:'desktop',state,report:`${directory}/${state}.json`}))};
await writeFile(`${directory}/status.json`,JSON.stringify({runId,complete:false},null,2));
let browser;
const deadline=async(promise,ms)=>{
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`Capture operation exceeded ${ms}ms`)),ms);})]);}
  finally{clearTimeout(timer);}
};
try{
await writeFile(`${directory}/evidence.json`,JSON.stringify(manifest,null,2));
const sources=['src/world/LandQualityViews.ts','src/game/Game.ts','src/world/World.ts','src/world/WorldLayout.ts','src/world/ForestLayout.ts','src/world/Atmosphere.ts','src/world/MountainLayout.ts','src/world/NaturalTerrain.ts','src/world/NaturalForest.ts','src/world/WoodlandGeometry.ts','src/world/LimestoneOutcrops.ts','src/world/CoastalEnvironment.ts','src/world/CoastalRocks.ts','src/world/WaterSurface.ts','src/systems/WeatherRenderer.ts','src/core/CameraBoom.ts','src/core/StaticOccluderIndex.ts'];
const geologicalFaces=(await readFile('src/world/World.ts','utf8')).includes("from './GeologicalEscarpments'");
if(geologicalFaces)sources.push('src/world/GeologicalEscarpments.ts');
if((await readFile('src/world/World.ts','utf8')).includes("from './TerrainField'"))sources.push('src/world/TerrainField.ts');
if((await readFile('src/core/CameraBoom.ts','utf8')).includes("from './StaticFaceRaycast'"))sources.push('src/core/StaticFaceRaycast.ts');
sources.push('src/core/StaticBodyCollision.ts');
const separateLandMaterial=(await readFile('src/world/NaturalTerrain.ts','utf8')).includes("from './NaturalLandMaterial'");
if(separateLandMaterial)sources.push('src/world/NaturalLandMaterial.ts');
const rockAssetsExpected=(await readFile(separateLandMaterial?'src/world/NaturalLandMaterial.ts':'src/world/NaturalTerrain.ts','utf8')).includes('uRockColor');
const hashes={};for(const file of sources){
  const bytes=await readFile(file);hashes[file]=createHash('sha256').update(bytes).digest('hex');
  const record=`${directory}/source-record/${file}`;await mkdir(record.slice(0,record.lastIndexOf('/')),{recursive:true});await writeFile(record,bytes);
}
const captureScript=await readFile(new URL(import.meta.url)),captureScriptHash=createHash('sha256').update(captureScript).digest('hex');
await mkdir(`${directory}/source-record/scripts`,{recursive:true});await writeFile(`${directory}/source-record/scripts/capture-land-quality.mjs`,captureScript);
const assets=await readdir('dist/assets'),builtHashes={},builtSources=new Map();
for(const file of assets){
  if(file.endsWith('.js')||file.endsWith('.map'))builtHashes[`dist/assets/${file}`]=createHash('sha256').update(await readFile(`dist/assets/${file}`)).digest('hex');
  if(file.endsWith('.map')){const map=JSON.parse(await readFile(`dist/assets/${file}`,'utf8'));map.sources.forEach((source,i)=>builtSources.set(source,map.sourcesContent?.[i]));}
}
const assetHashes={};
if(rockAssetsExpected)for(const name of ['rock_face_diff_1k.jpg','rock_face_nor_gl_1k.jpg','rock_face_rough_1k.jpg']){
  const path=`/assets/materials/rock-face/${name}`,source=await readFile(`public${path}`),built=await readFile(`dist${path}`);
  if(!source.equals(built))throw new Error(`Preview material asset is stale: ${path}`);
  assetHashes[path]=createHash('sha256').update(source).digest('hex');builtHashes[`dist${path}`]=assetHashes[path];
}
for(const file of sources){
  const built=[...builtSources].find(([name])=>name.endsWith(`/${file}`))?.[1];
  if(built!==await readFile(file,'utf8'))throw new Error(`Preview build is stale or has no matching source map: ${file}`);
}
const browserArgs=['--force-device-scale-factor=1'];
await writeFile(`${directory}/source.json`,JSON.stringify({runId,head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),hashes,sourceRecord:'source-record/',captureScriptHash,builtHashes,assetHashes,geologicalFaces,rockAssetsExpected,sourceMapMatch:true,browserArgs},null,2));
browser=await chromium.launch({channel:'chromium',headless:false,args:browserArgs});
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  const responses=[],servedHashes={};
  page.on('response',response=>{
    const path=new URL(response.url()).pathname;
    if(!path.startsWith('/assets/')||(!path.endsWith('.js')&&!Object.hasOwn(assetHashes,path)))return;
    if(response.status()>=300&&response.status()<400)return;
    // Catch immediately: a body read may fail while the browser is still
    // preparing its next frame. Report it through the normal terminal path.
    responses.push(response.body().then(body=>({path,hash:createHash('sha256').update(body).digest('hex')})).catch(error=>({path,error:String(error)})));
  });
  const active=[];
  for(const capture of manifest.captures){
    const report=await inspectPage(page,{...capture,screenshotPath:capture.report.replace(/\.json$/,'.png'),url,seed:42,wait:0,timeoutMs:30000,runId});
    const buffer=report.result?.drawingBuffer;
    if(report.result?.ok&&(buffer?.width!==1280||buffer?.height!==720)){report.result.ok=false;report.result.reason='physical-buffer-size-mismatch';}
    await writeFile(capture.report,JSON.stringify(report,null,2));console.log(summarize(report,capture.report));
    if(!report.result?.ok||report.pageErrorCount||report.consoleErrorCount)throw new Error(`Capture failed: ${capture.state}`);
    const payloads=await Promise.all(responses);
    if(!payloads.length)throw new Error('No served JavaScript payload was verified');
    for(const payload of payloads){
      if(payload.error)throw new Error(`Served payload could not be read: ${payload.path}: ${payload.error}`);
      if(builtHashes[`dist${payload.path}`]!==payload.hash)throw new Error(`Served JavaScript differs from captured build: ${payload.path}`);
      servedHashes[payload.path]=payload.hash;
    }
    if(rockAssetsExpected&&Object.keys(assetHashes).some(path=>servedHashes[path]!==assetHashes[path]))throw new Error('Not all required material assets were loaded and byte-verified');
    const provenance=JSON.parse(await readFile(`${directory}/source.json`,'utf8'));provenance.servedHashes=servedHashes;
    await writeFile(`${directory}/source.json`,JSON.stringify(provenance,null,2));
    const consoleStart=report.consoleErrorCount,pageStart=report.pageErrorCount;
    await page.evaluate(async state=>{await window.__THREE_GAME_TEST_HOOKS__.setState(state);await window.__THREE_GAME_TEST_HOOKS__.setReducedMotion(false);await window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(false);},capture.state);
    const performanceValid=report.gpu?.softwareRendered===false&&Boolean(report.gpu?.renderer);
    const sampleCount=performanceValid?120:24;
    const performance=await deadline(page.evaluate(sampleCount=>new Promise(resolve=>{
      let warm=0,last=0;const intervals=[];
      function tick(now){if(warm++<20){last=now;requestAnimationFrame(tick);return;}
        intervals.push(now-last);last=now;
        if(intervals.length<sampleCount){requestAnimationFrame(tick);return;}
        const total=intervals.reduce((a,b)=>a+b,0),sorted=[...intervals].sort((a,b)=>a-b),d=window.__THREE_GAME_DIAGNOSTICS__;
        resolve({fps:sampleCount*1000/total,frameMs:total/sampleCount,p50:sorted[Math.floor(sampleCount*.5)],p95:sorted[Math.floor(sampleCount*.95)],intervals,renderer:d.renderer,player:d.player,camera:d.camera,weather:d.weather});
      }requestAnimationFrame(tick);
    }),sampleCount),60000);
    const errors={console:report.consoleErrors.slice(consoleStart),page:report.pageErrors.slice(pageStart)};
    const frozenPosition=report.result.diagnostics.player.position;
    const poseDrift=Math.hypot(performance.player.position.x-frozenPosition.x,performance.player.position.y-frozenPosition.y,performance.player.position.z-frozenPosition.z);
    active.push({state:capture.state,gpu:report.gpu,performanceValid,performance,errors,poseDrift});
    await writeFile(`${directory}/performance.json`,JSON.stringify({runId,viewport:{width:1280,height:720,dpr:1},method:'Unpaused requestAnimationFrame presentation intervals after 20 warmup frames; 120 samples on verified hardware, 24 software diagnostics only; stationary player views, not GPU-only timing',active},null,2));
    if(report.consoleErrorCount>consoleStart||report.pageErrorCount>pageStart)throw new Error(`Active sample errors: ${capture.state}`);
    if(poseDrift>.05)throw new Error(`Frozen/active player pose drifted ${poseDrift}m: ${capture.state}`);
    console.log(`ACTIVE ${capture.state}: ${performanceValid?'hardware':'SOFTWARE - invalid hardware FPS'} ${performance.fps.toFixed(1)} FPS / ${performance.frameMs.toFixed(2)} ms, ${performance.renderer.calls} calls / ${performance.renderer.triangles} triangles`);
  }
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.evaluate(async()=>{await window.__THREE_GAME_TEST_HOOKS__.setState('quality-forest-noon');await window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(false);});
  const start=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__.player.position);
  await page.keyboard.down('KeyW');
  try{await page.waitForFunction(p=>{const q=window.__THREE_GAME_DIAGNOSTICS__.player.position;return Math.hypot(q.x-p.x,q.z-p.z)>8;},start,{timeout:60000});}
  finally{await page.keyboard.up('KeyW');}
  await page.waitForFunction(()=>{const d=window.__THREE_GAME_DIAGNOSTICS__;return d.player.speed<.1&&Math.abs(d.player.position.y-d.coast.ground)<.05;},null,{timeout:10000});
  const walked=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__);
  await page.screenshot({path:`${directory}/real-walk.png`});
  await page.keyboard.press('KeyF');await page.keyboard.down('Space');
  try{await page.waitForFunction(()=>{const d=window.__THREE_GAME_DIAGNOSTICS__;return d.flying&&d.player.position.y-d.coast.ground>15;},null,{timeout:60000});}
  finally{await page.keyboard.up('Space');}
  await page.mouse.move(640,320);await page.mouse.down({button:'right'});await page.mouse.move(800,340,{steps:12});await page.mouse.up({button:'right'});
  const flown=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__);
  await page.screenshot({path:`${directory}/real-flight.png`});
  await page.keyboard.down('KeyC');
  try{await page.waitForFunction(()=>{const d=window.__THREE_GAME_DIAGNOSTICS__;return d.player.position.y-d.coast.ground<3;},null,{timeout:60000});}
  finally{await page.keyboard.up('KeyC');}
  await page.keyboard.press('KeyF');
  await page.waitForFunction(()=>{const d=window.__THREE_GAME_DIAGNOSTICS__;return !d.flying&&Math.abs(d.player.position.y-d.coast.ground)<.05;},null,{timeout:10000});
  const landed=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__);
  await page.screenshot({path:`${directory}/real-land.png`});
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setState('quality-road-noon'));
  const roadStart=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__);
  await page.keyboard.down('KeyA');
  try{await page.waitForFunction(p=>{const q=window.__THREE_GAME_DIAGNOSTICS__.player.position;return Math.hypot(q.x-p.x,q.z-p.z)>3;},roadStart.player.position,{timeout:30000});}
  finally{await page.keyboard.up('KeyA');}
  await page.waitForFunction(()=>{const d=window.__THREE_GAME_DIAGNOSTICS__;return d.player.speed<.1&&Math.abs(d.player.position.y-d.coast.ground)<.05;},null,{timeout:10000});
  const roadEnd=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__);
  await page.screenshot({path:`${directory}/real-road.png`});
  await writeFile(`${directory}/real-input.json`,JSON.stringify({runId,scope:'Smoke: forest walk, vertical sword flight, mouse orbit, landing, 3m road movement. Does not prove full road-width or collision/free-exploration acceptance.',start,walked,flown,landed,roadStart,roadEnd,errors},null,2));
  if(errors.length)throw new Error('Real input produced browser errors');
  if(Math.abs(walked.player.position.y-walked.coast.ground)>.1||Math.abs(landed.player.position.y-landed.coast.ground)>.1||Math.abs(roadEnd.player.position.y-roadEnd.coast.ground)>.1)throw new Error('Real movement did not remain grounded');
  await writeFile(`${directory}/status.json`,JSON.stringify({runId,complete:true,captures:states.length,hardwarePerformanceComplete:active.every(item=>item.performanceValid),realInputSmokeComplete:true},null,2));
}catch(error){
  await writeFile(`${directory}/status.json`,JSON.stringify({runId,complete:false,terminal:true,error:String(error)},null,2));throw error;
}finally{await browser?.close();}

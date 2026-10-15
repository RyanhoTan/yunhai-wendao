import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {posix} from 'node:path';
import {inspectPage,summarize} from './inspect-threejs-canvas.mjs';

const stage=process.argv[2]??'before';
if(!/^[a-z0-9-]+$/.test(stage))throw new Error('Invalid stage');
const url=process.argv[3]??'http://127.0.0.1:4194/?test=1';
const directory=`artifacts/laas-quality-20261012/${stage}`;
const allStates=['quality-forest-noon','quality-floor-noon','quality-road-noon','quality-sect-golden','quality-valley-golden','coast','coast-rocks','coast-flight'];
const availableStates=[...allStates,'quality-upper-road-noon'];
const preparationLimitMs=Number(process.env.LAND_QUALITY_PREPARATION_MS??30000);
if(![30000,60000].includes(preparationLimitMs))throw new Error('Preparation limit must be 30000 or explicit diagnostic 60000');
const states=process.env.LAND_QUALITY_STATES?process.env.LAND_QUALITY_STATES.split(','):allStates;
if(!states.length||new Set(states).size!==states.length||states.some(state=>!availableStates.includes(state)))throw new Error('Invalid capture state subset');
await mkdir(directory,{recursive:false});
const runId=`land-quality-20261012-${stage}-${Date.now()}`;
const manifest={version:1,runId,captures:states.map(state=>({mode:'desktop',state,report:`${directory}/${state}.json`}))};
await writeFile(`${directory}/status.json`,JSON.stringify({runId,complete:false,preparationLimitMs,strict30SecondPreparationGatePassed:false},null,2));
let browser;
const deadline=async(promise,ms)=>{
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`Capture operation exceeded ${ms}ms`)),ms);})]);}
  finally{clearTimeout(timer);}
};
try{
await writeFile(`${directory}/evidence.json`,JSON.stringify(manifest,null,2));
const sources=['src/main.ts','src/world/LandQualityViews.ts','src/game/Game.ts','src/world/World.ts','src/world/WorldLayout.ts','src/world/ForestLayout.ts','src/world/Atmosphere.ts','src/world/MountainLayout.ts','src/world/NaturalTerrain.ts','src/world/NaturalForest.ts','src/world/WoodlandGeometry.ts','src/world/LimestoneOutcrops.ts','src/world/CoastalEnvironment.ts','src/world/CoastalRocks.ts','src/world/WaterSurface.ts','src/systems/WeatherRenderer.ts','src/core/CameraBoom.ts','src/core/StaticOccluderIndex.ts'];
const worldSource=await readFile('src/world/World.ts','utf8');
const geologicalBuilder=worldSource.includes("from './GeologicalEscarpments'");
const geologicalCacheExpected=worldSource.includes("from './GeologicalSurface'");
const geologicalFaces=geologicalBuilder||geologicalCacheExpected;
if(geologicalBuilder)sources.push('src/world/GeologicalEscarpments.ts');
if(geologicalCacheExpected)sources.push('src/world/GeologicalSurfaceCache.ts');
if((await readFile('src/world/World.ts','utf8')).includes("from './TerrainField'"))sources.push('src/world/TerrainField.ts');
if((await readFile('src/core/CameraBoom.ts','utf8')).includes("from './StaticFaceRaycast'"))sources.push('src/core/StaticFaceRaycast.ts');
sources.push('src/core/StaticBodyCollision.ts');
const separateLandMaterial=(await readFile('src/world/NaturalTerrain.ts','utf8')).includes("from './NaturalLandMaterial'");
if(separateLandMaterial)sources.push('src/world/NaturalLandMaterial.ts');
// Follow the runtime forest imports after responsibility splits; each recorded
// implementation still has to match the actual preview source map below.
const forestQueue=['src/world/NaturalForest.ts','src/world/WoodlandGeometry.ts','src/world/NaturalLandMaterial.ts','src/world/GroundCoverObstacles.ts'];
// Terrain structure and rock meshing now have their own runtime modules.
forestQueue.push('src/world/MountainLayout.ts');
if(sources.includes('src/world/TerrainField.ts'))forestQueue.push('src/world/TerrainField.ts');
if(geologicalBuilder)forestQueue.push('src/world/GeologicalEscarpments.ts');
if(geologicalCacheExpected)forestQueue.push('src/world/GeologicalSurfaceCache.ts','src/world/GeologicalSurface.ts');
if((await readFile('src/world/World.ts','utf8')).includes("from './ForestDeadwood'"))forestQueue.push('src/world/ForestDeadwood.ts');
if((await readFile('src/game/Game.ts','utf8')).includes("from './DeadwoodQualityPose'"))forestQueue.push('src/game/DeadwoodQualityPose.ts');
for(let i=0;i<forestQueue.length;i++){
  const file=forestQueue[i],source=await readFile(file,'utf8');if(!sources.includes(file))sources.push(file);
  for(const match of source.matchAll(/from\s+['"]([.][^'"]+)['"]/g)){
    const dependency=posix.normalize(posix.join(posix.dirname(file),`${match[1]}.ts`));
    if(!forestQueue.includes(dependency))forestQueue.push(dependency);
    if(!sources.includes(dependency))sources.push(dependency);
  }
}
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
const forestFloorAssetsExpected=(await readFile('src/world/NaturalLandMaterial.ts','utf8')).includes('loadForestFloorTextures');
const assetHashes={},materialPaths=[];
let geologicalBake=null;
if(geologicalCacheExpected){
  execFileSync(process.execPath,['scripts/bake-geological-surface.mjs','--check'],{stdio:'pipe'});
  geologicalBake=JSON.parse(await readFile('public/assets/terrain/geological/manifest.json','utf8'));
  materialPaths.push('/assets/terrain/geological/manifest.json',`/assets/terrain/geological/${geologicalBake.file}`);
  for(const [file,hash] of Object.entries(geologicalBake.sourceHashes)){
    const bytes=await readFile(file);if(createHash('sha256').update(bytes).digest('hex')!==hash)throw new Error(`Baked source differs: ${file}`);
    const record=`${directory}/baked-source-record/${file}`;await mkdir(record.slice(0,record.lastIndexOf('/')),{recursive:true});await writeFile(record,bytes);
  }
}
if(rockAssetsExpected)materialPaths.push(...['rock_face_diff_1k.jpg','rock_face_nor_gl_1k.jpg','rock_face_rough_1k.jpg'].map(name=>`/assets/materials/rock-face/${name}`));
if(forestFloorAssetsExpected)materialPaths.push(...['forest_floor_diff_1k.jpg','forest_floor_nor_gl_1k.jpg','forest_floor_rough_1k.jpg'].map(name=>`/assets/materials/forest-floor/${name}`));
if((await readFile('src/world/World.ts','utf8')).includes("from './ForestDeadwood'"))materialPaths.push(...['bark_brown_01_diff_1k.jpg','bark_brown_01_nor_gl_1k.jpg','bark_brown_01_rough_1k.jpg'].map(name=>`/assets/materials/deadwood-bark/${name}`));
for(const path of materialPaths){
  const source=await readFile(`public${path}`),built=await readFile(`dist${path}`);
  if(!source.equals(built))throw new Error(`Preview material asset is stale: ${path}`);
  assetHashes[path]=createHash('sha256').update(source).digest('hex');builtHashes[`dist${path}`]=assetHashes[path];
}
const bakedOnlySources=[];
const bakedOnlyAllowlist=new Set(['src/world/GeologicalProtection.ts']);
for(const file of sources){
  const built=[...builtSources].find(([name])=>name.endsWith(`/${file}`))?.[1];
  // Exposure/displacement-only dependencies are removed from the player
  // bundle once terrain is baked. Their proof is the byte-verified bake map,
  // not a nonexistent runtime source map. A present runtime source must match.
  if(built===undefined&&bakedOnlyAllowlist.has(file)&&geologicalBake?.sourceHashes[file]===hashes[file]){bakedOnlySources.push(file);continue;}
  if(built!==await readFile(file,'utf8'))throw new Error(`Preview build is stale or has no matching source map: ${file}`);
}
const browserArgs=['--force-device-scale-factor=1'];
await writeFile(`${directory}/source.json`,JSON.stringify({runId,preparationLimitMs,head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),hashes,sourceRecord:'source-record/',captureScriptHash,builtHashes,assetHashes,geologicalFaces,geologicalBake,bakedOnlySources,rockAssetsExpected,forestFloorAssetsExpected,sourceMapMatch:true,browserArgs},null,2));
browser=await chromium.launch({channel:'chromium',headless:false,args:browserArgs});
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  const responses=[],servedHashes={};
  page.on('response',response=>{
    const path=new URL(response.url()).pathname;
    if(!path.startsWith('/assets/')||(!path.endsWith('.js')&&!Object.hasOwn(assetHashes,path)))return;
    if(response.status()>=300&&response.status()<400)return;
    // Large binary bodies exceed Chromium's inspector response cache. Verify
    // that asset inside the browser instead of retrieving it through CDP.
    if(geologicalBake&&path===`/assets/terrain/geological/${geologicalBake.file}`){responses.push(Promise.resolve({path,browserVerify:true}));return;}
    // Catch immediately: a body read may fail while the browser is still
    // preparing its next frame. Report it through the normal terminal path.
    responses.push(response.body().then(body=>({path,hash:createHash('sha256').update(body).digest('hex')})).catch(error=>({path,error:String(error)})));
  });
  const active=[];
  for(const capture of manifest.captures){
    const report=await inspectPage(page,{...capture,screenshotPath:capture.report.replace(/\.json$/,'.png'),url,seed:42,wait:0,timeoutMs:preparationLimitMs,runId});
    const buffer=report.result?.drawingBuffer;
    if(report.result?.ok&&(buffer?.width!==1280||buffer?.height!==720)){report.result.ok=false;report.result.reason='physical-buffer-size-mismatch';}
    await writeFile(capture.report,JSON.stringify(report,null,2));console.log(summarize(report,capture.report));
    if(!report.result?.ok||report.pageErrorCount||report.consoleErrorCount)throw new Error(`Capture failed: ${capture.state}`);
    const payloads=await Promise.all(responses);
    if(!payloads.length)throw new Error('No served JavaScript payload was verified');
    for(const payload of payloads){
      if(payload.browserVerify){
        if(servedHashes[payload.path])continue;
        const proof=await page.evaluate(async path=>{
          const response=await fetch(path,{cache:'force-cache'});if(!response.ok)throw new Error(`Asset HTTP ${response.status}`);
          const bytes=await response.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
          return {bytes:bytes.byteLength,hash:Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('')};
        },payload.path);
        if(proof.bytes!==geologicalBake.byteLength||proof.hash!==geologicalBake.sha256)throw new Error('Browser geological binary differs from baked build');
        payload.hash=proof.hash;
      }
      if(payload.error)throw new Error(`Served payload could not be read: ${payload.path}: ${payload.error}`);
      if(builtHashes[`dist${payload.path}`]!==payload.hash)throw new Error(`Served JavaScript differs from captured build: ${payload.path}`);
      servedHashes[payload.path]=payload.hash;
    }
    if(rockAssetsExpected&&Object.keys(assetHashes).some(path=>servedHashes[path]!==assetHashes[path]))throw new Error('Not all required material assets were loaded and byte-verified');
    const provenance=JSON.parse(await readFile(`${directory}/source.json`,'utf8'));provenance.servedHashes=servedHashes;
    if(geologicalBake)provenance.geologicalBinaryVerification='browser-fetch-arraybuffer-sha256';
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
  await writeFile(`${directory}/status.json`,JSON.stringify({runId,complete:true,captures:states.length,fullRequiredCoverage:allStates.every(state=>states.includes(state)),preparationLimitMs,strict30SecondPreparationGatePassed:preparationLimitMs===30000,scope:preparationLimitMs===60000?'Complete visual/input/asset capture with explicit extended preparation; strict 30s startup gate remains unpassed. Neither budget norLAAS visual acceptance.':'Complete visual/input/asset capture; neither budget nor LAAS visual acceptance.',hardwarePerformanceComplete:active.every(item=>item.performanceValid),realInputSmokeComplete:true},null,2));
}catch(error){
  await writeFile(`${directory}/status.json`,JSON.stringify({runId,complete:false,terminal:true,error:String(error)},null,2));throw error;
}finally{await browser?.close();}

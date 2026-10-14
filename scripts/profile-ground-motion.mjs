import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const stage=process.argv[2];
if(!/^ground-motion-[a-z0-9-]+$/.test(stage??''))throw new Error('Invalid motion stage');
const out=`artifacts/laas-quality-20261012/${stage}`;
await mkdir(out,{recursive:false});
const files=['GroundCover','GroundCoverGeometry','GroundCoverPlacement','GroundCoverMaterials','GroundCoverObstacles','GroundCoverage','GroundUnderstoryGeometry','ForestFloorMaterial','NaturalLandMaterial','NaturalForest','TerrainField','World','WoodlandRenderCells','WoodlandMaterials'].map(name=>`src/world/${name}.ts`);
if((await readFile('src/world/World.ts','utf8')).includes("from './ForestDeadwood'"))files.push(...['ForestDeadwood','ForestDeadwoodGeometry','ForestDeadwoodMaterial','WoodlandPrimitives'].map(name=>`src/world/${name}.ts`),'src/core/StaticBodyCollision.ts','src/game/Game.ts','src/game/DeadwoodQualityPose.ts','src/main.ts');
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
const report={complete:false,sourceHashes:await hashes(),errors:[],scope:'Continuous real keyboard travel with independent RAF recording and no screenshots during timing. Browser frame intervals include CPU/GPU scheduling; they are not GPU timer queries.'};
const builtHashes={},builtSources=new Map();
for(const file of await readdir('dist/assets')){
  if(!file.endsWith('.js')&&!file.endsWith('.map'))continue;
  const bytes=await readFile(`dist/assets/${file}`);builtHashes[`/assets/${file}`]=createHash('sha256').update(bytes).digest('hex');
  if(file.endsWith('.map')){const map=JSON.parse(bytes);map.sources.forEach((source,i)=>builtSources.set(source,map.sourcesContent[i]));}
}
for(const file of files)if([...builtSources].find(([name])=>name.endsWith(`/${file}`))?.[1]!==await readFile(file,'utf8'))throw new Error(`Stale motion build: ${file}`);
report.builtHashes=builtHashes;report.sourceMapMatch=true;
const save=()=>writeFile(`${out}/status.json`,JSON.stringify(report,null,2)+'\n');
await save();
const browser=await chromium.launch({channel:'chromium',headless:false,args:['--force-device-scale-factor=1']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  const payloads=[];
  page.on('response',response=>{const path=new URL(response.url()).pathname;if(path.startsWith('/assets/')&&path.endsWith('.js')&&response.status()===200)payloads.push(response.body().then(bytes=>({path,hash:createHash('sha256').update(bytes).digest('hex')})).catch(error=>({path,error:String(error)})));});
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.goto('http://127.0.0.1:4194/?test=1');
  await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
  await page.evaluate(async()=>{await window.__THREE_GAME_TEST_HOOKS__.setState('quality-forest-noon');await window.__THREE_GAME_TEST_HOOKS__.setReducedMotion(false);await window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(false);});
  await page.waitForTimeout(1500);
  report.gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
  if(/swiftshader|llvmpipe/i.test(report.gpu))throw new Error('Hardware renderer required');
  report.start=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__);
  await page.evaluate(()=>{
    window.__groundMotion={running:true,frames:[],last:performance.now()};
    const tick=now=>{const sample=window.__groundMotion;if(!sample.running)return;const d=window.__THREE_GAME_DIAGNOSTICS__;sample.frames.push({ms:now-sample.last,x:d.player.position.x,z:d.player.position.z,gap:d.player.position.y-d.coast.ground,calls:d.renderer.calls,triangles:d.renderer.triangles,geometries:d.renderer.geometries,textures:d.renderer.textures});sample.last=now;requestAnimationFrame(tick);};requestAnimationFrame(tick);
  });
  await page.keyboard.down('KeyW');try{await page.waitForTimeout(10000);}finally{await page.keyboard.up('KeyW');}
  report.turn=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__);
  await page.keyboard.down('KeyS');try{await page.waitForTimeout(10000);}finally{await page.keyboard.up('KeyS');}
  await page.waitForTimeout(500);
  report.end=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__);
  const frames=await page.evaluate(()=>{window.__groundMotion.running=false;return window.__groundMotion.frames;});
  await writeFile(`${out}/frames.json`,JSON.stringify(frames)+'\n');
  const sorted=frames.map(frame=>frame.ms).sort((a,b)=>a-b),sum=sorted.reduce((a,b)=>a+b,0);
  report.performance={samples:frames.length,fps:frames.length*1000/sum,meanMs:sum/frames.length,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],p99:sorted[Math.floor(sorted.length*.99)],maxMs:sorted.at(-1),over50ms:sorted.filter(ms=>ms>50).length,over100ms:sorted.filter(ms=>ms>100).length};
  report.distance=Math.hypot(report.turn.player.position.x-report.start.player.position.x,report.turn.player.position.z-report.start.player.position.z);
  report.maxGroundGap=Math.max(...frames.map(frame=>Math.abs(frame.gap)));
  report.sourceHashesAtEnd=await hashes();
  report.servedHashes={};
  for(const payload of await Promise.all(payloads)){
    if(payload.error||builtHashes[payload.path]!==payload.hash)throw new Error(`Unverified motion payload: ${payload.path}`);
    report.servedHashes[payload.path]=payload.hash;
  }
  if(!Object.keys(report.servedHashes).length)throw new Error('No motion build payload verified');
  await page.screenshot({path:`${out}/returned.png`});
  if(JSON.stringify(report.sourceHashes)!==JSON.stringify(report.sourceHashesAtEnd))throw new Error('Source changed during motion');
  if(report.errors.length||report.maxGroundGap>.08||report.distance<16)throw new Error('Motion validation failed');
  report.complete=true;await save();console.log(JSON.stringify({complete:report.complete,distance:report.distance,performance:report.performance}));
}catch(error){report.error=String(error);await save();throw error;}
finally{await browser.close();}

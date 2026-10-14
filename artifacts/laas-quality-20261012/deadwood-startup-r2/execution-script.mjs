import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const stage=process.argv[2];if(!/^deadwood-startup-[a-z0-9-]+$/.test(stage??''))throw new Error('Invalid startup stage');
const out=`artifacts/laas-quality-20261012/${stage}`;await mkdir(out,{recursive:false});
const files=['src/main.ts','src/game/Game.ts','src/world/World.ts','src/world/ForestDeadwood.ts','src/world/ForestDeadwoodGeometry.ts','src/world/ForestDeadwoodMaterial.ts','src/core/StaticBodyCollision.ts'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
const report={complete:false,timings:[],errors:[],sourceHashes:await hashes(),scope:'Diagnostic 60s observation per hook; does not relax the unchanged 30s final capture gate or prove the cause of earlier timeout.'};
const builtHashes={},sources=new Map();
for(const name of await readdir('dist/assets')){if(!name.endsWith('.js')&&!name.endsWith('.map'))continue;const bytes=await readFile(`dist/assets/${name}`);builtHashes[`/assets/${name}`]=createHash('sha256').update(bytes).digest('hex');if(name.endsWith('.map')){const map=JSON.parse(bytes);map.sources.forEach((name,i)=>sources.set(name,map.sourcesContent[i]));}}
for(const file of files)if([...sources].find(([name])=>name.endsWith(`/${file}`))?.[1]!==await readFile(file,'utf8'))throw new Error(`Stale startup build: ${file}`);
report.builtHashes=builtHashes;report.sourceMapMatch=true;
const scriptBytes=await readFile(new URL(import.meta.url));report.scriptSha256=createHash('sha256').update(scriptBytes).digest('hex');await writeFile(`${out}/execution-script.mjs`,scriptBytes);
const save=()=>writeFile(`${out}/status.json`,JSON.stringify(report,null,2)+'\n');await save();
const browser=await chromium.launch({channel:'chromium',headless:false,args:['--force-device-scale-factor=1']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
 const payloads=[];page.on('response',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/assets/')&&path.endsWith('.js')&&r.status()===200)payloads.push(r.body().then(bytes=>({path,hash:createHash('sha256').update(bytes).digest('hex')})));});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 const step=async(name,callback)=>{const start=performance.now();let timer;try{await Promise.race([callback(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${name} exceeded diagnostic 60s`)),60000);})]);report.timings.push({name,ms:performance.now()-start});await save();}finally{clearTimeout(timer);}};
 await step('navigation',()=>page.goto('http://127.0.0.1:4194/?test=1'));
 await step('seed_waits_actual_game_ready',()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.seed(1)));
 await step('actual_forest_state_and_render',()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setState('quality-forest-noon')));
 await step('reduced_motion_and_second_render',()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setReducedMotion(true)));
 await step('pause',()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true)));
 await step('font_ready',()=>page.evaluate(()=>document.fonts.ready));
 report.construction=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.inspectDecomposition(false));
 report.diagnostics=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__);
 report.gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
 await page.screenshot({path:`${out}/forest.png`});report.sourceHashesAtEnd=await hashes();
 report.servedHashes={};for(const payload of await Promise.all(payloads)){if(builtHashes[payload.path]!==payload.hash)throw new Error(`Unverified startup payload: ${payload.path}`);report.servedHashes[payload.path]=payload.hash;}if(!Object.keys(report.servedHashes).length)throw new Error('No startup payload verified');
 if(JSON.stringify(report.sourceHashes)!==JSON.stringify(report.sourceHashesAtEnd)||report.errors.length||/swiftshader|llvmpipe/i.test(report.gpu))throw new Error('Unverified diagnostic render');
 report.complete=true;await save();console.log(JSON.stringify({complete:true,timings:report.timings,gpu:report.gpu}));
}catch(error){report.error=String(error);await save();throw error;}finally{await browser.close();}

import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const stage=process.argv[2];
if(!stage||!/^[a-z0-9-]+$/.test(stage))throw new Error('Provide a new lowercase stage');
const out=`artifacts/laas-quality-20261012/${stage}`;await mkdir(out,{recursive:false});
const hashes={};
for(const file of ['src/world/WoodlandTree.ts','src/world/WoodlandPrimitives.ts','src/world/WoodlandMaterials.ts','src/world/WoodlandLOD.ts','src/world/GroundCoverage.ts','artifacts/laas-quality-20261012/canopy-probe.html','scripts/measure-canopy-coverage.mjs']){
  const bytes=await readFile(file);hashes[file]=createHash('sha256').update(bytes).digest('hex');
  const path=`${out}/source-record/${file}`;await mkdir(path.slice(0,path.lastIndexOf('/')),{recursive:true});await writeFile(path,bytes);
}
const channel=process.env.CANOPY_BROWSER_CHANNEL??'chromium';
const browser=await chromium.launch({channel,headless:false,args:['--force-device-scale-factor=1']});
const errors=[],rows=[];
try{
  const page=await browser.newPage({viewport:{width:768,height:768},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(process.argv[3]??'http://127.0.0.1:5188/artifacts/laas-quality-20261012/canopy-probe.html');
  await page.waitForFunction(()=>window.canopyProbeReady,{},{timeout:30000});
  const seeds=process.env.CANOPY_PROBE_ALL_ARCHITECTURES==='1'?Array.from({length:12},(_,i)=>i):[3,4,5];
  for(const seedIndex of seeds)for(const angle of [0,45,90,135])for(const level of [0,1,2]){
    const row=await page.evaluate(args=>window.measureCanopy(...args),[seedIndex,level,angle,120]);rows.push(row);
    await page.screenshot({path:`${out}/tree-${seedIndex}-${angle}-lod${level}.png`});
  }
  const comparisons=rows.filter(r=>r.level===0).map(near=>{
    const levels=rows.filter(r=>r.seedIndex===near.seedIndex&&r.angle===near.angle);
    return {seedIndex:near.seedIndex,angle:near.angle,nearArea:near.area,midRatio:levels[1].area/near.area,farRatio:levels[2].area/near.area};
  });
  const valid=!errors.length&&rows.every(r=>r.area>0&&Number.isFinite(r.area));
  await writeFile(`${out}/coverage.json`,JSON.stringify({complete:valid,diagnosticOnly:true,channel,method:'Same actual geometry/material/atlas/mips/alphaToCoverage. Surviving RGB white, linear output, black background; summed resolved pixel luminance. No trunk, terrain, lighting or fog. Not player-view acceptance.',hashes,rows,comparisons,errors},null,2));
  console.log(JSON.stringify({out,comparisons,errors}));
  if(!valid)throw new Error('Invalid coverage rendering; see coverage.json');
}finally{await browser.close();}

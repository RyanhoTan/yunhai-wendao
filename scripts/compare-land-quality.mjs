import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {PNG} from 'pngjs';

const [before,after,output]=process.argv.slice(2);
if(![before,after,output].every(x=>typeof x==='string'&&/^[a-z0-9-]+$/.test(x)))throw new Error('Supply before, after and output stage names');
const root='artifacts/laas-quality-20261012';
const json=async path=>JSON.parse(await readFile(path,'utf8'));
for(const stage of [before,after])if(!(await json(`${root}/${stage}/status.json`)).complete)throw new Error(`Incomplete capture: ${stage}`);
const states=['quality-forest-noon','quality-floor-noon','quality-road-noon','quality-sect-golden','quality-valley-golden','coast','coast-rocks','coast-flight'];
const regions={
  coast:{ocean:{x:350,y:288,width:220,height:36},shore:{x:900,y:325,width:160,height:120}},
  'coast-rocks':{ocean:{x:350,y:276,width:220,height:35},shore:{x:850,y:345,width:220,height:140}},
  'coast-flight':{ocean:{x:50,y:310,width:220,height:210},shore:{x:950,y:324,width:100,height:55}},
};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function difference(a,b,region){
  let sum=0,squares=0,changed=0,max=0;
  for(let y=region.y;y<region.y+region.height;y++)for(let x=region.x;x<region.x+region.width;x++){
    let pixelMax=0;
    for(let c=0;c<3;c++){const d=Math.abs(a.data[(y*a.width+x)*4+c]-b.data[(y*b.width+x)*4+c]);sum+=d;squares+=d*d;pixelMax=Math.max(pixelMax,d);}
    if(pixelMax>3)changed++;max=Math.max(max,pixelMax);
  }
  const pixels=region.width*region.height;
  return {region,meanAbsoluteChannelDifference:sum/(pixels*3),rms:Math.sqrt(squares/(pixels*3)),changedOver3Pixels:changed,changedPercent:changed/pixels*100,maxDifference:max};
}
const beforePerf=await json(`${root}/${before}/performance.json`),afterPerf=await json(`${root}/${after}/performance.json`);
const compact=(report,state)=>{const row=report.active.find(x=>x.state===state);return {hardwareValid:row.performanceValid,fps:row.performance.fps,frameMs:row.performance.frameMs,p95:row.performance.p95,renderer:row.performance.renderer};};
const rows=[];
for(const state of states){
  const a=(await json(`${root}/${before}/${state}.json`)).result.diagnostics,b=(await json(`${root}/${after}/${state}.json`)).result.diagnostics;
  const ap=PNG.sync.read(await readFile(`${root}/${before}/${state}.png`)),bp=PNG.sync.read(await readFile(`${root}/${after}/${state}.png`));
  if(ap.width!==1280||ap.height!==720||bp.width!==1280||bp.height!==720)throw new Error(`Physical buffer differs: ${state}`);
  const row={state,playerDelta:distance(a.player.position,b.player.position),cameraDelta:distance(a.camera.position,b.camera.position),targetDelta:distance(a.camera.target,b.camera.target),beforeHour:a.weather.manualHour,afterHour:b.weather.manualHour,beforeCloud:a.weather.cloudCover,afterCloud:b.weather.cloudCover,wholeImage:difference(ap,bp,{x:0,y:0,width:1280,height:720}),beforePerformance:compact(beforePerf,state),afterPerformance:compact(afterPerf,state)};
  for(const [key,region] of Object.entries(regions[state]??{}))row[key]=difference(ap,bp,region);
  rows.push(row);
}
const samePoseAndTime=rows.every(r=>r.playerDelta<1e-9&&r.cameraDelta<1e-9&&r.targetDelta<1e-9&&r.beforeHour===r.afterHour&&r.beforeCloud===r.afterCloud);
const coastalRegionsWithin3=rows.filter(r=>r.ocean).every(r=>r.ocean.changedOver3Pixels===0&&r.shore.changedOver3Pixels===0);
const hardwarePerformanceValid=rows.every(r=>r.beforePerformance.hardwareValid&&r.afterPerformance.hardwareValid);
await mkdir(`${root}/${output}`,{recursive:true});
await writeFile(`${root}/${output}/comparison.json`,JSON.stringify({before,after,samePoseAndTime,coastalRegionsWithin3,hardwarePerformanceValid,method:'Unedited raw PNG RGB difference. Coastal ocean/shore rectangles retain the first-unit regions, exclude UI/hero/far land. Whole-image changes retained. Differences and short RAF intervals do not establish aesthetic quality or sustained GPU timing.',rows},null,2)+'\n');
console.log(JSON.stringify({before,after,samePoseAndTime,coast:rows.filter(r=>r.ocean).map(r=>({state:r.state,wholeChangedPercent:r.wholeImage.changedPercent,ocean:r.ocean.maxDifference,shore:r.shore.maxDifference}))},null,2));
if(!samePoseAndTime)throw new Error('Comparison is not at equal player/camera/time');
if(!coastalRegionsWithin3)throw new Error('Protected coastal regions have changes above three channel levels');
if(!hardwarePerformanceValid)throw new Error('Hardware performance comparison is unverified');

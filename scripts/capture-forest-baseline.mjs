import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';

// Reproduce the committed forest with the current geological world and the
// same collision-free player pose. Preserve exact working bytes even on error.
const stage=process.argv[2];
if(!/^before-forest-fixed-camera-[a-z0-9-]+$/.test(stage??''))throw new Error('Invalid baseline stage');
const audit=`artifacts/laas-quality-20261012/${stage}-restoration`;
await mkdir(audit,{recursive:false});
const files=['src/world/NaturalForest.ts','src/world/WoodlandGeometry.ts'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const originals=new Map(),legacy=new Map();
const report={complete:false,head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),before:{},legacy:{},restored:{},steps:[],adapter:'Only the committed NaturalForest return value gains empty cameraOccluders and a no-op prepareRender. Tree geometry, placement, materials and legacy LOD remain committed bytes. Current geology, ocean and corrected player fixture remain unchanged.'};
const save=()=>writeFile(`${audit}/status.json`,JSON.stringify(report,null,2)+'\n');
const run=(name,cmd,args)=>{
  const r=spawnSync(cmd,args,{stdio:['ignore','pipe','pipe'],encoding:'utf8',maxBuffer:16*1024*1024});
  const output=(r.stdout??'')+(r.stderr??'');process.stdout.write(output);
  report.steps.push({name,exitCode:r.status,error:r.error?.message});
  return {r,output};
};
for(const file of files){
  const bytes=await readFile(file),committed=execFileSync('git',['show',`HEAD:${file}`]);
  originals.set(file,bytes);report.before[file]=sha(bytes);report.legacy[file]={committedSha256:sha(committed)};
  let input=committed;
  if(file.endsWith('NaturalForest.ts')){
    const old='return {colliders,update(elapsed:number){time.value=elapsed;}};';
    const source=committed.toString('utf8');
    if(source.split(old).length!==2)throw new Error('Committed forest return interface changed');
    input=Buffer.from(source.replace(old,'return {colliders,cameraOccluders:[] as THREE.Box3[],prepareRender(_camera:THREE.Camera){},update(elapsed:number){time.value=elapsed;}};'));
  }
  legacy.set(file,input);report.legacy[file].adaptedSha256=sha(input);
  await mkdir(`${audit}/original/src/world`,{recursive:true});await writeFile(`${audit}/original/${file}`,bytes);
}
await save();
let failure;
try{
  for(const file of files)await writeFile(file,legacy.get(file));
  for(const [name,cmd,args] of [['build-before','npm',['run','build']],['capture-before','node',['scripts/capture-land-quality.mjs',stage]]]){
    const {r,output}=run(name,cmd,args);await writeFile(`${audit}/${name}.txt`,output);await save();
    if(r.status!==0)throw new Error(`${name} failed with ${r.status}: ${r.error?.message??''}`);
  }
}catch(error){failure=error;report.error=String(error);}
finally{
  for(const [file,bytes] of originals){await writeFile(file,bytes);report.restored[file]=sha(await readFile(file));}
  report.restorationMatches=files.every(file=>report.before[file]===report.restored[file]);
  await save();
  const {r,output}=run('build-restored','npm',['run','build']);await writeFile(`${audit}/build-restored.txt`,output);
  if(r.status!==0)failure??=new Error(`Restored build failed with ${r.status}`);
  report.complete=!failure&&report.restorationMatches;await save();
}
if(failure)throw failure;
console.log(JSON.stringify({baseline:stage,restorationMatches:report.restorationMatches,complete:report.complete}));

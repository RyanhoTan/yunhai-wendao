import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(directory,'../../..');
const names=['src/world/ForestDeadwoodGeometry.ts','src/world/WoodlandPrimitives.ts'];
const hashSources=()=>Object.fromEntries(names.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(repo,name))).digest('hex')]));
const expected="f4cc0cc0d5c305fdc1fa2a529704a94af2de7746707911cbfd87e61078866962";
const previous=JSON.parse(fs.readFileSync(path.join(directory,'previous-executed-result.json'),'utf8'));
const startTimeUtc=new Date().toISOString(),sourceHashStart=hashSources();
let result,stderr='',exception=null;
try {
 if(sourceHashStart[names[0]]!==expected)throw new Error('Frozen primary source changed; refusing to validate a different source as r1.');
 const stdout=execFileSync(process.execPath,[path.join(directory,'validate-original.mjs')],{cwd:repo,encoding:'utf8',maxBuffer:8*1024*1024});
 fs.writeFileSync(path.join(directory,'replay-console.json'),stdout);
 result=JSON.parse(stdout);
} catch(error){exception=String(error);stderr=error.stderr?.toString()??'';}
const sourceHashEnd=hashSources(),endTimeUtc=new Date().toISOString(),sameSource=JSON.stringify(sourceHashStart)===JSON.stringify(sourceHashEnd);
const metrics={...previous,status:exception?'cpu_replay_failed':result.errorCount||!sameSource?'cpu_failed':'cpu_passed',...result,startTimeUtc,endTimeUtc,sourceHashStart,sourceHashEnd,sameSource,expectedFrozenPrimarySha256:expected,exception,stderr,sourceHashRecordingNote:'本次复跑在调用原始192样本脚本前后记录源码与Writer依赖SHA；旧终态数值保留于previous-executed-result.json。'};
fs.writeFileSync(path.join(directory,'metrics.json'),JSON.stringify(metrics,null,2)+'\n');
fs.writeFileSync(path.join(directory,'source-hashes.json'),JSON.stringify({startTimeUtc,endTimeUtc,sourceHashStart,sourceHashEnd,sameSource,expectedFrozenPrimarySha256:expected},null,2)+'\n');
console.log(JSON.stringify({status:metrics.status,errorCount:metrics.errorCount,sameSource,sourceHashStart,sourceHashEnd},null,2));
if(metrics.status!=='cpu_passed')process.exitCode=1;

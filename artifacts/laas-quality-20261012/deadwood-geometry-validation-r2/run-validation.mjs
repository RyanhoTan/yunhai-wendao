import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(directory,'../../..');
const names=['src/world/ForestDeadwoodGeometry.ts','src/world/WoodlandPrimitives.ts'];
const hashSources=()=>Object.fromEntries(names.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(repo,name))).digest('hex')]));
const plan=JSON.parse(fs.readFileSync(path.join(directory,'validation-plan.json'),'utf8'));
const startTimeUtc=new Date().toISOString(),sourceHashStart=hashSources();
let result=null,exception=null,stderr='';
try {
 if(sourceHashStart[names[0]]!==plan.sourceCandidateSha256)throw new Error('Candidate source changed; update the explicit plan before validating a different revision.');
 const stdout=execFileSync(process.execPath,[path.join(directory,'validate-original.mjs')],{cwd:repo,encoding:'utf8',maxBuffer:8*1024*1024});
 fs.writeFileSync(path.join(directory,'replay-console.json'),stdout);
 result=JSON.parse(stdout);
} catch(error){exception=String(error);stderr=error.stderr?.toString()??'';}
const endTimeUtc=new Date().toISOString(),sourceHashEnd=hashSources(),sameSource=JSON.stringify(sourceHashStart)===JSON.stringify(sourceHashEnd);
const metrics={...plan,...result,status:exception?'cpu_failed':result.errorCount||!sameSource?'cpu_failed':'cpu_passed',startTimeUtc,endTimeUtc,sourceHashStart,sourceHashEnd,sameSource,exception,stderr};
fs.writeFileSync(path.join(directory,'metrics.json'),JSON.stringify(metrics,null,2)+'\n');
fs.writeFileSync(path.join(directory,'source-hashes.json'),JSON.stringify({startTimeUtc,endTimeUtc,sourceHashStart,sourceHashEnd,sameSource},null,2)+'\n');
console.log(JSON.stringify({status:metrics.status,errorCount:metrics.errorCount,sameSource,sourceHashStart,sourceHashEnd,stats:metrics.stats},null,2));
if(metrics.status!=='cpu_passed')process.exitCode=1;


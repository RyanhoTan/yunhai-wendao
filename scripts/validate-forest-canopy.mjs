import {mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const stage=process.argv[2]??`forest-canopy-validation-${Date.now()}`;
if(!/^forest-canopy-validation-[a-z0-9-]+$/.test(stage))throw new Error('Invalid canopy validation stage');
const out=`artifacts/laas-quality-20261012/${stage}`;
// Reject the entire occupied directory before Playwright can clear old traces.
await mkdir(out,{recursive:false});
const run=spawnSync('npx',['playwright','test','tests/forest-canopy.spec.ts','--workers=1',`--output=${out}/playwright-results`],{env:{...process.env,FOREST_CANOPY_VALIDATION_STAGE:stage},encoding:'utf8',maxBuffer:16*1024*1024});
await writeFile(`${out}/terminal.txt`,(run.stdout??'')+(run.stderr??''));
process.stdout.write(run.stdout??'');process.stderr.write(run.stderr??'');
if(run.error)throw run.error;
process.exitCode=run.status??1;

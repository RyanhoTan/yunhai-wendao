import {createServer} from 'vite';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const stage=process.argv[2];if(!stage||!/^[a-z0-9-]+$/.test(stage))throw new Error('Provide a new stage');
const out=`artifacts/laas-quality-20261012/${stage}`;await mkdir(out,{recursive:false});
const beforePath='src/world/.ForestPopulationBefore.ts',afterPath='src/world/.ForestPopulationAfter.ts';
const before=execFileSync('git',['show','cec0a53:src/world/WoodlandPopulation.ts'],{encoding:'utf8'});
const after=await readFile('src/world/WoodlandPopulation.ts','utf8');
const treeOnly=(source,old)=>source.slice(0,source.indexOf('  const grass=['))+`  return {trees,cameraOccluders${old?'':',legacyTreeCount,habitatStats'}};\n}\n`;
await writeFile(beforePath,treeOnly(before.replace('{FOREST_GROVES,woodlandCover}', '{FOREST_GROVES,legacyWoodlandCover as woodlandCover}'),true));
await writeFile(afterPath,treeOnly(after,false));
let server;
try{
  server=await createServer({server:{middlewareMode:true,watch:null},appType:'custom'});
  const {terrainHeight,protectedPoint}=await server.ssrLoadModule('/src/world/World.ts');
  const baseline=(await server.ssrLoadModule(`/${beforePath}`)).createWoodlandPopulation(terrainHeight,protectedPoint);
  const current=(await server.ssrLoadModule(`/${afterPath}`)).createWoodlandPopulation(terrainHeight,protectedPoint);
  assert.equal(current.legacyTreeCount,baseline.trees.length);
  assert.deepEqual(JSON.parse(JSON.stringify(current.trees.slice(0,current.legacyTreeCount))),JSON.parse(JSON.stringify(baseline.trees)),'All original positions, matrices, species, age and colliders remain identical');
  assert.deepEqual(current.cameraOccluders.slice(0,baseline.cameraOccluders.length),baseline.cameraOccluders);
  let minimumSpacing=Infinity;
  for(let i=0;i<current.trees.length;i++){
    const t=current.trees[i];assert.equal(protectedPoint(t.x,t.z,t.canopyRadius+.4),false);
    assert.ok(t.y<=terrainHeight(t.x,t.z)&&t.y>terrainHeight(t.x,t.z)-.67);
    if(i>=current.legacyTreeCount)assert.ok(t.z<=78);
    for(let j=0;j<i;j++)minimumSpacing=Math.min(minimumSpacing,Math.hypot(t.x-current.trees[j].x,t.z-current.trees[j].z));
  }
  assert.ok(minimumSpacing>=5.8);
  for(const band of current.habitatStats){assert.ok(band.accepted>0&&band.accepted<=band.limit);assert.equal(band.ageCounts.reduce((a,b)=>a+b,0),band.accepted);}
  const serialize=JSON.stringify(baseline.trees),baselineSha=createHash('sha256').update(serialize).digest('hex');
  await writeFile(`${out}/legacy-trees.json`,serialize);
  await writeFile(`${out}/result.json`,JSON.stringify({complete:true,scope:'Actual height/protection/root/spacing and exact old/new legacy trees + camera volumes. Tree phase only; rendering, ground layers and player views are separate checks.',baselineRef:'cec0a53',baselineSha,legacyTreeCount:current.legacyTreeCount,treeCount:current.trees.length,minimumSpacing,habitatStats:current.habitatStats},null,2));
  console.log(JSON.stringify({treeCount:current.trees.length,legacyTreeCount:current.legacyTreeCount,minimumSpacing,habitatStats:current.habitatStats}));
}finally{await server?.close();await unlink(beforePath);await unlink(afterPath);}

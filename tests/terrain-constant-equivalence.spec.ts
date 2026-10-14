import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import * as baseline from '../artifacts/laas-quality-20261012/deadwood-terrain-constant-r1/baseline-TerrainField';
import * as current from '../src/world/TerrainField';

test('fixed clearing and trail heights preserve the complete heightfield and fractional coast samples',async()=>{
  test.setTimeout(180000);
  const directory='artifacts/laas-quality-20261012/deadwood-terrain-constant-r1';
  const files=['src/world/TerrainField.ts','tests/terrain-constant-equivalence.spec.ts',`${directory}/original-TerrainField.ts`,`${directory}/baseline-TerrainField.ts`];
  const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
  const sourceHashes=await hashes(),points:number[][]=[];
  for(let z=-322;z<=162;z++)for(let x=-562;x<=322;x++)points.push([x,z]);
  let seed=837461;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<30000;i++)points.push([-565+random()*890,-325+random()*490]);
  // Exercise the coastline's uncached authored path and interpolation edges.
  for(const z of [119,120,125.999,126,145.999,146,146.001,159.5,160])for(let x=-562;x<=322;x+=.5)points.push([x,z]);
  const measure=(field:typeof current)=>{
    const values=new Float64Array(points.length*2),start=performance.now();
    points.forEach(([x,z],i)=>{values[i*2]=field.terrainSurfaceHeight(x,z);values[i*2+1]=field.terrainHeight(x,z);});
    return {values,ms:performance.now()-start};
  };
  const old=measure(baseline),next=measure(current),oldBytes=Buffer.from(old.values.buffer),nextBytes=Buffer.from(next.values.buffer);
  let differences=0;const examples:unknown[]=[];
  for(let i=0;i<old.values.length;i++)if(!Object.is(old.values[i],next.values[i])||!Number.isFinite(next.values[i])){differences++;if(examples.length<10)examples.push({point:points[Math.floor(i/2)],function:i%2?'terrainHeight':'terrainSurfaceHeight',before:old.values[i],after:next.values[i]});}
  const sourceHashesAtEnd=await hashes();
  const report={sourceHashes,sourceHashesAtEnd,points:points.length,values:old.values.length,differences,examples,rawFloat64BytesEqual:oldBytes.equals(nextBytes),baselineSha256:createHash('sha256').update(oldBytes).digest('hex'),currentSha256:createHash('sha256').update(nextBytes).digest('hex'),timings:{baselineMs:old.ms,currentMs:next.ms},scope:'All integer lattice points across the complete map plus 30000 deterministic fractional positions and explicit coast boundaries. Pure CPU height equivalence; neither FPS nor final visual acceptance.'};
  await writeFile(`${directory}/metrics.json`,JSON.stringify(report,null,2)+'\n');
  expect(sourceHashesAtEnd).toEqual(sourceHashes);expect(differences).toBe(0);expect(oldBytes.equals(nextBytes)).toBe(true);
});

import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createGeologicalDisplacement} from '../src/world/GeologicalDisplacement';
import {terrainSurfaceHeight,rockSurfaceExposure} from '../src/world/TerrainField';
import {canonicalGeologicalBase} from '../src/world/GeologicalFaceRefinement';

test('former worst road-cliff edges remain continuous across the old clipping threshold',async()=>{
  const stage=process.env.DISPLACEMENT_VALIDATION_STAGE??'geological-displacement';
  if(!/^[a-z0-9-]+$/.test(stage))throw new Error('Invalid displacement validation stage');
  const input=JSON.parse(await readFile('artifacts/laas-quality-20261012/summit-structure-validation-r9/refinement.json','utf8'));
  const output:unknown[]=[];
  for(const edge of input.worstCurvatureEdges){
    const eligible=new Set<string>(),a=new THREE.Vector3().fromArray(edge.baseA),b=new THREE.Vector3().fromArray(edge.baseB);
    const cx=Math.floor(a.x),cz=Math.floor(a.z);
    for(let z=cz-3;z<=cz+3;z++)for(let x=cx-3;x<=cx+3;x++){
      const h=terrainSurfaceHeight(x+.5,z+.5);if(h<22||rockSurfaceExposure(x+.5,h,z+.5)<=0)continue;
      const heights=[terrainSurfaceHeight(x,z),terrainSurfaceHeight(x,z+1),terrainSurfaceHeight(x+1,z),terrainSurfaceHeight(x+1,z+1)];
      if(Math.max(...heights)-Math.min(...heights)>=1.8)eligible.add(`${x},${z}`);
    }
    const observations:unknown[]=[],point=createGeologicalDisplacement(terrainSurfaceHeight,rockSurfaceExposure,eligible,r=>observations.push(r));
    const qa=point(a),qb=point(b),qm=point(canonicalGeologicalBase(a.clone().add(b).multiplyScalar(.5)));
    const error=qm.distanceTo(qa.clone().add(qb).multiplyScalar(.5));
    output.push({key:edge.key,error,observations});
    expect(error,'centimetre source edges must not acquire metre-scale shelf jumps').toBeLessThan(.12);
  }
  await mkdir(`artifacts/laas-quality-20261012/${stage}`,{recursive:true});
  await writeFile(`artifacts/laas-quality-20261012/${stage}/trace.json`,JSON.stringify(output,null,2));
});

test('diagnostic profile of the remaining water-side shelf records sub-centimetre behaviour',async()=>{
  const stage=process.env.DISPLACEMENT_PROFILE_STAGE??'geological-displacement-profile';
  if(!/^[a-z0-9-]+$/.test(stage))throw new Error('Invalid displacement profile stage');
  const input=JSON.parse(await readFile('artifacts/laas-quality-20261012/summit-structure-validation-r12/refinement.json','utf8'));
  const edge=input.worstCurvatureEdges[0],a=new THREE.Vector3().fromArray(edge.baseA),b=new THREE.Vector3().fromArray(edge.baseB),eligible=new Set<string>();
  const cx=Math.floor(a.x),cz=Math.floor(a.z);
  for(let z=cz-3;z<=cz+3;z++)for(let x=cx-3;x<=cx+3;x++){
    const h=terrainSurfaceHeight(x+.5,z+.5);if(h<22||rockSurfaceExposure(x+.5,h,z+.5)<=0)continue;
    const heights=[terrainSurfaceHeight(x,z),terrainSurfaceHeight(x,z+1),terrainSurfaceHeight(x+1,z),terrainSurfaceHeight(x+1,z+1)];
    if(Math.max(...heights)-Math.min(...heights)>=1.8)eligible.add(`${x},${z}`);
  }
  const samples:Record<string,unknown>[]=[],worlds:THREE.Vector3[]=[];
  const point=createGeologicalDisplacement(terrainSurfaceHeight,rockSurfaceExposure,eligible,r=>samples.push(r));
  for(let i=0;i<=256;i++)worlds.push(point(canonicalGeologicalBase(a.clone().lerp(b,i/256))));
  const jumps=worlds.slice(1).map((p,i)=>({distance:p.distanceTo(worlds[i]),i,a:samples[i],b:samples[i+1]})).sort((a,b)=>b.distance-a.distance);
  expect(worlds.every(p=>Number.isFinite(p.lengthSq()))).toBe(true);
  await mkdir(`artifacts/laas-quality-20261012/${stage}`,{recursive:true});
  await writeFile(`artifacts/laas-quality-20261012/${stage}/profile.json`,JSON.stringify({edge,samples,worlds:worlds.map(p=>p.toArray()),largestJumps:jumps.slice(0,8)},null,2));
});

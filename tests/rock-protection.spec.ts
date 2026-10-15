import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {rockSurfaceExposure} from '../src/world/TerrainField';
import {SECT_BUILDINGS,sectWorld,sectProtected} from '../src/world/SectLayout';
import {inWaterCorridor} from '../src/world/WaterLayout';
import {waterRockExposure} from '../src/world/GeologicalProtection';

test('mountain-gate cliff exposure approaches protected foundations continuously',async()=>{
  const stage=process.env.ROCK_PROTECTION_STAGE??'rock-protection';
  if(!/^[a-z0-9-]+$/.test(stage))throw new Error('Invalid rock protection stage');
  const pairs=[
    [[-76.445637,52.402344,-58.515942],[-76.426621,52.314454,-58.531116]],
    [[-76.433881,52.402344,-58.516172],[-76.454575,52.5,-58.499321]],
    [[-76.432203,52.392579,-58.51785],[-76.436122,52.392579,-58.517773]],
  ];
  const observations=pairs.map(([a,b])=>({a,b,exposureA:rockSurfaceExposure(...a as [number,number,number]),exposureB:rockSurfaceExposure(...b as [number,number,number])}));
  await mkdir(`artifacts/laas-quality-20261012/${stage}`,{recursive:true});
  await writeFile(`artifacts/laas-quality-20261012/${stage}/exposure.json`,JSON.stringify(observations,null,2));
  for(const p of observations)expect(Math.abs(p.exposureA-p.exposureB),'millimetre gate-border samples must not switch the full cliff off').toBeLessThan(.02);
  for(const building of SECT_BUILDINGS)for(const x of [-building.width/2,0,building.width/2])for(const z of [-building.depth/2,0,building.depth/2]){
    const p=sectWorld(building,x,z);expect(sectProtected(p.x,p.z,1.5)).toBe(true);
    expect(rockSurfaceExposure(p.x,200,p.z),'existing protected foundation remains clear').toBe(0);
  }
});

test('continuous water-bank union retains every existing water keep-out sample',()=>{
  let protectedSamples=0;
  for(let z=-210;z<=94;z+=2)for(let x=104;x<=246;x+=2){
    if(!inWaterCorridor(x,z,1.5))continue;
    expect(waterRockExposure(x,z),'stream/pond union must preserve the old bank core').toBe(0);protectedSamples++;
  }
  expect(protectedSamples).toBeGreaterThan(1000);
});

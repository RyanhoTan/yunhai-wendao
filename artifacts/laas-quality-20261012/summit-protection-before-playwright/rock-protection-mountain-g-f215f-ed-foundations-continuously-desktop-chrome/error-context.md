# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rock-protection.spec.ts >> mountain-gate cliff exposure approaches protected foundations continuously
- Location: tests/rock-protection.spec.ts:6:1

# Error details

```
Error: millimetre gate-border samples must not switch the full cliff off

expect(received).toBeLessThan(expected)

Expected: < 0.02
Received:   1
```

# Test source

```ts
  1  | import {expect,test} from '@playwright/test';
  2  | import {mkdir,writeFile} from 'node:fs/promises';
  3  | import {rockSurfaceExposure} from '../src/world/TerrainField';
  4  | import {SECT_BUILDINGS,sectWorld,sectProtected} from '../src/world/SectLayout';
  5  | 
  6  | test('mountain-gate cliff exposure approaches protected foundations continuously',async()=>{
  7  |   const stage=process.env.ROCK_PROTECTION_STAGE??'rock-protection';
  8  |   if(!/^[a-z0-9-]+$/.test(stage))throw new Error('Invalid rock protection stage');
  9  |   const pairs=[
  10 |     [[-76.445637,52.402344,-58.515942],[-76.426621,52.314454,-58.531116]],
  11 |     [[-76.433881,52.402344,-58.516172],[-76.454575,52.5,-58.499321]],
  12 |     [[-76.432203,52.392579,-58.51785],[-76.436122,52.392579,-58.517773]],
  13 |   ];
  14 |   const observations=pairs.map(([a,b])=>({a,b,exposureA:rockSurfaceExposure(...a as [number,number,number]),exposureB:rockSurfaceExposure(...b as [number,number,number])}));
  15 |   await mkdir(`artifacts/laas-quality-20261012/${stage}`,{recursive:true});
  16 |   await writeFile(`artifacts/laas-quality-20261012/${stage}/exposure.json`,JSON.stringify(observations,null,2));
> 17 |   for(const p of observations)expect(Math.abs(p.exposureA-p.exposureB),'millimetre gate-border samples must not switch the full cliff off').toBeLessThan(.02);
     |                                                                                                                                             ^ Error: millimetre gate-border samples must not switch the full cliff off
  18 |   for(const building of SECT_BUILDINGS)for(const x of [-building.width/2,0,building.width/2])for(const z of [-building.depth/2,0,building.depth/2]){
  19 |     const p=sectWorld(building,x,z);expect(sectProtected(p.x,p.z,1.5)).toBe(true);
  20 |     expect(rockSurfaceExposure(p.x,200,p.z),'existing protected foundation remains clear').toBe(0);
  21 |   }
  22 | });
  23 | 
```
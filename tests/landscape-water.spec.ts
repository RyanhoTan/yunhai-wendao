import {expect,test} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {terrainHeight} from '../src/world/World';
import {shorelineAt} from '../src/world/CoastMath';

const fixture='tests/fixtures/protected-water-heights.json';
test('mountain upgrades retain coastal and lake-bank elevations',()=>{
  if(process.env.CAPTURE_WATER_BASELINE==='1'){
    const points:number[][]=[];
    for(const x of [-220,-160,-90,0,75,175,250])for(const z of [136,150,167,shorelineAt(x)])points.push([x,z]);
    for(const radius of [0,20,30,38,43])for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5])points.push([-160+Math.cos(angle)*radius*1.25,110+Math.sin(angle)*radius]);
    mkdirSync('tests/fixtures',{recursive:true});writeFileSync(fixture,JSON.stringify(points.map(([x,z])=>({x,z,height:terrainHeight(x,z)})),null,2)+'\n');
  }
  const samples=JSON.parse(readFileSync(fixture,'utf8')) as {x:number;z:number;height:number}[];
  for(const p of samples)expect(terrainHeight(p.x,p.z),`protected water bank ${p.x},${p.z}`).toBeCloseTo(p.height,5);
});

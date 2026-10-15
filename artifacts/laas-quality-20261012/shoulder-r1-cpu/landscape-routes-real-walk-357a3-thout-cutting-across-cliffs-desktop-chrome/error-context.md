# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: landscape-routes.spec.ts >> real walking descends the inland forest spur without cutting across cliffs
- Location: tests/landscape-routes.spec.ts:26:1

# Error details

```
Error: page.evaluate: Test ended.
```

# Test source

```ts
  1  | import {expect,test} from '@playwright/test';
  2  | import {FOREST_APPROACH,MOUNTAIN_CIRCUIT,WEST_VALLEY_ROUTE,SECT_ASCENT} from '../src/world/WorldLayout';
  3  | import {mkdir,writeFile} from 'node:fs/promises';
  4  | import {walk} from './helpers/navigation';
  5  | import {terrainHeight,protectedPoint} from '../src/world/World';
  6  | type Point={x:number;z:number};
  7  | function roadGrade(route:readonly Point[]){
  8  |   let worst=0,at={x:0,z:0,offset:0};
  9  |   for(let i=1;i<route.length;i++){
  10 |     const a=route[i-1],b=route[i],length=Math.hypot(b.x-a.x,b.z-a.z),count=Math.ceil(length/.2);
  11 |     for(const offset of [-4,-2,0,2,4]){
  12 |       const x0=a.x-(b.z-a.z)/length*offset,z0=a.z+(b.x-a.x)/length*offset;let last=terrainHeight(x0,z0);
  13 |       for(let j=1;j<=count;j++){
  14 |         const t=j/count,x=x0+(b.x-a.x)*t,z=z0+(b.z-a.z)*t,y=terrainHeight(x,z),grade=Math.abs(y-last)/(length/count);
  15 |         if(grade>worst){worst=grade;at={x,z,offset};}last=y;
  16 |         expect(protectedPoint(x,z,.6)).toBe(true);
  17 |       }
  18 |     }
  19 |   }
  20 |   return {worst,at};
  21 | }
  22 | for(const [name,route] of [['ascent',SECT_ASCENT],['forest',FOREST_APPROACH],['circuit',MOUNTAIN_CIRCUIT],['west-spur',WEST_VALLEY_ROUTE]] as const){
  23 |   test(`full eight-metre ${name} road remains walkable at fine sampling`,()=>{const report=roadGrade(route);console.log(name,report);expect(report.worst).toBeLessThan(.55);});
  24 | }
  25 | 
  26 | test('real walking descends the inland forest spur without cutting across cliffs',async({page})=>{
  27 |   test.setTimeout(100000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?test=1');
> 28 |   await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('forest-spur'));const positions=[];
     |              ^ Error: page.evaluate: Test ended.
  29 |   for(let i=1;i<WEST_VALLEY_ROUTE.length;i++){
  30 |     const a=WEST_VALLEY_ROUTE[i-1],b=WEST_VALLEY_ROUTE[i],n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/8);
  31 |     for(let j=1;j<=n;j++){await walk(page,a.x+(b.x-a.x)*j/n,a.z+(b.z-a.z)*j/n);await page.waitForTimeout(180);
  32 |       const d=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);expect(d.flying).toBe(false);expect(Math.abs(d.player.position.y-terrainHeight(d.player.position.x,d.player.position.z))).toBeLessThan(.08);positions.push(d.player.position);
  33 |     }
  34 |   }
  35 |   const out='artifacts/landscape-laas-20261010/structural-input';await mkdir(out,{recursive:true});
  36 |   await page.screenshot({path:`${out}/forest-spur.png`});await writeFile(`${out}/forest-spur.json`,JSON.stringify({positions,errors},null,2));expect(errors).toEqual([]);
  37 | });
  38 | 
```
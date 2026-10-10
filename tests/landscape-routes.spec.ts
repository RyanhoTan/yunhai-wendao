import {expect,test} from '@playwright/test';
import {FOREST_APPROACH,MOUNTAIN_CIRCUIT,WEST_VALLEY_ROUTE,SECT_ASCENT} from '../src/world/WorldLayout';
import {mkdir,writeFile} from 'node:fs/promises';
import {walk} from './helpers/navigation';
import {terrainHeight,protectedPoint} from '../src/world/World';
type Point={x:number;z:number};
function roadGrade(route:readonly Point[]){
  let worst=0,at={x:0,z:0,offset:0};
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],length=Math.hypot(b.x-a.x,b.z-a.z),count=Math.ceil(length/.2);
    for(const offset of [-4,-2,0,2,4]){
      const x0=a.x-(b.z-a.z)/length*offset,z0=a.z+(b.x-a.x)/length*offset;let last=terrainHeight(x0,z0);
      for(let j=1;j<=count;j++){
        const t=j/count,x=x0+(b.x-a.x)*t,z=z0+(b.z-a.z)*t,y=terrainHeight(x,z),grade=Math.abs(y-last)/(length/count);
        if(grade>worst){worst=grade;at={x,z,offset};}last=y;
        expect(protectedPoint(x,z,.6)).toBe(true);
      }
    }
  }
  return {worst,at};
}
for(const [name,route] of [['ascent',SECT_ASCENT],['forest',FOREST_APPROACH],['circuit',MOUNTAIN_CIRCUIT],['west-spur',WEST_VALLEY_ROUTE]] as const){
  test(`full eight-metre ${name} road remains walkable at fine sampling`,()=>{const report=roadGrade(route);console.log(name,report);expect(report.worst).toBeLessThan(.55);});
}

test('real walking descends the inland forest spur without cutting across cliffs',async({page})=>{
  test.setTimeout(100000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?test=1');
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('forest-spur'));const positions=[];
  for(let i=1;i<WEST_VALLEY_ROUTE.length;i++){
    const a=WEST_VALLEY_ROUTE[i-1],b=WEST_VALLEY_ROUTE[i],n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/8);
    for(let j=1;j<=n;j++){await walk(page,a.x+(b.x-a.x)*j/n,a.z+(b.z-a.z)*j/n);await page.waitForTimeout(180);
      const d=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);expect(d.flying).toBe(false);expect(Math.abs(d.player.position.y-terrainHeight(d.player.position.x,d.player.position.z))).toBeLessThan(.08);positions.push(d.player.position);
    }
  }
  const out='artifacts/landscape-laas-20261010/structural-input';await mkdir(out,{recursive:true});
  await page.screenshot({path:`${out}/forest-spur.png`});await writeFile(`${out}/forest-spur.json`,JSON.stringify({positions,errors},null,2));expect(errors).toEqual([]);
});

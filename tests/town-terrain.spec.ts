import {expect,test} from '@playwright/test';
import {terrainHeight} from '../src/world/World';
import {SECT_ASCENT} from '../src/world/WorldLayout';
import {TOWN_APPROACH} from '../src/world/TownLayout';
import {walk} from './helpers/navigation';
import {TOWN} from '../src/world/TownLayout';

test('shop floors and the main street share a continuous flat foundation',()=>{
  for(let x=105;x<=145;x+=2.5)for(let z=39;z<=128;z+=3.7)expect(Math.abs(terrainHeight(x,z)-TOWN.groundY)).toBeLessThan(.001);
  // Check the transition out of the district, not just its constant interior.
  let largestStep=0;
  for(let z=30;z<=144;z+=2)for(let x=91;x<=159;x+=2)largestStep=Math.max(largestStep,Math.abs(terrainHeight(x+.2,z)-terrainHeight(x,z)),Math.abs(terrainHeight(x,z+.2)-terrainHeight(x,z)));
  expect(largestStep,'street exits must blend into the surrounding terrain').toBeLessThan(.65);
});

test('walk from the sect along the new approach without teleporting',async({page})=>{
  test.setTimeout(180000);await page.goto('/?test=1');await page.locator('[data-action=new-game]').click();
  for(const p of [...SECT_ASCENT].reverse())await walk(page,p.x,p.z);
  let held:string[]=[];
  const change=async(next:string[])=>{for(const key of held)if(!next.includes(key))await page.keyboard.up(key);for(const key of next)if(!held.includes(key))await page.keyboard.down(key);held=next;};
  for(const {x,z} of TOWN_APPROACH){
    let arrived=false;
    for(let step=0;step<180;step++){
      const d=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);const p=d.player;
      const dx=x-p.position.x,dz=z-p.position.z;
      if(Math.hypot(dx,dz)<2.2){arrived=true;break;}
      const right=Math.cos(p.yaw)*dx-Math.sin(p.yaw)*dz,forward=-Math.sin(p.yaw)*dx-Math.cos(p.yaw)*dz,next:string[]=[];
      if(Math.abs(right)>.8)next.push(right>0?'KeyD':'KeyA');if(Math.abs(forward)>.8)next.push(forward>0?'KeyW':'KeyS');
      await change(next);await page.waitForTimeout(140);
    }
    await change([]);expect(arrived,`arrive at approach waypoint ${x},${z}`).toBe(true);
  }
  await page.waitForTimeout(300);const d=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
  expect(d.health).toBe(100);expect(Math.abs(d.player.position.y-terrainHeight(d.player.position.x,d.player.position.z))).toBeLessThan(.08);
  await page.screenshot({path:'artifacts/qa/town-approach.png'});
});

import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {MOUNTAIN_CIRCUIT,SECT_ASCENT,SECT_SUMMIT} from '../src/world/WorldLayout';
import {walk} from './helpers/navigation';
import {terrainHeight,protectedPoint} from '../src/world/World';


test('mountain circuit has graded walking slopes and continuous protected corridors',()=>{
  let worst=0;
  for(let i=1;i<MOUNTAIN_CIRCUIT.length;i++){
    const a=MOUNTAIN_CIRCUIT[i-1],b=MOUNTAIN_CIRCUIT[i],length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length*2);
    let previous=terrainHeight(a.x,a.z);
    for(let j=1;j<=steps;j++){
      const t=j/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=terrainHeight(x,z);
      worst=Math.max(worst,Math.abs(y-previous)/(length/steps));previous=y;
      expect(protectedPoint(x,z,1),'trees cannot occupy the new walking trail').toBe(true);
    }
  }
  expect(worst,'trail grade allows walking without abrupt height jumps').toBeLessThan(.48);
});

test('summit forecourt and the full switchback have continuous walkable foundations',()=>{
  expect(terrainHeight(0,50)).toBeCloseTo(SECT_SUMMIT.height,5);
  expect(terrainHeight(0,32)).toBeCloseTo(SECT_SUMMIT.height,5);
  let worst=0,worstAt={x:0,z:0,offset:0};
  for(let i=1;i<SECT_ASCENT.length;i++){
    const a=SECT_ASCENT[i-1],b=SECT_ASCENT[i],length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length*2);
    for(const offset of [-2.5,0,2.5]){
      let last=terrainHeight(a.x-(b.z-a.z)/length*offset,a.z+(b.x-a.x)/length*offset);
      for(let j=1;j<=steps;j++){
        const t=j/steps,x=a.x+(b.x-a.x)*t-(b.z-a.z)/length*offset,z=a.z+(b.z-a.z)*t+(b.x-a.x)/length*offset,y=terrainHeight(x,z);
        const grade=Math.abs(y-last)/(length/steps);if(grade>worst){worst=grade;worstAt={x,z,offset};}last=y;expect(protectedPoint(x,z,.6)).toBe(true);
      }
    }
  }
  console.log('ascent grade',worst,worstAt);
  expect(worst).toBeLessThan(.55);expect(terrainHeight(0,50)-terrainHeight(0,126)).toBeGreaterThan(80);
});

test('real walking climbs every switchback to the temple then saves and continues on the summit',async({page})=>{
  test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('sect-foot'));
  const out='artifacts/sect-expansion-20261010';await mkdir(out,{recursive:true});const heights=[],route=[];
  await page.screenshot({path:`${out}/road-start.png`});
  for(const [i,p] of SECT_ASCENT.entries()){
    if(i>0){
      const a=SECT_ASCENT[i-1],count=Math.ceil(Math.hypot(p.x-a.x,p.z-a.z)/12);
      // Follow the road centre instead of cutting across the next switchback/structures.
      for(let j=1;j<count;j++){
        await walk(page,a.x+(p.x-a.x)*j/count,a.z+(p.z-a.z)*j/count);
        const d=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);route.push(d.player.position);
        expect(d.flying).toBe(false);expect(Math.abs(d.player.position.y-terrainHeight(d.player.position.x,d.player.position.z))).toBeLessThan(.08);
      }
    }
    await walk(page,p.x,p.z);await page.waitForTimeout(300);
    const d=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);heights.push(d.player.position);
    expect(d.flying).toBe(false);expect(Math.abs(d.player.position.y-terrainHeight(d.player.position.x,d.player.position.z))).toBeLessThan(.08);
    if(i===3)await page.screenshot({path:`${out}/road-halfway.png`});
  }
  await walk(page,0,50);await expect(page.locator('[data-field=location]')).toContainText('峰顶');
  await page.screenshot({path:`${out}/temple-summit.png`});
  await page.keyboard.press('Escape');await page.locator('[data-action=save]').click();await page.reload();await page.locator('[data-action=continue]').click();
  await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position.y)).toBeCloseTo(SECT_SUMMIT.height,1);
  await walk(page,0,34);await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.interaction)).toContain('沈清尘');
  await page.keyboard.press('KeyM');await page.screenshot({path:`${out}/summit-map.png`});
  await writeFile(`${out}/ascent-input.json`,JSON.stringify({heights,route,errors},null,2));expect(errors).toEqual([]);
});

test('real input traverses the three-shrine circuit, saves on a ridge and resumes grounded',async({page})=>{
  test.setTimeout(240000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('mountain-circuit'));
  await mkdir('artifacts/shanhai-map-20261008',{recursive:true});const route=[];
  for(const [index,p] of MOUNTAIN_CIRCUIT.slice(1).entries()){
    await walk(page,p.x,p.z);await page.waitForTimeout(350);
    const d=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);route.push(d.player.position);
    expect(d.flying).toBe(false);expect(Math.abs(d.player.position.y-terrainHeight(d.player.position.x,d.player.position.z))).toBeLessThan(.08);
    if(index===1){
      await page.keyboard.press('Escape');await page.locator('[data-action=save]').click();await page.reload();await page.locator('[data-action=continue]').click();
      const resumed=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position);
      expect(Math.hypot(resumed.x-p.x,resumed.z-p.z)).toBeLessThan(1.5);
      expect(Math.abs(resumed.y-terrainHeight(resumed.x,resumed.z))).toBeLessThan(.08);
    }
  }
  await page.keyboard.press('KeyM');await expect(page.getByRole('dialog',{name:'山川舆图'})).toBeVisible();
  await page.screenshot({path:'artifacts/shanhai-map-20261008/circuit-map.png'});
  await writeFile('artifacts/shanhai-map-20261008/circuit-input.json',JSON.stringify({route,errors},null,2));expect(errors).toEqual([]);
});

test('accelerating lowest sword flight remains above the redesigned uphill surface',async({page})=>{
  await page.goto('/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('mountain-low-flight'));
  await page.keyboard.down('KeyW');await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyC');
  const samples=[];
  for(let i=0;i<35;i++){
    await page.waitForTimeout(90);const d=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);samples.push(d.player.position);
    expect(d.flying).toBe(true);expect(d.player.position.y-terrainHeight(d.player.position.x,d.player.position.z)).toBeGreaterThan(2.5);
  }
  for(const key of ['KeyW','ShiftLeft','KeyC'])await page.keyboard.up(key);
  expect(Math.max(...samples.map(p=>terrainHeight(p.x,p.z)))-terrainHeight(0,126)).toBeGreaterThan(10);
});

test('an old low-elevation save restores safely beside a raised temple wall',async({page})=>{
  await page.goto('/?test=1');await page.locator('[data-action=new-game]').click();
  await page.evaluate(()=>{const key='yunhai-wendao-save-v1',save=JSON.parse(localStorage.getItem(key)!);save.position={x:0,y:2,z:1};localStorage.setItem(key,JSON.stringify(save));});
  await page.reload();await page.locator('[data-action=continue]').click();
  const initial=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position);expect(initial.y).toBeGreaterThan(89);
  expect(Math.hypot(initial.x,initial.z-1)).toBeGreaterThan(1);
  await page.waitForTimeout(300);const settled=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position);
  expect(Math.hypot(initial.x-settled.x,initial.z-settled.z)).toBeLessThan(.1);
  await page.keyboard.down('KeyS');await page.waitForTimeout(600);await page.keyboard.up('KeyS');
  expect((await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position)).z).toBeGreaterThan(settled.z+1);
});

test('a returning enemy remains grounded on the mountain after real player retreat',async({page})=>{
  await page.goto('/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('mountain-chase'));
  await page.keyboard.down('KeyW');await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position.z),{timeout:18000}).toBeLessThan(-90);await page.keyboard.up('KeyW');
  let returned=false;
  for(let i=0;i<18;i++){
    await page.waitForTimeout(100);const e=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.enemies[0]);
    if(e.position.z>-34){returned=true;expect(Math.abs(e.position.y-terrainHeight(e.position.x,e.position.z))).toBeLessThan(.12);}
  }
  expect(returned).toBe(true);
});

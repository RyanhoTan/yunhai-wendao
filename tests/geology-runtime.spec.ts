import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {SAVE_KEY} from '../src/game/Save';
import {WEST_VALLEY_ROUTE} from '../src/world/WorldLayout';
import {walk} from './helpers/navigation';

const state=(page:Page)=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
test('old saves, real forest-spur walking, cliff camera orbit and rain occlusion survive geological faces',async({page})=>{
  test.setTimeout(240000);
  const name=process.env.GEOLOGY_RUNTIME_STAGE??`geology-runtime-${Date.now()}`;
  if(!/^[a-z0-9-]+$/.test(name))throw new Error('Invalid runtime evidence stage');
  const out=`artifacts/laas-quality-20261012/${name}`;await mkdir(out,{recursive:false});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const report:Record<string,unknown>={complete:false,scope:'Historical v1 save and reload; full west forest spur via real WASD; 24-step real mouse orbit near cliff; rain under shop roof and resource reuse. Not final all-route free exploration.'};
  await writeFile(`${out}/status.json`,JSON.stringify(report,null,2));
  try{
    const before=JSON.parse(await readFile('artifacts/laas-quality-20261012/before-geology-fixed-height/quality-road-noon.json','utf8'));
    const oldSave={version:1,position:before.result.diagnostics.player.position,health:100,qi:100,xp:1234,realm:1,quest:3,herbs:5,pills:4,stones:550,kills:2,shrines:[true,false,true],collected:[1,4,7],defeated:[2,6],treasures:[1]};
    await page.addInitScript(({key,data})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(data));},{key:SAVE_KEY,data:oldSave});
    await page.goto('/?test=1');await page.locator('[data-action=continue]').click();await page.waitForLoadState('networkidle');
    const loaded=await state(page);expect(loaded.realm).toBe(1);expect(loaded.quest).toBe(3);expect(loaded.herbs).toBe(5);expect(loaded.pills).toBe(4);expect(loaded.shrines).toEqual(oldSave.shrines);
    expect(loaded.player.position.x).toBeCloseTo(oldSave.position.x,2);expect(loaded.player.position.z).toBeCloseTo(oldSave.position.z,2);expect(Math.abs(loaded.player.position.y-loaded.coast.ground)).toBeLessThan(.05);
    await expect(page.locator('[data-field=stones]')).toHaveText('550');await expect(page.locator('[data-field=xp-value]')).toContainText('1234');
    await page.screenshot({path:`${out}/old-save-loaded.png`});await page.reload();await page.locator('[data-action=continue]').click();const reloaded=await state(page);expect(reloaded.quest).toBe(3);expect(reloaded.shrines).toEqual(oldSave.shrines);report.save={oldSave,loaded,reloaded};
    await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('forest-spur'));const positions=[];
    for(let i=1;i<WEST_VALLEY_ROUTE.length;i++){
      const a=WEST_VALLEY_ROUTE[i-1],b=WEST_VALLEY_ROUTE[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/8);
      for(let j=1;j<=steps;j++){
        await walk(page,a.x+(b.x-a.x)*j/steps,a.z+(b.z-a.z)*j/steps);await page.waitForTimeout(180);const d=await state(page);
        expect(d.flying).toBe(false);expect(Math.abs(d.player.position.y-d.coast.ground)).toBeLessThan(.08);positions.push(d.player.position);
      }
    }
    report.westSpur={positions};await page.screenshot({path:`${out}/west-spur-walk.png`});
    await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('quality-road-noon'));const orbit=[];
    await page.mouse.move(640,340);await page.mouse.down({button:'right'});
    try{for(let i=0;i<24;i++){await page.mouse.move(640+Math.sin(i*.4)*250,340+Math.sin(i*.27)*65,{steps:3});await page.waitForTimeout(70);const d=await state(page);expect(Number.isFinite(d.camera.position.x+d.camera.position.y+d.camera.position.z)).toBe(true);expect(Math.hypot(d.camera.position.x-d.camera.target.x,d.camera.position.y-d.camera.target.y,d.camera.position.z-d.camera.target.z)).toBeGreaterThan(.20);orbit.push(d.camera);}}
    finally{await page.mouse.up({button:'right'});}
    report.cliffOrbit={samples:orbit,limitation:'Real orbit remains finite and outside the target. Structural ray tests validate rock clearance; these samples alone do not prove absence of every tiny corner clipping.'};await page.screenshot({path:`${out}/cliff-orbit.png`});
    await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('weather-town-rain'));const roof=await state(page);expect(roof.weather.roofHeight).toBeGreaterThan(roof.player.position.y+3);await page.screenshot({path:`${out}/rain-shop.png`});
    await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('weather-rain'));const rain=await state(page);expect(rain.weather.rainVisible).toBe(true);
    // Renderer memory counts GPU uploads, including geometry first exposed by
    // a night/day camera or shadow pass. Warm every compared state first.
    const warmHistory=[];
    for(let i=0;i<8;i++){await page.evaluate(n=>window.__THREE_GAME_TEST_HOOKS__!.setState(n),i%2?'weather-night':'weather-rain');await page.waitForTimeout(90);warmHistory.push((await state(page)).renderer);}
    await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('weather-rain'));await page.waitForTimeout(120);const warm=await state(page);
    for(let i=0;i<8;i++){await page.evaluate(n=>window.__THREE_GAME_TEST_HOOKS__!.setState(n),i%2?'weather-night':'weather-rain');await page.waitForTimeout(90);}
    await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('weather-rain'));const reused=await state(page);
    report.rain={roof,rain,warmHistory,warm,reused};expect(reused.renderer.geometries).toBe(warm.renderer.geometries);expect(reused.renderer.textures).toBe(warm.renderer.textures);expect(errors).toEqual([]);
    report.complete=true;report.errors=errors;await writeFile(`${out}/status.json`,JSON.stringify(report,null,2));
  }catch(error){report.error=String(error);report.errors=errors;await writeFile(`${out}/status.json`,JSON.stringify(report,null,2));throw error;}
});

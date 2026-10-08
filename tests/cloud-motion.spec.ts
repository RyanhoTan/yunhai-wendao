import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs/promises';
import {PNG} from 'pngjs';

const out='artifacts/cloud-drift-20261008';
// Central sky only: excludes the HUD, terrain, character and animated sea.
const skyRegion={x:360,y:120,width:500,height:140};
const state=(page:Page)=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
async function frame(page:Page,name?:string){
  const data=await page.evaluate(()=>new Promise<string>(resolve=>requestAnimationFrame(()=>{
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
    canvas.getContext('2d')!.drawImage(document.querySelector<HTMLCanvasElement>('#game-canvas')!,0,0,1280,720);
    resolve(canvas.toDataURL('image/png'));
  })));
  const bytes=Buffer.from(data.split(',')[1],'base64');
  if(name){await fs.mkdir(out,{recursive:true});await fs.writeFile(`${out}/${name}.png`,bytes);}
  return PNG.sync.read(bytes);
}
function skyDifference(a:PNG,b:PNG){
  let total=0,changed=0;
  for(let y=skyRegion.y;y<skyRegion.y+skyRegion.height;y++)for(let x=skyRegion.x;x<skyRegion.x+skyRegion.width;x++){
    const i=(y*a.width+x)*4;
    const delta=Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2]);
    total+=delta;if(delta>6)changed++;
  }
  const pixels=skyRegion.width*skyRegion.height;
  return {meanRgbDifference:total/(pixels*3),changedPixelRatio:changed/pixels};
}
async function setup(page:Page,name:string){
  await page.evaluate(name=>{const hooks=window.__THREE_GAME_TEST_HOOKS__!;hooks.setState(name);hooks.setPausedForScreenshot(true);hooks.setReducedMotion(true);},name);
}
async function clouds(page:Page,preset:'cloudy'|'clear'){
  await page.locator('[data-action=weather]').click();
  await page.locator(`[data-weather=preset-${preset}]`).click();
  if(preset==='clear'){await page.locator('[data-weather=cloud-cover]').focus();await page.keyboard.press('Home');}
  await page.locator('[data-weather=close]').click();
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.advanceWeather(0));
}
test.use({timezoneId:'Asia/Shanghai',trace:'off',video:'off'});

test('clouds advect at fixed day and night hours, freeze for captures, and leave cloudless sky stable',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?test=1');await page.waitForFunction(()=>Boolean(window.__THREE_GAME_TEST_HOOKS__));
  const results=[];
  for(const name of ['weather-noon','weather-night','weather-sun-clear']){
    await setup(page,name);await clouds(page,name==='weather-sun-clear'?'clear':'cloudy');
    const before=await state(page),first=await frame(page,name==='weather-sun-clear'?undefined:`${name}-0s`);
    await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.advanceWeather(6));
    const after=await state(page),last=await frame(page,name==='weather-sun-clear'?undefined:`${name}-6s`),motion=skyDifference(first,last);
    expect(after.weather.hour).toBe(before.weather.hour);expect(after.weather.cloudCover).toBe(before.weather.cloudCover);
    expect(after.weather.weatherClock-before.weather.weatherClock).toBeCloseTo(6,5);
    expect(after.renderer.geometries).toBe(before.renderer.geometries);expect(after.renderer.textures).toBe(before.renderer.textures);
    if(name==='weather-sun-clear')expect(motion.meanRgbDifference).toBe(0);
    else{expect(motion.meanRgbDifference).toBeGreaterThan(.5);expect(motion.changedPixelRatio).toBeGreaterThan(.02);}
    await page.waitForTimeout(120);const frozen=await frame(page);
    expect(skyDifference(last,frozen).meanRgbDifference).toBe(0);
    results.push({name,before:before.weather,after:after.weather,motion,renderer:after.renderer});
  }
  expect(errors).toEqual([]);await fs.writeFile(`${out}/fixed-hour-report.json`,JSON.stringify({skyRegion,results,errors},null,2)+'\n');
});

test('real play shows continuous cloud drift and ordinary pause freezes it',async({browser})=>{
  const context=await browser.newContext({viewport:{width:1280,height:720},timezoneId:'Asia/Shanghai',recordVideo:{dir:'test-results/cloud-motion',size:{width:1280,height:720}}});
  const page=await context.newPage(),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    await page.goto('/?test=1');await page.waitForFunction(()=>Boolean(window.__THREE_GAME_TEST_HOOKS__));
    await setup(page,'weather-noon');await clouds(page,'cloudy');
    await page.evaluate(()=>{const hooks=window.__THREE_GAME_TEST_HOOKS__!;hooks.setReducedMotion(false);hooks.setPausedForScreenshot(false);});
    const samples=[],first=await frame(page,'live-0s');let previous=first;
    const start=await state(page);
    for(const seconds of [3,6,9]){
      await page.waitForTimeout(3000);const image=await frame(page,`live-${seconds}s`),current=await state(page);
      const motion=skyDifference(previous,image);expect(motion.changedPixelRatio).toBeGreaterThan(.005);
      expect(current.phase).toBe('playing');expect(current.weather.hour).toBe(12);
      samples.push({seconds,weatherClock:current.weather.weatherClock,motion});previous=image;
    }
    const end=await state(page);expect(end.weather.weatherClock).toBeGreaterThan(start.weather.weatherClock+6);
    await page.keyboard.press('Escape');await expect.poll(()=>state(page).then(s=>s.phase)).toBe('paused');
    const paused=await state(page);await page.waitForTimeout(300);expect((await state(page)).weather.weatherClock).toBe(paused.weather.weatherClock);
    await page.keyboard.press('Escape');await expect.poll(()=>state(page).then(s=>s.weather.weatherClock)).toBeGreaterThan(paused.weather.weatherClock);
    const position=(await state(page)).player.position;
    await page.keyboard.down('KeyD');try{await expect.poll(()=>state(page).then(s=>Math.hypot(s.player.position.x-position.x,s.player.position.z-position.z))).toBeGreaterThan(.7);}finally{await page.keyboard.up('KeyD');}
    const snapshot=(s:typeof start)=>({phase:s.phase,weather:s.weather,player:s.player,renderer:s.renderer});
    expect(errors).toEqual([]);await fs.writeFile(`${out}/live-report.json`,JSON.stringify({skyRegion,start:snapshot(start),end:snapshot(end),samples,pausedClock:paused.weather.weatherClock,errors},null,2)+'\n');
  }finally{await context.close();await page.video()!.saveAs(`${out}/live-cloud-drift.webm`);}
});

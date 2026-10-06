import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs/promises';
const state=(page:Page)=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
async function frame(page:Page,path:string){
  // Read after the game's render callback in the same unpaused animation frame.
  const data=await page.evaluate(()=>new Promise<string>(resolve=>requestAnimationFrame(()=>resolve(document.querySelector<HTMLCanvasElement>('#game-canvas')!.toDataURL('image/jpeg',.88)))));
  await fs.writeFile(path,Buffer.from(data.split(',')[1],'base64'));
}
test.use({trace:'off',video:'off'});

test('five elements orbit then launch through real input, share cooldown and damage enemies',async({page})=>{
  test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await fs.mkdir('artifacts/qa/elemental-frames',{recursive:true});await page.goto('/?test=1');await page.locator('[data-action=new-game]').click();
  const elements=['metal','wood','water','fire','earth'];const samples=[];
  for(let i=0;i<5;i++){
    await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('combat'));
    await page.keyboard.press(`Digit${i+1}`);const before=await state(page);await page.keyboard.press('KeyT');
    await expect.poll(()=>state(page).then(s=>s.elemental.orbiting)).toBe(5);
    await expect(page.locator(`[data-field=element-${elements[i]}]`)).toHaveAttribute('aria-pressed','true');
    const orbit=await state(page);expect(orbit.elemental.element).toBe(elements[i]);expect(orbit.elemental.casts).toBe(1);expect(orbit.qi).toBeLessThan(before.qi-18);
    await frame(page,`artifacts/qa/elemental-frames/${elements[i]}-orbit.jpg`);
    // Switching cannot bypass the shared cooldown or change projectiles already in flight.
    await page.keyboard.press(`Digit${i===4?1:i+2}`);await page.keyboard.press('KeyT');expect((await state(page)).elemental.casts).toBe(1);
    await expect.poll(()=>state(page).then(s=>s.elemental.hits)).toBeGreaterThan(0);
    await frame(page,`artifacts/qa/elemental-frames/${elements[i]}-hit.jpg`);
    const hit=await state(page);expect(hit.enemies[0].health).toBeLessThan(before.enemies[0].health);samples.push({element:elements[i],orbit,hit});
    await expect.poll(()=>state(page).then(s=>s.elemental.activeProjectiles),{timeout:5000}).toBe(0);
  }
  const gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas')!.getContext('webgl2')!,ext=gl.getExtension('WEBGL_debug_renderer_info')!;return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;});
  await fs.writeFile('artifacts/qa/elemental-input.json',JSON.stringify({gpu,performanceValid:!/swiftshader|software|llvmpipe/i.test(gpu),samples,errors},null,2));expect(errors).toEqual([]);
});

test('element attacks freeze with menus and reset particle pools on retry',async({page})=>{
  await page.goto('/?test=1');await page.locator('[data-action=new-game]').click();await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('combat'));
  await page.keyboard.press('Digit3');await page.keyboard.press('KeyT');await expect.poll(()=>state(page).then(s=>s.elemental.orbiting)).toBe(5);
  await page.keyboard.press('Escape');const paused=await state(page);await page.waitForTimeout(300);const later=await state(page);
  expect(later.elemental).toEqual(paused.elemental);expect(later.enemies[0].health).toBe(paused.enemies[0].health);
  await page.keyboard.press('KeyT');await page.keyboard.press('Digit5');await page.locator('[data-action=resume]').click();expect((await state(page)).elemental.casts).toBe(1);
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('fail'));await page.locator('[data-action=retry]').click();
  const reset=await state(page);expect(reset.elemental.activeProjectiles).toBe(0);expect(reset.elemental.trailParticles).toBe(0);expect(reset.elemental.impactParticles).toBe(0);expect(reset.elemental.cooldown).toBe(0);
  const geometries=reset.renderer.geometries,textures=reset.renderer.textures;
  for(let i=0;i<4;i++){await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('combat'));await page.keyboard.press('KeyT');await page.waitForTimeout(80);}
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('combat'));const end=await state(page);
  expect(end.elemental.activeProjectiles).toBe(0);expect(end.elemental.projectileSlots).toBe(10);expect(end.renderer.geometries).toBeLessThanOrEqual(geometries+5);expect(end.renderer.textures).toBe(textures);
});

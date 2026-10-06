import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';

test.use({trace:'off',video:'off'});
test('shield and elemental attack coexist through real input and retain their cast element',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const state=()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
  await page.goto('/?test=1');await page.locator('[data-action=new-game]').click();
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('combat'));
  await page.keyboard.press('Digit4');const before=await state();
  await page.keyboard.press('KeyZ');await expect.poll(()=>state().then(s=>s.shield.active)).toBe(true);
  await page.keyboard.press('KeyT');await expect.poll(()=>state().then(s=>s.elemental.orbiting)).toBe(5);
  const orbit=await state();expect(orbit.shield.element).toBe('fire');expect(orbit.shield.active).toBe(true);expect(orbit.elemental.casts).toBe(1);expect(orbit.qi).toBeLessThan(before.qi-30);
  await expect.poll(()=>state().then(s=>s.animation.castingWeight)).toBeGreaterThan(.1);
  await page.keyboard.press('Digit3');await page.keyboard.press('KeyZ');
  await expect.poll(()=>state().then(s=>s.elemental.hits)).toBeGreaterThan(0);
  const hit=await state();expect(hit.elemental.element).toBe('water');expect(hit.shield.element).toBe('fire');expect(hit.shield.active).toBe(true);expect(hit.shield.cooldown).toBeGreaterThan(0);expect(hit.enemies[0].health).toBeLessThan(before.enemies[0].health);expect(errors).toEqual([]);
  const jpg=await page.evaluate(()=>new Promise<string>(resolve=>requestAnimationFrame(()=>resolve(document.querySelector<HTMLCanvasElement>('#game-canvas')!.toDataURL('image/jpeg',.9)))));
  await fs.writeFile('artifacts/qa/shield-frames/attack-with-shield.jpg',Buffer.from(jpg.split(',')[1],'base64'));
  await fs.writeFile('artifacts/qa/shield-attack-interaction.json',JSON.stringify({before,orbit,hit,errors},null,2));
});

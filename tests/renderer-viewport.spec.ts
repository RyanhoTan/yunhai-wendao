import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

test('the complete frozen camera view fits the real GPU buffer after resizing',async({page})=>{
  await page.goto('/?test=1');
  const records=[];
  for(const size of [{width:1280,height:720},{width:1100,height:700},{width:1280,height:720}]){
    await page.setViewportSize(size);
    await page.evaluate(async()=>{const h=window.__THREE_GAME_TEST_HOOKS__!;await h.setState('character-front');await h.setPausedForScreenshot(true);await h.setReducedMotion(true);await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    const state=await page.evaluate(()=>{
      const canvas=document.querySelector<HTMLCanvasElement>('#game-canvas')!,gl=canvas.getContext('webgl2')!;
      return {canvas:{width:canvas.width,height:canvas.height},buffer:{width:gl.drawingBufferWidth,height:gl.drawingBufferHeight},viewport:Array.from(gl.getParameter(gl.VIEWPORT) as Int32Array),player:window.__THREE_GAME_DIAGNOSTICS__!.player};
    });
    expect(state.viewport).toEqual([0,0,state.buffer.width,state.buffer.height]);
    expect(state.player.renderPosition).toEqual(state.player.position);records.push(state);
  }
  const out='artifacts/landscape-laas-20261010/viewport-fix';await mkdir(out,{recursive:true});
  await page.screenshot({path:`${out}/character-front.png`});await writeFile(`${out}/buffers.json`,JSON.stringify(records,null,2));
});

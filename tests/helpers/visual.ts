import {expect,test,type Page} from '@playwright/test';

/** Offscreen image checks use a full buffer; hardware captures and input tests run separately. */
export const fullResolutionTest=test.extend<{visualPage:Page}>({
  visualPage:async({playwright,baseURL,viewport,timezoneId},use)=>{
    const browser=await playwright.chromium.launch({channel:'chromium',headless:true,ignoreDefaultArgs:['--enable-features=CDPScreenshotNewSurface']});
    try{const page=await browser.newPage({baseURL,viewport,timezoneId,deviceScaleFactor:1});await use(page);}
    finally{await browser.close();}
  },
});

/** Freeze simulation immediately, then wait for presentation without advancing gameplay. */
export async function freezeScene(page:Page,state:string){
  await page.bringToFront();
  const buffer=await page.evaluate(async state=>{
    const hooks=window.__THREE_GAME_TEST_HOOKS__!;
    await hooks.setPausedForScreenshot(false);await hooks.seed(42);await hooks.setState(state);
    await hooks.setPausedForScreenshot(true);await hooks.setReducedMotion(true);await document.fonts.ready;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const canvas=document.querySelector<HTMLCanvasElement>('#game-canvas')!,gl=canvas.getContext('webgl2')!;
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    return {declared:[canvas.width,canvas.height],actual:[gl.drawingBufferWidth,gl.drawingBufferHeight],viewport:Array.from(gl.getParameter(gl.VIEWPORT) as Int32Array),renderer:debug?String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)):null};
  },state);
  expect(buffer.actual,`${state}: visual baselines require full physical resolution`).toEqual(buffer.declared);
  expect(buffer.viewport,`${state}: camera view fits the physical buffer`).toEqual([0,0,...buffer.actual]);
  test.info().annotations.push({type:'visual-buffer',description:JSON.stringify({state,...buffer})});
}

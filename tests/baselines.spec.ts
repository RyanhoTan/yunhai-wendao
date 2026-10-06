import {expect,test} from '@playwright/test';
test('stable world, elemental attack and transparent shield image baselines',async({page})=>{
  test.setTimeout(180_000);
  await page.goto('/?test=1');
  const elements=['metal','wood','water','fire','earth'].flatMap(element=>[`element-${element}-orbit`,`element-${element}-launch`]);
  const shields=['metal','wood','water','fire','earth','hit','flight','inside'].map(state=>`shield-${state}`);
  for(const name of ['active-play','boss','map','natural-land','forest','coast-rocks','character-front','character-back','character-portrait','town','town-entrance','town-shop','woodland-grove','woodland-floor','woodland-overlook','woodland-meadow','forest-entry','forest-expansion','forest-canopy',...elements,'vortex','pulse','sword-wave',...shields]){
    await page.evaluate(async state=>{const hooks=window.__THREE_GAME_TEST_HOOKS__!;await hooks.setPausedForScreenshot(false);await hooks.seed(42);await hooks.setState(state);await hooks.setPausedForScreenshot(true);await hooks.setReducedMotion(true);await document.fonts.ready;},name);
    await expect(page).toHaveScreenshot(`${name}.png`,{maxDiffPixelRatio:.012,animations:'disabled',timeout:30_000});
  }
});

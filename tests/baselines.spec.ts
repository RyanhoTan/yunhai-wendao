import {expect,test} from '@playwright/test';
test('stable active-play, boss and map image baselines',async({page})=>{
  await page.goto('/?test=1');
  for(const name of ['active-play','boss','map']){
    await page.evaluate(async state=>{const hooks=window.__THREE_GAME_TEST_HOOKS__!;await hooks.setPausedForScreenshot(false);await hooks.seed(42);await hooks.setState(state);await hooks.setPausedForScreenshot(true);await hooks.setReducedMotion(true);await document.fonts.ready;},name);
    await expect(page).toHaveScreenshot(`${name}.png`,{maxDiffPixelRatio:.012,animations:'disabled'});
  }
});

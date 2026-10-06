import {expect,test} from '@playwright/test';
test('stable gameplay, sparse woodland, expanded forest, coast and market street image baselines',async({page})=>{
  await page.goto('/?test=1');
  for(const name of ['active-play','boss','map','natural-land','forest','coast-rocks','character-front','character-back','character-portrait','town','town-entrance','town-shop','woodland-grove','woodland-floor','woodland-overlook','woodland-meadow','forest-entry','forest-expansion','forest-canopy']){
    await page.evaluate(async state=>{const hooks=window.__THREE_GAME_TEST_HOOKS__!;await hooks.setPausedForScreenshot(false);await hooks.seed(42);await hooks.setState(state);await hooks.setPausedForScreenshot(true);await hooks.setReducedMotion(true);await document.fonts.ready;},name);
    await expect(page).toHaveScreenshot(`${name}.png`,{maxDiffPixelRatio:.012,animations:'disabled'});
  }
});

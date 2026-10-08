import {expect,test} from '@playwright/test';
test.use({timezoneId:'Asia/Shanghai',trace:'off',video:'off'});
test('stable world, attacks, shields and adjustable weather image baselines',async({page})=>{
  test.setTimeout(180_000);
  await page.goto('/?test=1');
  const elements=['metal','wood','water','fire','earth'].flatMap(element=>[`element-${element}-orbit`,`element-${element}-launch`]);
  const shields=['metal','wood','water','fire','earth','hit','flight','inside'].map(state=>`shield-${state}`);
  const weather=['dawn','sunset','night','rain','night-rain','panel','flight-rain','town-rain','forest-night','town-night','sun-clear','sun-clouded'].map(state=>`weather-${state}`);
  const shanhai=['sect-foot','sect-summit','sect-overlook','sect-panorama','mountain-vista','waterfall','waterfall-night','jade-pool','creek-bank','creek-mouth','waterfall-flight'];
  for(const name of ['active-play','boss','map','natural-land','forest','coast-rocks','character-front','character-back','character-portrait','town','town-entrance','town-shop','woodland-grove','woodland-floor','woodland-overlook','woodland-meadow','forest-entry','forest-expansion','forest-canopy','wolf-contact','beast-contact',...elements,'vortex','pulse','sword-wave',...shields,...weather,...shanhai]){
    await page.evaluate(async state=>{const hooks=window.__THREE_GAME_TEST_HOOKS__!;await hooks.setPausedForScreenshot(false);await hooks.seed(42);await hooks.setState(state);await hooks.setPausedForScreenshot(true);await hooks.setReducedMotion(true);await document.fonts.ready;},name);
    await expect(page).toHaveScreenshot(`${name}.png`,{maxDiffPixelRatio:.012,animations:'disabled',timeout:30_000});
  }
});

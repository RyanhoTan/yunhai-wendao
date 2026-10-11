import {expect} from '@playwright/test';
import {freezeScene,fullResolutionTest as test} from './helpers/visual';
test.use({timezoneId:'Asia/Shanghai',trace:'off',video:'off'});
test('stable world, attacks, shields and adjustable weather image baselines',async({visualPage:page})=>{
  test.setTimeout(360_000);
  await page.goto('/?test=1');
  const elements=['metal','wood','water','fire','earth'].flatMap(element=>[`element-${element}-orbit`,`element-${element}-launch`]);
  const shields=['metal','wood','water','fire','earth','hit','flight','inside'].map(state=>`shield-${state}`);
  const weather=['dawn','sunset','night','rain','night-rain','panel','flight-rain','town-rain','forest-night','town-night','sun-clear','sun-clouded'].map(state=>`weather-${state}`);
  const shanhai=['sect-foot','sect-summit','sect-overlook','sect-panorama','mountain-vista','waterfall','waterfall-night','jade-pool','creek-bank','creek-mouth','waterfall-flight'];
  for(const name of ['active-play','boss','map','natural-land','forest','coast-rocks','town','town-entrance','town-shop','woodland-grove','woodland-floor','woodland-overlook','woodland-meadow','forest-entry','forest-expansion','forest-canopy','wolf-contact','beast-contact',...elements,'vortex','pulse','sword-wave',...shields,...weather,...shanhai]){
    await freezeScene(page,name);
    await expect(page).toHaveScreenshot(`${name}.png`,{maxDiffPixelRatio:.012,animations:'disabled',timeout:30_000});
  }
});

test('stable imported character front, back and portrait baselines',async({visualPage:page})=>{
  await page.goto('/?test=1');
  for(const name of ['character-front','character-back','character-portrait']){
    await freezeScene(page,name);
    await expect(page).toHaveScreenshot(`${name}.png`,{maxDiffPixelRatio:.012,animations:'disabled',timeout:30_000});
  }
});

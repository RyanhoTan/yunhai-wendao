import {chromium} from 'playwright';
import {writeFile,rename,mkdir,readFile} from 'node:fs/promises';
const out='artifacts/laas-quality-20261012/reference-live';
const flags=['--enable-unsafe-webgpu','--enable-features=Vulkan','--use-angle=vulkan','--ignore-gpu-blocklist','--force-device-scale-factor=1'];
const bootURL='https://dc5fzrbo8ssfx.cloudfront.net/laas/?seed=42&cam=1500,580.1177673339844,1900,0.65,-0.18,55&T=17.3&preset=high&freeze=1&hud=1&dpr=1';
await mkdir(`${out}/attempt-runtime-setter`,{recursive:true});
for(const name of ['mountain-vista-golden-T17.3','valley-forest-golden-T17.3'])for(const ext of ['.png','-hud.png','.json'])try{await rename(`${out}/${name}${ext}`,`${out}/attempt-runtime-setter/${name}${ext}`)}catch{}
const browser=await chromium.launch({channel:'chromium',headless:false,args:flags,env:{...process.env,VK_DRIVER_FILES:'/usr/share/vulkan/icd.d/nvidia_icd.json',VK_ICD_FILENAMES:'/usr/share/vulkan/icd.d/nvidia_icd.json'}});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});const log=[];const errors=[];const results=[];
page.on('console',m=>log.push({type:m.type(),text:m.text()}));page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(bootURL,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__laas?.ready||window.__laas?.error,{},{timeout:180000});
 const boot=await page.evaluate(()=>({ready:window.__laas.ready,error:window.__laas.error,body:document.body.innerText,diag:window.__laas.diag}));
 if(!boot.ready)throw Error(boot.error??'notready');
 if(!boot.body.includes('T=17.3'))throw Error('Time HUD does not confirm boot parameter T17.3');
 console.log('BOOT confirmed pure cam URL T17.3 '+JSON.stringify(boot.diag));
 for(const view of [{name:'mountain-vista-golden-T17.3',pose:{p:[1500,580.1177673339844,1900],yaw:0.65,pitch:-0.18,fov:55}},{name:'valley-forest-golden-T17.3',pose:{p:[-600,455.6548194885254,700],yaw:-0.6,pitch:-0.5,fov:55}}]){
  await page.evaluate(p=>window.__laas.setPose(p),view.pose);
  await page.evaluate(()=>window.__laas.settle(60));await page.waitForTimeout(1500);
  const hud=await page.locator('body').innerText();if(!hud.includes('T=17.3'))throw Error('Time HUD changed');
  await page.screenshot({path:`${out}/${view.name}-hud.png`});
  const hudNode=page.locator('#hud');if(await hudNode.isVisible())await page.keyboard.press('F3');
  await page.waitForTimeout(200);
  const data=await page.evaluate(()=>({pose:window.__laas.getPose(),diag:window.__laas.diag,stats:window.__laas.stats,error:window.__laas.error,canvas:{width:document.querySelector('canvas')?.width,height:document.querySelector('canvas')?.height},userAgent:navigator.userAgent,hudVisible:getComputedStyle(document.querySelector('#hud')).display!=='none'}));
  if(data.hudVisible)throw Error('HUD was not hidden');
  await page.screenshot({path:`${out}/${view.name}.png`});
  const canonicalURL=`https://dc5fzrbo8ssfx.cloudfront.net/laas/?seed=42&cam=${[...data.pose.p,data.pose.yaw,data.pose.pitch,data.pose.fov].join(',')}&T=17.3&preset=high&freeze=1&hud=0&dpr=1`;
  const evidence={name:view.name,classification:'our-live-deployment-runtime-capture',source:'https://dc5fzrbo8ssfx.cloudfront.net/laas/',sourceCommit:null,sourceCommitCaution:'Live unversioned deployment; do not attribute to repository fd75fdb without bundle comparison.',seed:42,T:17.3,preset:'high',freeze:true,shot:null,bootURL,canonicalURL,timeVerification:{method:'Fresh boot pure cam+T=17.3 URL without shot; no runtime time setter in this capture session.',observedHUD:17.3,noShotBookmarkOverride:true,noTimeSetter:true,hud},timestamp:new Date().toISOString(),flags,environment:{VK_DRIVER_FILES:'/usr/share/vulkan/icd.d/nvidia_icd.json'},browserVersion:browser.version(),viewport:{width:1280,height:720,dpr:1},commands:['page.goto recorded bootURL','window.__laas.setPose recorded exact pose','window.__laas.settle(60)','F3 hides debug HUD after evidence capture'],...data};
  await writeFile(`${out}/${view.name}.json`,JSON.stringify(evidence,null,2));results.push(evidence);console.log('CAPTURE '+view.name+' '+JSON.stringify({pose:data.pose,stats:data.stats}));
  await page.keyboard.press('F3');
 }
 await writeFile(`${out}/golden-pure-url-manifest.json`,JSON.stringify({bootURL,results,consoleLog:log,errors},null,2));
} catch(e){console.error(e);await page.screenshot({path:`${out}/golden-pure-url-failure.png`}).catch(()=>{});await writeFile(`${out}/golden-pure-url-failure.json`,JSON.stringify({error:e.message,body:await page.locator('body').innerText(),consoleLog:log,errors},null,2));process.exitCode=1;}finally{await browser.close();console.log('GPU workload released')}

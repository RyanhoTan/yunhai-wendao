import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out='artifacts/laas-quality-20261012/reference-live';
const flags=['--enable-unsafe-webgpu','--enable-features=Vulkan','--use-angle=vulkan','--ignore-gpu-blocklist','--force-device-scale-factor=1'];
const browser=await chromium.launch({channel:'chromium',headless:false,args:flags,env:{...process.env,VK_DRIVER_FILES:'/usr/share/vulkan/icd.d/nvidia_icd.json',VK_ICD_FILENAMES:'/usr/share/vulkan/icd.d/nvidia_icd.json'}});
const results=[];const consoleLog=[];const errors=[];const runtimeAssets=[];let page;
try{
page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
page.on('console',m=>consoleLog.push({type:m.type(),text:m.text(),timestamp:new Date().toISOString()}));page.on('pageerror',e=>errors.push(e.message));
page.on('response',async r=>{if(r.url().includes('/laas/assets/')&&r.url().endsWith('.js'))try{const data=await r.body();runtimeAssets.push({url:r.url(),status:r.status(),bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')})}catch(e){errors.push('asset metadata: '+e.message)}});
const bootURL='https://dc5fzrbo8ssfx.cloudfront.net/laas/?seed=42&shot=7&T=12&preset=high&freeze=1&hud=1&dpr=1';
await page.goto(bootURL,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction(()=>window.__laas?.ready||window.__laas?.error,{},{timeout:180000});
const boot=await page.evaluate(()=>({ready:window.__laas.ready,error:window.__laas.error,pose:window.__laas.getPose?.(),diag:window.__laas.diag,stats:window.__laas.stats,body:document.body.innerText}));
console.log('BOOT '+JSON.stringify(boot));
if(!boot.ready)throw Error(boot.error??'not ready');
const views=[
 {name:'forest-interior-noon',shot:7,T:12,grounded:true},
 {name:'floor-roots-noon',shot:7,T:12,grounded:true,pitch:-0.4},
 {name:'cliff-gorge-noon',shot:6,T:12,grounded:true},
 {name:'mountain-vista-golden-T17.3',shot:3,T:17.3},
 {name:'valley-forest-golden-T17.3',shot:9,T:17.3}
];
for(const view of views){
 await page.keyboard.press(String(view.shot));
 const commandedPose=await page.evaluate(v=>{const h=window.__laas;h.setTimeOfDay(v.T);const p=h.getPose();if(v.grounded){const g=h.groundProbe(p.p[0],p.p[2]);p.p[1]=Math.max(g.ground+1.75,g.water+0.8)}if(v.pitch!==undefined)p.pitch=v.pitch;h.setPose(p);return p},view);
 await page.evaluate(()=>window.__laas.settle(48));
 await page.waitForTimeout(2500);
 const data=await page.evaluate(()=>({pose:window.__laas.getPose(),diag:window.__laas.diag,stats:window.__laas.stats,error:window.__laas.error,hud:document.body.innerText,canvas:{width:document.querySelector('canvas')?.width,height:document.querySelector('canvas')?.height},userAgent:navigator.userAgent}));
 await page.screenshot({path:`${out}/${view.name}-hud.png`});
 await page.locator('canvas').screenshot({path:`${out}/${view.name}.png`});
 const cmdPose=[...data.pose.p,data.pose.yaw,data.pose.pitch,...(data.pose.fov?[data.pose.fov]:[])].join(',');
 const canonicalURL=`https://dc5fzrbo8ssfx.cloudfront.net/laas/?seed=42&cam=${cmdPose}&T=${view.T}&preset=high&freeze=1&hud=1&dpr=1`;
 const evidence={...view,classification:'our-live-deployment-runtime-capture',source:'https://dc5fzrbo8ssfx.cloudfront.net/laas/',sourceCommit:null,sourceCommitCaution:'Live unversioned deployment; do not attribute to repository fd75fdb commit without bundle comparison.',bootURL,canonicalURL,commands:['keyboard Digit'+view.shot,'window.__laas.setTimeOfDay('+view.T+')','window.__laas.setPose recorded above','window.__laas.settle(48)'],commandedPose,timestamp:new Date().toISOString(),flags,environment:{VK_DRIVER_FILES:'/usr/share/vulkan/icd.d/nvidia_icd.json'},browserVersion:browser.version(),viewport:{width:1280,height:720,dpr:1},...data};
 await writeFile(`${out}/${view.name}.json`,JSON.stringify(evidence,null,2)); results.push(evidence);
 console.log('CAPTURE '+view.name+' '+JSON.stringify({pose:data.pose,stats:data.stats,hud:data.hud.slice(0,350)}));
}
await writeFile(`${out}/manifest.json`,JSON.stringify({timestamp:new Date().toISOString(),classification:'our-live-deployment-runtime-capture',sourceCommit:null,bootURL,flags,browserVersion:browser.version(),runtimeAssets,consoleLog,errors,results},null,2));
} catch(e){console.error(e); if(page){await page.screenshot({path:`${out}/capture-failure.png`}).catch(()=>{});await writeFile(`${out}/capture-failure.json`,JSON.stringify({message:e.message,body:await page.locator('body').innerText().catch(()=>''),consoleLog,errors,runtimeAssets,results},null,2));}process.exitCode=1;} finally {await browser.close();console.log('GPU workload released')}

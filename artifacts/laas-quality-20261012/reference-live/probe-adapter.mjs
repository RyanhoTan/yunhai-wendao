import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
const flags = ['--enable-unsafe-webgpu','--enable-features=Vulkan','--use-angle=vulkan','--ignore-gpu-blocklist','--force-device-scale-factor=1'];
const browser = await chromium.launch({channel:'chromium',headless:false,args:flags,env:{...process.env,VK_DRIVER_FILES:'/usr/share/vulkan/icd.d/nvidia_icd.json',VK_ICD_FILENAMES:'/usr/share/vulkan/icd.d/nvidia_icd.json'}});
try {
const page=await browser.newPage();
await page.goto('https://dc5fzrbo8ssfx.cloudfront.net/laas/?seed=42&shot=7&T=12&preset=high&freeze=1&hud=1');
const consoleLog=[]; page.on('console',m=>consoleLog.push({type:m.type(),text:m.text()}));page.on('pageerror',e=>consoleLog.push({type:'pageerror',text:e.message}));
const adapter=await page.evaluate(async()=>{const a=await navigator.gpu?.requestAdapter({powerPreference:'high-performance'});return a?{info:Object.fromEntries(['vendor','architecture','device','description','backend','type'].map(k=>[k,a.info?.[k]??null])),features:[...a.features],limits:Object.fromEntries(['maxBufferSize','maxStorageBufferBindingSize'].map(k=>[k,a.limits[k]])),fallback:a.isFallbackAdapter??null}:null});
console.log(JSON.stringify({adapter,flags,browserVersion:browser.version()}));
await page.waitForTimeout(30000);
const result={url:page.url(),adapter,flags,browserVersion:browser.version(),timestamp:new Date().toISOString(),body:await page.locator('body').innerText(),consoleLog};
await page.screenshot({path:'artifacts/laas-quality-20261012/reference-live/probe-rtx4050.png'});
await writeFile('artifacts/laas-quality-20261012/reference-live/probe-rtx4050.json',JSON.stringify(result,null,2));
console.log(result.body);
}finally{await browser.close()}

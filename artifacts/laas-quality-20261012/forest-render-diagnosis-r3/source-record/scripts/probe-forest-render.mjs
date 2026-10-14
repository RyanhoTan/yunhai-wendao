import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const stage=process.argv[2];
if(!/^forest-render-diagnosis-[a-z0-9-]+$/.test(stage??''))throw new Error('Invalid probe stage');
const out=`artifacts/laas-quality-20261012/${stage}`;await mkdir(out,{recursive:false});
const variants=(process.argv[3]??'unchanged,bark-bump-off,shadow-off,majority-lod').split(',');
if(variants.some(v=>!['unchanged','bark-bump-off','shadow-off','majority-lod','late-world-lod'].includes(v)))throw new Error('Invalid probe variants');
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={complete:false,purpose:'Diagnostic intervention on real WebGL shader/uniform calls only. No production source modification. These images are not final visual acceptance or FPS evidence.',sourceHash:sha(await readFile('src/world/WoodlandMaterials.ts')),scriptHash:sha(await readFile(new URL(import.meta.url))),cases:[]};
const save=()=>writeFile(`${out}/status.json`,JSON.stringify(report,null,2)+'\n');await save();
let browser;
try{
  browser=await chromium.launch({channel:'chromium',headless:false,args:['--force-device-scale-factor=1']});
    for(const variant of variants){
    const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await context.addInitScript(variant=>{
      const names=new WeakMap(),stats={variant,barkOverrides:0,shadowOverrides:0,shaderOverrides:0};window.__FOREST_RENDER_PROBE__=stats;
      const gl=WebGL2RenderingContext.prototype,location=gl.getUniformLocation,uniform=gl.uniform1f,source=gl.shaderSource;
      gl.getUniformLocation=function(program,name){const value=location.call(this,program,name);if(value)names.set(value,name);return value;};
      gl.uniform1f=function(location,value){
        const name=names.get(location)??'';
        if(variant==='bark-bump-off'&&name==='bumpScale'&&Math.abs(value-.018)<1e-7){value=0;stats.barkOverrides++;}
        if(variant==='shadow-off'&&name.endsWith('.shadowIntensity')){value=0;stats.shadowOverrides++;}
        return uniform.call(this,location,value);
      };
      gl.shaderSource=function(shader,text){
        const needle='if(woodlandThreshold<woodlandLower||woodlandThreshold>=woodlandUpper)discard;';
        if(variant==='majority-lod'&&text.includes(needle)){text=text.replace(needle,'if(woodlandUpper-woodlandLower<.5)discard;');stats.shaderOverrides++;}
        if(variant==='late-world-lod'&&text.includes(needle)){
          text=text.replace(needle,'');const end=text.lastIndexOf('}');
          text=text.slice(0,end)+needle+'\n'+text.slice(end);stats.shaderOverrides++;
        }
        return source.call(this,shader,text);
      };
    },variant);
    const page=await context.newPage(),errors=[],served={};page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    const responses=[];page.on('response',r=>{if(new URL(r.url()).pathname.endsWith('.js')&&r.status()===200)responses.push(r.body().then(b=>{served[new URL(r.url()).pathname]=sha(b);}));});
    await page.goto('http://127.0.0.1:4194/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setState('quality-floor-noon'));
    await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setReducedMotion(true));
    await page.waitForTimeout(400);await page.mouse.move(640,340);await page.mouse.down({button:'right'});
    // A single real drag reaches the previous orbit endpoint without depending
    // on intermediate render scheduling while shaders compile.
    try{await page.mouse.move(640+Math.sin(16*.35)*230,340+(.05-.36)/.004,{steps:4});}
    finally{await page.mouse.up({button:'right'});}
    await page.waitForTimeout(1200);await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true));await page.waitForTimeout(180);
    const state=await page.evaluate(()=>({probe:window.__FOREST_RENDER_PROBE__,diagnostics:window.__THREE_GAME_DIAGNOSTICS__,gpu:(()=>{const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null;})()}));
    await page.screenshot({path:`${out}/${variant}.png`});await Promise.all(responses);
    report.cases.push({variant,...state,served,errors});await save();await context.close();
    const reference=report.cases[0].diagnostics.camera,actual=state.diagnostics.camera;
    const delta=Math.hypot(actual.position.x-reference.position.x,actual.position.y-reference.position.y,actual.position.z-reference.position.z);
    if(delta>.01)throw new Error(`${variant} diagnostic camera differs by ${delta}m`);
    if(errors.length)throw new Error(`${variant} has renderer errors`);
    if(variant==='bark-bump-off'&&!state.probe.barkOverrides||variant==='shadow-off'&&!state.probe.shadowOverrides||['majority-lod','late-world-lod'].includes(variant)&&!state.probe.shaderOverrides)throw new Error(`${variant} intervention did not execute`);
    console.log(`${variant}: ${JSON.stringify({probe:state.probe,camera:state.diagnostics.camera,gpu:state.gpu})}`);
  }
  report.complete=true;await save();
}catch(error){report.error=String(error);await save();throw error;}
finally{await browser?.close();}

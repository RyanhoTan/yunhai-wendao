import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';

// Video decoding only; this browser supplies no gameplay performance measurements.
const input=process.argv[2]??'artifacts/qa/hero-motion.webm';
const output=process.argv[3]??'artifacts/qa/character-motion-sheet.png';
const fullFrame=process.argv.includes('--full-frame');
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--disable-gpu']});
try{
  const page=await browser.newPage();
  const bytes=await readFile(input);
  const result=await page.evaluate(async ({base64,fullFrame})=>{
    const video=document.createElement('video');video.muted=true;video.src=`data:video/webm;base64,${base64}`;
    await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=reject;});
    const frameWidth=fullFrame?480:380,frameHeight=fullFrame?270:340;
    const canvas=document.createElement('canvas');canvas.width=frameWidth*4;canvas.height=(frameHeight+20)*3;
    const context=canvas.getContext('2d');context.fillStyle='#12211e';context.fillRect(0,0,canvas.width,canvas.height);
    for(let i=0;i<12;i++){
      const time=(i+.3)/12*Math.max(.1,video.duration-.15);
      await new Promise(resolve=>{video.onseeked=resolve;video.currentTime=time;});
      const x=i%4*frameWidth,y=Math.floor(i/4)*(frameHeight+20);
      if(fullFrame)context.drawImage(video,0,0,video.videoWidth,video.videoHeight,x,y,frameWidth,frameHeight);
      else context.drawImage(video,450,185,380,340,x,y,380,340);
      context.fillStyle='#eadab7';context.font='14px sans-serif';context.fillText(`${time.toFixed(2)}s`,x+8,y+frameHeight+14);
    }
    return {png:canvas.toDataURL('image/png').split(',')[1],duration:video.duration,frames:12};
  },{base64:bytes.toString('base64'),fullFrame});
  await writeFile(output,Buffer.from(result.png,'base64'));
  console.log(JSON.stringify({input,output,duration:result.duration,frames:result.frames}));
}finally{await browser.close();}

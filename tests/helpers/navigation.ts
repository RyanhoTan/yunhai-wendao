import type {Page} from '@playwright/test';
export async function walk(page:Page,x:number,z:number){
  let held:string[]=[];
  try{
    for(let i=0;i<230;i++){
      const p=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player),dx=x-p.position.x,dz=z-p.position.z;
      if(Math.hypot(dx,dz)<1)return;
      const right=Math.cos(p.yaw)*dx-Math.sin(p.yaw)*dz,forward=-Math.sin(p.yaw)*dx-Math.cos(p.yaw)*dz,next:string[]=[];
      if(Math.abs(right)>.4)next.push(right>0?'KeyD':'KeyA');if(Math.abs(forward)>.4)next.push(forward>0?'KeyW':'KeyS');
      for(const key of held)if(!next.includes(key))await page.keyboard.up(key);
      for(const key of next)if(!held.includes(key))await page.keyboard.down(key);
      held=next;await page.waitForTimeout(90);
    }
    throw new Error(`Mountain circuit could not reach ${x},${z}`);
  }finally{for(const key of held)await page.keyboard.up(key);}
}

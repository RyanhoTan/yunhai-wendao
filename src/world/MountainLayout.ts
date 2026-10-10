import {SECT_ASCENT,SECT_SUMMIT} from './WorldLayout';
import {sectGroundBlend} from './SectLayout';

const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
export function ascentDistance(x:number,z:number){
  let nearest=Infinity;
  for(let i=1;i<SECT_ASCENT.length;i++){
    const a=SECT_ASCENT[i-1],b=SECT_ASCENT[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
    nearest=Math.min(nearest,Math.hypot(x-a.x-dx*t,z-a.z-dz*t));
  }
  return nearest;
}
/** All overlapping trail influences blend; a nearest-segment switch cannot create a seam. */
export function summitLandscape(x:number,z:number,original:number){
  let profile=SECT_SUMMIT.height;
  for(let i=1;i<SECT_ASCENT.length;i++){
    const a=SECT_ASCENT[i-1],b=SECT_ASCENT[i];
    if(z<=a.z&&z>=b.z){profile=a.y+(b.y-a.y)*smooth(b.z,a.z,a.z+b.z-z);break;}
  }
  // The hillside follows the ascent's broad elevation profile. A radial mound
  // would leave huge artificial retaining cliffs at the outer switchbacks.
  const shoulder=(1-smooth(72,108,Math.abs(x)))*(1-smooth(114,126,z))*(1-smooth(25,80,-z));
  let h=original*(1-shoulder)+profile*shoulder;
  let weight=0,weightedHeight=0,blend=0;
  for(let i=1;i<SECT_ASCENT.length;i++){
    const a=SECT_ASCENT[i-1],b=SECT_ASCENT[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
    const d=Math.hypot(x-a.x-dx*t,z-a.z-dz*t),w=1-smooth(3.6,6.1,d);
    const length=Math.hypot(dx,dz),start=i===1?0:27,end=i===SECT_ASCENT.length-1?0:27;
    // Level hairpin landings keep both sides of a turn at the same elevation.
    const graded=smooth(start,length-end,t*length);
    weight+=w;weightedHeight+=(a.y+(b.y-a.y)*graded)*w;blend=Math.max(blend,w);
  }
  // A broad level forecourt supports the mentor, herbs and the temple foundation.
  const plaza=1-smooth(38,44,Math.hypot(x,z-14));
  h=h*(1-plaza)+SECT_SUMMIT.height*plaza;
  const site=sectGroundBlend(x,z);
  h=h*(1-site)+SECT_SUMMIT.height*site;
  if(weight>0)h=h*(1-blend)+(weightedHeight/weight)*blend;
  return h;
}

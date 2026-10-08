import {shorelineAt} from './CoastMath';

export type WaterPoint={x:number;z:number;y:number;r:number};
export const JADE_POOL={x:130,z:-120,y:3,rx:12,rz:10};
export const WATERCOURSE:readonly WaterPoint[]=[
  {x:187,z:-182,y:56,r:4},{x:187,z:-163,y:56,r:3},
  {x:183,z:-151,y:16,r:4},{x:174,z:-143,y:16,r:3},{x:166,z:-136,y:16,r:3},
  {x:156,z:-129,y:3,r:4},{x:142,z:-122,y:3,r:4},
  {x:130,z:-114,y:3,r:3},{x:154,z:-99,y:2.9,r:3},{x:183,z:-73,y:2.7,r:3},
  {x:216,z:-20,y:2.4,r:3},{x:221,z:40,y:1.9,r:3},{x:205,z:111,y:1,r:3},
  {x:205,z:shorelineAt(205)-2,y:.09,r:3},{x:205,z:shorelineAt(205)+3,y:0,r:3},
];
export const WATERFALLS=[{from:1,to:2},{from:4,to:5}] as const;
export const WATERFALL_LANDMARK={name:'叠瀑谷',x:178,z:-146};
/** A shared miter section joins flat water and cataracts without triangle gaps. */
export function waterSection(index:number){
  const p=WATERCOURSE[index],a=WATERCOURSE[Math.max(0,index-1)],b=WATERCOURSE[Math.min(WATERCOURSE.length-1,index+1)];
  const incoming=Math.hypot(p.x-a.x,p.z-a.z),outgoing=Math.hypot(b.x-p.x,b.z-p.z);
  const nx1=incoming?-(p.z-a.z)/incoming:-(b.z-p.z)/outgoing,nz1=incoming?(p.x-a.x)/incoming:(b.x-p.x)/outgoing;
  const nx2=outgoing?-(b.z-p.z)/outgoing:nx1,nz2=outgoing?(b.x-p.x)/outgoing:nz1;
  const length=Math.hypot(nx1+nx2,nz1+nz2),nx=(nx1+nx2)/length,nz=(nz1+nz2)/length;
  const scale=p.r/Math.max(.35,nx*nx1+nz*nz1);
  return{x:nx*scale,z:nz*scale};
}
const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
export function nearestWater(x:number,z:number){
  let d=Infinity,y=0,r=0,segment=-1;
  for(let i=1;i<WATERCOURSE.length;i++){
    const a=WATERCOURSE[i-1],b=WATERCOURSE[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
    const distance=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
    if(distance<d){d=distance;y=a.y+(b.y-a.y)*t;r=a.r+(b.r-a.r)*t;segment=i-1;}
  }
  return{d,y,r,segment};
}
/** A shallow physical bed follows the visible water, including both cataracts. */
export function gorgeHeight(x:number,z:number,original:number){
  if(x<90||x>260||z<-213||z>shorelineAt(205)+38)return original;
  const source=Math.hypot((x-187)/1.2,z+179),plateau=1-smooth(16,29,source);
  let h=original*(1-plateau)+55.5*plateau;
  let weight=0,target=0,blend=0,coreBed=Infinity;
  // Blend every influence at bends rather than changing discontinuously to the nearest one.
  for(let i=1;i<WATERCOURSE.length;i++){
    const a=WATERCOURSE[i-1],b=WATERCOURSE[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
    // Reserve a 1.2m sampling margin so the 1m terrain triangles stay below
    // the complete water strip, including its edges on the steep cataracts.
    const d=Math.hypot(x-a.x-dx*t,z-a.z-dz*t),r=a.r+(b.r-a.r)*t;
    // The lower stream has a broad valley shoulder; only the cataracts retain
    // a narrow rock gorge. This avoids excavating a slot through rolling hills.
    const shoulder=i>=7?30-(30-7.2)*smooth(110,135,z):7.2;
    const w=1-smooth(r+1.2,r+shoulder,d);
    const falling=WATERFALLS.some(f=>f.from===i-1);
    const depth=falling?.5:.5*(1-smooth(.65,1,d/r));
    const bed=a.y+(b.y-a.y)*t-depth;
    if(d<=r+1.2)coreBed=Math.min(coreBed,bed);
    weight+=w;target+=bed*w;blend=Math.max(blend,w);
  }
  if(weight>0)h=h*(1-blend)+target/weight*blend;
  h=Math.min(h,coreBed);
  const pond=Math.hypot((x-JADE_POOL.x)/JADE_POOL.rx,(z-JADE_POOL.z)/JADE_POOL.rz),p=1-smooth(1,1.65,pond);
  const pondBed=JADE_POOL.y-.5*(1-smooth(.75,1,pond));
  return h*(1-p)+pondBed*p;
}
export function inWaterCorridor(x:number,z:number,extra=0){
  if(x<108-extra||x>240+extra)return false;
  const w=nearestWater(x,z);
  return w.d<w.r+7+extra||Math.hypot((x-JADE_POOL.x)/JADE_POOL.rx,(z-JADE_POOL.z)/JADE_POOL.rz)<1.65+extra/10;
}

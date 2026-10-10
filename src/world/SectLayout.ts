import {SECT_SUMMIT} from './WorldLayout';

export type SectBuildingKind = 'library' | 'alchemy' | 'residence' | 'pavilion' | 'gate';
/** Metres, front +Z. Width/depth include the stone plinth, excluding entrance steps. */
export interface SectBuildingPlacement {
  id: string; name: string; kind: SectBuildingKind;
  x: number; z: number; yaw: number; width: number; depth: number; floor: number; entryWidth: number;
}
export const SECT_BUILDINGS: readonly SectBuildingPlacement[] = [
  {id:'scripture-library',name:'藏经阁',kind:'library',x:-28,z:8,yaw:0,width:14,depth:11,floor:.75,entryWidth:2.4},
  {id:'alchemy-hall',name:'炼丹堂',kind:'alchemy',x:31,z:14,yaw:0,width:19,depth:11,floor:.8,entryWidth:2.4},
  {id:'residence-west',name:'弟子居所·西院',kind:'residence',x:22,z:-28,yaw:0,width:9,depth:7,floor:.45,entryWidth:1.9},
  {id:'residence-north',name:'弟子居所·北院',kind:'residence',x:38,z:-30,yaw:0,width:9,depth:7,floor:.45,entryWidth:1.9},
  {id:'residence-east',name:'弟子居所·东院',kind:'residence',x:43,z:-12,yaw:-Math.PI/2,width:9,depth:7,floor:.45,entryWidth:1.9},
  {id:'viewing-pavilion',name:'观景亭',kind:'pavilion',x:-40,z:27,yaw:0,width:8,depth:8,floor:.6,entryWidth:2.4},
  {id:'mountain-gate',name:'云岚山门',kind:'gate',x:25,z:66-(65-25)*15/130,yaw:Math.atan2(130,15),width:6.4,depth:2.4,floor:.06,entryWidth:4},
];
export const SECT_PATHS = [
  [{x:0,z:29},{x:-28,z:29},{x:-28,z:16}],
  [{x:0,z:29},{x:31,z:29},{x:31,z:22}],
  [{x:-28,z:29},{x:-28,z:35},{x:-40,z:35},{x:-40,z:34}],
  [{x:16,z:29},{x:16,z:-18},{x:22,z:-18},{x:22,z:-22}],
  [{x:22,z:-18},{x:38,z:-18},{x:38,z:-24}],
  [{x:38,z:-18},{x:36,z:-12},{x:38,z:-12}],
] as const;

const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
export function sectLocal(p:SectBuildingPlacement,x:number,z:number) {
  const dx=x-p.x,dz=z-p.z,c=Math.cos(p.yaw),s=Math.sin(p.yaw);
  return {x:dx*c-dz*s,z:dx*s+dz*c};
}
export function sectWorld(p:SectBuildingPlacement,x:number,z:number) {
  const c=Math.cos(p.yaw),s=Math.sin(p.yaw);
  return {x:p.x+x*c+z*s,z:p.z-x*s+z*c};
}
export function sectPathDistance(x:number,z:number) {
  let distance=Infinity;
  for(const route of SECT_PATHS)for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
    distance=Math.min(distance,Math.hypot(x-a.x-dx*t,z-a.z-dz*t));
  }
  return distance;
}
/** Broaden only the rear/right summit shoulder; existing switchback grades retain priority. */
export function sectGroundBlend(x:number,z:number) {
  if(x<-55||x>57||z<-48||z>50)return 0;
  const yard=(1-smooth(44,56,Math.abs(x)))*(1-smooth(34,47,-z))*(1-smooth(39,46,z));
  if(yard===1)return 1;
  let terraces=0;
  for(const p of SECT_BUILDINGS){if(p.kind==='gate')continue;
    const q=sectLocal(p,x,z),d=Math.max(Math.abs(q.x)-p.width/2,-q.z-p.depth/2,q.z-p.depth/2-2.4);
    terraces=Math.max(terraces,1-smooth(1.5,7,d));
  }
  return Math.max(yard,terraces);
}
export function sectProtected(x:number,z:number,extra=0) {
  if(sectPathDistance(x,z)<2.1+extra)return true;
  return SECT_BUILDINGS.some(p=>{
    const q=sectLocal(p,x,z);
    return Math.abs(q.x)<p.width/2+2+extra && q.z>-p.depth/2-2-extra && q.z<p.depth/2+4.2+extra;
  });
}
/** Shared by visual stair recipe and feet height; highest overlapping tread wins. */
export function sectFloorOffset(p:SectBuildingPlacement,x:number,z:number) {
  const q=sectLocal(p,x,z);
  if(p.kind==='gate')return Math.abs(q.x)<=p.width/2&&Math.abs(q.z)<=p.depth/2?p.floor:null;
  if(p.kind==='pavilion'){
    // Regular hexagon, a front edge parallel to X and the entrance facing +Z.
    const r=p.width/2+.07,az=Math.abs(q.z),ax=Math.abs(q.x);
    if(az<=r*Math.sqrt(3)/2 && ax<=r-az/Math.sqrt(3))return p.floor;
  }else if(Math.abs(q.x)<=p.width/2 && Math.abs(q.z)<=p.depth/2)return p.floor;
  const stairStart=p.kind==='pavilion'?p.width/2*Math.sqrt(3)/2:p.depth/2;
  if(Math.abs(q.x)>(p.entryWidth+1.2)/2)return null;
  const count=Math.ceil(p.floor/.15),stepDepth=2.4/count;
  let height:number|null=null;
  for(let i=0;i<count;i++){
    const center=stairStart+2.4-(i+.5)*stepDepth;
    if(Math.abs(q.z-center)<=stepDepth/2+.0175)height=(i+1)*p.floor/count;
  }
  return height;
}
export const SECT_GROUND_Y=SECT_SUMMIT.height;
// Match the graded upper switchback at the gate centre, not an unrelated fixed altitude.
const gateSegmentLength=Math.hypot(130,15);
export const SECT_GATE_Y=73+14*smooth(27,gateSegmentLength-27,(65-SECT_BUILDINGS[6].x)/130*gateSegmentLength);
export function sectGateGrade(x:number,z:number,height:number) {
  const gate=SECT_BUILDINGS[6],q=sectLocal(gate,x,z);
  const d=Math.max(Math.abs(q.x)-gate.width/2,Math.abs(q.z)-gate.depth/2);
  const blend=1-smooth(1.1,2.7,d);
  return height*(1-blend)+SECT_GATE_Y*blend;
}
export function sectBuildingAt(x:number,z:number) {
  return SECT_BUILDINGS.find(p=>{const q=sectLocal(p,x,z);return Math.abs(q.x)<p.width/2+1.5 && Math.abs(q.z)<p.depth/2+2.8;});
}

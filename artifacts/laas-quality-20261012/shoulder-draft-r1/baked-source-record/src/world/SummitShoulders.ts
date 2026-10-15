import {landNoise} from './NaturalTerrain';

const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
// Ridges connect the existing summit/side-peak anchors. Unequal lengths and
// off-axis toes stop the platform edge from continuing as one vertical wall.
// All centres stay inside the current main-mountain footprint; this module
// neither moves the road nor modifies the building's protected foundation.
const shoulders=[
  {ax:-37,az:-8,bx:-137,bz:-58,width:28,top:137,toe:16,seed:11},
  {ax:-25,az:-35,bx:-105,bz:-133,width:24,top:138,toe:18,seed:37},
  {ax:25,az:-33,bx:106,bz:-125,width:27,top:137,toe:16,seed:59},
  {ax:43,az:8,bx:140,bz:-37,width:25,top:137,toe:14,seed:83},
  {ax:29,az:40,bx:110,bz:99,width:27,top:135,toe:11,seed:107},
  {ax:-33,az:35,bx:-126,bz:101,width:25,top:134,toe:12,seed:131},
] as const;

/** Absolute ridge elevations. The caller keeps the existing natural floor,
 * then cuts the shared ravines and applies final road/building foundations. */
export function summitShoulderHeight(x:number,z:number):number{
  let height=0;
  for(const ridge of shoulders){
    const padding=ridge.width*1.5;
    if(x<Math.min(ridge.ax,ridge.bx)-padding||x>Math.max(ridge.ax,ridge.bx)+padding||z<Math.min(ridge.az,ridge.bz)-padding||z>Math.max(ridge.az,ridge.bz)+padding)continue;
    const dx=ridge.bx-ridge.ax,dz=ridge.bz-ridge.az,length=Math.hypot(dx,dz);
    const projection=((x-ridge.ax)*dx+(z-ridge.az)*dz)/(length*length);
    const t=Math.max(0,Math.min(1,projection));
    const meander=landNoise(t*2.6+ridge.seed,ridge.seed*.31)*4.5*Math.sin(t*Math.PI);
    const px=ridge.ax+dx*t-dz/length*meander,pz=ridge.az+dz*t+dx/length*meander;
    const distance=Math.hypot(x-px,z-pz),width=ridge.width*(.78+t*.43);
    if(distance>=width)continue;
    const cross=1-smooth(.20,1,distance/width);
    const longitudinal=1-smooth(0,1,t);
    const crown=landNoise(x*.037+ridge.seed,z*.031-ridge.seed)*3.2*Math.sin(t*Math.PI);
    height=Math.max(height,(ridge.toe+(ridge.top-ridge.toe)*longitudinal+crown)*cross);
  }
  return height;
}

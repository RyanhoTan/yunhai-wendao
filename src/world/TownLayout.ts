import * as THREE from 'three';

export const TOWN={name:'听潮坊',x:125,z:83,groundY:3.4,streetHalfWidth:5.1,north:38,south:130};
export const TOWN_APPROACH=[{x:0,z:65},{x:52,z:72},{x:87,z:127},{x:125,z:137}];
export const TOWN_SHOPS=Array.from({length:12},(_,i)=>({
  index:i,side:i<6?-1:1,z:53+(i%6)*12.5,x:TOWN.x+(i<6?-1:1)*6.2,
  storeys:i%3===0?2:1,width:10.4,depth:7.4,
}));

/** Shared keep-out and foundation field for terrain, buildings and foliage. */
export function townDistance(x:number,z:number){
  return Math.hypot(Math.max(0,Math.abs(x-TOWN.x)-22),Math.max(0,Math.abs(z-TOWN.z)-47));
}
export function townBlend(x:number,z:number){return 1-THREE.MathUtils.smoothstep(townDistance(x,z),0,12);}
export function inTown(x:number,z:number){return Math.abs(x-TOWN.x)<23&&z>TOWN.north-3&&z<TOWN.south+3;}

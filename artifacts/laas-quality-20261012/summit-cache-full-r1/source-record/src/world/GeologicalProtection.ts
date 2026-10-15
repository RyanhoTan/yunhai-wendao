import {SECT_BUILDINGS,sectLocal,sectPathDistance} from './SectLayout';
import {WATERCOURSE,JADE_POOL} from './WaterLayout';

const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};

/** Same foundation/path keep-out as sectProtected(...,1.5), with a physical
 * transition outside it. A binary mask inside a 1m cell produced metre-scale
 * cracks regardless of further mesh refinement. The protected volume stays 0. */
export function sectRockExposure(x:number,z:number){
  let clearance=sectPathDistance(x,z)-3.6;
  for(const building of SECT_BUILDINGS){
    const q=sectLocal(building,x,z);
    clearance=Math.min(clearance,Math.max(Math.abs(q.x)-building.width/2-3.5,-q.z-building.depth/2-3.5,q.z-building.depth/2-5.7));
  }
  return smooth(clearance/2.5);
}

/** Union of stream-bank envelopes, with continuous outside embedding. Taking
 * the union also avoids switching width at a nearest-segment Voronoi edge. */
export function waterRockExposure(x:number,z:number){
  if(x<102||x>247)return 1;
  let clearance=(Math.hypot((x-JADE_POOL.x)/JADE_POOL.rx,(z-JADE_POOL.z)/JADE_POOL.rz)-1.8)*10;
  for(let i=1;i<WATERCOURSE.length;i++){
    const a=WATERCOURSE[i-1],b=WATERCOURSE[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
    clearance=Math.min(clearance,Math.hypot(x-a.x-dx*t,z-a.z-dz*t)-(a.r+(b.r-a.r)*t)-8.5);
  }
  return smooth(clearance/2.5);
}

export function rockClearanceFade(clearance:number){return smooth(clearance/2.5);}

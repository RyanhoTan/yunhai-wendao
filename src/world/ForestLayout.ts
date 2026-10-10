import {WESTERN_FOREST} from './WorldLayout';
import * as THREE from 'three';

/** Connected forest shoulders frame the open valleys, roads and quest clearings. */
export const FOREST_GROVES = [
  {x:-207,z:-224,rx:65,rz:57},
  {x:-121,z:-132,rx:74,rz:63},
  {x:176,z:-166,rx:65,rz:67},
  {x:237,z:-34,rx:47,rz:68},
  {x:-218,z:42,rx:68,rz:51},
  {x:78,z:-235,rx:58,rz:45},
  WESTERN_FOREST,
  {x:-321,z:25,rx:67,rz:68},
  {x:-145,z:-18,rx:59,rz:57},
  {x:112,z:-42,rx:59,rz:52},
] as const;

export function woodlandCover(x:number,z:number):number {
  let cover=0;
  for(const grove of FOREST_GROVES){
    const distance=Math.hypot((x-grove.x)/grove.rx,(z-grove.z)/grove.rz);
    cover=Math.max(cover,1-THREE.MathUtils.smoothstep(distance,.55,1.12));
  }
  return cover;
}

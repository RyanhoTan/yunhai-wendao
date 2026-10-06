import * as THREE from 'three';

/** Woodland islands leave most of the valley as open meadow and rock. */
export const FOREST_GROVES = [
  {x:-207,z:-224,rx:43,rz:38},
  {x:-121,z:-132,rx:48,rz:40},
  {x:176,z:-166,rx:47,rz:43},
  {x:237,z:-34,rx:31,rz:43},
  {x:-218,z:42,rx:42,rz:31},
  {x:78,z:-235,rx:39,rz:31},
] as const;

export function woodlandCover(x:number,z:number):number {
  let cover=0;
  for(const grove of FOREST_GROVES){
    const distance=Math.hypot((x-grove.x)/grove.rx,(z-grove.z)/grove.rz);
    cover=Math.max(cover,1-THREE.MathUtils.smoothstep(distance,.55,1.12));
  }
  return cover;
}

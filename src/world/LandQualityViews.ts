import {SECT_ASCENT} from './WorldLayout';

/** Repeatable player poses; every camera stays inside the ordinary input limits. */
const road=SECT_ASCENT[Math.floor(SECT_ASCENT.length*.46)];
export const LAND_QUALITY_VIEWS={
  'quality-forest-noon':{x:-394,z:-142,height:0,yaw:Math.PI/2,pitch:.08,distance:4,hour:12},
  'quality-floor-noon':{x:-215,z:-222,height:0,yaw:-.35,pitch:.36,distance:4,hour:12},
  'quality-road-noon':{x:road.x,z:road.z,height:0,yaw:Math.atan2(road.x,road.z-7),pitch:.12,distance:7,hour:12},
  'quality-sect-golden':{x:-196,z:-135,height:44,altitude:134,yaw:Math.atan2(-196,-142),pitch:.05,distance:18,hour:17.3},
  'quality-valley-golden':{x:-137,z:-204,height:38,yaw:-1.1,pitch:.24,distance:12,hour:17.3},
} as const;
export type LandQualityView=keyof typeof LAND_QUALITY_VIEWS;
export function landQualityView(name:string){return Object.hasOwn(LAND_QUALITY_VIEWS,name)?LAND_QUALITY_VIEWS[name as LandQualityView]:undefined;}

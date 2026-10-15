import * as THREE from 'three';
import {FOREST_CLEARINGS,TERRAIN_BOUNDS,MERIDIAN_SITES,WEST_VALLEY_ROUTE,MOUNTAIN_CIRCUIT,VALLEY_ROUTES,SHANHAI_RIDGES,SECT_SUMMIT,SECT_ASCENT} from './WorldLayout';
import {summitLandscape,mountainLandscape,ascentRoadHeight,ascentDistance} from './MountainLayout';
import {gorgeHeight,inWaterCorridor} from './WaterLayout';
import {coastBlend,coastalHeight} from './CoastMath';
import {naturalRelief,mountainRelief,landNoise} from './NaturalTerrain';
import {TOWN,townBlend,townDistance} from './TownLayout';
import {mainHallStairHeight} from './MainHall';
import {SECT_BUILDINGS,SECT_GROUND_Y,SECT_GATE_Y,sectFloorOffset,sectProtected} from './SectLayout';
import {sectRockExposure,waterRockExposure,rockClearanceFade} from './GeologicalProtection';

type Point = { x: number; z: number };
const shrines: readonly Point[] = MERIDIAN_SITES;
export const safeAreas = [{ x: 0, z: 14, r: 38 }, { x: 0, z: 50, r: 12 }, { x: -15, z: 12, r: 6 }, { x: 18, z: -20, r: 10 }, ...FOREST_CLEARINGS, ...shrines.map((p) => ({ ...p, r: 12 })), { x: 0, z: -280, r: 30 }];
const routes = VALLEY_ROUTES;
const smooth = (a: number, b: number, t: number) => { const n = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1); return n * n * (3 - 2 * n); };

function segmentDistance(x: number, z: number, a: Point, b: Point) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}

export function roadDistance(x: number, z: number, legacyOnly=false) {
  if(legacyOnly&&z>=120){
    // The protected coastal transition keeps its original graded foundation.
    const coastRoutes=[[{x:0,z:65},{x:52,z:72},{x:87,z:127},{x:125,z:137}],[{x:125,z:38},{x:125,z:137}],[{x:0,z:145},{x:0,z:65}]];
    let closest=Infinity;for(const route of coastRoutes)for(let i=1;i<route.length;i++)closest=Math.min(closest,segmentDistance(x,z,route[i-1],route[i]));return closest;
  }
  let distance = Infinity;
  for(let r=legacyOnly?1:0;r<(legacyOnly?routes.length-1:routes.length);r++)for (let i = 1; i < routes[r].length; i++) distance = Math.min(distance, segmentDistance(x, z, routes[r][i - 1], routes[r][i]));
  if(legacyOnly){const lakeRadius=Math.hypot((x+160)/1.25,z-110);distance=Math.max(distance,21*(1-smooth(60,110,lakeRadius)));}
  return distance;
}

function westernForestHeight(x:number,z:number){
  return 9+mountainRelief(x*.8,z*.8)*.65
    +Math.exp(-((x+442)**2/3800+(z+85)**2/4900))*13
    +Math.exp(-((x+430)**2/5200+(z+190)**2/3100))*9;
}

// Authored clearing and trail endpoints are fixed world data. Compute their
// identical height expressions once instead of for every heightfield sample.
const forestTrailLevels=[1.8+Math.sin(-70*.017)*1.1,5.2,7.8,10.4,12.1,13.5,westernForestHeight(-394,-142)];
const safeAreaLevels=new Map(safeAreas.map(area=>[area,
  FOREST_CLEARINGS.some(c=>c.x===area.x&&c.z===area.z)?westernForestHeight(area.x,area.z):area.z < -200 ? 1.8 + Math.sin(area.z * 0.017) * 1.1 : area.z === 14 ? 1.8 : 1.8 + Math.sin(area.z * 0.017) * 1.1
]));

/** Freeze the old lake-bank landform, including its pre-existing outer mountain influence. */
function lakeBankLandscape(x:number,z:number){
  let h=4.8+naturalRelief(x,z);
  h+=Math.exp(-((x+158)**2+(z+157)**2)/6200)*54+Math.exp(-((x-165)**2+(z+48)**2)/6500)*46
    +Math.exp(-((x+80)**2+(z-172)**2)/6000)*17+Math.exp(-((x-75)**2+(z+221)**2)/4200)*38;
  const wx=x+landNoise(x*.007+21,z*.009-12)*19,wz=z+landNoise(x*.008-8,z*.006+17)*17;
  let hill=5.3+landNoise(wx*.016+47,wz*.014-19)*3.2+landNoise(wx*.041-7,wz*.039+31)*1.35+landNoise(wx*.10+5,wz*.11-4)*.34;
  SHANHAI_RIDGES.forEach((r,i)=>{const dx=(x-r.x+(z-r.z)*r.lean)/r.rx,dz=(z-r.z)/r.rz;hill+=Math.exp(-(dx*dx+dz*dz))*[72,76,53,26][i];});
  return THREE.MathUtils.lerp(h,hill,(1-smooth(90,110,z))*smooth(45,60,Math.hypot((x+160)/1.25,z-110)));
}
/** Eased turn landings keep adjacent road projections close on both sides of a bend. */
function routeElevation(a:{x:number;z:number;y:number},b:{x:number;z:number;y:number},t:number){
  const length=Math.hypot(b.x-a.x,b.z-a.z),landing=Math.min(10,length*.18),s=t*length;
  const ramp=s<landing?s*s/(2*landing):s>length-landing?length-landing-(length-s)**2/(2*landing):s-landing/2;
  return a.y+(b.y-a.y)*ramp/(length-landing);
}
/** Continuous authored landscape: flat sanctuaries linked by soft traversable valleys. */
function authoredLandscapeHeight(x: number, z: number): number {
  let h = 4.8 + naturalRelief(x,z);
  h += Math.exp(-((x + 158) ** 2 + (z + 157) ** 2) / 6200) * 54;
  h += Math.exp(-((x - 165) ** 2 + (z + 48) ** 2) / 6500) * 46;
  h += Math.exp(-((x + 80) ** 2 + (z - 172) ** 2) / 6000) * 17;
  h += Math.exp(-((x - 75) ** 2 + (z + 221) ** 2) / 4200) * 38;
  // Preserve the existing complete road foundation, including intersections
  // where two grading envelopes blend. New erosion grows outside the corridor.
  // The ascent's final grading is authoritative to 5.8m from its route.
  // Do not additionally freeze the old mountain in XZ around each switchback:
  // on a steep flank that froze tens of metres of wall into a complete ring.
  const sculpture=smooth(5.4,11,roadDistance(x,z));
  const hillside=sculpture===1?mountainLandscape(x,z):THREE.MathUtils.lerp(mountainLandscape(x,z,false),sculpture>0?mountainLandscape(x,z):0,sculpture);
  // Preserve every coastal elevation and the lake basin/banks while shaping northern hills.
  const lakeMargin=Math.hypot((x+160)/1.25,z-110);
  h=THREE.MathUtils.lerp(h,hillside,(1-smooth(90,110,z))*smooth(47,62,lakeMargin));
  const westHeight=westernForestHeight(x,z);
  h=THREE.MathUtils.lerp(h,westHeight,(1-smooth(-330,-288,x))*(1-smooth(40,100,z)));
  // The sect's entire playable foundation rises with its mountain and road.
  if(x>-160&&x<160&&z>-155&&z<140){
    const envelope=smooth(-160,-146,x)*(1-smooth(146,160,x))*smooth(-155,-140,z)*(1-smooth(112,126,z));
    const summit=sculpture===1?summitLandscape(x,z,h):THREE.MathUtils.lerp(summitLandscape(x,z,h,false),sculpture>0?summitLandscape(x,z,h):0,sculpture);
    h=THREE.MathUtils.lerp(h,summit,envelope);
  }
  // The new forest trail follows rolling ground; only legacy valley roads
  // keep their existing low, level profile.
  const road = roadDistance(x, z,true);
  h = THREE.MathUtils.lerp(1.8 + Math.sin(z * 0.017) * 1.1, h, smooth(4, 21, road));
  const forestTrail=routes[0];let forestWeight=0,forestHeight=0,forestBlend=0;
  for(let i=1;i<forestTrail.length;i++){
    const a=forestTrail[i-1],b=forestTrail[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1);
    const distance=Math.hypot(x-a.x-dx*t,z-a.z-dz*t),w=(1-smooth(6,19,distance))*smooth(4,17,road);
    forestWeight+=w**4;forestHeight+=THREE.MathUtils.lerp(forestTrailLevels[i-1],forestTrailLevels[i],t)*w**4;forestBlend=Math.max(forestBlend,w);
  }
  if(forestWeight>0)h=THREE.MathUtils.lerp(h,forestHeight/forestWeight,forestBlend);
  // Grade only the new trail. Existing roads win at crossings, avoiding terrace steps.
  let trailWeight=0,trailHeight=0,trailBlend=0;
  for(let i=1;i<MOUNTAIN_CIRCUIT.length;i++){
    const a=MOUNTAIN_CIRCUIT[i-1],b=MOUNTAIN_CIRCUIT[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1);
    const distance=Math.hypot(x-a.x-dx*t,z-a.z-dz*t),w=(1-smooth(5.8,19,distance))*smooth(4,17,road);
    trailWeight+=w**4;trailHeight+=routeElevation(a,b,t)*w**4;trailBlend=Math.max(trailBlend,w);
  }
  if(trailWeight>0)h=THREE.MathUtils.lerp(h,trailHeight/trailWeight,trailBlend);
  let spurWeight=0,spurHeight=0,spurBlend=0;
  for(let i=1;i<WEST_VALLEY_ROUTE.length;i++){
    const a=WEST_VALLEY_ROUTE[i-1],b=WEST_VALLEY_ROUTE[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1),d=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
    const w=1-smooth(5.8,18,d);spurWeight+=w**4;spurHeight+=routeElevation(a,b,t)*w**4;spurBlend=Math.max(spurBlend,w);
  }
  if(spurWeight>0)h=THREE.MathUtils.lerp(h,spurHeight/spurWeight,spurBlend);
  for (const area of safeAreas) {
    if(Math.abs(area.x)<60&&area.z>-60&&area.z<65)continue;
    const d = Math.hypot(x - area.x, z - area.z);
    const level = safeAreaLevels.get(area)!;
    h = THREE.MathUtils.lerp(level, h, smooth(area.r, area.r + 15, d));
  }
  const apron=(1-smooth(0,56,townDistance(x,z)))*(1-smooth(110,126,z));
  h=THREE.MathUtils.lerp(h,TOWN.groundY,apron);
  if(lakeMargin<62)h=THREE.MathUtils.lerp(lakeBankLandscape(x,z),h,smooth(47,62,lakeMargin));
  h=ascentRoadHeight(x,z,h);
  // The quiet southern lake is entirely outside the quest routes.
  const lake = Math.hypot((x + 160) / 1.25, z - 110);
  h = THREE.MathUtils.lerp(-2.2, h, smooth(22, 37, lake));
  h=THREE.MathUtils.lerp(h, coastalHeight(x,z), coastBlend(z));
  return gorgeHeight(x,z,THREE.MathUtils.lerp(h,TOWN.groundY,townBlend(x,z)));
}

// The character walks the same triangular heightfield as the near 1m land meshes.
const elevationMinX=TERRAIN_BOUNDS.minX-2,elevationMinZ=TERRAIN_BOUNDS.minZ-2;
const elevationWidth=TERRAIN_BOUNDS.maxX-elevationMinX+3,elevationRows=TERRAIN_BOUNDS.maxZ-elevationMinZ+3;
// A dense grid needs 3.4MB; string-keyed entries consumed far more memory.
const elevationCache=new Float64Array(elevationWidth*elevationRows).fill(NaN);
function landscapeHeight(x:number,z:number):number {
  if(z>=146)return authoredLandscapeHeight(x,z);
  const x0=Math.floor(x),z0=Math.floor(z),tx=x-x0,tz=z-z0;
  const at=(px:number,pz:number)=>{
    const column=px-elevationMinX,row=pz-elevationMinZ;
    if(column<0||column>=elevationWidth||row<0||row>=elevationRows)return authoredLandscapeHeight(px,pz);
    const index=row*elevationWidth+column,cached=elevationCache[index];
    if(!Number.isNaN(cached))return cached;
    return elevationCache[index]=authoredLandscapeHeight(px,pz);
  };
  if(tx===0&&tz===0)return at(x0,z0);
  if(tx+tz<=1)return at(x0,z0)*(1-tx-tz)+at(x0+1,z0)*tx+at(x0,z0+1)*tz;
  return at(x0+1,z0+1)*(tx+tz-1)+at(x0+1,z0)*(1-tz)+at(x0,z0+1)*(1-tx);
}

/** Render ground independently from the new architectural plinth/step overlays. */
export function terrainSurfaceHeight(x: number, z: number): number {
  let h = landscapeHeight(x, z);
  // Match the three visible stone plinths exactly, including their rear edges.
  // A broad terrain ramp previously buried the feet along the rear terrace.
  const offset=SECT_SUMMIT.height-1.8;
  if(Math.abs(x)<=13.5&&Math.abs(z-7)<=10)h=2.3+offset;
  if(Math.abs(x)<=12.9&&Math.abs(z-7)<=9.6)h=2.7+offset;
  if(Math.abs(x)<=12.3&&Math.abs(z-7)<=9.2)h=3.1+offset;
  const tread = mainHallStairHeight(x, z - SECT_SUMMIT.z);
  if(tread!==null)h=Math.max(h,SECT_SUMMIT.height+tread);
  return h;
}
export function terrainHeight(x:number,z:number) {
  let h=terrainSurfaceHeight(x,z);
  for(const building of SECT_BUILDINGS){
    const floor=sectFloorOffset(building,x,z);
    if(floor!==null)h=(building.kind==='gate'?SECT_GATE_Y:SECT_GROUND_Y)+floor;
  }
  return h;
}

export function protectedPoint(x: number, z: number, extra = 0) {
  return sectProtected(x,z,extra) || inWaterCorridor(x,z,extra) || townDistance(x,z)<5+extra || z > 126 || roadDistance(x, z) < 6 + extra || ascentDistance(x,z)<6+extra || safeAreas.some((a) => Math.hypot(a.x - x, a.z - z) < a.r + extra) || Math.hypot((x + 160) / 1.25, z - 110) < 40;
}

/** Low ground plants can recover along road margins while the complete 8m
 * walking deck and its body clearance remain free. Other safeguards match. */
export function groundCoverProtectedPoint(x:number,z:number,extra=0){
  return sectProtected(x,z,extra)||inWaterCorridor(x,z,extra)||townDistance(x,z)<5+extra||z>119||roadDistance(x,z)<4.7+extra||ascentDistance(x,z)<4.7+extra||safeAreas.some(a=>Math.hypot(a.x-x,a.z-z)<a.r+extra)||Math.hypot((x+160)/1.25,z-110)<40;
}

// Rock faces can continue above a road cut, while its complete walking deck
// and headroom remain clear. Index the authored roads for dense cliff queries.
const rockRoadCells=new Map<string,{a:Point;b:Point}[]>();
for(const route of [...routes,SECT_ASCENT])for(let i=1;i<route.length;i++){
  const a=route[i-1],b=route[i];
  for(let z=Math.floor((Math.min(a.z,b.z)-10)/20);z<=Math.floor((Math.max(a.z,b.z)+10)/20);z++)for(let x=Math.floor((Math.min(a.x,b.x)-10)/20);x<=Math.floor((Math.max(a.x,b.x)+10)/20);x++){
    const key=`${x},${z}`,list=rockRoadCells.get(key)??[];list.push({a,b});rockRoadCells.set(key,list);
  }
}
export function rockSurfaceExposure(x:number,y:number,z:number){
  if(z>94)return 0;
  let exposure=Math.min(sectRockExposure(x,z),waterRockExposure(x,z),rockClearanceFade(townDistance(x,z)-7),rockClearanceFade(94-z),rockClearanceFade(Math.hypot((x+160)/1.25,z-110)-42));
  for(const area of safeAreas)exposure=Math.min(exposure,rockClearanceFade(Math.hypot(area.x-x,area.z-z)-area.r-1.5));
  if(exposure===0)return 0;
  for(const {a,b} of rockRoadCells.get(`${Math.floor(x/20)},${Math.floor(z/20)}`)??[]){
    const dx=b.x-a.x,dz=b.z-a.z,t=THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1),px=a.x+dx*t,pz=a.z+dz*t,d=Math.hypot(x-px,z-pz);
    if(d>=8)continue;
    const length=Math.hypot(dx,dz);
    const deck=Math.max(...[-4.6,-2,0,2,4.6].map(offset=>terrainHeight(px-dz/length*offset,pz+dx/length*offset)));
    // Keep 2.6m above the highest point across the full deck clear. The old
    // 4.2–7.2m exclusion left the player's entire near wall as the bare base.
    const horizontal=smooth(5.2,8,d),headroom=smooth(2.6,5.2,y-deck);
    exposure=Math.min(exposure,Math.max(horizontal,headroom));
  }
  return exposure;
}

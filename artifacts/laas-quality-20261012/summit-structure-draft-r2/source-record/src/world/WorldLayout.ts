import {CatmullRomCurve3,Vector3} from 'three';
import {coastBlend,coastalHeight} from './CoastMath';
/** Shared bounds and the walkable route into the new western forest. */
export const WORLD_MAP={minX:-500,maxX:300,minZ:-300,maxZ:300} as const;
export const WORLD_LIMITS={minX:-494,maxX:294,minZ:-294,maxZ:294} as const;
export const TERRAIN_BOUNDS={minX:-560,maxX:320,minZ:-320,maxZ:160} as const;
export const WESTERN_FOREST={name:'苍翠林',x:-407,z:-123,rx:72,rz:88} as const;
export const FOREST_CLEARINGS=[{x:-426,z:-100,r:8},{x:-369,z:-174,r:8}] as const;
export const FOREST_APPROACH=[{x:-110,z:-70},{x:-172,z:-64},{x:-236,z:-63},{x:-280,z:-99},{x:-305,z:-117},{x:-347,z:-140},{x:-394,z:-142}] as const;

/** Existing quest sites keep their identity and save order in the redesigned valley. */
export const MERIDIAN_SITES=[{x:-110,z:-70},{x:105,z:-135},{x:0,z:-245}] as const;
export const SECT_SUMMIT={x:0,z:7,height:140} as const;
/** Contour road: a western hairpin, a northern traverse and a final summit bend. */
const ascentCurve=new CatmullRomCurve3([
  [0,126],[0,116],[-20,112],[-62,106],[-95,86],[-106,55],[-104,34],
  [-87,38],[-63,62],[-21,78],[31,77],[58,56],[72,22],
  [76,-16],[70,-54],[37,-72],[-18,-76],[-61,-58],[-78,-24],
  [-73,9],[-58,31],[-34,45],[0,40],
].map(([x,z])=>new Vector3(x,0,z)),false,'centripetal');
ascentCurve.arcLengthDivisions=2000;
export const ASCENT_LENGTH=ascentCurve.getLength();
const footY=(1-coastBlend(126))*(1.8+Math.sin(126*.017)*1.1)+coastBlend(126)*coastalHeight(0,126);
// A six-metre level deck supports the gate; the last 60m reaches the forecourt level.
const gateStation=ASCENT_LENGTH*.805,gateHalfDeck=3,topLanding=60,startLanding=12;
function ascentElevation(s:number){
  const active=s-Math.max(0,Math.min(2*gateHalfDeck,s-gateStation+gateHalfDeck));
  const run=ASCENT_LENGTH-topLanding-2*gateHalfDeck;
  const ramp=active<startLanding?active*active/(2*startLanding):Math.min(run-startLanding/2,active-startLanding/2);
  return footY+(SECT_SUMMIT.height-footY)*Math.max(0,ramp)/(run-startLanding/2);
}
function ascentPoint(s:number){const p=ascentCurve.getPointAt(s/ASCENT_LENGTH);return {x:p.x,z:p.z,y:ascentElevation(s),s};}
// Close station spacing also keeps map strokes, protected corridors and the physical road coherent.
const stations=Array.from({length:Math.ceil(ASCENT_LENGTH/5)+1},(_,i)=>i*ASCENT_LENGTH/Math.ceil(ASCENT_LENGTH/5));
stations.push(gateStation-gateHalfDeck,gateStation,gateStation+gateHalfDeck,ASCENT_LENGTH-topLanding);
stations.sort((a,b)=>a-b);
export const SECT_ASCENT=stations.map(ascentPoint);
const gate=ascentPoint(gateStation),gateTangent=ascentCurve.getTangentAt(gateStation/ASCENT_LENGTH);
export const SECT_GATE_POSITION={...gate,yaw:Math.atan2(-gateTangent.x,-gateTangent.z)};
/** A second, graded circuit joins the three sites without forcing a return to the sect. */
export const MOUNTAIN_CIRCUIT=[
  {x:-110,z:-70,y:1.8+Math.sin(-70*.017)*1.1},{x:-150,z:-108,y:3.2},{x:-185,z:-161,y:20},
  {x:-137,z:-204,y:16},{x:-68,z:-223,y:7},{x:0,z:-245,y:2.7},
  {x:58,z:-219,y:10},{x:115,z:-194,y:17},{x:151,z:-166,y:5},
  {x:105,z:-135,y:1.8+Math.sin(-135*.017)*1.1},
] as const;
const forestJunction=SECT_ASCENT.reduce((best,p)=>Math.hypot(p.x+104,p.z-34)<Math.hypot(best.x+104,best.z-34)?p:best);
/** A descending inland spur connects the forest valley without crossing the southern lake. */
export const WEST_VALLEY_ROUTE=[forestJunction,{x:-151,z:24,y:25},{x:-151,z:-30,y:11},{x:-134,z:-54,y:3},{x:-110,z:-70,y:1.8+Math.sin(-70*.017)*1.1}] as const;
export const VALLEY_ROUTES=[
  [...FOREST_APPROACH],
  [{x:0,z:126},{x:52,z:122},{x:87,z:127},{x:125,z:137}],
  [{x:125,z:38},{x:125,z:137}],
  [{x:0,z:145},{x:0,z:126}],
  [...WEST_VALLEY_ROUTE],
  [{x:0,z:126},{x:0,z:142},{x:180,z:142},{x:180,z:-15},{x:105,z:-135}],
  [{x:-110,z:-70},{x:-124,z:-111},{x:-55,z:-153},{x:0,z:-190},{x:0,z:-245},{x:0,z:-280}],
  [...MOUNTAIN_CIRCUIT],
] as const;
/** Broad irregular ridges; their asymmetric shoulders are sampled by render and movement. */
export const SHANHAI_RIDGES=[
  {x:-171,z:-151,rx:65,rz:99,height:108,lean:.24},
  {x:183,z:-105,rx:58,rz:108,height:110,lean:-.19},
  {x:78,z:-224,rx:47,rz:62,height:82,lean:.26},
  {x:-65,z:-48,rx:34,rz:45,height:42,lean:-.3},
] as const;

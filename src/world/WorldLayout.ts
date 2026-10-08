import {coastBlend,coastalHeight} from './CoastMath';
/** Shared bounds and the walkable route into the new western forest. */
export const WORLD_MAP={minX:-500,maxX:300,minZ:-300,maxZ:300} as const;
export const WORLD_LIMITS={minX:-494,maxX:294,minZ:-294,maxZ:294} as const;
export const TERRAIN_BOUNDS={minX:-560,maxX:320,minZ:-320,maxZ:160} as const;
export const WESTERN_FOREST={name:'苍翠林',x:-407,z:-123,rx:72,rz:88} as const;
export const FOREST_CLEARINGS=[{x:-426,z:-100,r:8},{x:-369,z:-174,r:8}] as const;
export const FOREST_APPROACH=[{x:-110,z:-70},{x:-181,z:-99},{x:-267,z:-112},{x:-305,z:-117},{x:-347,z:-140},{x:-394,z:-142}] as const;

/** Existing quest sites keep their identity and save order in the redesigned valley. */
export const MERIDIAN_SITES=[{x:-110,z:-70},{x:105,z:-135},{x:0,z:-245}] as const;
export const SECT_SUMMIT={x:0,z:7,height:90} as const;
/** Elevations grade a continuous switchback, with room to pass at each turn. */
export const SECT_ASCENT=[
  {x:0,z:126,y:(1-coastBlend(126))*(1.8+Math.sin(126*.017)*1.1)+coastBlend(126)*coastalHeight(0,126)},
  {x:-65,z:111,y:15},{x:65,z:96,y:34},{x:-65,z:81,y:53},
  {x:65,z:66,y:73},{x:-65,z:51,y:87},{x:0,z:40,y:90},
] as const;
/** A second, graded circuit joins the three sites without forcing a return to the sect. */
export const MOUNTAIN_CIRCUIT=[
  {x:-110,z:-70,y:2.8},{x:-150,z:-108,y:6},{x:-185,z:-161,y:22},
  {x:-137,z:-204,y:16},{x:-68,z:-223,y:7},{x:0,z:-245,y:2.7},
  {x:58,z:-219,y:10},{x:115,z:-194,y:17},{x:151,z:-166,y:5},
  {x:105,z:-135,y:2.6},
] as const;
export const VALLEY_ROUTES=[
  [...FOREST_APPROACH],
  [{x:0,z:126},{x:52,z:122},{x:87,z:127},{x:125,z:137}],
  [{x:125,z:38},{x:125,z:137}],
  [{x:0,z:145},{x:0,z:126}],
  [{x:0,z:126},{x:0,z:142},{x:-95,z:142},{x:-95,z:10},{x:-110,z:-70}],
  [{x:0,z:126},{x:0,z:142},{x:180,z:142},{x:180,z:-15},{x:105,z:-135}],
  [{x:-110,z:-70},{x:-30,z:-150},{x:0,z:-190},{x:0,z:-245},{x:0,z:-280}],
  [...MOUNTAIN_CIRCUIT],
] as const;
/** Broad irregular ridges; their asymmetric shoulders are sampled by render and movement. */
export const SHANHAI_RIDGES=[
  {x:-171,z:-151,rx:65,rz:99,height:72,lean:.24},
  {x:183,z:-105,rx:58,rz:108,height:76,lean:-.19},
  {x:78,z:-224,rx:47,rz:62,height:53,lean:.26},
  {x:-65,z:-48,rx:34,rz:45,height:26,lean:-.3},
] as const;

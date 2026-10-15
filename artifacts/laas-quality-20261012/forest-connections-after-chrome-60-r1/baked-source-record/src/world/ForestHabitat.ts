import * as THREE from 'three';

type Node=readonly [number,number,number];
/** Narrow woodland connections inside the approved western forest envelope.
 * The central meadow, southern shore and existing quest clearings stay open.
 * Terrain/root/protection checks still decide whether a tree can actually grow. */
export const FOREST_CONNECTIONS:ReadonlyArray<{name:string;limit:number;nodes:ReadonlyArray<Node>}>= [
  {name:'western-north-shoulder',limit:160,nodes:[[-407,-151,22],[-355,-183,26],[-300,-205,24],[-250,-217,22],[-207,-224,18]]},
  {name:'western-valley-edge',limit:170,nodes:[[-405,-75,18],[-375,-30,21],[-350,8,24],[-321,25,22],[-270,33,20],[-218,42,16]]},
  {name:'north-valley-saddle',limit:105,nodes:[[-207,-224,14],[-198,-195,18],[-174,-166,22],[-145,-139,18],[-130,-128,14]]},
  {name:'inner-west-shoulder',limit:125,nodes:[[-141,-126,14],[-176,-108,18],[-188,-83,20],[-183,-46,18],[-169,-16,14]]},
];

export function connectionCover(index:number,x:number,z:number){
  if(z>78)return 0;
  const {nodes}=FOREST_CONNECTIONS[index];let cover=0;
  for(let i=1;i<nodes.length;i++){
    const a=nodes[i-1],b=nodes[i],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1);
    const width=THREE.MathUtils.lerp(a[2],b[2],t);
    const distance=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
    cover=Math.max(cover,1-THREE.MathUtils.smoothstep(distance/width,.38,1));
  }
  return cover;
}

export function connectingWoodlandCover(x:number,z:number){
  let cover=0;for(let i=0;i<FOREST_CONNECTIONS.length;i++)cover=Math.max(cover,connectionCover(i,x,z));return cover;
}

/** Broad competing crowns and small regeneration gaps, independent of tree RNG. */
export function connectionCompetition(x:number,z:number){
  const broad=Math.sin(x*.031+Math.sin(z*.019)*1.7)*Math.cos(z*.038-x*.013);
  const local=Math.sin(x*.117+z*.061)*Math.sin(z*.091-x*.047);
  return THREE.MathUtils.clamp(.58+broad*.31+local*.16,.08,1);
}

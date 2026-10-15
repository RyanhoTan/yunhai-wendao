import {SECT_ASCENT,SECT_GATE_POSITION,SECT_SUMMIT,SHANHAI_RIDGES} from './WorldLayout';
import {sectGroundBlend} from './SectLayout';
import {landNoise,mountainRelief} from './NaturalTerrain';
import {summitBedRelief} from './SummitStrata';
import {summitShoulderHeight} from './SummitShoulders';

const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
// Both the grass exclusion and road cut query the same locally indexed polyline.
const cellSize=20,queryPadding=22,roadCells=new Map<string,number[]>();
for(let i=1;i<SECT_ASCENT.length;i++){
  const a=SECT_ASCENT[i-1],b=SECT_ASCENT[i];
  for(let cz=Math.floor((Math.min(a.z,b.z)-queryPadding)/cellSize);cz<=Math.floor((Math.max(a.z,b.z)+queryPadding)/cellSize);cz++)
    for(let cx=Math.floor((Math.min(a.x,b.x)-queryPadding)/cellSize);cx<=Math.floor((Math.max(a.x,b.x)+queryPadding)/cellSize);cx++){
      const key=`${cx},${cz}`,cell=roadCells.get(key)??[];cell.push(i);roadCells.set(key,cell);
    }
}
function roadSamples(x:number,z:number){return roadCells.get(`${Math.floor(x/cellSize)},${Math.floor(z/cellSize)}`)??[];}
function roadProjection(i:number,x:number,z:number){
  const a=SECT_ASCENT[i-1],b=SECT_ASCENT[i],dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
  return {distance:Math.hypot(x-a.x-dx*t,z-a.z-dz*t),height:a.y+(b.y-a.y)*t};
}
export function ascentDistance(x:number,z:number){
  let nearest=Infinity;
  for(const i of roadSamples(x,z))nearest=Math.min(nearest,roadProjection(i,x,z).distance);
  return nearest;
}

// A shared bedding direction gives each massif continuous ledges. Drainage cuts
// cross the bedding, while wider warps move the actual cliff and ridge outline.
function erodedRadius(x:number,z:number,dx:number,dz:number){
  const wx=dx+landNoise(x*.019+18,z*.017-4)*.085;
  const wz=dz+landNoise(x*.016-23,z*.021+11)*.075;
  const channels=Math.abs(landNoise(x*.072+z*.015,z*.014-16));
  const joint=landNoise(x*.15+8,z*.12-21);
  return Math.hypot(wx,wz)*(1+landNoise(x*.041-8,z*.038+13)*.13+channels*.10+joint*.018);
}
function cliffRelief(x:number,z:number,h:number){
  const bedding=h*.12+x*.026+z*.011;
  const ledge=landNoise(bedding,landNoise(x*.013,z*.014)+7);
  const channels=Math.abs(landNoise(x*.11+z*.029,z*.022+4));
  return ledge*2.7-channels*3.3+landNoise(x*.21+11,z*.19-8)*.48;
}

// Drainage follows saddles between the map's four buttresses. These wide
// cuts divide the mesa wall into shoulders; beds terminate at each ravine.
const SUMMIT_DRAINS=[
  {ax:-24,az:-47,bx:-102,bz:-128,width:19,depth:39},
  {ax:-52,az:-2,bx:-142,bz:-24,width:12,depth:23},
  {ax:41,az:-54,bx:114,bz:-128,width:20,depth:35},
  {ax:47,az:38,bx:127,bz:91,width:14,depth:24},
  {ax:-31,az:51,bx:-117,bz:101,width:13,depth:22},
];
function summitDrainage(x:number,z:number){
  let incision=0;
  for(const drain of SUMMIT_DRAINS){
    const dx=drain.bx-drain.ax,dz=drain.bz-drain.az;
    const t=Math.max(0,Math.min(1,((x-drain.ax)*dx+(z-drain.az)*dz)/(dx*dx+dz*dz)));
    const wander=landNoise(t*3.1+drain.ax*.017,drain.az*.024+7)*3;
    const distance=Math.hypot(x-drain.ax-dx*t+dz/Math.hypot(dx,dz)*wander,z-drain.az-dz*t-dx/Math.hypot(dx,dz)*wander);
    const width=drain.width*(.55+t*.60);
    incision=Math.max(incision,drain.depth*(1-smooth(width*.16,width,distance))*smooth(0,.18,t));
  }
  // Final ascentRoadHeight already preserves every metre of the road core.
  // A second XZ-only exclusion here froze a complete wall beside each bend,
  // even where the ravine should continue above/below the cut in the massif.
  return incision*smooth(40,55,Math.hypot(x,z-14));
}

/** Broken crowns, sloping shoulders and drainage ribs, all in the collision heightfield. */
function karstMass(x:number,z:number,cx:number,cz:number,rx:number,rz:number,height:number,lean:number,sculpted=true){
  const dx=(x-cx+(z-cz)*lean)/rx,dz=(z-cz)/rz;
  if(dx*dx+dz*dz>3.61)return 0;
  if(!sculpted){
    const a=Math.atan2(dz,dx),r=Math.hypot(dx,dz)*(1+.095*Math.sin(a*7+.8)+.035*Math.sin(a*17)+landNoise(x*.037+9,z*.033-7)*.10);
    const core=1-smooth(.35,.72,r),shoulder=1-smooth(.62,1.27,r);
    return height*(core*.79+shoulder*.21)+(landNoise(x*.068+4,z*.061-17)*3.5+landNoise(x*.16,z*.17)*.7)*core;
  }
  const r=erodedRadius(x,z,dx,dz);
  const core=1-smooth(.12,.81,r),shoulder=1-smooth(.57,1.34,r);
  const mass=height*(core*.72+shoulder*.28);
  const crown=(landNoise(x*.064+4,z*.057-17)*7.5+landNoise(x*.16,z*.17)*1.5)*(1-smooth(.62,.97,r));
  const wall=smooth(.25,.48,r)*(1-smooth(1.10,1.34,r));
  return Math.max(0,mass+crown+cliffRelief(x,z,mass)*wall);
}
export function mountainLandscape(x:number,z:number,sculpted=true){
  const detail=mountainRelief(x,z);let height=5.3+detail;
  for(const ridge of SHANHAI_RIDGES){
    let rock=karstMass(x,z,ridge.x,ridge.z,ridge.rx,ridge.rz,ridge.height,ridge.lean,sculpted);
    // Existing map anchors remain; offset summits meet in eroded saddles.
    for(const [ox,oz,scale] of [[-.52,-.17,.68],[.35,-.42,.84],[.38,.35,.55]]){
      rock=Math.max(rock,karstMass(x,z,ridge.x+ox*ridge.rx,ridge.z+oz*ridge.rz,ridge.rx*.37,ridge.rz*.36,ridge.height*scale,-ridge.lean*.3,sculpted));
    }
    if(rock>0)height=Math.max(height,5.3+rock+detail*.35);
  }
  return height;
}

/** Broad summit mesa, sheer ribbed faces, foothill buttresses and a contour-cut walking road. */
export function summitLandscape(x:number,z:number,original:number,sculpted=true){
  const dx=x/97,dz=(z-SECT_SUMMIT.z)/116;
  // A mountain-sized warp replaces narrow columns that ran from foot to
  // summit. The original road foundation still calls the unchanged branch.
  const a=Math.atan2(dz,dx),r=sculpted?erodedRadius(x*.30,z*.30,dx+dz*.08,dz):Math.hypot(dx,dz)*(1+.05*Math.sin(a*9)+.025*Math.sin(a*21)+landNoise(x*.042,z*.038)*.055);
  const core=1-smooth(sculpted?.41:.59,sculpted?1.03:.85,r),foot=1-smooth(sculpted?.68:.82,sculpted?1.56:1.34,r);
  const base=7+(SECT_SUMMIT.height-7)*(core*(sculpted?.67:.78)+foot*(sculpted?.33:.22));
  const wall=smooth(.47,.62,r)*(1-smooth(1.32,1.56,r));
  const drainage=Math.abs(landNoise(x*.025+base*.022+41,z*.029-base*.017-9));
  // Beds no longer flatten every 14m contour into a complete mountain ring.
  // The geological strike and finite faults produce interrupted ledges.
  const body=Math.min(SECT_SUMMIT.height,base+(sculpted?(summitBedRelief(x,base,z)-drainage*8)*wall:0));
  let h=original+(Math.max(original,body)-original)*(1-smooth(sculpted?1.42:1.22,sculpted?1.56:1.34,r));
  if(sculpted)h=Math.max(h,summitShoulderHeight(x,z));
  // The same four map anchors become connected shoulders with broad saddles.
  // Only sculpted terrain uses their wider footprint, preserving road grades.
  for(const p of [{x:-84,z:-32,rx:25,rz:37,h:133,shoulder:107},{x:81,z:-42,rx:23,rz:35,h:131,shoulder:104},{x:73,z:56,rx:22,rz:29,h:90,shoulder:78},{x:-81,z:65,rx:23,rz:31,h:69,shoulder:62}])
    h=Math.max(h,karstMass(x,z,p.x,p.z,p.rx*(sculpted?1.45:1),p.rz*(sculpted?1.30:1),sculpted?p.shoulder:p.h,0,sculpted));
  if(sculpted)h=Math.max(original,h-summitDrainage(x,z));
  const plaza=1-smooth(38,44,Math.hypot(x,z-14)),site=Math.max(plaza,sectGroundBlend(x,z));
  h=h*(1-site)+SECT_SUMMIT.height*site;
  return h;
}
/** Road cuts have final priority over nearby valley shoulders; buildings stay on the shared deck. */
export function ascentRoadHeight(x:number,z:number,height:number){
  if(z>=126)return height;
  let h=height;
  let weight=0,weightedHeight=0,blend=0;
  for(const i of roadSamples(x,z)){
    const p=roadProjection(i,x,z),w=1-smooth(5.8,11.5,p.distance),contribution=w**4;
    // Adjacent curve chords blend continuously; distant overlapping shoulders cannot tilt the road deck.
    weight+=contribution;weightedHeight+=p.height*contribution;
    // Preserve the complete old chord weighting and <=5.8m foundation. Only
    // the excess high-wall apron ends earlier, with long geological variation:
    // a broad 22m cut previously printed each switchback across the whole face.
    const wall=smooth(82,108,p.height),edge=8.4+landNoise(x*.020+5,z*.017-9)*.9;
    const narrow=1-smooth(5.8,edge,p.distance);
    blend=Math.max(blend,w+(narrow-w)*wall);
  }
  if(weight>0)h=h*(1-blend)+(weightedHeight/weight)*blend;
  const gx=x-SECT_GATE_POSITION.x,gz=z-SECT_GATE_POSITION.z,c=Math.cos(SECT_GATE_POSITION.yaw),s=Math.sin(SECT_GATE_POSITION.yaw);
  const gateX=gx*c-gz*s,gateZ=gx*s+gz*c;
  const deck=(1-smooth(8.5,10.5,Math.abs(gateX)))*(1-smooth(1.3,4.8,Math.abs(gateZ)));
  return h*(1-deck)+SECT_GATE_POSITION.y*deck;
}

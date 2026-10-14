import * as THREE from 'three';
import {Writer,TAU} from './WoodlandPrimitives';

export type ForestDeadwoodGeometry={geometry:THREE.BufferGeometry;length:number;radius:number;height:number;contactIndices:number[];solidBounds:THREE.Box3[]};
type Random=()=>number;
type Surface={points:THREE.Vector3[][];ids:number[][];ts:number[];angles:number[]};
type Scar={t:number;angle:number;span:number;arc:number;depth:number};
type Fissure={angle:number;drift:number;width:number;depth:number;start:number;end:number};
type Log={writer:Writer;random:Random;form:0|1|2;length:number;rz:number;ry:number;phase:number;depth:number;start:number;end:number;knots:{t:number;angle:number;strength:number}[];scars:Scar[];fissures:Fissure[];sections:[Map<number,Map<number,THREE.Vector3>>,Map<number,Map<number,THREE.Vector3>>];sectionCacheCount:number;arcCache:Map<number,Map<number,number>>;normalCache:Map<number,Map<number,THREE.Vector3>>;contacts:Set<number>;solids:Map<string,THREE.Box3>;seams:[number,number][];mossPatches:number;barkLamellae:number;branchStumps:number;chips:number;fungi:number;fiberForks:number;probes:THREE.Vector3[]};
const clamp=THREE.MathUtils.clamp;
const tintBases=new Map<string,THREE.Color>();
const tint=(hex:string,tone=1)=>{let base=tintBases.get(hex);if(!base){base=new THREE.Color(hex);tintBases.set(hex,base);}return base.clone().multiplyScalar(tone);};
const randomFor=(seed:number):Random=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));

function centre(log:Log,t:number){
  return new THREE.Vector3((t-.5)*log.length,log.ry*(.93+.055*Math.sin(t*5.7+log.phase)+.025*Math.cos(t*12-log.phase)),.045*Math.sin(t*5.4+log.phase)*Math.sin(t*Math.PI));
}
function scarDamage(log:Log,t:number,angle:number){
  let damage=0;for(const scar of log.scars){const x=(t-scar.t)/scar.span,a=angleDelta(angle,scar.angle)/scar.arc,edge=1+.15*Math.sin(t*31+angle*8+log.phase);damage=Math.max(damage,scar.depth*Math.exp(-(x*x+a*a)*edge));}return damage;
}
function section(log:Log,t:number,angle:number,inner=false){
  const cache=log.sections[inner?1:0];let row=cache.get(t);const cached=row?.get(angle);if(cached)return cached.clone();
  const c=centre(log,t),grain=.050*Math.sin(angle*3+log.phase)+.034*Math.cos(angle*7-t*5.2)+.018*Math.sin(angle*13+t*19),body=.94+.065*Math.sin(t*5.3+log.phase)+.033*Math.sin(t*16-log.phase);
  let cracks=0;for(const f of log.fissures){const a=angleDelta(angle,f.angle+f.drift*Math.sin(t*8+log.phase)),span=clamp((t-f.start)/.10,0,1)*clamp((f.end-t)/.12,0,1);cracks+=f.depth*Math.exp(-(a*a)/(f.width*f.width))*span;}
  let knot=0;for(const k of log.knots)knot+=k.strength*Math.exp(-(((t-k.t)/.095)**2))*Math.exp(-((angleDelta(angle,k.angle)**2)/.22));
  const endShape=(.11*Math.sin(angle*3+log.phase)+.065*Math.sin(angle*8-log.phase))*Math.exp(-t/.065)+(.090*Math.sin(angle*4-log.phase)-.075*Math.sin(angle*9+log.phase))*Math.exp(-(1-t)/.065),decay=log.form===2?.035*(.5+.5*Math.sin(t*8+angle*2.1+log.phase)):0;
  const r=clamp(body+grain+knot-cracks-decay+endShape-(inner?0:scarDamage(log,t,angle)),.66,1.28),innerScale=log.form===0?.71-.17*(t/log.depth)**1.8:.63+.040*Math.sin(t*6.8+log.phase);
  const rz=log.rz*(inner?innerScale:1)*r,ry=log.ry*(inner?innerScale:1)*r;
  let a=angle;if(log.form!==0){const left=.035+.14*(.5+.5*Math.sin(t*13+log.phase))+.055*Math.sin(t*29+log.phase)**2,right=.035+.12*(.5+.5*Math.sin(t*11-log.phase))+.065*Math.sin(t*23-log.phase)**2;a+=left*Math.exp(-(angleDelta(angle,log.start)**2)/.10)-right*Math.exp(-(angleDelta(angle,log.end)**2)/.10);}
  const front=.115*Math.sin(angle*3+log.phase)+.070*Math.sin(angle*7-log.phase)+.032*Math.sin(angle*13+log.phase),back=.100*Math.sin(angle*2-log.phase)+.067*Math.sin(angle*5+log.phase)+.035*Math.sin(angle*11-log.phase);
  c.x+=(front+(inner?.032*Math.sin(angle*5+log.phase):0))*Math.exp(-t/.095)+(back+(inner?.036*Math.sin(angle*7-log.phase):0))*Math.exp(-(1-t)/.095);
  c.y=Math.max(0,c.y+Math.sin(a)*ry);c.z+=Math.cos(a)*rz;
  // Keep the cache local to one log and bounded; callers freely mutate their returned point.
  if(log.sectionCacheCount<4096){if(!row){row=new Map();cache.set(t,row);}row.set(angle,c.clone());log.sectionCacheCount++;}
  return c;
}
function outward(log:Log,angle:number){return new THREE.Vector3(0,Math.sin(angle)/log.ry,Math.cos(angle)/log.rz).normalize();}
function normalAt(log:Log,t:number,angle:number){
  let row=log.normalCache.get(t);const cached=row?.get(angle);if(cached)return cached.clone();
  const axial=section(log,Math.min(1,t+.001),angle).sub(section(log,Math.max(0,t-.001),angle)),around=section(log,t,angle+.001).sub(section(log,t,angle-.001)),normal=axial.cross(around).normalize();
  if(!row){row=new Map();log.normalCache.set(t,row);}row.set(angle,normal.clone());return normal;
}
function crossArc(log:Log,t:number,angle:number){
  let row=log.arcCache.get(t);const cached=row?.get(angle);if(cached!==undefined)return cached;
  const steps=Math.max(1,Math.ceil((angle-log.start)/.15));let previous=section(log,t,log.start),arc=0;
  for(let i=1;i<=steps;i++){const point=section(log,t,log.start+(angle-log.start)*i/steps);arc+=point.distanceTo(previous);previous=point;}
  if(!row){row=new Map();log.arcCache.set(t,row);}row.set(angle,arc);
  return arc;
}
function exposed(log:Log,t:number,angle:number){
  return scarDamage(log,t,angle)>.075;
}
function vertex(log:Log,p:THREE.Vector3,c:THREE.Color,u:number,v:number,role:number){
  p.y=Math.max(0,p.y);const id=log.writer.vertex(p,c,u,v,0,role,0);if(role<3&&p.y<=1e-9)log.contacts.add(id);return id;
}
function solid(log:Log,key:string,points:THREE.Vector3[]){
  const box=log.solids.get(key)??new THREE.Box3();points.forEach(p=>box.expandByPoint(p));log.solids.set(key,box);
  // Expansion is applied once when the complete bucket is returned.
}

function surface(log:Log,ts:number[],angles:number[],inner=false):Surface{
  const points:THREE.Vector3[][]=[],ids:number[][]=[];
  for(const t of ts){
    const row=angles.map(a=>section(log,t,a,inner)),indices:number[]=[];let arc=0;
    for(let j=0;j<row.length;j++){
      if(j)arc+=row[j].distanceTo(row[j-1]);const bare=!inner&&exposed(log,t,angles[j]),role=inner?2:bare?1:0;
      const damage=scarDamage(log,t,angles[j]),c=inner?tint('#596054',.85+.075*Math.sin(t*9+angles[j]*2)):bare?tint('#988c72',.87+.07*Math.sin(angles[j]*3)-damage*.22):tint('#776f61',.76+.10*Math.sin(angles[j]+.6)+.035*Math.sin(t*12+log.phase)-damage*.28);
      indices.push(vertex(log,row[j],c,row[j].x+log.length*.5,arc,role));
    }
    if(angles[angles.length-1]-angles[0]>=TAU-1e-9)log.seams.push([indices[0],indices[indices.length-1]]);
    points.push(row);ids.push(indices);
  }
  for(let k=0;k<ts.length-1;k++)for(let j=0;j<angles.length-1;j++){
    const a=ids[k][j],b=ids[k+1][j],c=ids[k][j+1],d=ids[k+1][j+1];
    if(inner){log.writer.triangle(a,c,b);log.writer.triangle(c,d,b);}else{log.writer.triangle(a,b,c);log.writer.triangle(c,b,d);}
    const band=Math.min(7,Math.floor((ts[k]+ts[k+1])*.5*8)),sector=Math.floor(j/3),corners=[points[k][j],points[k+1][j],points[k][j+1],points[k+1][j+1]];
    if(log.form===0&&ts[k]>=log.depth&&!inner)solid(log,`body_${band}`,corners);
    else if(log.form===0&&!inner&&ts[k]<log.depth&&ts[k+1]>log.depth)solid(log,`body_${band}`,corners.filter((_,i)=>i%2===1).concat([section(log,log.depth,angles[j]),section(log,log.depth,angles[j+1])]));
    else if(log.form!==0||ts[k+1]<=log.depth){
      const opposite=corners.map((_,i)=>section(log,i%2?ts[k+1]:ts[k],angles[j+(i>=2?1:0)],!inner));
      // The paired surfaces bound only the surviving cortical wall, leaving the cavity open.
      solid(log,`shell_${band}_${sector}`,log.form===1?corners.concat(corners.map((p,i)=>p.clone().addScaledVector(outward(log,angles[j+(i>=2?1:0)]),-.014))):corners.concat(opposite));
    }
  }
  return {points,ids,ts,angles};
}

function endRim(log:Log,outer:Surface,inner:Surface,outerRow:number,innerRow:number){
  const out=outer.points[outerRow],inside=inner.points[innerRow],c=centre(log,outer.ts[outerRow]),rows:number[][]=[];
  for(let layer=0;layer<3;layer++)rows.push(out.map((p,j)=>{const q=p.clone().lerp(inside[j],layer/2);if(layer===1)q.x+=(outerRow===0?-1:1)*(.018+.030*Math.sin(outer.angles[j]*6+log.phase)**2);return vertex(log,q,tint('#a09276',.84+.08*Math.sin(j*1.7+layer)),q.z-c.z,q.y-c.y,1);}));
  for(let layer=0;layer<2;layer++)for(let j=0;j<out.length-1;j++){
    const a=rows[layer][j],b=rows[layer][j+1],c=rows[layer+1][j],d=rows[layer+1][j+1];
    if(outerRow===0){log.writer.triangle(a,b,c);log.writer.triangle(b,d,c);}else{log.writer.triangle(a,c,b);log.writer.triangle(b,c,d);}
  }
}
function disk(log:Log,row:THREE.Vector3[],c:THREE.Vector3,right:boolean,role:number){
  const middle=c.clone();middle.x+=right?.035:-.030;const m=vertex(log,middle,tint(role===2?'#535b50':'#9e9077'),0,0,role),rows:number[][]=[];
  for(const rho of [.38,.72,1])rows.push(row.map((p,j)=>{const q=middle.clone().lerp(p,rho);q.x+=(right?1:-1)*.036*Math.sin(j*1.67+log.phase)*Math.sin(rho*Math.PI);return vertex(log,q,tint(role===2?'#5b6152':'#a29379',.83+.090*Math.sin(j*1.8+rho*8)),q.z-c.z,q.y-c.y,role);}));
  for(let j=0;j<row.length-1;j++)if(right)log.writer.triangle(m,rows[0][j+1],rows[0][j]);else log.writer.triangle(m,rows[0][j],rows[0][j+1]);
  for(let ring=0;ring<2;ring++)for(let j=0;j<row.length-1;j++){const a=rows[ring][j],b=rows[ring][j+1],c=rows[ring+1][j],d=rows[ring+1][j+1];if(right){log.writer.triangle(a,b,c);log.writer.triangle(b,d,c);}else{log.writer.triangle(a,c,b);log.writer.triangle(b,c,d);}}
}

function floorPoint(log:Log,t:number){
  const c=centre(log,t);c.x=section(log,t,Math.PI/2).x;c.y=Math.max(.045,c.y*.55+.011*Math.sin(t*13+log.phase));c.z+=.013*Math.sin(t*7+log.phase);return c;
}
function splitWalls(log:Log,outer:Surface){
  for(const left of [true,false]){
    const edge=left?0:outer.angles.length-1,points:THREE.Vector3[][]=[],ids:number[][]=[];
    for(let k=0;k<outer.ts.length;k++){
      const floor=floorPoint(log,outer.ts[k]),p:THREE.Vector3[]=[],row:number[]=[];
      for(let layer=0;layer<=8;layer++){
        const v=layer/8,point=outer.points[k][edge].clone().lerp(floor,v);point.z+=(left?-1:1)*.005*Math.sin(v*Math.PI)*Math.sin(outer.ts[k]*21+log.phase);
        row.push(vertex(log,point,tint('#958269',.94-v*.12+.025*Math.sin(outer.ts[k]*12)),point.x+log.length*.5,outer.points[k][edge].distanceTo(floor)*v,1));p.push(point);
      }
      points.push(p);ids.push(row);
    }
    for(let k=0;k<ids.length-1;k++)for(let layer=0;layer<8;layer++){
      const a=ids[k][layer],b=ids[k+1][layer],c=ids[k][layer+1],d=ids[k+1][layer+1];
      if(left){log.writer.triangle(a,c,b);log.writer.triangle(c,d,b);}else{log.writer.triangle(a,b,c);log.writer.triangle(c,b,d);}
      // Inset towards surviving wood; an axis-aligned cell must not fill the narrow V-shaped void.
      const inset=new THREE.Vector3(0,-.003,left?-.016:.016);
      solid(log,`cut_${left?0:1}_${Math.min(7,Math.floor((outer.ts[k]+outer.ts[k+1])*.5*8))}_${layer}`,[points[k][layer],points[k+1][layer],points[k][layer+1],points[k+1][layer+1]].map(p=>p.clone().add(inset)));
    }
  }
  for(const end of [0,outer.ts.length-1]){
    const t=outer.ts[end],row=outer.points[end],floor=floorPoint(log,t),c=floor.clone();c.y*=.52;
    const m=vertex(log,c,tint('#927f65'),0,0,1),ids=row.map(p=>vertex(log,p,tint('#a18b6d',.91+.055*Math.sin(p.z*24)),p.z-c.z,p.y-c.y,1)),f=vertex(log,floor,tint('#8d7b63'),floor.z-c.z,floor.y-c.y,1);
    for(let j=0;j<ids.length-1;j++)if(end===0)log.writer.triangle(m,ids[j],ids[j+1]);else log.writer.triangle(m,ids[j+1],ids[j]);
    if(end===0){log.writer.triangle(m,ids[ids.length-1],f);log.writer.triangle(m,f,ids[0]);}else{log.writer.triangle(m,f,ids[ids.length-1]);log.writer.triangle(m,ids[0],f);}
  }
  for(let band=0;band<8;band++){
    const a=floorPoint(log,band/8),b=floorPoint(log,(band+1)/8),zHalf=log.rz*.23,yMax=Math.min(a.y,b.y)*.73;
    solid(log,`core_${band}`,[new THREE.Vector3(Math.min(a.x,b.x),0,Math.min(a.z,b.z)-zHalf),new THREE.Vector3(Math.max(a.x,b.x),yMax,Math.max(a.z,b.z)+zHalf)]);
  }
}

/** Tapered angular wood fibres, with unequal fork tips and real cross-section thickness. */
function fiber(log:Log,root:THREE.Vector3,direction:THREE.Vector3,length:number,width:number,major=false){
  const axis=direction.clone().normalize(),side=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),axis).normalize(),normal=axis.clone().cross(side).normalize(),rows:number[][]=[],points:THREE.Vector3[]=[];
  for(let k=0;k<4;k++){
    const t=k/3,c=root.clone().addScaledVector(axis,length*t).addScaledVector(normal,.009*Math.sin(t*Math.PI)),r=width*(1-.80*t),row:number[]=[];
    let arc=0,previous:THREE.Vector3|undefined;
    for(let j=0;j<=4;j++){
      const q=j%4,a=q*TAU/4,p=c.clone().addScaledVector(side,Math.cos(a)*r*(.86+.08*Math.sin(q+log.phase))).addScaledVector(normal,Math.sin(a)*r*.61);points.push(p);
      if(previous)arc+=p.distanceTo(previous);previous=p;
      row.push(vertex(log,p,tint('#9e896b',.90+.065*Math.sin(q*1.9+k)),p.x+log.length*.5,arc,1));
    }
    log.seams.push([row[0],row[4]]);rows.push(row);
  }
  for(let k=0;k<3;k++)for(let j=0;j<4;j++){const n=j+1;log.writer.triangle(rows[k][j],rows[k][n],rows[k+1][j]);log.writer.triangle(rows[k][n],rows[k+1][n],rows[k+1][j]);}
  log.writer.triangle(rows[3][0],rows[3][1],rows[3][2]);log.writer.triangle(rows[3][0],rows[3][2],rows[3][3]);
  if(major){solid(log,`fork_${log.fiberForks}`,points);log.fiberForks++;}
}
function woodFragments(log:Log){
  const {random}=log;
  if(log.form===1)for(const sign of [-1,1]){
    const angle=sign<0?log.start+.40:log.end-.40,root=section(log,1,angle).lerp(centre(log,1),.12);
    fiber(log,root,new THREE.Vector3(1,.08+random()*.08,sign*(.15+random()*.11)),.23+random()*.11,.043+random()*.020,true);
  }
  const count=log.form===2?8:12+Math.floor(random()*5);
  for(let i=0;i<count;i++){
    if(log.form===2){
      const t=.13+random()*.66,angle=Math.PI*1.5+(random()-.5)*.43,root=section(log,t,angle,true).add(new THREE.Vector3(0,.006,0));
      fiber(log,root,new THREE.Vector3(random()<.5?-1:1,.015,(random()-.5)*.12),.24+random()*.25,.010+random()*.010);
    }else{
      const right=log.form===1&&random()>.38,angle=log.form===0?.22+random()*2.75:random()<.5?log.start+.2+random()*.55:log.end-.2-random()*.55,root=section(log,right?1:0,angle).lerp(centre(log,right?1:0),.15);
      fiber(log,root,new THREE.Vector3(right?1:-1,.02+random()*.13,(random()-.5)*.16),.12+random()*.14,.009+random()*.012);
    }
  }
  if(log.form===2)for(let i=0;i<3;i++){const right=random()>.5,a=random()>.5?log.start+.20:log.end-.20;fiber(log,section(log,right?1:0,a),new THREE.Vector3(right?1:-1,.05,(random()-.5)*.10),.10+random()*.12,.012+random()*.012);}
  if(random()>.30){
    const t=.22+random()*.52,a=log.form===0?random()>.5?.24:2.88:random()>.5?log.start+.55:log.end-.55,root=section(log,t,a).lerp(centre(log,t),.035);
    fiber(log,root,new THREE.Vector3(random()>.5?.85:-.85,.22,Math.cos(a)*.20),.10+random()*.060,.034+random()*.020,true);log.branchStumps++;
  }
}

/** Thin torn bark with an attached hinge, curled free edge and exposed wood underneath. */
function barkLamellae(log:Log){
  const {random}=log;
  for(const scar of log.scars){
    const count=7+Math.floor(random()*3),halfLength=.080+random()*.110,halfArc=.026+random()*.037,rotation=(random()-.5)*.70,shape=Math.floor(random()*3),phase=random()*TAU,thickness=.005+random()*.005;
    const tc=clamp(scar.t+(random()-.5)*scar.span*.40,.09,.91),ac=scar.angle+(random()-.5)*scar.arc*.45,outline=Array.from({length:count},(_,j)=>.82+.19*Math.sin(j*TAU/count*3+phase)+.13*(random()-.5)),rows:number[][][]=[],points:THREE.Vector3[]=[];
    const point=(rho:number,j:number,under:boolean)=>{
      const phi=j*TAU/count,localX=Math.cos(phi)*halfLength*outline[j]*rho,localArc=Math.sin(phi)*halfArc*outline[j]*rho,t=clamp(tc+(localX*Math.cos(rotation)-localArc*Math.sin(rotation))/log.length,.015,.985),a=clamp(ac+(localX*Math.sin(rotation)+localArc*Math.cos(rotation))/Math.sqrt((log.ry*log.ry+log.rz*log.rz)/2),log.start+.012,log.end-.012),base=section(log,t,a),free=Math.max(0,localX/halfLength),curl=shape===0?.004+.048*free*free:shape===1?.006+.016*Math.sin(rho*Math.PI)+.014*Math.max(0,Math.sin(phi+phase))*rho:.006+.028*free+.012*Math.sin(phi*2+phase)**2*rho;
      const p=base.addScaledVector(normalAt(log,t,a),Math.max(.001,curl+(under?0:thickness)));points.push(p);
      return vertex(log,p,tint(under?'#968970':'#716657',.79+.13*Math.sin(phi*2+phase)+.08*rho),p.x+log.length*.5,crossArc(log,t,a),under?1:0);
    };
    for(const under of [false,true]){const side:number[][]=[];for(const rho of [0,.48,1]){if(rho===0){const centre=point(0,0,under);side.push(Array.from({length:count},()=>centre));}else side.push(Array.from({length:count},(_,j)=>point(rho,j,under)));}rows.push(side);}
    for(let side=0;side<2;side++)for(let j=0;j<count;j++){
      const next=(j+1)%count,centre=rows[side][0][j],a=rows[side][1][j],b=rows[side][1][next],c=rows[side][2][j],d=rows[side][2][next];
      if(side===0){log.writer.triangle(centre,a,b);log.writer.triangle(a,c,b);log.writer.triangle(b,c,d);}else{log.writer.triangle(centre,b,a);log.writer.triangle(a,b,c);log.writer.triangle(b,d,c);}
      const top=rows[0][2],bottom=rows[1][2];if(side===0){log.writer.triangle(top[j],bottom[j],top[next]);log.writer.triangle(top[next],bottom[j],bottom[next]);}
    }
    solid(log,`bark_lamella_${log.barkLamellae}`,points);log.barkLamellae++;
  }
}

/** Lobed, low moss cushions conform to bark; detached rectangular strips are never emitted. */
function mossCushion(log:Log,tc:number,ac:number,halfLength:number,halfArc:number,phase:number,tiny=false){
  const count=tiny?6:8+Math.floor(log.random()*3),outline=Array.from({length:count},(_,j)=>{const phi=j*TAU/count;return .87+.18*Math.sin(phi*3+phase)+.11*Math.cos(phi*5-phase)+.09*(log.random()-.5);}),rows:number[][]=[],base:number[]=[],height=tiny?.004:.011+log.random()*.009,rotation=(log.random()-.5)*1.2;
  for(const rho of [0,.48,1]){
    const row:number[]=[];
    for(let j=0;j<count;j++){
      if(rho===0&&j>0){row.push(row[0]);continue;}
      const phi=j*TAU/count,localX=Math.cos(phi)*halfLength*outline[j]*rho,localArc=Math.sin(phi)*halfArc*outline[j]*rho,t=clamp(tc+(localX*Math.cos(rotation)-localArc*Math.sin(rotation))/log.length,.018,.982),a=clamp(ac+(localX*Math.sin(rotation)+localArc*Math.cos(rotation))/Math.sqrt((log.ry*log.ry+log.rz*log.rz)/2),log.start+.025,log.end-.025),surface=section(log,t,a),normal=normalAt(log,t,a),lift=.0015+height*(1-rho*.90)+height*.32*Math.sin(phi*3+phase)**2*rho,point=surface.clone().addScaledVector(normal,lift),colour=tint('#66764c',.77+.13*Math.sin(phi*2+phase)+.10*(1-rho));
      if(rho===1)colour.lerp(tint('#756e58'),.30);
      row.push(vertex(log,point,colour,point.x+log.length*.5,crossArc(log,t,a),3));
      if(rho===1)base.push(vertex(log,surface,tint('#5e6948'),surface.x+log.length*.5,crossArc(log,t,a),3));
    }
    rows.push(row);
  }
  for(let j=0;j<count;j++){
    const next=(j+1)%count;log.writer.triangle(rows[0][j],rows[1][j],rows[1][next]);log.writer.triangle(rows[1][j],rows[2][j],rows[1][next]);log.writer.triangle(rows[1][next],rows[2][j],rows[2][next]);log.writer.triangle(rows[2][j],base[j],rows[2][next]);log.writer.triangle(rows[2][next],base[j],base[next]);
  }
  log.mossPatches++;
}
function moss(log:Log){
  const {random}=log,count=7+Math.floor(random()*3);
  for(let patch=0;patch<count;patch++){
    const scar=log.scars[patch%log.scars.length],tc=clamp(scar.t+(random()-.5)*.11,.10,.90),ac=clamp(scar.angle+(random()-.5)*.25,log.start+.20,log.end-.20),halfLength=.045+random()*.075,halfArc=.033+random()*.045,phase=random()*TAU;
    mossCushion(log,tc,ac,halfLength,halfArc,phase);
    // The small fringe lobes grow from the parent's boundary, rather than random green dots.
    const phi=phase+random()*.6,edgeT=tc+Math.cos(phi)*halfLength*.88/log.length,edgeA=ac+Math.sin(phi)*halfArc*.88/Math.sqrt((log.ry*log.ry+log.rz*log.rz)/2);
    mossCushion(log,edgeT,edgeA,.018+random()*.012,.011+random()*.009,phase+.5,true);
  }
}
function debris(log:Log){
  const {random}=log,count=4+Math.floor(random()*3);
  for(let chip=0;chip<count;chip++){
    const c=new THREE.Vector3((random()-.5)*log.length*.78,0,(chip%2?1:-1)*(.29+random()*.09)),angle=(random()-.5)*.6,length=.09+random()*.09,width=.018+random()*.025,thickness=.006+random()*.007,ring:THREE.Vector3[]=[],top:number[]=[],bottom:number[]=[];
    for(let j=0;j<5;j++){
      const a=j*TAU/5,p=new THREE.Vector3(Math.cos(a)*length*.5,0,Math.sin(a)*width).applyAxisAngle(new THREE.Vector3(0,1,0),angle).add(c);ring.push(p);
      bottom.push(vertex(log,p,tint('#696857'),p.x+log.length*.5,p.z-c.z,0));
      top.push(vertex(log,p.clone().add(new THREE.Vector3(0,thickness*(.73+.32*Math.sin(j+chip)**2),0)),tint('#827c65',.94+random()*.10),p.x+log.length*.5,p.z-c.z,0));
    }
    const low=vertex(log,c,tint('#676450'),c.x+log.length*.5,0,0),high=vertex(log,c.clone().add(new THREE.Vector3(0,thickness*1.45,0)),tint('#8a8068'),c.x+log.length*.5,0,0);
    for(let j=0;j<5;j++){const k=(j+1)%5;log.writer.triangle(low,bottom[j],bottom[k]);log.writer.triangle(high,top[k],top[j]);log.writer.triangle(bottom[j],top[j],bottom[k]);log.writer.triangle(top[j],top[k],bottom[k]);}
    log.chips++;
  }
}
function fungi(log:Log){
  const {random}=log,count=2+Math.floor(random()*2);
  for(let mushroom=0;mushroom<count;mushroom++){
    const t=.17+random()*.65,angle=log.form===0?.64+random()*1.68:mushroom%2?log.end-.17:log.start+.17,anchor=section(log,t,angle).addScaledVector(outward(log,angle),.003),sign=Math.cos(angle)<0?-1:1,width=.025+random()*.020,reach=.028+random()*.018,rows:number[][]=[];
    for(let layer=0;layer<2;layer++){
      const row:number[]=[];
      for(let j=0;j<=7;j++){
        const a=j*Math.PI/7,p=anchor.clone().add(new THREE.Vector3(Math.cos(a)*width,(layer===0?-.004:.006)+.005*Math.sin(a),sign*Math.sin(a)*reach));
        row.push(vertex(log,p,tint(layer===0?'#8b846c':'#b0a48a',.95+.035*Math.sin(j+log.phase)),p.x-anchor.x,p.z-anchor.z,4));
      }
      rows.push(row);
    }
    const bottom=vertex(log,anchor.clone().add(new THREE.Vector3(0,-.004,0)),tint('#89836c'),0,0,4),top=vertex(log,anchor.clone().add(new THREE.Vector3(0,.009,0)),tint('#b2a78b'),0,0,4);
    for(let j=0;j<7;j++){if(sign>0){log.writer.triangle(top,rows[1][j+1],rows[1][j]);log.writer.triangle(bottom,rows[0][j],rows[0][j+1]);log.writer.triangle(rows[0][j],rows[1][j],rows[0][j+1]);log.writer.triangle(rows[0][j+1],rows[1][j],rows[1][j+1]);}else{log.writer.triangle(top,rows[1][j],rows[1][j+1]);log.writer.triangle(bottom,rows[0][j+1],rows[0][j]);log.writer.triangle(rows[0][j],rows[0][j+1],rows[1][j]);log.writer.triangle(rows[0][j+1],rows[1][j+1],rows[1][j]);}}
    log.fungi++;
  }
}

function compact(log:Log){
  const geometry=log.writer.finish(`ForestDeadwood_${log.form}`,0,false),p=geometry.getAttribute('position'),index=geometry.index!,faces:number[]=[],used=new Set<number>();
  for(let i=0;i<index.count;i+=3){const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2),ux=p.getX(b)-p.getX(a),uy=p.getY(b)-p.getY(a),uz=p.getZ(b)-p.getZ(a),vx=p.getX(c)-p.getX(a),vy=p.getY(c)-p.getY(a),vz=p.getZ(c)-p.getZ(a);if((uy*vz-uz*vy)**2+(uz*vx-ux*vz)**2+(ux*vy-uy*vx)**2<1e-16)continue;faces.push(a,b,c);used.add(a);used.add(b);used.add(c);}
  const identity=used.size===p.count,remap=new Map<number,number>();if(!identity)Array.from(used).sort((a,b)=>a-b).forEach((old,i)=>remap.set(old,i));
  const mapIndex=(old:number)=>identity?old:remap.get(old);
  for(const [name,attribute] of Object.entries(geometry.attributes)){if(name==='normal'){geometry.deleteAttribute(name);continue;}if(identity){geometry.setAttribute(name,new THREE.BufferAttribute(attribute.array,attribute.itemSize,attribute.normalized));continue;}const array=new Float32Array(remap.size*attribute.itemSize);for(const [old,now] of remap)for(let component=0;component<attribute.itemSize;component++)array[now*attribute.itemSize+component]=attribute.array[old*attribute.itemSize+component];geometry.setAttribute(name,new THREE.BufferAttribute(array,attribute.itemSize,attribute.normalized));}
  geometry.setIndex(identity?faces:faces.map(i=>remap.get(i)!));geometry.computeVertexNormals();
  const normal=geometry.getAttribute('normal'),position=geometry.getAttribute('position'),invalid=new Map<number,{area:number;normal:THREE.Vector3}>();
  for(let i=0;i<normal.count;i++)if(normal.getX(i)**2+normal.getY(i)**2+normal.getZ(i)**2<1e-12)invalid.set(i,{area:0,normal:new THREE.Vector3()});
  if(invalid.size){const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),idx=geometry.index!;for(let i=0;i<idx.count;i+=3){const ids=[idx.getX(i),idx.getX(i+1),idx.getX(i+2)];a.fromBufferAttribute(position,ids[0]);b.fromBufferAttribute(position,ids[1]).sub(a);c.fromBufferAttribute(position,ids[2]).sub(a);b.cross(c);for(const id of ids){const entry=invalid.get(id);if(entry&&b.lengthSq()>entry.area){entry.area=b.lengthSq();entry.normal.copy(b);}}}for(const [id,entry] of invalid){entry.normal.normalize();normal.setXYZ(id,entry.normal.x,entry.normal.y,entry.normal.z);}}
  const seamNormal=new THREE.Vector3();for(const [oldA,oldB]of log.seams){const a=mapIndex(oldA),b=mapIndex(oldB);if(a===undefined||b===undefined)continue;seamNormal.set(normal.getX(a)+normal.getX(b),normal.getY(a)+normal.getY(b),normal.getZ(a)+normal.getZ(b)).normalize();normal.setXYZ(a,seamNormal.x,seamNormal.y,seamNormal.z);normal.setXYZ(b,seamNormal.x,seamNormal.y,seamNormal.z);}
  return {geometry,contacts:Array.from(log.contacts).filter(i=>mapIndex(i)!==undefined).map(i=>mapIndex(i)!)};
}

/** Three physically different decayed logs, authored around their local X axis. */
export function createForestDeadwoodGeometry(seed:number,form:0|1|2):ForestDeadwoodGeometry{
  const random=randomFor(seed),length=2.75+random()*1.25,rz=.25+random()*.095,ry=form===2?.146+random()*.036:.19+random()*.055,phase=random()*TAU,depth=.29+random()*.065,start=form===0?0:form===1?Math.PI*.615:Math.PI*.68,end=form===0?TAU:form===1?Math.PI*2.385:Math.PI*2.32;
  const upperAngle=()=>form===0?.22+random()*2.70:random()>.5?start+.16+random()*.70:end-.16-random()*.70;
  const scars=Array.from({length:7+Math.floor(random()*3)},()=>({t:.12+random()*.76,angle:upperAngle(),span:.035+random()*.080,arc:.14+random()*.24,depth:.13+random()*.10}));
  const fissures=Array.from({length:8+Math.floor(random()*4)},()=>({angle:random()*TAU,drift:.035+random()*.12,width:.07+random()*.08,depth:.09+random()*.13,start:random()*.24,end:.64+random()*.36}));
  const log:Log={writer:new Writer(),random,form,length,rz,ry,phase,depth,start,end,knots:Array.from({length:4},()=>({t:.16+random()*.66,angle:upperAngle(),strength:.11+random()*.08})),scars,fissures,sections:[new Map(),new Map()],sectionCacheCount:0,arcCache:new Map(),normalCache:new Map(),contacts:new Set(),solids:new Map(),seams:[],mossPatches:0,barkLamellae:0,branchStumps:0,chips:0,fungi:0,fiberForks:0,probes:[]};
  const rings=(form===2?26:27)+Math.floor(random()*3),sectors=(form===2?26:28)+Math.floor(random()*3),ts=Array.from({length:rings},(_,i)=>i/(rings-1)),angles=Array.from({length:sectors+1},(_,j)=>start+(end-start)*j/sectors),outer=surface(log,ts,angles);
  if(form===0){
    const innerTs=Array.from({length:9},(_,i)=>depth*i/8),inside=surface(log,innerTs,angles,true);endRim(log,outer,inside,0,0);disk(log,inside.points[8],centre(log,depth),false,2);disk(log,outer.points[rings-1],centre(log,1),true,1);
    for(const t of [.04,.12,depth-.06])log.probes.push(centre(log,t).setX(section(log,t,Math.PI/2).x));
  }else if(form===1){splitWalls(log,outer);for(const t of [.12,.30,.48,.64,.80,.92]){const p=floorPoint(log,t);p.y+=.17;log.probes.push(p);}}
  else{
    const inside=surface(log,ts,angles,true);endRim(log,outer,inside,0,0);endRim(log,outer,inside,rings-1,rings-1);
    for(const edge of [0,sectors])for(let k=0;k<rings-1;k++){const ps=[outer.points[k][edge],outer.points[k+1][edge],inside.points[k][edge],inside.points[k+1][edge]],ids=ps.map(p=>vertex(log,p,tint('#958569'),p.x+length*.5,p.y,1));if(edge===0){log.writer.triangle(ids[0],ids[2],ids[1]);log.writer.triangle(ids[1],ids[2],ids[3]);}else{log.writer.triangle(ids[0],ids[1],ids[2]);log.writer.triangle(ids[1],ids[3],ids[2]);}}
    for(const t of [.12,.32,.52,.72,.90]){const p=centre(log,t);p.y+=ry*.44;log.probes.push(p);}
  }
  barkLamellae(log);woodFragments(log);moss(log);debris(log);fungi(log);
  const {geometry,contacts}=compact(log);geometry.computeBoundingBox();const raw=geometry.boundingBox!,shift=new THREE.Vector3(-(raw.min.x+raw.max.x)*.5,0,-(raw.min.z+raw.max.z)*.5);geometry.translate(shift.x,0,shift.z);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const bounds=geometry.boundingBox!,solidBounds=Array.from(log.solids.values()).map(box=>box.translate(shift).intersect(bounds).expandByScalar(.002)),actualLength=bounds.max.x-bounds.min.x,radius=(bounds.max.z-bounds.min.z)*.5,height=bounds.max.y;
  Object.assign(geometry.userData,{seed,form,nominalLength:length,triangles:geometry.index!.count/3,mossPatches:log.mossPatches,barkChips:log.chips,fungi:log.fungi,fiberForks:log.fiberForks,contactIndices:contacts,voidProbes:log.probes.map(p=>p.add(shift).toArray()),surfaceRoles:{bark:0,fiber:1,rottenInterior:2,moss:3,fungi:4},uvConvention:{axial:'u local axial metres, v measured cross-section arc metres',cutEnds:'u local Z offset, v local Y offset, in metres',moss:'u axial metres, v section arc metres',fungi:'u X offset, v Z offset, in metres'},collisionScope:'Only surviving hard main shell, split faces, solid core and large fork fibres; no moss, fungi or detached bark chips. Mouth/long-slot voids remain open.'});
  Object.assign(geometry.userData,{geometryRevision:'deadwood-r2',barkLamellae:log.barkLamellae,branchStumps:log.branchStumps,longFissures:log.fissures.length,peelScars:log.scars.length,mossTopology:'lobed low cushions following actual surface normals, with attached fringe colonies; no rectangular strips',collisionScope:'Surviving hard main shell, split faces, solid core, attached curled bark and large fork fibres; no moss, fungi or detached bark chips. Mouth/long-slot voids remain open.'});
  return {geometry,length:actualLength,radius,height,contactIndices:contacts,solidBounds};
}

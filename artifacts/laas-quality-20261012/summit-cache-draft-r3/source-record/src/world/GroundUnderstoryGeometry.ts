import * as THREE from 'three';
import {Writer,UP,TAU} from './WoodlandPrimitives';

export type GroundUnderstoryKind='hazel'|'bramble'|'bilberry';
type Random=()=>number;
type BranchRecord={order:'basal'|'lateral'|'petiole';points:THREE.Vector3[];radius:number;dead:boolean};
type Build={writer:Writer;random:Random;height:number;branches:BranchRecord[];leafCount:number;damagedLeaves:number;deadBranches:number;basalStems:number;compoundGroups:number;leafLengths:number[]};
const lerp=THREE.MathUtils.lerp;
const radial=(angle:number)=>new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));
const randomFor=(seed:number):Random=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const tint=(hex:string,tone=1)=>new THREE.Color(hex).multiplyScalar(tone);
const woodFlex=(build:Build,p:THREE.Vector3)=>p.y<=0?0:Math.min(.035,p.y/build.height*.025);

function along(points:THREE.Vector3[],t:number){
  const k=THREE.MathUtils.clamp(t,0,1)*(points.length-1),i=Math.min(points.length-2,Math.floor(k));
  return points[i].clone().lerp(points[i+1],k-i);
}
function frame(axis:THREE.Vector3){
  const side=new THREE.Vector3().crossVectors(UP,axis);if(side.lengthSq()<.001)side.set(1,0,0);side.normalize();
  return {side,normal:axis.clone().cross(side).normalize()};
}

/** Curved woody stems; the leaf's petiole uses the same positional wind field. */
function branch(build:Build,points:THREE.Vector3[],radius:number,tip:number,sides:number,color:THREE.Color,order:BranchRecord['order'],dead=false){
  const {writer}=build,rows:number[][]=[],side=new THREE.Vector3();let distance=0;
  for(let k=0;k<points.length;k++){
    if(k)distance+=points[k].distanceTo(points[k-1]);
    const axis=points[Math.min(k+1,points.length-1)].clone().sub(points[Math.max(0,k-1)]).normalize();
    if(k===0)side.crossVectors(axis,Math.abs(axis.y)>.93?new THREE.Vector3(0,0,1):UP).normalize();
    else{side.addScaledVector(axis,-side.dot(axis));if(side.lengthSq()<.001)side.crossVectors(axis,UP);side.normalize();}
    const normal=axis.clone().cross(side),t=k/(points.length-1),r=lerp(radius,tip,t**.82),row:number[]=[];
    for(let j=0;j<=sides;j++){
      const a=(j%sides)*TAU/sides,relief=1+.035*Math.sin(a*3+k*.71),p=points[k].clone().addScaledVector(side,Math.cos(a)*r*relief).addScaledVector(normal,Math.sin(a)*r*relief);
      if(k===0&&points[0].y===0)p.y=0;
      row.push(writer.vertex(p,color.clone().multiplyScalar(.88+.085*Math.cos(a-.50)),j/sides,distance*4,woodFlex(build,p)));
    }
    rows.push(row);
  }
  for(let k=0;k<rows.length-1;k++)for(let j=0;j<sides;j++){writer.triangle(rows[k][j],rows[k][j+1],rows[k+1][j]);writer.triangle(rows[k][j+1],rows[k+1][j+1],rows[k+1][j]);}
  if(dead){
    const end=points[points.length-1],centre=writer.vertex(end,color.clone().lerp(tint('#b3a382'),.42),.5,.5,woodFlex(build,end)),ring=rows[rows.length-1];
    for(let j=0;j<sides;j++)writer.triangle(centre,ring[j],ring[j+1]);build.deadBranches++;
  }
  build.branches.push({order,points:points.map(p=>p.clone()),radius,dead});
}

/** Folded, irregular leaf outlines, with real missing margins on some damaged leaves. */
function leaf(build:Build,base:THREE.Vector3,axis:THREE.Vector3,length:number,halfWidth:number,color:THREE.Color,kind:GroundUnderstoryKind,damage=false){
  const {writer,random}=build,{side,normal}=frame(axis),twist=(random()-.5)*.65;side.applyAxisAngle(axis,twist);normal.copy(axis).cross(side).normalize();
  const outline=kind==='bilberry'?[[0,0],[-.71,.24],[-1,.62],[0,1],[.95,.66],[.68,.25]]:kind==='hazel'?[[0,0],[-.58,.16],[-1,.50],[-.77,.80],[0,1],[.73,.82],[.96,.51],[.55,.17]]:[[0,0],[-.61,.24],[-.93,.49],[-.65,.79],[0,1],[.69,.82],[1,.53],[.59,.26]];
  const center=base.clone().addScaledVector(axis,length*.52).addScaledVector(normal,length*.08),anchor=woodFlex(build,base),flex=.29+random()*.12,ids:number[]=[];
  const c=writer.vertex(center,color.clone().multiplyScalar(1.035),.5,.52,anchor+flex*.52);
  for(let i=0;i<outline.length;i++){
    const [u,t]=outline[i],margin=(.93+random()*.10)*(damage&&i===2?.46:1),p=base.clone().addScaledVector(axis,length*t).addScaledVector(side,halfWidth*u*margin).addScaledVector(normal,length*(.055*Math.sin(t*Math.PI)-.040*t*t+.022*u*u));
    ids.push(writer.vertex(p,color.clone().multiplyScalar(.95+.075*t),.5+u*.5,t,anchor+flex*t));
  }
  for(let i=0;i<ids.length;i++)writer.triangle(c,ids[i],ids[(i+1)%ids.length]);
  build.leafCount++;if(damage)build.damagedLeaves++;build.leafLengths.push(length);
}

function attachLeaf(build:Build,origin:THREE.Vector3,direction:THREE.Vector3,length:number,kind:GroundUnderstoryKind,leafColor:THREE.Color,widthRatio:number,petioleLength=.010){
  const {random}=build,axis=direction.clone().normalize(),end=origin.clone().addScaledVector(axis,petioleLength);
  branch(build,[origin,end],.00065,.00035,3,tint('#7b8150'), 'petiole');
  const damage=build.leafCount===0||random()<.055,aged=random()<.07,c=leafColor.clone().multiplyScalar(.88+random()*.18);
  if(aged||damage)c.lerp(tint('#938858'),aged?.32:.12);
  leaf(build,end,axis,length,length*widthRatio,c,kind,damage);
}

function hazel(build:Build){
  const {random,height}=build,stems=4+Math.floor(random()*2),phase=random()*TAU;build.basalStems=stems;
  for(let stem=0;stem<stems;stem++){
    const a=phase+stem*2.399963+(random()-.5)*.35,direction=radial(a),root=radial(a+.4).multiplyScalar(.025+random()*.032),h=height*(.77+random()*.21),lean=.095+random()*.075;
    const points=Array.from({length:6},(_,i)=>root.clone().addScaledVector(direction,lean*(i/5)**1.4).add(new THREE.Vector3(.012*Math.sin(i*.8+phase)*i/5,h*i/5,.010*Math.sin(i*.6)*i/5)));
    branch(build,points,.0065+random()*.0028,.0011,6,tint('#7c765c',.94+random()*.08),'basal');
    for(let shoot=0;shoot<3;shoot++){
      const t=.32+shoot*.21,origin=along(points,t),azimuth=a+(shoot%2?1:-1)*(.63+random()*.52),heading=radial(azimuth),reach=.18+random()*.065,rise=.070+random()*.065;
      const end=origin.clone().addScaledVector(heading,reach).add(new THREE.Vector3(0,rise,0)),path=[origin,origin.clone().lerp(end,.46).add(new THREE.Vector3(0,.026,0)),end],dead=stem===0&&shoot===0;
      branch(build,path,.0024,.00065,4,tint(dead?'#9a8b72':'#7a775c'), 'lateral',dead);
      if(dead)continue;
      for(let node=0;node<4;node++){
        const p=along(path,.22+node*.22),angle=azimuth+(node%2?1:-1)*(.68+random()*.28),axis=radial(angle).add(new THREE.Vector3(0,.22+random()*.24,0));
        attachLeaf(build,p,axis,.055+random()*.037,'hazel',tint('#66834a'),.34+random()*.075,.009+random()*.007);
      }
    }
    for(let node=0;node<3;node++){
      const t=.72+node*.105,axis=radial(a+(node%2?1:-1)*1.06).add(new THREE.Vector3(0,.34,0));
      attachLeaf(build,along(points,t),axis,.053+random()*.026,'hazel',tint('#708c4d'),.37,.012);
    }
  }
}

function thorn(build:Build,origin:THREE.Vector3,outward:THREE.Vector3,size:number){
  const {writer}=build,{side,normal}=frame(outward),base=origin.clone().addScaledVector(outward,.0025),color=tint('#887f67'),a=writer.vertex(base.clone().addScaledVector(side,-size*.21),color,0,0,woodFlex(build,base)),b=writer.vertex(base.clone().addScaledVector(side,size*.21),color,1,0,woodFlex(build,base)),c=writer.vertex(base.clone().addScaledVector(normal,size*.28),color,.5,.2,woodFlex(build,base)),tip=writer.vertex(base.clone().addScaledVector(outward,size).addScaledVector(normal,size*.12),color.clone().multiplyScalar(1.07),.5,1,woodFlex(build,base));
  writer.triangle(a,b,tip);writer.triangle(b,c,tip);writer.triangle(c,a,tip);writer.triangle(a,c,b);
}

function bramble(build:Build){
  const {random,height}=build,canes=2+Math.floor(random()*2),phase=random()*TAU;build.basalStems=canes;
  for(let cane=0;cane<canes;cane++){
    const a=phase+cane*2.399963+(random()-.5)*.34,direction=radial(a),side=new THREE.Vector3(-direction.z,0,direction.x),root=radial(a+.7).multiplyScalar(.02+random()*.025),reach=.35+random()*.10,h=height*(.88+random()*.10),bow=(random()-.5)*.09;
    const points=Array.from({length:8},(_,i)=>root.clone().addScaledVector(direction,reach*i/7).addScaledVector(side,bow*Math.sin(i/7*Math.PI)).add(new THREE.Vector3(0,h*(Math.sin(i/7*Math.PI*.94)+.08*i/7),0)));
    branch(build,points,.0034+random()*.0015,.0011,5,tint('#777651',.90+random()*.11),'basal');
    for(let spike=0;spike<4;spike++)thorn(build,along(points,.22+spike*.15),side.clone().multiplyScalar(spike%2?1:-1).add(new THREE.Vector3(0,.28,0)).normalize(),.005+random()*.003);
    const groups=4+(random()<.4?1:0);
    for(let group=0;group<groups;group++){
      const t=.27+group/(groups-1)*.57,origin=along(points,t),heading=radial(a+(group%2?1:-1)*(.61+random()*.37)),end=origin.clone().addScaledVector(heading,.035+random()*.018).add(new THREE.Vector3(0,.009,0)),dead=cane===0&&group===0;
      branch(build,[origin,end],.0013,.0007,4,tint(dead?'#9c8b70':'#788159'), 'lateral',dead);if(dead)continue;
      build.compoundGroups++;
      const terminalLength=.050+random()*.026;
      for(let leaflet=0;leaflet<3;leaflet++){
        const angle=a+(group%2?1:-1)*.60+(leaflet-1)*.98,axis=radial(angle).add(new THREE.Vector3(0,leaflet===1?.20:.10,0));
        attachLeaf(build,end,axis,terminalLength*(leaflet===1?1:.84),'bramble',tint('#547847'),.30+random()*.065,leaflet===1?.014:.010);
      }
    }
  }
}

function bilberry(build:Build){
  const {random,height}=build,stems=5+Math.floor(random()*3),phase=random()*TAU;build.basalStems=stems;
  for(let stem=0;stem<stems;stem++){
    const a=phase+stem*2.399963+(random()-.5)*.23,direction=radial(a),root=radial(a-.35).multiplyScalar(.035+random()*.042),h=height*(stem===0?.97:.82+random()*.16),reach=.13+random()*.083;
    const points=Array.from({length:6},(_,i)=>root.clone().addScaledVector(direction,reach*(i/5)**1.22).addScaledVector(radial(a+Math.PI/2),Math.sin(i*2.25+phase)*.016*i/5).add(new THREE.Vector3(0,h*i/5,0)));
    branch(build,points,.0027+random()*.0011,.00065,4,tint('#73805b',.92+random()*.1),'basal');
    for(let node=0;node<4;node++){
      const t=.36+node*.18,axis=radial(a+(node%2?1:-1)*1.05).add(new THREE.Vector3(0,.22+random()*.16,0));
      attachLeaf(build,along(points,t),axis,.040+random()*.017,'bilberry',tint('#6c8848'),.24+random()*.046,.006+random()*.004);
    }
    for(let shoot=0;shoot<2;shoot++){
      const origin=along(points,.43+shoot*.25),heading=radial(a+(shoot%2?1:-1)*.64),end=origin.clone().addScaledVector(heading,.095+random()*.045).add(new THREE.Vector3(0,.050+random()*.037,0)),path=[origin,origin.clone().lerp(end,.50).add(new THREE.Vector3(0,.010,0)),end],dead=stem===0&&shoot===0;
      branch(build,path,.00125,.0004,3,tint(dead?'#998b72':'#74825a'), 'lateral',dead);if(dead)continue;
      for(let node=0;node<3;node++){
        const axis=radial(a+(node%2?1:-1)*.94+shoot*.21).add(new THREE.Vector3(0,.21,0));
        attachLeaf(build,along(path,.27+node*.31),axis,.040+random()*.014,'bilberry',tint('#608143'),.255,.007);
      }
    }
  }
}

function finish(build:Build,kind:GroundUnderstoryKind,seed:number){
  const geometry=build.writer.finish(`GroundUnderstory_${kind}_${seed}`),position=geometry.getAttribute('position'),index=geometry.index!,faces:number[]=[],used=new Set<number>();
  for(let i=0;i<index.count;i+=3){
    const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2),ux=position.getX(b)-position.getX(a),uy=position.getY(b)-position.getY(a),uz=position.getZ(b)-position.getZ(a),vx=position.getX(c)-position.getX(a),vy=position.getY(c)-position.getY(a),vz=position.getZ(c)-position.getZ(a);
    if((uy*vz-uz*vy)**2+(uz*vx-ux*vz)**2+(ux*vy-uy*vx)**2<1e-16)continue;
    faces.push(a,b,c);used.add(a);used.add(b);used.add(c);
  }
  const remap=new Map<number,number>();Array.from(used).sort((a,b)=>a-b).forEach((old,i)=>remap.set(old,i));
  for(const [name,attribute] of Object.entries(geometry.attributes)){
    if(name==='normal'){geometry.deleteAttribute(name);continue;}
    const array=new Float32Array(remap.size*attribute.itemSize);for(const [old,now] of remap)for(let component=0;component<attribute.itemSize;component++)array[now*attribute.itemSize+component]=attribute.array[old*attribute.itemSize+component];
    geometry.setAttribute(name,new THREE.BufferAttribute(array,attribute.itemSize,attribute.normalized));
  }
  geometry.setIndex(faces.map(id=>remap.get(id)!));geometry.computeVertexNormals();
  const p=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),invalidNormals=new Map<number,{area:number;normal:THREE.Vector3}>(),roots:number[]=[];let radius=0,height=0;
  for(let i=0;i<p.count;i++){
    radius=Math.max(radius,Math.hypot(p.getX(i),p.getZ(i)));height=Math.max(height,p.getY(i));if(Math.abs(p.getY(i))<1e-8)roots.push(i);
    if(normal.getX(i)**2+normal.getY(i)**2+normal.getZ(i)**2<1e-12)invalidNormals.set(i,{area:0,normal:new THREE.Vector3()});
  }
  if(invalidNormals.size){
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),idx=geometry.index!;
    for(let i=0;i<idx.count;i+=3){const ids=[idx.getX(i),idx.getX(i+1),idx.getX(i+2)];a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]).sub(a);c.fromBufferAttribute(p,ids[2]).sub(a);b.cross(c);for(const id of ids){const entry=invalidNormals.get(id);if(entry&&b.lengthSq()>entry.area){entry.area=b.lengthSq();entry.normal.copy(b);}}}
    for(const [id,entry] of invalidNormals){entry.normal.normalize();normal.setXYZ(id,entry.normal.x,entry.normal.y,entry.normal.z);}
  }
  geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.boundingBox!.expandByScalar(.11);geometry.boundingSphere!.radius+=.11;
  Object.assign(geometry.userData,{understoryKind:kind,seed,height,footprintRadius:radius,rootVertexIndices:roots,windPadding:.11,windPaddingSpace:'world-metres',triangles:geometry.index!.count/3,basalStemCount:build.basalStems,branchCount:build.branches.filter(b=>b.order!=='petiole').length,leafCount:build.leafCount,damagedLeafCount:build.damagedLeaves,deadBranchCount:build.deadBranches,compoundLeafGroups:build.compoundGroups,leafLengthsMetres:{min:Math.min(...build.leafLengths),max:Math.max(...build.leafLengths)},branchStructure:build.branches.filter(b=>b.order!=='petiole').map(b=>({order:b.order,points:b.points.map(p=>p.toArray()),radius:b.radius,dead:b.dead}))});
  return geometry;
}

/** Physical upright hazel, arched compound-leaf bramble and alternating-leaf bilberry shoots. */
export function createGroundUnderstoryGeometry(kind:GroundUnderstoryKind,seed:number):THREE.BufferGeometry{
  const random=randomFor(seed),height=kind==='hazel'?.76+random()*.20:kind==='bramble'?.41+random()*.22:.37+random()*.18;
  const writer=new Writer(p=>p.y<=0?0:Math.min(.060,(p.y/height)**1.25*.055)),build:Build={writer,random,height,branches:[],leafCount:0,damagedLeaves:0,deadBranches:0,basalStems:0,compoundGroups:0,leafLengths:[]};
  switch(kind){case 'hazel':hazel(build);break;case 'bramble':bramble(build);break;case 'bilberry':bilberry(build);break;default:throw new RangeError(`Unsupported understory kind: ${String(kind)}`);}
  return finish(build,kind,seed);
}

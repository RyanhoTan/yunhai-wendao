import * as THREE from 'three';
import {Writer,UP,TAU,type Leaf} from './WoodlandPrimitives';

export type WoodlandDetail = 0 | 1 | 2;
export type WoodlandArchitecture = 0 | 1 | 2 | 3;
export const woodlandRandom=(seed:number)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
export const WOODLAND_TREE_WIND_PADDING=.4;
export type WoodlandTree = {
  height:number;radius:number;trunkRadius:number;wood:THREE.BufferGeometry;leaves:THREE.BufferGeometry;
  architecture:WoodlandArchitecture;crownClusters:number;leafCount:number;branchCount:number;
  clusterLayout:ReadonlyArray<{center:readonly [number,number,number];leafCount:number}>;
  trunkSegments:ReadonlyArray<{a:readonly [number,number,number];b:readonly [number,number,number];radius:number}>;
};
type Limb={points:THREE.Vector3[];radius:number;tip:number;order:number;root?:boolean;broken?:boolean;phase:number};
type TreeLeaf=Leaf&{id:number;cluster:number;points:THREE.Vector3[]};
type Cluster={center:THREE.Vector3;axis:THREE.Vector3;leaves:TreeLeaf[];phase:number};
type Layout={height:number;trunkRadius:number;color:THREE.Color;bark:THREE.Color;limbs:Limb[];clusters:Cluster[];leaves:TreeLeaf[];bounds:THREE.Box3;radius:number;keepers:Set<number>};
const clamp=THREE.MathUtils.clamp,lerp=THREE.MathUtils.lerp;

function along(points:THREE.Vector3[],t:number){
  const k=clamp(t,0,1)*(points.length-1),i=Math.min(points.length-2,Math.floor(k));
  return points[i].clone().lerp(points[i+1],k-i);
}
function frame(axis:THREE.Vector3){
  const side=new THREE.Vector3().crossVectors(UP,axis);
  if(side.lengthSq()<.001)side.set(1,0,0);side.normalize();
  return {side,normal:axis.clone().cross(side).normalize()};
}
function physicalLeafPoints(item:Leaf){
  const {side,normal}=frame(item.axis);side.applyAxisAngle(item.axis,item.twist);normal.copy(item.axis).cross(side).normalize();
  const p=(u:number,t:number)=>item.base.clone().addScaledVector(item.axis,item.length*t).addScaledVector(side,item.width*u*Math.sin(t*Math.PI)).addScaledVector(normal,item.length*(.065*Math.sin(t*Math.PI)-.13*t*t));
  return [item.base.clone(),p(-1,.43),p(1,.48),p(0,1),p(0,.45).addScaledVector(normal,item.length*.075)];
}

/** All detail levels are derived from this one botanical layout, without enlarged leaves. */
function treeLayout(kind:number,seed:number,architecture:WoodlandArchitecture):Layout{
  const random=woodlandRandom(seed),species=clamp(Math.floor(kind),0,2);
  const ageHeight=[.70,1,1.04,.94][architecture],ageWidth=[.61,1,1.28,.93][architecture];
  const height=[10.5,12.6,10.1][species]*ageHeight*(.92+random()*.17),baseRadius=[.37,.255,.335][species]*[.61,1,1.55,1.08][architecture];
  const spread=[3.45,2.40,3.75][species]*ageWidth*(.93+random()*.13);
  const bark=new THREE.Color(['#8b7a60','#b9b7a6','#8a7c65'][species]),color=new THREE.Color(['#617b3b','#739052','#608447'][species]);
  const leanAngle=random()*TAU,lean=[.55,.88,1.48,1.14][architecture]*(.55+random()*.65),leanVector=new THREE.Vector3(Math.cos(leanAngle),0,Math.sin(leanAngle));
  const limbs:Limb[]=[],clusters:Cluster[]=[],leaves:TreeLeaf[]=[],bounds=new THREE.Box3();
  const trunkPoint=(t:number)=>leanVector.clone().multiplyScalar(lean*t**1.7).add(new THREE.Vector3(Math.sin(t*5.1+seed*.017)*.09*t,height*t,Math.sin(t*4.3+seed*.031)*.12*t));
  const addLimb=(points:THREE.Vector3[],radius:number,tip:number,order:number,options:Partial<Limb>={})=>{
    const limb={points,radius,tip,order,phase:random()*TAU,...options};limbs.push(limb);
    // Radial bark relief and taper are included, even where lower LODs retain fewer ring vertices.
    points.forEach(p=>{const r=radius*1.36;bounds.expandByPoint(p.clone().addScalar(r));bounds.expandByPoint(p.clone().addScalar(-r));});
    return limb;
  };
  const fork=architecture===2,broken=architecture===3;
  const forkHeight=fork?.32+random()*.10:1,stemEnd=broken?.84+random()*.09:forkHeight;
  const trunk=Array.from({length:fork?5:8},(_,i)=>trunkPoint(stemEnd*i/(fork?4:7)));
  addLimb(trunk,baseRadius,fork?baseRadius*.56:broken?baseRadius*.13:.035,-1,{broken});
  let leaders:THREE.Vector3[][]=[trunk];
  if(fork){
    const crotch=trunk[trunk.length-1],splitDirection=leanVector.clone().applyAxisAngle(UP,.65+(random()-.5)*.40);
    leaders=[-1,1].map((sign,index)=>{
      const topHeight=height*(index===0?1:.84+random()*.12),offset=splitDirection.clone().multiplyScalar(sign*spread*(.28+random()*.11)).addScaledVector(leanVector,index===0?.75:.35);
      const points=Array.from({length:6},(_,i)=>crotch.clone().lerp(trunkPoint(topHeight/height).add(offset),i/5).addScaledVector(splitDirection,sign*Math.sin(i/5*Math.PI)*.19));
      addLimb(points,baseRadius*(index===0?.62:.49),.033,-1);return points;
    });
  }
  const rootCount=[5,7,9,7][architecture],rootPhase=random()*TAU;
  for(let i=0;i<rootCount;i++){
    const a=rootPhase+i*TAU/rootCount+(random()-.5)*.35,direction=new THREE.Vector3(Math.cos(a),0,Math.sin(a)),side=direction.clone().cross(UP),length=baseRadius*(2.7+random()*1.65);
    const points=[direction.clone().multiplyScalar(baseRadius*.44),direction.clone().multiplyScalar(baseRadius*.94).add(new THREE.Vector3(0,baseRadius*.43,0)),direction.clone().multiplyScalar(length*.60).addScaledVector(side,(random()-.5)*.15).add(new THREE.Vector3(0,baseRadius*.15,0)),direction.clone().multiplyScalar(length)];
    addLimb(points,baseRadius*.25,baseRadius*.018,3,{root:true});
  }
  const arms=[6+(species===1?1:0),10+(species===1?1:0),11+(species===1?1:0),8][architecture],phase=random()*TAU;
  for(let arm=0;arm<arms;arm++){
    const level=(architecture===0?.24:architecture===1?.31:architecture===2?.30:.32)+(arm+.25+random()*.45)/arms*(architecture===0?.68:.60);
    const leader=fork&&arm>1?leaders[arm%2]:trunk,start=along(leader,fork&&arm>1?(level-.26)/.70:level/stemEnd);
    const angle=phase+arm*2.399963+(random()-.5)*.64+(fork?.24*Math.sin(arm*1.9):0),radial=new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));
    const lateral=radial.clone().cross(UP),crownShape=Math.sqrt(Math.max(.18,1-((level-.63)/.43)**2));
    const reach=spread*crownShape*(.65+random()*.42)*(architecture===2?.83+.27*radial.dot(leanVector):1);
    const rise=height*(species===1?.12+random()*.065:.055+random()*.07),droop=species===2?.32:architecture===2?.24:.10;
    const end=start.clone().addScaledVector(radial,reach).add(new THREE.Vector3(0,rise,0));
    const primary=Array.from({length:6},(_,i)=>start.clone().lerp(end,i/5).addScaledVector(lateral,Math.sin(i/5*Math.PI)*(random()-.5)*.37).add(new THREE.Vector3(0,Math.sin(i/5*Math.PI)*(rise*.28+droop)-droop*(i/5)**3,0)));
    const bare=broken&&(arm===1||arm===5)||(fork&&arm===2);
    if(bare){primary.splice(4);primary[primary.length-1].lerp(primary[primary.length-2],.20);}
    addLimb(primary,baseRadius*(.29+random()*.13),bare?.025:.018,0,{broken:bare});
    if(bare)continue;
    const secondaryCount=architecture===0?2:broken?2+(random()<.35?1:0):3+(random()<.22?1:0);
    for(let branch=0;branch<secondaryCount;branch++){
      const at=.34+(branch+.18+random()*.27)/secondaryCount*.59,origin=along(primary,at),fan=angle+(branch%2?1:-1)*(.60+random()*.62);
      const direction=new THREE.Vector3(Math.cos(fan),species===1?.58:.30,Math.sin(fan)).normalize(),length=(.66+random()*.49)*(architecture===0?.77:architecture===2?1.08:1);
      const target=origin.clone().addScaledVector(direction,length).add(new THREE.Vector3(0,.10+random()*.22,0));
      const secondary=[origin,origin.clone().lerp(target,.38).add(new THREE.Vector3(0,.12,0)),origin.clone().lerp(target,.76).add(new THREE.Vector3(0,.08,0)),target];
      addLimb(secondary,baseRadius*.070,.006,1);
      const cluster:Cluster={center:new THREE.Vector3(),axis:target.clone().sub(origin).normalize(),leaves:[],phase:random()*TAU};clusters.push(cluster);
      const sprigs=architecture===0?5:6,perSprig=architecture===0?13:broken?12:16+(random()<.45?2:0);
      for(let twig=0;twig<sprigs;twig++){
        const twigStart=along(secondary,.37+(twig+.20)/sprigs*.59),rotation=cluster.phase+twig*2.399963;
        const axis=cluster.axis.clone().multiplyScalar(.54).add(new THREE.Vector3(Math.cos(rotation)*.65,.24+random()*.26,Math.sin(rotation)*.65)).normalize();
        const twigLength=(.29+random()*.26)*(architecture===0?.78:1),twigEnd=twigStart.clone().addScaledVector(axis,twigLength),twigMid=twigStart.clone().lerp(twigEnd,.52).add(new THREE.Vector3(0,.045,0));
        const twigPoints=[twigStart,twigMid,twigEnd];addLimb(twigPoints,.008,.0018,2);
        const basis=frame(axis);
        for(let j=0;j<perSprig;j++){
          const t=.10+(j+.15+random()*.35)/perSprig*.88,base=along(twigPoints,t),azimuth=j*2.399963+rotation+(random()-.5)*.30;
          const leafDirection=axis.clone().multiplyScalar(.24).addScaledVector(basis.side,Math.cos(azimuth)).addScaledVector(basis.normal,Math.sin(azimuth)*.70).add(new THREE.Vector3(0,.14,0)).normalize();
          const leafLength=.10+.15*Math.sqrt(random()),item:TreeLeaf={id:leaves.length,cluster:clusters.length-1,base,axis:leafDirection,length:leafLength,width:leafLength*(species===1?.30+random()*.11:.39+random()*.13),twist:(random()-.5)*.85,tone:.79+random()*.31,points:[]};
          item.points=physicalLeafPoints(item);item.points.forEach(p=>bounds.expandByPoint(p));cluster.leaves.push(item);leaves.push(item);
          cluster.center.add(item.points[4]);
        }
      }
      cluster.center.divideScalar(cluster.leaves.length);
    }
  }
  const keepers=new Set<number>();
  for(const score of [(p:THREE.Vector3)=>p.x,(p:THREE.Vector3)=>-p.x,(p:THREE.Vector3)=>p.y,(p:THREE.Vector3)=>-p.y,(p:THREE.Vector3)=>p.z,(p:THREE.Vector3)=>-p.z,(p:THREE.Vector3)=>p.x*p.x+p.z*p.z]){
    let extreme=-Infinity,keeper=-1;for(const item of leaves)for(const p of item.points){const value=score(p);if(value>extreme){extreme=value;keeper=item.id;}}
    if(keeper>=0)keepers.add(keeper);
  }
  let radius=0;
  limbs.forEach(limb=>limb.points.forEach(p=>{radius=Math.max(radius,Math.hypot(p.x,p.z)+limb.radius*1.36);}));
  leaves.forEach(item=>item.points.forEach(p=>{radius=Math.max(radius,Math.hypot(p.x,p.z));}));
  bounds.min.y=Math.max(0,bounds.min.y);
  return {height,trunkRadius:baseRadius*1.32,color,bark,limbs,clusters,leaves,bounds,radius,keepers};
}

function slowSway(layout:Layout,p:THREE.Vector3){
  const t=clamp(p.y/layout.height,0,1.16),rise=t*t*(3-2*Math.min(t,1)),radial=clamp(Math.hypot(p.x,p.z)/Math.max(layout.radius,1),0,1);
  return clamp(rise*(.56+radial*.30),0,1);
}

function woodSweep(writer:Writer,limb:Limb,layout:Layout,detail:WoodlandDetail){
  if(detail===2&&(limb.order>0||limb.root)||detail===1&&limb.order===2)return;
  const {radius,tip,root,phase}=limb;
  const points=detail===0||limb.order<0?limb.points:detail===1?[limb.points[0],limb.points[Math.floor(limb.points.length/2)],limb.points[limb.points.length-1]]:[limb.points[0],limb.points[Math.floor(limb.points.length/2)],limb.points[limb.points.length-1]];
  const sides=limb.order<0?[14,8,4][detail]:root?[7,4,3][detail]:limb.order===0?[8,4,3][detail]:limb.order===1?[5,3,3][detail]:3;
  const rows:number[][]=[],side=new THREE.Vector3();let distance=0;
  for(let k=0;k<points.length;k++){
    if(k)distance+=points[k].distanceTo(points[k-1]);
    const tangent=points[Math.min(points.length-1,k+1)].clone().sub(points[Math.max(0,k-1)]).normalize();
    if(!k)side.crossVectors(tangent,Math.abs(tangent.y)>.94?new THREE.Vector3(0,0,1):UP).normalize();
    else{side.addScaledVector(tangent,-side.dot(tangent));if(side.lengthSq()<.00001)side.crossVectors(tangent,UP);side.normalize();}
    const normal=tangent.clone().cross(side),row:number[]=[],t=k/(points.length-1),r=lerp(radius,tip,t**.79)*(limb.order<0?1+.19*Math.exp(-t*15):1);
    for(let j=0;j<=sides;j++){
      const a=(j%sides)*TAU/sides;
      const grooves=.058*Math.sin(a*5+phase)+.026*Math.cos(a*9-k*.69+phase),knot=limb.order<0?.095*Math.exp(-(((t-.37)/.13)**2))*Math.max(0,Math.cos(a-phase))**5:0;
      const point=points[k].clone().addScaledVector(side,Math.cos(a)*r*(1+grooves+knot)).addScaledVector(normal,Math.sin(a)*r*(1+grooves+knot));
      if(root||k===0&&points[0].y===0)point.y=Math.max(0,root?point.y:0);
      const tone=.85+.11*Math.cos(a-.60)+.09*Math.min(points[k].y/layout.height,1),c=layout.bark.clone().multiplyScalar(tone);
      row.push(writer.vertex(point,c,j/sides,distance*.60,0,0,root?0:undefined));
    }
    rows.push(row);
  }
  for(let k=0;k<rows.length-1;k++)for(let j=0;j<sides;j++){writer.triangle(rows[k][j],rows[k][j+1],rows[k+1][j]);writer.triangle(rows[k][j+1],rows[k+1][j+1],rows[k+1][j]);}
  if(limb.broken){
    const center=writer.vertex(points[points.length-1],layout.bark.clone().lerp(new THREE.Color('#c5b08b'),.55),.5,.5),last=rows[rows.length-1];
    for(let j=0;j<sides;j++)writer.triangle(center,last[j+1],last[j]);
  }
}

function individualLeaf(writer:Writer,item:TreeLeaf,layout:Layout,folded=true){
  const crownHeight=clamp(item.base.y/layout.height,0,1),exposure=clamp(Math.hypot(item.base.x,item.base.z)/Math.max(layout.radius,1),0,1);
  const tone=item.tone*(.84+exposure*.15+crownHeight*.12),color=layout.color.clone().multiplyScalar(tone),p=item.points;
  const a=writer.vertex(p[0],color,.5,0,0),l=writer.vertex(p[1],color.clone().multiplyScalar(.95),0,.43,.45),r=writer.vertex(p[2],color.clone().multiplyScalar(1.025),1,.48,.50),b=writer.vertex(p[3],color.clone().multiplyScalar(1.07),.5,1,1);
  if(folded){const m=writer.vertex(p[4],color.clone().multiplyScalar(1.025),.5,.45,.50);writer.triangle(a,l,m);writer.triangle(a,m,r);writer.triangle(l,b,m);writer.triangle(m,b,r);}
  else{writer.triangle(a,l,r);writer.triangle(l,b,r);}
}

/** Open, curved sprays replace a cluster's interior leaves, retaining its authored edge points. */
function clusterProxy(writer:Writer,cluster:Cluster,layout:Layout,detail:WoodlandDetail){
  const {side}=frame(cluster.axis),fans=detail===1?3:2,segments=detail===1?7:6;
  const candidates=cluster.leaves.flatMap(item=>item.points.slice(1)),center=cluster.center;
  for(let fan=0;fan<fans;fan++){
    const u=side.clone().applyAxisAngle(cluster.axis,fan*Math.PI/fans+cluster.phase*.23),v=cluster.axis.clone();
    // The centre and every boundary vertex are within the full leaf population's hull.
    const middle=center.clone().lerp(candidates[(fan*71)%candidates.length],.16),ids:number[]=[];
    const shade=.87+fan*.045+clamp(center.y/layout.height,0,1)*.07;
    const c=writer.vertex(middle,layout.color.clone().multiplyScalar(shade),.5,.45,.3,1);
    for(let edge=0;edge<segments;edge++){
      const angle=(edge+.09*Math.sin(edge*2.8+cluster.phase))*TAU/segments,direction=u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v,Math.sin(angle));
      let best=-Infinity,point=candidates[0],foundSector=false;
      for(const candidate of candidates){
        const projected=candidate.clone().sub(center),projectedAngle=Math.atan2(projected.dot(v),projected.dot(u)),angularDistance=Math.abs(Math.atan2(Math.sin(projectedAngle-angle),Math.cos(projectedAngle-angle)));
        const inSector=angularDistance<Math.PI/segments,score=projected.dot(direction)-Math.abs(projected.dot(cluster.axis))*.10;
        if(inSector&&!foundSector){best=-Infinity;foundSector=true;}
        if(inSector===foundSector&&score>best){best=score;point=candidate;}
      }
      const boundary=center.clone().lerp(point,edge%3===0?.80:.97),uv=.5+.49*Math.cos(angle),vv=.5+.49*Math.sin(angle);
      ids.push(writer.vertex(boundary,layout.color.clone().multiplyScalar(shade+.05*Math.sin(edge*1.7+cluster.phase)),uv,vv,.65,1));
    }
    // Two skipped wedges per spray keep air gaps rather than closing a solid crown shell.
    for(let edge=0;edge<segments;edge++)if(edge!==(fan*2+1)%segments&&edge!==(fan*2+3)%segments)writer.triangle(c,ids[edge],ids[(edge+1)%segments]);
  }
}

function smoothBarkSeams(geometry:THREE.BufferGeometry){
  const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),groups=new Map<string,{sum:THREE.Vector3;indices:number[]}>();
  for(let i=0;i<p.count;i++){
    const key=`${Math.round(p.getX(i)*1e5)},${Math.round(p.getY(i)*1e5)},${Math.round(p.getZ(i)*1e5)}`,entry=groups.get(key)??{sum:new THREE.Vector3(),indices:[]};
    entry.sum.add(new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)));entry.indices.push(i);groups.set(key,entry);
  }
  for(const {sum,indices} of groups.values()){sum.normalize();for(const i of indices)n.setXYZ(i,sum.x,sum.y,sum.z);}
  n.needsUpdate=true;
}

function compactTreeGeometry(geometry:THREE.BufferGeometry){
  const position=geometry.getAttribute('position'),index=geometry.index!,triangles:number[]=[],used=new Set<number>();
  for(let i=0;i<index.count;i+=3){
    const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2),ux=position.getX(b)-position.getX(a),uy=position.getY(b)-position.getY(a),uz=position.getZ(b)-position.getZ(a),vx=position.getX(c)-position.getX(a),vy=position.getY(c)-position.getY(a),vz=position.getZ(c)-position.getZ(a);
    if((uy*vz-uz*vy)**2+(uz*vx-ux*vz)**2+(ux*vy-uy*vx)**2<=1e-18)continue;
    triangles.push(a,b,c);used.add(a);used.add(b);used.add(c);
  }
  const remap=new Map<number,number>();Array.from(used).sort((a,b)=>a-b).forEach((old,index)=>remap.set(old,index));
  for(const [name,attribute] of Object.entries(geometry.attributes)){
    if(name==='normal'){geometry.deleteAttribute(name);continue;}
    const array=new Float32Array(remap.size*attribute.itemSize);
    for(const [old,now] of remap)for(let component=0;component<attribute.itemSize;component++)array[now*attribute.itemSize+component]=attribute.array[old*attribute.itemSize+component];
    geometry.setAttribute(name,new THREE.BufferAttribute(array,attribute.itemSize,attribute.normalized));
  }
  geometry.setIndex(triangles.map(i=>remap.get(i)!));geometry.computeVertexNormals();
}

/** Young leaders, mature branching crowns, asymmetric forked veterans and damaged open crowns. */
export function createWoodlandTree(kind:number,seed:number,detail:WoodlandDetail,architecture:WoodlandArchitecture=0):WoodlandTree{
  const layout=treeLayout(kind,seed,architecture),swayAt=(point:THREE.Vector3)=>slowSway(layout,point),wood=new Writer(swayAt),leaves=new Writer(swayAt);
  layout.limbs.forEach(limb=>woodSweep(wood,limb,layout,detail));
  if(detail===0)layout.leaves.forEach(item=>individualLeaf(leaves,item,layout));
  else{
    layout.clusters.forEach(cluster=>clusterProxy(leaves,cluster,layout,detail));
    layout.leaves.forEach(item=>{if(layout.keepers.has(item.id))individualLeaf(leaves,item,layout);else if(detail===1&&item.id%17===0)individualLeaf(leaves,item,layout,false);});
  }
  const woodGeometry=wood.finish(`OriginalWoodland${kind}_${seed}_Architecture${architecture}_WoodLOD${detail}`),leafGeometry=leaves.finish(`OriginalWoodland${kind}_${seed}_Architecture${architecture}_LeafLOD${detail}`);
  compactTreeGeometry(woodGeometry);compactTreeGeometry(leafGeometry);smoothBarkSeams(woodGeometry);
  const bounds=layout.bounds.clone().expandByScalar(WOODLAND_TREE_WIND_PADDING),sphere=bounds.getBoundingSphere(new THREE.Sphere());
  for(const geometry of [woodGeometry,leafGeometry]){geometry.boundingBox=bounds.clone();geometry.boundingSphere=sphere.clone();Object.assign(geometry.userData,{architecture,crownClusters:layout.clusters.length,fullLeafCount:layout.leaves.length,windPadding:WOODLAND_TREE_WIND_PADDING});}
  const trunkSegments=layout.limbs.filter(limb=>limb.order<0).flatMap(limb=>limb.points.slice(1).map((point,i)=>({a:limb.points[i].toArray() as [number,number,number],b:point.toArray() as [number,number,number],radius:lerp(limb.radius,limb.tip,(i/(limb.points.length-1))**.79)*1.36})));
  return {height:layout.bounds.max.y,radius:layout.radius+WOODLAND_TREE_WIND_PADDING,trunkRadius:layout.trunkRadius,wood:woodGeometry,leaves:leafGeometry,architecture,crownClusters:layout.clusters.length,leafCount:layout.leaves.length,branchCount:layout.limbs.filter(limb=>!limb.root&&limb.order>=0).length,clusterLayout:layout.clusters.map(cluster=>({center:cluster.center.toArray() as [number,number,number],leafCount:cluster.leaves.length})),trunkSegments};
}

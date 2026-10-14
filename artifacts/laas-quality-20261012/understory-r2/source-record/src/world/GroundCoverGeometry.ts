import * as THREE from 'three';
import {Writer,UP,TAU} from './WoodlandPrimitives';
import {createGroundUnderstoryGeometry} from './GroundUnderstoryGeometry';

export type GroundCoverKind='grass'|'sedge'|'fern'|'clover'|'flowers'|'litter'|'twig'|'pebble'|'mushroom'|'hazel'|'bramble'|'bilberry';
type Random=()=>number;
const lerp=THREE.MathUtils.lerp;
const randomFor=(seed:number):Random=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const radial=(angle:number)=>new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));
const color=(hex:string,tone=1)=>new THREE.Color(hex).multiplyScalar(tone);

function site(random:Random,radius:number){
  return radial(random()*TAU).multiplyScalar(radius*Math.sqrt(random()));
}
function along(points:THREE.Vector3[],t:number){
  const k=THREE.MathUtils.clamp(t,0,1)*(points.length-1),i=Math.min(points.length-2,Math.floor(k));
  return points[i].clone().lerp(points[i+1],k-i);
}
function basis(axis:THREE.Vector3){
  const side=new THREE.Vector3().crossVectors(UP,axis);
  if(side.lengthSq()<.001)side.set(1,0,0);side.normalize();
  return {side,normal:axis.clone().cross(side).normalize()};
}

/** Narrow folded blades retain a fixed three-vertex root and a single pointed tip. */
function blade(writer:Writer,root:THREE.Vector3,direction:THREE.Vector3,height:number,width:number,lean:number,droop:number,tint:THREE.Color,flex:number){
  const lateral=new THREE.Vector3(-direction.z,0,direction.x),rows:number[][]=[],rise=height/(1-droop);
  const centre=(t:number)=>root.clone().addScaledVector(direction,rise*lean*t*t).add(new THREE.Vector3(0,rise*(t-droop*t*t*t),0));
  for(const t of [0,.45,.82]){
    const p=centre(t),half=width*.5*(.28+.72*Math.sin(Math.PI*t)),weight=flex*t;
    const left=p.clone().addScaledVector(lateral,-half),ridge=p.clone().addScaledVector(direction,half*.25*Math.sin(Math.PI*t)),right=p.clone().addScaledVector(lateral,half);
    const c=tint.clone().multiplyScalar(.88+t*.21);
    rows.push([writer.vertex(left,c,0,t,weight),writer.vertex(ridge,c.clone().multiplyScalar(1.025),.5,t,weight),writer.vertex(right,c,1,t,weight)]);
  }
  for(let row=1;row<rows.length;row++)for(let side=0;side<2;side++){
    const a=rows[row-1],b=rows[row];writer.triangle(a[side],a[side+1],b[side]);writer.triangle(a[side+1],b[side+1],b[side]);
  }
  const tip=writer.vertex(centre(1),tint.clone().multiplyScalar(1.10),.5,1,flex),last=rows[rows.length-1];
  writer.triangle(last[0],last[1],tip);writer.triangle(last[1],last[2],tip);
}

/** Small stems and twigs use curved tubes, with real optional cut end caps. */
function tube(writer:Writer,points:THREE.Vector3[],radius:number,tip:number,sides:number,tint:THREE.Color,flex=0,caps=false,startFlex=0){
  const rows:number[][]=[],side=new THREE.Vector3();let length=0;
  for(let k=0;k<points.length;k++){
    if(k)length+=points[k].distanceTo(points[k-1]);
    const t=k/(points.length-1),axis=points[Math.min(points.length-1,k+1)].clone().sub(points[Math.max(0,k-1)]).normalize();
    if(k===0)side.crossVectors(axis,Math.abs(axis.y)>.93?new THREE.Vector3(0,0,1):UP).normalize();
    else{side.addScaledVector(axis,-side.dot(axis));if(side.lengthSq()<.001)side.crossVectors(axis,UP);side.normalize();}
    const normal=axis.clone().cross(side),r=lerp(radius,tip,t),row:number[]=[];
    for(let j=0;j<=sides;j++){
      const a=(j%sides)*TAU/sides,relief=1+.035*Math.sin(a*3+t*5),p=points[k].clone().addScaledVector(side,Math.cos(a)*r*relief).addScaledVector(normal,Math.sin(a)*r*relief);
      if(k===0&&points[0].y===0)p.y=0;
      row.push(writer.vertex(p,tint.clone().multiplyScalar(.91+.075*Math.cos(a-.5)),j/sides,length*7,lerp(startFlex,flex,t)));
    }
    rows.push(row);
  }
  for(let k=0;k<rows.length-1;k++)for(let j=0;j<sides;j++){
    writer.triangle(rows[k][j],rows[k][j+1],rows[k+1][j]);writer.triangle(rows[k][j+1],rows[k+1][j+1],rows[k+1][j]);
  }
  if(caps)for(const end of [0,points.length-1]){
    const c=writer.vertex(points[end],tint.clone().multiplyScalar(1.13),.5,.5,lerp(startFlex,flex,end/(points.length-1))),ring=rows[end];
    for(let j=0;j<sides;j++)if(end===0)writer.triangle(c,ring[j+1],ring[j]);else writer.triangle(c,ring[j],ring[j+1]);
  }
}

/** Two pairs of uneven margins form a small curled pinna or pointed herb leaf. */
function pointedLeaf(writer:Writer,base:THREE.Vector3,axis:THREE.Vector3,length:number,halfWidth:number,tint:THREE.Color,anchorFlex:number,tipFlex:number,twist=0){
  const {side,normal}=basis(axis);side.applyAxisAngle(axis,twist);normal.copy(axis).cross(side).normalize();
  const p=(t:number,lateral:number)=>base.clone().addScaledVector(axis,length*t).addScaledVector(side,halfWidth*lateral).addScaledVector(normal,length*(.09*Math.sin(t*Math.PI)-.055*t*t));
  const ids=[writer.vertex(base,tint,.5,0,anchorFlex),writer.vertex(p(.30,-.82),tint.clone().multiplyScalar(.96),0,.30,lerp(anchorFlex,tipFlex,.30)),writer.vertex(p(.32,.91),tint.clone().multiplyScalar(1.03),1,.32,lerp(anchorFlex,tipFlex,.32)),writer.vertex(p(.68,-1),tint,0,.68,lerp(anchorFlex,tipFlex,.68)),writer.vertex(p(.71,.85),tint.clone().multiplyScalar(1.025),1,.71,lerp(anchorFlex,tipFlex,.71)),writer.vertex(p(1,0),tint.clone().multiplyScalar(1.07),.5,1,tipFlex)];
  writer.triangle(ids[0],ids[1],ids[2]);writer.triangle(ids[1],ids[3],ids[2]);writer.triangle(ids[2],ids[3],ids[4]);writer.triangle(ids[3],ids[5],ids[4]);
}

function grass(writer:Writer,random:Random,sedge=false){
  const count=sedge?6+Math.floor(random()*3):9+Math.floor(random()*4),patchPhase=random()*TAU;
  for(let i=0;i<count;i++){
    const dry=random()<.13,root=site(random,sedge?.105:.19),angle=patchPhase+i*2.399963+(random()-.5)*.7;
    const height=sedge?.30+random()*.27:.14+random()*.34,width=.005+random()*.007,lean=sedge?.48+random()*.26:.24+random()*.31;
    blade(writer,root,radial(angle),height,width,lean,.08+random()*.08,color(dry?'#938263':sedge?'#627b43':'#6c8747',.88+random()*.19),dry?.30:.72+random()*.17);
  }
  if(sedge){
    const root=site(random,.04),height=.34+random()*.10,points=[root,root.clone().add(new THREE.Vector3(.01,height*.5,-.01)),root.clone().add(new THREE.Vector3(.025,height,0))];
    tube(writer,points,.0011,.0007,3,color('#7c8250'),.20);
    for(let i=0;i<3;i++)pointedLeaf(writer,points[2].clone().add(new THREE.Vector3(0,i*.006,0)),radial(patchPhase+i*TAU/3).add(new THREE.Vector3(0,.45,0)).normalize(),.018,.0032,color('#a29267'),.20,.26);
  }
}

function fern(writer:Writer,random:Random){
  const count=5+Math.floor(random()*2),phase=random()*TAU,plantHeight=.35+random()*.30;
  for(let frond=0;frond<count;frond++){
    const angle=phase+frond*TAU/count+(random()-.5)*.25,direction=radial(angle),lateral=new THREE.Vector3(-direction.z,0,direction.x),height=plantHeight*(.88+random()*.12),reach=.28+random()*.11;
    const points=Array.from({length:5},(_,i)=>direction.clone().multiplyScalar(reach*(i/4)**1.55).add(new THREE.Vector3(0,height*Math.sin(i/4*Math.PI*.71),0)));
    const old=frond===0&&random()<.35,tint=color(old?'#879064':'#577e43',.88+random()*.14),flex=old?.28:.43;
    tube(writer,points,.0023,.0007,4,tint.clone().multiplyScalar(.84),flex);
    for(let pair=0;pair<6;pair++){
      const t=.16+pair*.133,origin=along(points,t),length=(.042+.090*Math.sin(t*Math.PI))*(.88+random()*.12),anchorFlex=flex*t;
      for(const sign of [-1,1]){
        const axis=lateral.clone().multiplyScalar(sign).addScaledVector(direction,.22+random()*.12).add(new THREE.Vector3(0,-.08-random()*.07,0)).normalize();
        pointedLeaf(writer,origin,axis,length,length*(.095+random()*.025),tint.clone().multiplyScalar(.88+random()*.19),anchorFlex,Math.min(.76,anchorFlex+.19),sign*(.09+random()*.15));
      }
    }
  }
}

function cloverLeaf(writer:Writer,base:THREE.Vector3,direction:THREE.Vector3,length:number,halfWidth:number,tint:THREE.Color,flex:number){
  const side=new THREE.Vector3(-direction.z,0,direction.x),outline=[[0,0],[-.62,.25],[-1,.68],[-.56,1],[0,.86],[.56,1],[1,.68],[.62,.25]];
  const middle=base.clone().addScaledVector(direction,length*.55).add(new THREE.Vector3(0,length*.07,0)),center=writer.vertex(middle,tint.clone().multiplyScalar(1.08),.5,.55,flex+.075),ring:number[]=[];
  for(const [u,t] of outline){const p=base.clone().addScaledVector(direction,length*t).addScaledVector(side,halfWidth*u).add(new THREE.Vector3(0,length*(.045*Math.sin(t*Math.PI)-.025*t*t),0));ring.push(writer.vertex(p,tint.clone().multiplyScalar(.96+.07*t),.5+u*.5,t,flex+.11*t));}
  for(let i=0;i<ring.length;i++)writer.triangle(center,ring[i],ring[(i+1)%ring.length]);
}

function clover(writer:Writer,random:Random){
  const count=4+Math.floor(random()*3),phase=random()*TAU;
  for(let stem=0;stem<count;stem++){
    const root=site(random,.11),height=.045+random()*.078,direction=radial(phase+stem*2.399963),top=root.clone().addScaledVector(direction,.013+random()*.016).add(new THREE.Vector3(0,height,0));
    tube(writer,[root,root.clone().lerp(top,.50).add(new THREE.Vector3(.005,0,-.003)),top],.0010,.0006,3,color('#74834d'),.16);
    for(let leaflet=0;leaflet<3;leaflet++){
      const axis=radial(phase+stem*.4+leaflet*TAU/3+(random()-.5)*.13),length=.021+random()*.018,petiole=top.clone().addScaledVector(axis,.008+random()*.005);
      tube(writer,[top,petiole],.0006,.00035,3,color('#74834d'),.16,false,.16);
      cloverLeaf(writer,petiole,axis,length,length*(.36+random()*.13),color('#668447',.90+random()*.18),.16);
    }
  }
}

function petal(writer:Writer,base:THREE.Vector3,direction:THREE.Vector3,length:number,width:number,tint:THREE.Color,flex:number){
  const side=new THREE.Vector3(-direction.z,0,direction.x),point=(t:number,u:number)=>base.clone().addScaledVector(direction,length*t).addScaledVector(side,width*u*Math.sin(t*Math.PI*.88)).add(new THREE.Vector3(0,length*(.38*t*t-.08*t),0));
  const a=writer.vertex(base,tint,.5,0,flex),l=writer.vertex(point(.52,-1),tint.clone().multiplyScalar(.96),0,.52,flex+.03),r=writer.vertex(point(.48,1),tint.clone().multiplyScalar(1.03),1,.48,flex+.03),tip=writer.vertex(point(1,0),tint.clone().multiplyScalar(1.055),.5,1,flex+.05),mid=writer.vertex(point(.5,0).add(new THREE.Vector3(0,-length*.06,0)),tint,.5,.5,flex+.03);
  writer.triangle(a,l,mid);writer.triangle(a,mid,r);writer.triangle(l,tip,mid);writer.triangle(mid,tip,r);
}

function flowers(writer:Writer,random:Random){
  const count=2+Math.floor(random()*3),phase=random()*TAU;
  for(let stem=0;stem<count;stem++){
    const root=site(random,.18),height=.11+random()*.16,lean=radial(phase+stem*2.4).multiplyScalar(.013+random()*.03),top=root.clone().add(lean).add(new THREE.Vector3(0,height,0));
    const points=[root,root.clone().lerp(top,.35).add(new THREE.Vector3(.003,0,.005)),root.clone().lerp(top,.72),top];
    tube(writer,points,.0012,.00065,3,color('#75824e'),.16);
    for(let leaf=0;leaf<2;leaf++){
      const t=.33+leaf*.29,base=along(points,t),axis=radial(phase+stem*.7+leaf*Math.PI).add(new THREE.Vector3(0,.28,0)).normalize();
      pointedLeaf(writer,base,axis,.024+random()*.018,.006+random()*.003,color('#668247',.9+random()*.15),.16*t,.25);
    }
    const violet=random()<.45,tint=color(violet?'#9184aa':'#d7caa3',.93+random()*.09),petals=5+(random()<.25?1:0),length=.009+random()*.007;
    for(let p=0;p<petals;p++)petal(writer,top,radial(phase+p*TAU/petals+(random()-.5)*.10),length*(.90+random()*.15),length*(.34+random()*.10),tint,.16);
    const middle=writer.vertex(top.clone().add(new THREE.Vector3(0,.003,0)),color('#b9a16b'),.5,.5,.16),ring:number[]=[];
    for(let p=0;p<5;p++)ring.push(writer.vertex(top.clone().addScaledVector(radial(p*TAU/5),.0035).add(new THREE.Vector3(0,.0012,0)),color('#b9a16b',.94+random()*.1),.5+.5*Math.cos(p*TAU/5),.5+.5*Math.sin(p*TAU/5),.16));
    for(let p=0;p<ring.length;p++)writer.triangle(middle,ring[p],ring[(p+1)%ring.length]);
  }
}

function seatPart(writer:Writer,startVertex:number){
  let bottom=Infinity;for(let i=startVertex*3+1;i<writer.position.length;i+=3)bottom=Math.min(bottom,writer.position[i]);
  for(let i=startVertex*3+1;i<writer.position.length;i+=3)writer.position[i]=Math.max(0,writer.position[i]-bottom);
}

function litter(writer:Writer,random:Random){
  const count=5+Math.floor(random()*3);
  for(let item=0;item<count;item++){
    const start=writer.position.length/3,root=site(random,.26),axis=radial(random()*TAU),side=new THREE.Vector3(-axis.z,0,axis.x),length=.05+random()*.08,width=length*(.18+random()*.15),curl=.003+random()*.009;
    const tint=color(['#8b7759','#9b805a','#746951','#aaa080'][item%4],.86+random()*.16),rings:number[][]=[];
    const centre=(t:number)=>root.clone().addScaledVector(axis,length*t).add(new THREE.Vector3(0,curl*(Math.sin(t*Math.PI*.9)+.45*t*t),0));
    const a=writer.vertex(centre(0),tint,.5,0);
    for(const t of [.22,.49,.76]){
      const w=width*Math.sin(t*Math.PI),roughLeft=.82+random()*.23,roughRight=.75+random()*.28,p=centre(t),ridge=p.clone().add(new THREE.Vector3(0,curl*.15*Math.sin(t*Math.PI),0));
      rings.push([writer.vertex(p.clone().addScaledVector(side,-w*roughLeft).add(new THREE.Vector3(0,-curl*.24,0)),tint.clone().multiplyScalar(.93),0,t),writer.vertex(ridge,tint.clone().multiplyScalar(1.065),.5,t),writer.vertex(p.clone().addScaledVector(side,w*roughRight).add(new THREE.Vector3(0,curl*.11,0)),tint,1,t)]);
    }
    writer.triangle(a,rings[0][0],rings[0][1]);writer.triangle(a,rings[0][1],rings[0][2]);
    for(let k=1;k<rings.length;k++)for(let side=0;side<2;side++){writer.triangle(rings[k-1][side],rings[k-1][side+1],rings[k][side]);writer.triangle(rings[k-1][side+1],rings[k][side+1],rings[k][side]);}
    const tip=writer.vertex(centre(1).add(new THREE.Vector3(0,curl*.22,0)),tint.clone().multiplyScalar(.9),.5,1),last=rings[rings.length-1];writer.triangle(last[0],tip,last[1]);writer.triangle(last[1],tip,last[2]);
    seatPart(writer,start);
  }
}

function twig(writer:Writer,random:Random){
  const count=2+Math.floor(random()*2);
  for(let item=0;item<count;item++){
    const start=writer.position.length/3,root=site(random,.20),direction=radial(random()*TAU),length=.11+random()*.13,radius=.0025+random()*.0032;
    const points=[root.clone().add(new THREE.Vector3(0,radius,0)),root.clone().addScaledVector(direction,length*.47).add(new THREE.Vector3(0,radius+.005+random()*.004,0)),root.clone().addScaledVector(direction,length).add(new THREE.Vector3(0,radius*.62,0))];
    const tint=color(['#786a54','#8a7860','#695f4b'][item%3],.92+random()*.12);tube(writer,points,radius,radius*.38,6,tint,0,true);
    const origin=along(points,.33+random()*.23),branch=direction.clone().applyAxisAngle(UP,(random()<.5?-1:1)*(.48+random()*.7)),tip=origin.clone().addScaledVector(branch,.035+random()*.047).add(new THREE.Vector3(0,.002+random()*.007,0));
    tube(writer,[origin,origin.clone().lerp(tip,.53).add(new THREE.Vector3(0,.002,0)),tip],radius*.50,radius*.15,4,tint,0,true);seatPart(writer,start);
  }
}

function pebble(writer:Writer,random:Random){
  const count=5+Math.floor(random()*4);
  for(let stone=0;stone<count;stone++){
    const root=site(random,.27),diameter=.02+random()*.08,sides=6+Math.floor(random()*2),phase=random()*TAU,rx=diameter*.50,rz=rx*(.68+random()*.40),height=diameter*(.34+random()*.28),tint=color(['#8f8c79','#7a8377','#9c9683','#686f64'][stone%4],.93+random()*.12),rows:number[][]=[];
    const shapes=Array.from({length:sides},()=>.84+random()*.27);
    for(let ring=0;ring<3;ring++){
      const y=[0,.45,.84][ring]*height,r=[.58,1,.71][ring],row:number[]=[];
      for(let j=0;j<sides;j++){
        const a=phase+j*TAU/sides+(random()-.5)*.10,p=root.clone().add(new THREE.Vector3(Math.cos(a)*rx*r*shapes[j],ring===0?0:y*(.94+random()*.11),Math.sin(a)*rz*r*shapes[j]));
        row.push(writer.vertex(p,tint.clone().multiplyScalar(.89+ring*.055+random()*.045),.5+.5*Math.cos(a),ring*.42));
      }
      rows.push(row);
    }
    for(let ring=1;ring<rows.length;ring++)for(let j=0;j<sides;j++){const k=(j+1)%sides;writer.triangle(rows[ring-1][j],rows[ring-1][k],rows[ring][j]);writer.triangle(rows[ring-1][k],rows[ring][k],rows[ring][j]);}
    const bottom=writer.vertex(root,tint.clone().multiplyScalar(.77),.5,.5),top=writer.vertex(root.clone().add(new THREE.Vector3(rx*.08,height,rz*-.10)),tint.clone().multiplyScalar(1.04),.5,1);
    for(let j=0;j<sides;j++){const k=(j+1)%sides;writer.triangle(bottom,rows[0][k],rows[0][j]);writer.triangle(top,rows[2][j],rows[2][k]);}
  }
}

function mushroom(writer:Writer,random:Random){
  const count=3+Math.floor(random()*3),phase=random()*TAU;
  for(let fungus=0;fungus<count;fungus++){
    const root=site(random,.15),height=.025+random()*.055,radius=height*(.24+random()*.12),direction=radial(phase+fungus*2.4),top=root.clone().addScaledVector(direction,height*.075).add(new THREE.Vector3(0,height*.65,0)),stem=color('#b2a58a',.93+random()*.11);
    tube(writer,[root,root.clone().lerp(top,.5).addScaledVector(direction,.002),top],Math.max(.0014,radius*.16),Math.max(.001,radius*.105),5,stem,0,true);
    const sides=7,rows:number[][]=[],tint=color(['#9b8160','#b4a385','#8a7057'][fungus%3],.93+random()*.09),wobble=Array.from({length:sides},()=>.92+random()*.15);
    for(let ring=0;ring<3;ring++){
      const r=[.25,1,.64][ring]*radius,y=[.60,.73,.92][ring]*height,row:number[]=[];
      for(let j=0;j<sides;j++){
        const a=phase+j*TAU/sides,p=root.clone().addScaledVector(direction,height*.075).add(new THREE.Vector3(Math.cos(a)*r*wobble[j],y+(ring===1?(random()-.5)*height*.035:0),Math.sin(a)*r*wobble[j]));
        row.push(writer.vertex(p,ring===0?stem.clone().multiplyScalar(.88):tint.clone().multiplyScalar(.94+ring*.045),.5+.5*Math.cos(a),.5+.5*Math.sin(a)));
      }
      rows.push(row);
    }
    for(let ring=1;ring<rows.length;ring++)for(let j=0;j<sides;j++){const k=(j+1)%sides;writer.triangle(rows[ring-1][j],rows[ring-1][k],rows[ring][j]);writer.triangle(rows[ring-1][k],rows[ring][k],rows[ring][j]);}
    const crown=writer.vertex(root.clone().addScaledVector(direction,height*.06).add(new THREE.Vector3(0,height,0)),tint.clone().multiplyScalar(1.07),.5,.5);
    for(let j=0;j<sides;j++)writer.triangle(crown,rows[2][j],rows[2][(j+1)%sides]);
  }
}

function finish(writer:Writer,kind:GroundCoverKind,seed:number){
  const geometry=writer.finish(`GroundCover_${kind}_${seed}`),position=geometry.getAttribute('position'),index=geometry.index!,triangles:number[]=[],used=new Set<number>();
  for(let i=0;i<index.count;i+=3){
    const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2),ux=position.getX(b)-position.getX(a),uy=position.getY(b)-position.getY(a),uz=position.getZ(b)-position.getZ(a),vx=position.getX(c)-position.getX(a),vy=position.getY(c)-position.getY(a),vz=position.getZ(c)-position.getZ(a);
    if((uy*vz-uz*vy)**2+(uz*vx-ux*vz)**2+(ux*vy-uy*vx)**2<1e-16)continue;
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
  const p=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),wind=geometry.getAttribute('woodlandWind'),invalidNormals=new Map<number,{area:number;normal:THREE.Vector3}>(),roots:number[]=[];
  let radius=0,maxWind=0;
  for(let i=0;i<p.count;i++){
    radius=Math.max(radius,Math.hypot(p.getX(i),p.getZ(i)));maxWind=Math.max(maxWind,wind.getX(i));if(Math.abs(p.getY(i))<1e-8)roots.push(i);
    if(normal.getX(i)**2+normal.getY(i)**2+normal.getZ(i)**2<1e-12)invalidNormals.set(i,{area:0,normal:new THREE.Vector3()});
  }
  if(invalidNormals.size){
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),idx=geometry.index!;
    for(let i=0;i<idx.count;i+=3){const ids=[idx.getX(i),idx.getX(i+1),idx.getX(i+2)];a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]).sub(a);c.fromBufferAttribute(p,ids[2]).sub(a);b.cross(c);for(const id of ids){const entry=invalidNormals.get(id);if(entry&&b.lengthSq()>entry.area){entry.area=b.lengthSq();entry.normal.copy(b);}}}
    for(const [id,entry] of invalidNormals){entry.normal.normalize();normal.setXYZ(id,entry.normal.x,entry.normal.y,entry.normal.z);}
  }
  geometry.computeBoundingBox();geometry.computeBoundingSphere();const windPadding=maxWind>0?.11:0;
  geometry.boundingBox!.expandByScalar(windPadding);geometry.boundingSphere!.radius+=windPadding;
  Object.assign(geometry.userData,{groundCoverKind:kind,seed,footprintRadius:radius,rootVertexIndices:roots,windPadding,triangles:geometry.index!.count/3});
  return geometry;
}

/** Deterministic small physical plants and debris; no DOM, textures or external assets. */
export function createGroundCoverGeometry(kind:GroundCoverKind,seed:number):THREE.BufferGeometry{
  if(kind==='hazel'||kind==='bramble'||kind==='bilberry')return createGroundUnderstoryGeometry(kind,seed);
  const writer=new Writer(),random=randomFor(seed);
  switch(kind){
    case 'grass':grass(writer,random);break;
    case 'sedge':grass(writer,random,true);break;
    case 'fern':fern(writer,random);break;
    case 'clover':clover(writer,random);break;
    case 'flowers':flowers(writer,random);break;
    case 'litter':litter(writer,random);break;
    case 'twig':twig(writer,random);break;
    case 'pebble':pebble(writer,random);break;
    case 'mushroom':mushroom(writer,random);break;
    default:throw new RangeError(`Unsupported ground-cover kind: ${String(kind)}`);
  }
  return finish(writer,kind,seed);
}

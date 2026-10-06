import * as THREE from 'three';

export type WoodlandDetail = 0 | 1 | 2;
type Leaf = {base:THREE.Vector3;axis:THREE.Vector3;length:number;width:number;twist:number;tone:number};
type Limb = {points:THREE.Vector3[];radius:number;tip:number;order:number};
const UP=new THREE.Vector3(0,1,0),TAU=Math.PI*2;
export const woodlandRandom=(seed:number)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};

/** Original tree skeletons and leaves are authored once; all LODs retain that layout. */
export type WoodlandTree = {height:number;radius:number;trunkRadius:number;wood:THREE.BufferGeometry;leaves:THREE.BufferGeometry};
class Writer {
  position:number[]=[];color:number[]=[];uv:number[]=[];wind:number[]=[];indices:number[]=[];
  vertex(p:THREE.Vector3,c:THREE.Color,u=0,v=0,wind=0){const i=this.position.length/3;this.position.push(p.x,p.y,p.z);this.color.push(c.r,c.g,c.b);this.uv.push(u,v);this.wind.push(wind);return i;}
  triangle(a:number,b:number,c:number){this.indices.push(a,b,c);}
  finish(name:string,padding=0){const g=new THREE.BufferGeometry();g.name=name;g.setAttribute('position',new THREE.Float32BufferAttribute(this.position,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.color,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));g.setAttribute('woodlandWind',new THREE.Float32BufferAttribute(this.wind,1));g.setIndex(this.indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();g.boundingBox!.expandByScalar(padding);g.boundingSphere!.radius+=padding;return g;}
}

function sweep(writer:Writer,points:THREE.Vector3[],radius:number,tip:number,sides:number,color:THREE.Color){
  const rows:number[][]=[],side=new THREE.Vector3();let distance=0;
  for(let k=0;k<points.length;k++){
    if(k)distance+=points[k].distanceTo(points[k-1]);
    const axis=points[Math.min(k+1,points.length-1)].clone().sub(points[Math.max(0,k-1)]).normalize();
    if(!k)side.crossVectors(axis,Math.abs(axis.y)>.93?new THREE.Vector3(0,0,1):UP).normalize();
    else{side.addScaledVector(axis,-side.dot(axis));if(side.lengthSq()<.001)side.crossVectors(axis,UP);side.normalize();}
    const other=axis.clone().cross(side),row:number[]=[],r=THREE.MathUtils.lerp(radius,tip,Math.pow(k/(points.length-1),.86));
    for(let j=0;j<=sides;j++){
      const angle=(j%sides)*TAU/sides,grain=1+.055*Math.sin(angle*3+k*.7),p=points[k].clone().addScaledVector(side,Math.cos(angle)*r*grain).addScaledVector(other,Math.sin(angle)*r*grain);
      if(k===0&&points[0].y===0)p.y=0;
      row.push(writer.vertex(p,color.clone().multiplyScalar(.86+.10*Math.cos(angle-.4)),j/sides,distance*.54));
    }
    rows.push(row);
  }
  for(let k=0;k<rows.length-1;k++)for(let j=0;j<sides;j++){writer.triangle(rows[k][j],rows[k][j+1],rows[k+1][j]);writer.triangle(rows[k][j+1],rows[k+1][j+1],rows[k+1][j]);}
}

function leaf(writer:Writer,item:Leaf,color:THREE.Color,detail:WoodlandDetail){
  const {base,axis,length,width,twist,tone}=item;
  const lateral=new THREE.Vector3().crossVectors(UP,axis);if(lateral.lengthSq()<.01)lateral.set(1,0,0);lateral.normalize().applyAxisAngle(axis,twist);
  const normal=axis.clone().cross(lateral).normalize(),size=detail===0?1:detail===1?2:3.3;
  const p=(u:number,t:number)=>base.clone().addScaledVector(axis,length*t*size).addScaledVector(lateral,width*u*Math.sin(t*Math.PI)*size).addScaledVector(normal,length*(.065*Math.sin(t*Math.PI)-.11*t*t)*size);
  const c=color.clone().multiplyScalar(tone),a=writer.vertex(base,c,.5,0,0),l=writer.vertex(p(-1,.45),c.clone().multiplyScalar(.94),0,.45,.5),r=writer.vertex(p(1,.45),c.clone().multiplyScalar(1.04),1,.45,.5),b=writer.vertex(p(0,1),c.clone().multiplyScalar(1.12),.5,1,1);
  if(detail===2){writer.triangle(a,l,r);writer.triangle(l,b,r);}
  else{const m=writer.vertex(p(0,.45).addScaledVector(normal,length*.08),c.clone().multiplyScalar(1.08),.5,.45,.5);writer.triangle(a,l,m);writer.triangle(a,m,r);writer.triangle(l,b,m);writer.triangle(m,b,r);}
}

/** Quercus, birch and elm inspired silhouettes, authored at game camera scale. */
export function createWoodlandTree(kind:number,seed:number,detail:WoodlandDetail):WoodlandTree{
  const random=woodlandRandom(seed),height=[10.1,12.3,9.4][kind]*(.94+random()*.12),trunkRadius=[.34,.24,.31][kind],bend=(random()-.5)*.9;
  const wood=new Writer(),leaves=new Writer(),limbs:Limb[]=[],population:Leaf[]=[],crownRadius=[3.65,2.55,3.4][kind];
  const trunk=Array.from({length:6},(_,i)=>new THREE.Vector3(bend*Math.pow(i/5,1.65),height*i/5,Math.sin(i*.8+seed)*.14*i/5));
  const green=new THREE.Color(['#547538','#70954a','#55773d'][kind]),bark=new THREE.Color(['#8a795e','#bebaaa','#81745e'][kind]);
  const arms=10,phase=random()*TAU;
  for(let arm=0;arm<arms;arm++){
    const angle=phase+arm*2.399963+(random()-.5)*.32,level=(kind===1?.46:.40)+arm/(arms-1)*.48,start=trunk[Math.min(4,Math.floor(level*5))].clone().lerp(trunk[Math.min(5,Math.floor(level*5)+1)],(level*5)%1);
    const crownShape=Math.sqrt(Math.max(.20,1-((level-.64)/.34)**2));
    const reach=crownRadius*(.73+random()*.25)*crownShape,rise=kind===1?.7+random()*.8:.35+random()*.9;
    const end=start.clone().add(new THREE.Vector3(Math.cos(angle)*reach,rise,Math.sin(angle)*reach));
    const elbow=start.clone().lerp(end,.52).add(new THREE.Vector3(0,.28,0));limbs.push({points:[start,elbow,end],radius:trunkRadius*.30,tip:.027,order:0});
    for(let twig=0;twig<8;twig++){
      const t=.17+twig*.10,origin=t<.52?start.clone().lerp(elbow,t/.52):elbow.clone().lerp(end,(t-.52)/.48),fan=angle+(twig%2?1:-1)*(.42+random()*.80);
      const target=origin.clone().add(new THREE.Vector3(Math.cos(fan)*(.67+random()*.72),(.15+random()*.93)*(twig%3===0?1.3:1),Math.sin(fan)*(.67+random()*.72)));
      limbs.push({points:[origin,target],radius:.019,tip:.005,order:1});
      const axis=target.clone().sub(origin).normalize();
      for(let j=0;j<16;j++){
        const at=origin.clone().lerp(target,.04+j*.061),azimuth=j*2.399963+random()*.28;
        const direction=axis.clone().multiplyScalar(.4).add(new THREE.Vector3(Math.cos(azimuth),.20+(random()-.5)*.65,Math.sin(azimuth))).normalize();
        const length=(kind===1?.17:.25)+random()*(kind===1?.10:.13);
        population.push({base:at,axis:direction,length,width:length*(kind===1?.27:.37),twist:(random()-.5)*1.0,tone:.76+random()*.34});
      }
    }
  }
  const sampleTrunk=detail===0?trunk:detail===1?[trunk[0],trunk[1],trunk[3],trunk[5]]:[trunk[0],trunk[3],trunk[5]];
  sweep(wood,sampleTrunk,trunkRadius,.028,detail===0?8:detail===1?5:3,bark);
  if(detail<2)for(let root=0;root<6;root++){
    const a=root*TAU/6+seed*.17,length=trunkRadius*(2.1+random()*.9),width=trunkRadius*.30,base=new THREE.Vector3(Math.cos(a)*trunkRadius*.60,0,Math.sin(a)*trunkRadius*.60),end=new THREE.Vector3(Math.cos(a)*length,0,Math.sin(a)*length),side=new THREE.Vector3(-Math.sin(a)*width,0,Math.cos(a)*width);
    const l=wood.vertex(base.clone().add(side),bark),r=wood.vertex(base.clone().sub(side),bark),top=wood.vertex(base.clone().add(new THREE.Vector3(0,trunkRadius*1.25,0)),bark.clone().multiplyScalar(1.1)),e=wood.vertex(end,bark.clone().multiplyScalar(.77));
    wood.triangle(l,e,top);wood.triangle(top,e,r);
  }
  limbs.forEach(limb=>{if(detail===2&&limb.order===1)return;const points=detail===0?limb.points:[limb.points[0],limb.points[limb.points.length-1]];sweep(wood,points,limb.radius,limb.tip,detail===0&&limb.order===0?5:3,bark);});
  const step=detail===0?1:detail===1?4:12;
  population.forEach((item,index)=>{if(index%step===0)leaf(leaves,item,green,detail);});
  const woodGeometry=wood.finish(`OriginalWoodland${kind}_${seed}_WoodLOD${detail}`),leafGeometry=leaves.finish(`OriginalWoodland${kind}_${seed}_LeafLOD${detail}`,.10);
  // All LODs use the full population's extent, including enlarged retained far leaves.
  const bounds=new THREE.Box3();trunk.forEach(p=>bounds.expandByPoint(p));population.forEach(item=>{bounds.expandByPoint(item.base);bounds.expandByPoint(item.base.clone().addScaledVector(item.axis,item.length*3.3));});bounds.expandByScalar(1.05);
  const sphere=bounds.getBoundingSphere(new THREE.Sphere());woodGeometry.boundingSphere=sphere.clone();leafGeometry.boundingSphere=sphere.clone();
  return {height,radius:crownRadius+1.5,trunkRadius,wood:woodGeometry,leaves:leafGeometry};
}

export function createWoodlandGrass(seed:number,low=false){
  const random=woodlandRandom(seed),writer=new Writer(),count=low?6:11,baseColor=new THREE.Color('#6d853f');
  for(let i=0;i<count;i++){
    const a=i*2.39996+random()*.35,h=.23+random()*.32,w=.014+random()*.016,root=new THREE.Vector3(Math.cos(a)*.09,0,Math.sin(a)*.09),axis=new THREE.Vector3(Math.cos(a),0,Math.sin(a)),cross=new THREE.Vector3(-Math.sin(a),0,Math.cos(a));
    const b0=writer.vertex(root.clone().addScaledVector(cross,-w),baseColor,0,0,0),b1=writer.vertex(root.clone().addScaledVector(cross,w),baseColor,1,0,0),mid=root.clone().addScaledVector(axis,h*.2).add(new THREE.Vector3(0,h*.55,0)),tip=root.clone().addScaledVector(axis,h*.5).add(new THREE.Vector3(0,h,0));
    const m0=writer.vertex(mid.clone().addScaledVector(cross,-w*.65),baseColor.clone().multiplyScalar(1.20),0,.55,.6),m1=writer.vertex(mid.clone().addScaledVector(cross,w*.65),baseColor.clone().multiplyScalar(1.2),1,.55,.6),t=writer.vertex(tip,baseColor.clone().multiplyScalar(1.42),.5,1,1);writer.triangle(b0,b1,m0);writer.triangle(b1,m1,m0);writer.triangle(m0,m1,t);
  }return writer.finish(`OriginalWoodlandGrass_${seed}_${low?'Far':'Near'}`,.08);
}

export function createWoodlandFern(seed:number,low=false){
  const random=woodlandRandom(seed),writer=new Writer(),green=new THREE.Color('#557c3c'),fronds=6;
  for(let f=0;f<fronds;f++){
    const a=f*TAU/fronds+random()*.22,radial=new THREE.Vector3(Math.cos(a),0,Math.sin(a)),lateral=new THREE.Vector3(-Math.sin(a),0,Math.cos(a)),h=.54+random()*.17;
    const points=Array.from({length:5},(_,i)=>radial.clone().multiplyScalar(.63*(i/4)**1.6).add(new THREE.Vector3(0,h*Math.sin(i/4*Math.PI*.72),0)));if(!low||f%2===0)sweep(writer,points,.005,.002,3,green.clone().multiplyScalar(.8));
    const pairs=8;
    for(let p=0;p<pairs;p++){
      const t=.12+p/(pairs-1)*.78,k=t*4,origin=points[Math.floor(k)].clone().lerp(points[Math.ceil(k)],k%1),length=.24*Math.sin(t*Math.PI)*(.90+random()*.15);
      for(const s of [-1,1]){const item={base:origin,axis:lateral.clone().multiplyScalar(s).addScaledVector(radial,.28).add(new THREE.Vector3(0,-.04,0)).normalize(),length,width:length*.21,twist:s*.25,tone:.8+random()*.3};if(!low||(f%2===0&&p%2===0))leaf(writer,item,green,low?2:1);}
    }
  }return writer.finish(`OriginalWoodlandFern_${seed}_${low?'Far':'Near'}`,.08);
}

export function createWoodlandLitter(seed:number){
  const random=woodlandRandom(seed),writer=new Writer(),ochre=new THREE.Color('#928061');
  for(let i=0;i<6;i++){
    const a=random()*TAU,r=random()*.18,at=new THREE.Vector3(Math.cos(a)*r,.009+random()*.006,Math.sin(a)*r);
    leaf(writer,{base:at,axis:new THREE.Vector3(Math.cos(a),.06,Math.sin(a)).normalize(),length:.12+random()*.06,width:.055,twist:(random()-.5)*.35,tone:.76+random()*.34},ochre,1);
  }return writer.finish('OriginalWoodlandCurledLitter');
}

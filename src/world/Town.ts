import * as THREE from 'three';
import {artGeometry,bake} from '../assets/ArtKit';
import {TOWN,TOWN_SHOPS} from './TownLayout';
import {createTownMaterials} from './TownMaterials';
import {addShopProps} from './TownProps';

type Kit=ReturnType<typeof createTownMaterials>;
const box=(parent:THREE.Group,material:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>{
  const mesh=new THREE.Mesh(artGeometry.box,material);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);parent.add(mesh);return mesh;
};

/** Original curved, corrugated gable roof with raised verge corners and a visible underside. */
function roof(width:number,depth:number,rise:number,coarse=false){
  const columns=coarse?12:72,rows=coarse?3:4,p:number[]=[],uv:number[]=[],ix:number[]=[];
  for(const side of [-1,1]){
    const base=p.length/3;
    for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++){
      const t=row/rows,u=col/columns*2-1,x=u*width/2;
      const corr=coarse?0:.022*(1-Math.cos(col/columns*width/.34*Math.PI*2));
      const curl=Math.pow(Math.abs(u),8)*t*t*.27;
      p.push(x,rise*(1-Math.pow(t,.84))+Math.pow(t,6)*.19+curl+corr,side*t*depth/2);
      uv.push(col/columns*width*.45,t*depth*.5);
      if(row<rows&&col<columns){const a=base+row*(columns+1)+col,b=a+columns+1;if(side>0)ix.push(a,b,a+1,a+1,b,b+1);else ix.push(a,a+1,b,a+1,b+1,b);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
}

function addRoof(parent:THREE.Group,k:Kit,width:number,depth:number,rise:number,y:number,z:number,coarse=false){
  const geometry=roof(width,depth,rise,coarse),mesh=new THREE.Mesh(geometry,k.roof);mesh.position.set(0,y,z);parent.add(mesh);
  box(parent,k.roof,0,y+rise+.08,z,width,.18,.28);
  if(coarse)return;
  const soffit=roof(width,depth,rise,true),indices=soffit.index!;
  for(let i=0;i<indices.count;i+=3){const b=indices.getX(i+1);indices.setX(i+1,indices.getX(i+2));indices.setX(i+2,b);}
  soffit.computeVertexNormals();const underside=new THREE.Mesh(soffit,k.timber);underside.position.set(0,y-.12,z);parent.add(underside);
  for(const side of [-1,1]){
    box(parent,k.timber,0,y+.04,z+side*depth/2,width,.14,.15);
    for(const x of [-width/2+.12,width/2-.12]){
      const fin=box(parent,k.roof,x,y+rise+.21,z,.18,.44,.22);fin.rotation.z=Math.sign(x)*-.18;
    }
  }
}

function lattice(parent:THREE.Group,k:Kit,x:number,y:number,z:number,width=1.8,height=1.45){
  box(parent,k.lantern,x,y,z-.07,width,height,.08);
  for(const dx of [-width/2,width/2])box(parent,k.timber,x+dx,y,z,.10,height+.15,.10);
  for(const dy of [-height/2,height/2])box(parent,k.timber,x,y+dy,z,width+.1,.1,.10);
  for(let i=-3;i<=3;i++)box(parent,k.timber,x+i*width/8,y,z,.038,height,.055);
  for(const dy of [-.25,.25])box(parent,k.timber,x,y+dy,z,width,.035,.06);
}

function sign(parent:THREE.Group,k:Kit,index:number){
  box(parent,k.timber,0,2.82,.12,3.7,.88,.18);
  const g=new THREE.PlaneGeometry(3.45,.68),uv=g.getAttribute('uv'),[u0,v0,u1,v1]=k.signUV(index);
  for(let i=0;i<uv.count;i++)uv.setXY(i,THREE.MathUtils.lerp(u0,u1,uv.getX(i)),THREE.MathUtils.lerp(v0,v1,uv.getY(i)));
  const mesh=new THREE.Mesh(g,k.sign);mesh.position.set(0,2.82,.22);parent.add(mesh);
}

function shop(k:Kit,index:number,coarse=false){
  const def=TOWN_SHOPS[index],group=new THREE.Group();group.name=`TownShop_${index}`;
  const w=def.width,d=def.depth,ceil=3.65+(def.storeys-1)*3;
  for(const side of [-1,1])box(group,k.plaster,side*w/2,ceil/2,-d/2,.22,ceil,d);
  box(group,k.plaster,0,ceil/2,-d,w,ceil,.22);
  if(coarse){box(group,k.timber,0,ceil*.4,0,w,ceil*.8,.16);addRoof(group,k,w+1.4,d+3.5,1.6,ceil,-d/2+.35,true);return group;}
  for(const side of [-1,1]){
    const pos:number[]=[],uv:number[]=[],indices:number[]=[];
    for(let i=0;i<=12;i++){
      const z=-d+i/12*d,t=Math.abs(z+d/2-.35)/((d+3.5)/2),h=1.6*(1-Math.pow(t,.84))+.19*Math.pow(t,6)-.12;
      pos.push(side*w/2,ceil,z,side*w/2,ceil+h,z);uv.push(i/12,0,i/12,h/2);
      if(i<12){const a=i*2;if(side>0)indices.push(a,a+1,a+3,a,a+3,a+2);else indices.push(a,a+3,a+1,a,a+2,a+3);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();group.add(new THREE.Mesh(g,k.plaster));
  }
  // A 1.5cm finish above the shared foundation prevents coplanar terrain flicker.
  box(group,k.stone,0,-.065,-d/2,w+.14,.16,d+4.2);
  for(const side of [-1,1]){
    box(group,k.plaster,side*3.3,1.75,-.04,3.7,3.5,.18);
    for(const x of [side*1.5,side*5.05])box(group,k.timber,x,ceil/2,.10,.16,ceil,.22);
    lattice(group,k,side*3.3,1.93,.14,2.12,1.44);
    for(const z of [-d,1.85])box(group,k.timber,side*5.05,ceil/2,z,.2,ceil,.2);
    box(group,k.timber,side*5.05,.11,1.85,.38,.22,.38);
  }
  for(const side of [-1,1])box(group,k.timber,side*3.3,.5,.05,3.7,.14,.18);
  box(group,k.timber,0,3.25,.05,w,.14,.18);
  // Center remains open: a two-metre doorway and a three-metre clear aisle.
  box(group,k.timber,0,3.38,.13,w,.2,.25);
  box(group,k.timber,0,ceil-.14,1.85,w,.18,.22);
  for(let x=-4.8;x<=4.8;x+=.8)box(group,k.timber,x,ceil-.23,1.12,.085,.13,1.65);
  if(def.storeys===2){
    box(group,k.timber,0,3.25,-d/2,w,.16,d);
    box(group,k.plaster,0,4.95,0,w,3,.16);
    for(const x of [-3.1,0,3.1])lattice(group,k,x,4.9,.15,1.85,1.52);
    box(group,k.timber,0,3.37,.42,w+.1,.16,.85);
    for(let x=-4.8;x<=4.8;x+=.6)box(group,k.timber,x,3.75,.75,.045,.75,.055);
    box(group,k.timber,0,4.13,.75,w,.065,.065);
  }
  sign(group,k,index);addRoof(group,k,w+1.4,d+3.5,1.6,ceil,-d/2+.35);
  // Eave fascia and ceramic edge caps give roofs a readable thickness.
  for(const side of [-1,1])box(group,k.roof,0,ceil+.12,-d/2+.35+side*(d+3.5)/2,w+1.4,.19,.12);
  addShopProps(group,k,index);return group;
}

export function createTown(root:THREE.Group){
  const k=createTownMaterials(),lod=new THREE.LOD();lod.name='ExplorableTingchaoTown';lod.position.set(TOWN.x,0,TOWN.z);root.add(lod);
  const walls:THREE.Box3[]=[],cameraOccluders:THREE.Box3[]=[];
  const collider=(matrix:THREE.Matrix4,x:number,y:number,z:number,w:number,h:number,d:number,camera=true)=>{
    const b=new THREE.Box3(new THREE.Vector3(x-w/2,y-h/2,z-d/2),new THREE.Vector3(x+w/2,y+h/2,z+d/2)).applyMatrix4(matrix);walls.push(b);if(camera)cameraOccluders.push(b);
  };
  for(const coarse of [false,true]){
    const level=new THREE.Group();level.position.set(-TOWN.x,0,-TOWN.z);level.name=coarse?'TownFarSilhouette':'TownStreetDetail';
    for(const def of TOWN_SHOPS){
      const group=shop(k,def.index,coarse),yaw=def.side<0?Math.PI/2:-Math.PI/2;
      group.position.set(def.x,TOWN.groundY,def.z);group.rotation.y=yaw;
      level.add(group);
      if(!coarse){
        const matrix=new THREE.Matrix4().compose(group.position,group.quaternion,new THREE.Vector3(1,1,1)),ceil=3.65+(def.storeys-1)*3;
        collider(matrix,0,ceil/2,-def.depth,def.width,ceil,.25);
        for(const side of [-1,1]){
          collider(matrix,side*def.width/2,ceil/2,-def.depth/2,.25,ceil,def.depth);
          collider(matrix,side*3.3,1.75,0,3.7,3.5,.25);
          collider(matrix,side*5.05,ceil/2,1.85,.24,ceil,.24);
          collider(matrix,side*2.9,.55,-1.2,1.7,1.1,.8,false);
          collider(matrix,side*2.8,1.33,-5.9,2.4,2.66,.6);
        }
        collider(matrix,0,ceil+1.0,-def.depth/2+.35,def.width+1.4,2.2,def.depth+3.5);
        if(def.storeys===2)collider(matrix,0,3.25,-def.depth/2,def.width,.16,def.depth);
        for(const prop of def.index===5?[[3.55,.65,.63,.55]]:def.index===6?[[-3.45,-2.6,.62,.62],[-2.65,-3.32,.62,.62],[3.45,.62,.70,.60]]:def.index===9?[[3.55,.68,.56,.48]]:def.index===11?[[-3.55,.68,.67,.57]]:[]){
          collider(matrix,prop[0],.4,prop[1],prop[2],.8,prop[3],false);
        }
      }
    }
    const plaza=new THREE.Group();plaza.position.y=TOWN.groundY;
    if(coarse)box(plaza,k.stone,TOWN.x,-.02,TOWN.z,10.2,.08,92);
    else for(let row=0;row<62;row++)for(let col=0;col<8;col++){
      const tile=box(plaza,k.stone,TOWN.x+(col-3.5)*1.265,-.035,TOWN.north+.74+row*1.48,1.24,.08,1.44);
      tile.rotation.y=Math.sin(row*17.1+col*7.3)*.005;
    }
    for(const z of [TOWN.north,TOWN.south]){
      const gate=new THREE.Group();gate.position.set(TOWN.x,0,z);
      for(const side of [-1,1]){box(gate,k.stone,side*6.35,.22,0,.9,.44,.9);box(gate,k.timber,side*6.35,2.85,0,.38,5.7,.38);}
      box(gate,k.timber,0,5.4,0,13.5,.42,.48);addRoof(gate,k,14.7,3.2,1.1,5.7,0,coarse);
      if(!coarse){
        const m=new THREE.Matrix4().makeTranslation(TOWN.x,TOWN.groundY,z);
        for(const side of [-1,1])collider(m,side*6.35,2.85,0,.55,5.7,.55);
        collider(m,0,6.25,0,14.7,1.5,3.2);
      }
      plaza.add(gate);
    }
    level.add(plaza);bake(level);lod.addLevel(level,coarse?145:0,coarse?.08:0);
  }
  return {walls,cameraOccluders,shopCount:TOWN_SHOPS.length,root:lod};
}

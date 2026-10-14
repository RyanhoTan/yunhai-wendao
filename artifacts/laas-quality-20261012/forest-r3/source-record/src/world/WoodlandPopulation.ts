import * as THREE from 'three';
import {WORLD_LIMITS} from './WorldLayout';
import {FOREST_GROVES,woodlandCover} from './ForestLayout';
import {createWoodlandTree,createWoodlandGrass,createWoodlandFern,createWoodlandLitter,woodlandRandom,type WoodlandDetail} from './WoodlandGeometry';

export type Point={x:number;z:number};
export type Tree=Point&{y:number;scale:number;yaw:number;kind:number;seed:number;grove:number;radius:number;canopyRadius:number;matrix:THREE.Matrix4};
export type Collider=Point&{r:number};
export type Plant=Point&{y:number;scale:number;yaw:number;tilt?:THREE.Quaternion};
export const TREE_SPACING=5.8;

export function localMatrix(p:Plant,center:THREE.Vector3){
  const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.yaw);
  if(p.tilt)rotation.premultiply(p.tilt);
  return new THREE.Matrix4().compose(new THREE.Vector3(p.x-center.x,p.y-center.y,p.z-center.z),rotation,new THREE.Vector3(p.scale,p.scale,p.scale));
}

export function createWoodlandPopulation(heightAt:(x:number,z:number)=>number,isProtected:(x:number,z:number,extra:number)=>boolean){
  const random=woodlandRandom(903721),trees:Tree[]=[],colliders:Collider[]=[],cameraOccluders:THREE.Box3[]=[];
  // Neighbour checks stay local as vegetation density grows.
  const treeGrid=new Map<string,Tree[]>(),gridKey=(x:number,z:number)=>`${Math.floor(x/8)},${Math.floor(z/8)}`;
  const neighbours=(x:number,z:number)=>{
    const cx=Math.floor(x/8),cz=Math.floor(z/8),near:Tree[]=[];
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)near.push(...(treeGrid.get(`${cx+dx},${cz+dz}`)??[]));
    return near;
  };
  const legal=(x:number,z:number,extra:number,slopeLimit=.95)=>{
    if((x<WORLD_LIMITS.minX+6||x>288)||z< -289||z>121||isProtected(x,z,extra))return false;
    const h=heightAt(x,z),dx=(heightAt(x+.5,z)-heightAt(x-.5,z)),dz=(heightAt(x,z+.5)-heightAt(x,z-.5));
    return Number.isFinite(h+dx+dz)&&h>.16&&Math.hypot(dx,dz)<=slopeLimit;
  };
  const groundTilt=(x:number,z:number)=>new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(heightAt(x-.5,z)-heightAt(x+.5,z),1,heightAt(x,z-.5)-heightAt(x,z+.5)).normalize());
  const prototypes=Array.from({length:12},(_,index)=>Array.from({length:3},(_,detail)=>createWoodlandTree(index%3,1289+index*181,detail as WoodlandDetail,Math.floor(index/3) as 0|1|2|3)));
  let expansionCount=0;
  for(let attempt=0;attempt<70000&&trees.length<1450;attempt++){
    const index=attempt%FOREST_GROVES.length,grove=FOREST_GROVES[index],angle=random()*Math.PI*2,r=Math.sqrt(random()),x=grove.x+Math.cos(angle)*grove.rx*r,z=grove.z+Math.sin(angle)*grove.rz*r;
    const kind=Math.floor(random()*3),seed=kind+Math.floor(random()*4)*3,prototype=prototypes[seed][0],scale=.82+random()*.43,yaw=random()*Math.PI*2;
    const dx=(heightAt(x+1,z)-heightAt(x-1,z))*.5,dz=(heightAt(x,z+1)-heightAt(x,z-1))*.5,tilt=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(-dx*.14,1,-dz*.14).normalize());
    const canopyRadius=prototype.radius*scale+prototype.height*scale*Math.hypot(dx,dz)*.14+.4;
    if(woodlandCover(x,z)<.17||!legal(x,z,canopyRadius+.4,.95)||neighbours(x,z).some(p=>(p.x-x)**2+(p.z-z)**2<TREE_SPACING**2))continue;
    tilt.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw));
    const position=new THREE.Vector3(x,heightAt(x,z)-.012,z),matrix=new THREE.Matrix4().compose(position,tilt,new THREE.Vector3(scale,scale,scale));
    // Root buttresses must contact the rendered height field across their full base.
    let sink=0;const vertices=prototype.wood.getAttribute('position'),sample=new THREE.Vector3();
    for(let i=0;i<vertices.count;i++)if(Math.abs(vertices.getY(i))<1e-6){sample.fromBufferAttribute(vertices,i).applyMatrix4(matrix);sink=Math.max(sink,sample.y-heightAt(sample.x,sample.z)+.012);}
    if(sink>.65)continue;
    position.y-=sink;matrix.setPosition(position);
    let radius=prototype.trunkRadius*scale*1.12+.045;
    for(const segment of prototype.trunkSegments){
      const a=new THREE.Vector3().fromArray(segment.a).applyMatrix4(matrix),b=new THREE.Vector3().fromArray(segment.b).applyMatrix4(matrix);
      const thickness=segment.radius*scale;
      cameraOccluders.push(new THREE.Box3().setFromPoints([a,b]).expandByScalar(thickness+.28));
      // The walking collider encloses the bent stem only at body height.
      if(Math.min(a.y,b.y)-position.y<2.6)for(const point of [a,b]){
        const bodyT=THREE.MathUtils.clamp((position.y+2.6-a.y)/Math.max(b.y-a.y,.001),0,1),bodyTop=a.clone().lerp(b,bodyT);
        const sample=point.y>position.y+2.6?bodyTop:point;
        radius=Math.max(radius,Math.hypot(sample.x-x,sample.z-z)+thickness+.025);
      }
    }
    if(index===6)expansionCount++;
    const tree={x,z,y:position.y,scale,yaw,kind,seed,grove:index,radius,canopyRadius,matrix};
    trees.push(tree);colliders.push({x,z,r:radius});
    const key=gridKey(x,z),bucket=treeGrid.get(key)??[];bucket.push(tree);treeGrid.set(key,bucket);
  }
  const grass=[createWoodlandGrass(44731),createWoodlandGrass(44731,true)],ferns=[createWoodlandFern(16127),createWoodlandFern(16127,true)],litter=createWoodlandLitter(60491);
  const grassRoots:THREE.Vector3[]=[],grassPosition=grass[0].getAttribute('position'),grassWind=grass[0].getAttribute('woodlandWind');
  for(let i=0;i<grassPosition.count;i++)if(grassWind.getX(i)===0)grassRoots.push(new THREE.Vector3().fromBufferAttribute(grassPosition,i));
  const groundSample=new THREE.Vector3(),worldOrigin=new THREE.Vector3();
  const seatGrass=(plant:Plant)=>{
    const transform=localMatrix(plant,worldOrigin);let sink=0;
    for(const root of grassRoots){groundSample.copy(root).applyMatrix4(transform);sink=Math.max(sink,groundSample.y-heightAt(groundSample.x,groundSample.z)-.003);}
    if(sink>.10)return false;
    plant.y-=sink;return true;
  };
  // Grove identities control the distribution; overlapping groves share one render cell.
  const cells=new Map<string,{x:number;z:number;trees:Tree[];plants:Plant[];ferns:Plant[];litter:Plant[]}>();
  const cellFor=(p:Point)=>{
    const x=Math.floor(p.x/24)*24+12,z=Math.floor(p.z/24)*24+12,key=`${x},${z}`;
    let cell=cells.get(key);if(!cell){cell={x,z,trees:[],plants:[],ferns:[],litter:[]};cells.set(key,cell);}return cell;
  };
  let placedFerns=0,placedLitter=0,placedGrass=0;
  for(let index=0;index<FOREST_GROVES.length;index++){
    const list=trees.filter(p=>p.grove===index);
    const plants:Plant[]=[],fernPlants:Plant[]=[],litterPlants:Plant[]=[];
    const plantRandom=woodlandRandom(75913+index*701),grow=(target:Plant[],count:number,inner:number,outer:number)=>{
      for(let attempt=0;attempt<count*8&&target.length<count;attempt++){
        const tree=list[Math.floor(plantRandom()*list.length)];if(!tree)break;
        const a=plantRandom()*Math.PI*2,d=inner+plantRandom()*(outer-inner),x=tree.x+Math.cos(a)*d,z=tree.z+Math.sin(a)*d;
        if(!legal(x,z,.65)||neighbours(x,z).some(t=>(t.x-x)**2+(t.z-z)**2<(t.radius+.20)**2))continue;
        const plant={x,z,y:heightAt(x,z)+.013,scale:.68+plantRandom()*.51,yaw:plantRandom()*Math.PI*2,tilt:groundTilt(x,z)};
        if(target===plants&&!seatGrass(plant))continue;
        target.push(plant);
      }
    };
    grow(plants,list.length*7,1,6.5);grow(fernPlants,Math.round(list.length*1.25),1.0,4.5);grow(litterPlants,list.length*4,.75,2.8);placedFerns+=fernPlants.length;placedLitter+=litterPlants.length;placedGrass+=plants.length;
    list.forEach(p=>cellFor(p).trees.push(p));plants.forEach(p=>cellFor(p).plants.push(p));fernPlants.forEach(p=>cellFor(p).ferns.push(p));litterPlants.forEach(p=>cellFor(p).litter.push(p));
  }
  const meadowRandom=woodlandRandom(773219),meadowCells=new Map<string,{center:THREE.Vector3;plants:Plant[]}>();let meadowCount=0;
  let eligibleGrassSites=0;
  for(let gz=-288;gz<121;gz+=1.4)for(let gx=WORLD_LIMITS.minX+7;gx<288;gx+=1.4){
      const x=gx+(meadowRandom()-.5)*1.1,z=gz+(meadowRandom()-.5)*1.1;
      if(!legal(x,z,.12,1.0)||neighbours(x,z).some(t=>(t.x-x)**2+(t.z-z)**2<(t.radius+.20)**2))continue;
      eligibleGrassSites++;
      const forest=woodlandCover(x,z),band=(Math.sin(x*.043+z*.037)*Math.sin(z*.057-x*.022)+1)*.5;
      if(meadowRandom()>(forest>.65?.46:.76+band*.20))continue;
      const plant={x,z,y:heightAt(x,z)+.007,scale:.86+meadowRandom()*.72,yaw:meadowRandom()*Math.PI*2,tilt:groundTilt(x,z)};
      if(!seatGrass(plant))continue;
      meadowCount++;
      const cx=Math.floor(x/32)*32+16,cz=Math.floor(z/32)*32+16,key=`${cx},${cz}`;
      let cell=meadowCells.get(key);if(!cell){cell={center:new THREE.Vector3(cx,heightAt(cx,cz),cz),plants:[]};meadowCells.set(key,cell);}cell.plants.push(plant);
  }
  return {trees,colliders,cameraOccluders,prototypes,grass,ferns,litter,cells,meadowCells,expansionCount,placedFerns,placedLitter,placedGrass,meadowCount,eligibleGrassSites};
}

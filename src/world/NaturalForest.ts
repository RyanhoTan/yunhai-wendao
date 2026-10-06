import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {FOREST_GROVES,woodlandCover} from './ForestLayout';
import {createWoodlandTree,createWoodlandGrass,createWoodlandFern,createWoodlandLitter,woodlandRandom,type WoodlandDetail} from './WoodlandGeometry';

type Point={x:number;z:number};
type Tree=Point&{y:number;scale:number;yaw:number;kind:number;seed:number;grove:number;radius:number;matrix:THREE.Matrix4};
type Collider=Point&{r:number};
type Plant=Point&{y:number;scale:number;yaw:number};
const WIND_PADDING=.12;

function originalBarkMap(){
  if(typeof document==='undefined')return null;
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=512;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  const random=woodlandRandom(851039);ctx.fillStyle='#b7af9b';ctx.fillRect(0,0,256,512);
  for(let i=0;i<140;i++){
    const x=random()*256,y=random()*512,length=20+random()*160,curve=(random()-.5)*9;
    ctx.strokeStyle=i%4?'rgba(66,57,43,.31)':'rgba(226,219,196,.38)';ctx.lineWidth=.6+random()*1.3;
    for(const shift of [-512,0,512]){ctx.beginPath();ctx.moveTo(x,y+shift);ctx.bezierCurveTo(x+curve,y+length*.34+shift,x-curve*.6,y+length*.77+shift,x+curve*.3,y+length+shift);ctx.stroke();}
  }
  for(let i=0;i<950;i++){ctx.fillStyle=i%3?'rgba(53,46,36,.13)':'rgba(235,227,206,.25)';ctx.fillRect(random()*256,random()*512,.5+random()*1.3,1+random()*3);}
  const map=new THREE.CanvasTexture(canvas);map.name='OriginalWoodlandBarkGrooves';map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=4;return map;
}

/** Only the flexible leaf blade moves; its attachment stays on the static twig. */
function installWind(material:THREE.Material,time:{value:number}){
  material.onBeforeCompile=shader=>{
    shader.uniforms.uWoodlandTime=time;
    shader.vertexShader='attribute float woodlandWind;uniform float uWoodlandTime;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec4 woodlandPosition=vec4(position,1.);
      #ifdef USE_INSTANCING
        woodlandPosition=instanceMatrix*woodlandPosition;
      #endif
      woodlandPosition=modelMatrix*woodlandPosition;
      float woodlandPhase=woodlandPosition.x*.79+woodlandPosition.z*.64;
      transformed.x+=sin(uWoodlandTime*1.13+woodlandPhase)*woodlandWind*.056;
      transformed.z+=cos(uWoodlandTime*.87+woodlandPhase*.83)*woodlandWind*.033;`);
  };
  material.customProgramCacheKey=()=> 'original-attached-woodland-leaf-wind-v1';
}

function localMatrix(p:Plant,center:THREE.Vector3){return new THREE.Matrix4().compose(new THREE.Vector3(p.x-center.x,p.y-center.y,p.z-center.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.yaw),new THREE.Vector3(p.scale,p.scale,p.scale));}

function mergedMesh(parts:THREE.BufferGeometry[],material:THREE.Material,name:string,castShadow=false,depth?:THREE.Material){
  if(!parts.length)return null;
  const geometry=mergeGeometries(parts,false);parts.forEach(part=>part.dispose());if(!geometry)return null;
  geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.boundingBox!.expandByScalar(WIND_PADDING);geometry.boundingSphere!.radius+=WIND_PADDING;
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.castShadow=castShadow;mesh.receiveShadow=true;if(depth)mesh.customDepthMaterial=depth;return mesh;
}

/** Six separate sparse groves; untouched gaps remain open grass slopes and paths. */
export function createNaturalForest(root:THREE.Group,heightAt:(x:number,z:number)=>number,isProtected:(x:number,z:number,extra:number)=>boolean){
  const group=new THREE.Group();group.name='OriginalNaturalWoodland';root.add(group);
  const time={value:0},bark=new THREE.MeshStandardMaterial({map:originalBarkMap(),vertexColors:true,roughness:.95});bark.name='OriginalWoodlandBark';
  const living=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88,side:THREE.DoubleSide,emissive:0x151c0a,emissiveIntensity:.035});living.name='OriginalWoodlandFoldedLeaves';installWind(living,time);
  const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});installWind(depth,time);
  const litterMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide});litterMaterial.name='OriginalWoodlandDryLitter';
  const random=woodlandRandom(903721),trees:Tree[]=[],colliders:Collider[]=[];
  const legal=(x:number,z:number,extra:number,slopeLimit=.95)=>{
    if(Math.abs(x)>288||z< -289||z>121||isProtected(x,z,extra))return false;
    const h=heightAt(x,z),dx=(heightAt(x+.5,z)-heightAt(x-.5,z)),dz=(heightAt(x,z+.5)-heightAt(x,z-.5));
    return Number.isFinite(h+dx+dz)&&h>.16&&Math.hypot(dx,dz)<=slopeLimit;
  };
  const prototypes=Array.from({length:6},(_,index)=>Array.from({length:3},(_,detail)=>createWoodlandTree(index%3,1289+index*181,detail as WoodlandDetail)));
  for(let attempt=0;attempt<19000&&trees.length<300;attempt++){
    const index=attempt%FOREST_GROVES.length,grove=FOREST_GROVES[index],angle=random()*Math.PI*2,r=Math.sqrt(random()),x=grove.x+Math.cos(angle)*grove.rx*r,z=grove.z+Math.sin(angle)*grove.rz*r;
    const kind=Math.floor(random()*3),seed=kind+(random()<.5?0:3),prototype=prototypes[seed][0],scale=.77+random()*.34,yaw=random()*Math.PI*2;
    if(woodlandCover(x,z)<.17||!legal(x,z,prototype.radius*scale+.8,.85)||trees.some(p=>(p.x-x)**2+(p.z-z)**2<8.6**2))continue;
    const dx=(heightAt(x+1,z)-heightAt(x-1,z))*.5,dz=(heightAt(x,z+1)-heightAt(x,z-1))*.5,tilt=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(-dx*.14,1,-dz*.14).normalize());
    tilt.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw));
    const position=new THREE.Vector3(x,heightAt(x,z)-.012,z),matrix=new THREE.Matrix4().compose(position,tilt,new THREE.Vector3(scale,scale,scale));
    // Root buttresses must contact the rendered height field across their full base.
    let sink=0;const vertices=prototype.wood.getAttribute('position'),sample=new THREE.Vector3();
    for(let i=0;i<vertices.count;i++)if(Math.abs(vertices.getY(i))<1e-6){sample.fromBufferAttribute(vertices,i).applyMatrix4(matrix);sink=Math.max(sink,sample.y-heightAt(sample.x,sample.z)+.012);}
    position.y-=sink;matrix.setPosition(position);
    const radius=prototype.trunkRadius*scale*1.12+.045;
    trees.push({x,z,y:position.y,scale,yaw,kind,seed,grove:index,radius,matrix});colliders.push({x,z,r:radius});
  }
  const grass=[createWoodlandGrass(44731),createWoodlandGrass(44731,true)],ferns=[createWoodlandFern(16127),createWoodlandFern(16127,true)],litter=createWoodlandLitter(60491);
  const fernCount=120,litterCount=300;let placedFerns=0,placedLitter=0,placedGrass=0;
  for(let index=0;index<FOREST_GROVES.length;index++){
    const list=trees.filter(p=>p.grove===index);
    const plants:Plant[]=[],fernPlants:Plant[]=[],litterPlants:Plant[]=[];
    const plantRandom=woodlandRandom(75913+index*701),grow=(target:Plant[],count:number,inner:number,outer:number)=>{
      for(let attempt=0;attempt<count*8&&target.length<count;attempt++){
        const tree=list[Math.floor(plantRandom()*list.length)];if(!tree)break;
        const a=plantRandom()*Math.PI*2,d=inner+plantRandom()*(outer-inner),x=tree.x+Math.cos(a)*d,z=tree.z+Math.sin(a)*d;
        if(!legal(x,z,.65)||trees.some(t=>(t.x-x)**2+(t.z-z)**2<(t.radius+.20)**2))continue;
        target.push({x,z,y:heightAt(x,z)+.013,scale:.68+plantRandom()*.51,yaw:plantRandom()*Math.PI*2});
      }
    };
    grow(plants,90,1,5.8);grow(fernPlants,fernCount/6,1.0,3.8);grow(litterPlants,litterCount/6,.75,2.0);placedFerns+=fernPlants.length;placedLitter+=litterPlants.length;placedGrass+=plants.length;
    // Small spatial cells keep nearby trees detailed even on the grove edge.
    const cells=new Map<string,{x:number;z:number;trees:Tree[];plants:Plant[];ferns:Plant[];litter:Plant[]}>();
    const cellFor=(p:Point)=>{
      const x=Math.floor(p.x/24)*24+12,z=Math.floor(p.z/24)*24+12,key=`${x},${z}`;
      let cell=cells.get(key);if(!cell){cell={x,z,trees:[],plants:[],ferns:[],litter:[]};cells.set(key,cell);}return cell;
    };
    list.forEach(p=>cellFor(p).trees.push(p));plants.forEach(p=>cellFor(p).plants.push(p));fernPlants.forEach(p=>cellFor(p).ferns.push(p));litterPlants.forEach(p=>cellFor(p).litter.push(p));
    for(const cell of cells.values()){
      const center=new THREE.Vector3(cell.x,heightAt(cell.x,cell.z),cell.z),lod=new THREE.LOD();lod.position.copy(center);lod.name=`OriginalWoodlandCell${index}_${cell.x}_${cell.z}`;
      for(let detail=0;detail<3;detail++){
        const level=new THREE.Group();level.name=`WoodlandCell${index}LOD${detail}`;
        const woodParts:THREE.BufferGeometry[]=[],leafParts:THREE.BufferGeometry[]=[],groundParts:THREE.BufferGeometry[]=[],litterParts:THREE.BufferGeometry[]=[];
        if(detail===0){
          // Detailed crowns share six immutable prototypes instead of duplicating
          // every near vertex across the whole world at startup.
          for(let seed=0;seed<prototypes.length;seed++){
            const list=cell.trees.filter(t=>t.seed===seed);if(!list.length)continue;
            for(const part of ['Trunks','Leaves'] as const){
              const prototype=prototypes[seed][0],mesh=new THREE.InstancedMesh(part==='Trunks'?prototype.wood:prototype.leaves,part==='Trunks'?bark:living,list.length);
              mesh.name=`WoodlandCell${index}_${part}LOD0`;mesh.castShadow=true;mesh.receiveShadow=true;if(part==='Leaves')mesh.customDepthMaterial=depth;
              list.forEach((tree,i)=>mesh.setMatrixAt(i,new THREE.Matrix4().makeTranslation(-center.x,-center.y,-center.z).multiply(tree.matrix)));
              mesh.computeBoundingSphere();mesh.boundingSphere!.radius+=WIND_PADDING;level.add(mesh);
            }
          }
        }else for(const tree of cell.trees){const transform=new THREE.Matrix4().makeTranslation(-center.x,-center.y,-center.z).multiply(tree.matrix),prototype=prototypes[tree.seed][detail];woodParts.push(prototype.wood.clone().applyMatrix4(transform));leafParts.push(prototype.leaves.clone().applyMatrix4(transform));}
        if(detail<2){
          cell.plants.forEach((plant,i)=>{if(detail===1&&i%2)return;groundParts.push(grass[detail].clone().applyMatrix4(localMatrix(plant,center)));});
          cell.ferns.forEach((plant,i)=>{if(detail===1&&i%2)return;groundParts.push(ferns[detail].clone().applyMatrix4(localMatrix(plant,center)));});
          cell.litter.forEach((plant,i)=>{
            if(detail===1&&i%3)return;
            const shape=litter.clone(),position=shape.getAttribute('position'),heights=Array.from({length:position.count},(_,v)=>position.getY(v)*plant.scale);
            shape.applyMatrix4(localMatrix(plant,center));
            for(let v=0;v<position.count;v++)position.setY(v,heightAt(position.getX(v)+center.x,position.getZ(v)+center.z)-center.y+Math.max(.003,heights[v]*.60+.006));
            shape.computeVertexNormals();litterParts.push(shape);
          });
        }
        for(const mesh of [mergedMesh(woodParts,bark,`WoodlandCell${index}_TrunksLOD${detail}`,detail<2),mergedMesh(leafParts,living,`WoodlandCell${index}_LeavesLOD${detail}`,detail===0,depth),mergedMesh(groundParts,living,`WoodlandCell${index}_UnderstoryLOD${detail}`,false,depth),mergedMesh(litterParts,litterMaterial,`WoodlandCell${index}_LitterLOD${detail}`)])if(mesh)level.add(mesh);
        lod.addLevel(level,[0,32,82][detail],.10);
      }
      lod.addLevel(new THREE.Group(),390,.10);group.add(lod);
      // A shared bound avoids frustum differences when far leaves switch in.
      for(const part of ['Trunks','Leaves']){
        const meshes:THREE.Mesh[]=[];lod.traverse(object=>{if(object instanceof THREE.Mesh&&object.name.includes(`_${part}LOD`))meshes.push(object);});
        const bounds=new THREE.Sphere();bounds.makeEmpty();meshes.forEach(m=>bounds.union(m instanceof THREE.InstancedMesh?m.boundingSphere!:m.geometry.boundingSphere!));
        meshes.forEach(m=>{if(m instanceof THREE.InstancedMesh)m.boundingSphere=bounds.clone();else m.geometry.boundingSphere=bounds.clone();});
      }
    }
  }
  // A light meadow layer improves nearby grass silhouettes while preserving open land.
  const meadowRandom=woodlandRandom(773219),meadowCells=new Map<string,{center:THREE.Vector3;plants:Plant[]}>();let meadowCount=0;
  for(let region=0;region<6;region++){
    const cx=region%2?145:-145,cz=-219+Math.floor(region/2)*140,plants:Plant[]=[];
    for(let attempt=0;attempt<6000&&plants.length<360;attempt++){
      const x=cx+(meadowRandom()-.5)*286,z=cz+(meadowRandom()-.5)*138;
      const band=(Math.sin(x*.053+z*.037)*Math.sin(z*.067-x*.022)+1)*.5;
      if(woodlandCover(x,z)>.40||band<.52||!legal(x,z,.40,.82))continue;
      plants.push({x,z,y:heightAt(x,z)+.007,scale:.62+meadowRandom()*.50,yaw:meadowRandom()*Math.PI*2});
    }
    meadowCount+=plants.length;
    for(const plant of plants){
      const x=Math.floor(plant.x/48)*48+24,z=Math.floor(plant.z/48)*48+24,key=`${x},${z}`;
      let cell=meadowCells.get(key);if(!cell){cell={center:new THREE.Vector3(x,heightAt(x,z),z),plants:[]};meadowCells.set(key,cell);}cell.plants.push(plant);
    }
  }
  for(const [key,cell] of meadowCells){
    const lod=new THREE.LOD();lod.name=`OriginalOpenMeadow${key}`;lod.position.copy(cell.center);
    for(let detail=0;detail<2;detail++){
      const plants=cell.plants.filter((_,i)=>detail===0||i%3===0),mesh=new THREE.InstancedMesh(grass[detail],living,plants.length);
      mesh.name=`OpenMeadow${key}BladesLOD${detail}`;mesh.receiveShadow=true;mesh.customDepthMaterial=depth;
      plants.forEach((p,i)=>mesh.setMatrixAt(i,localMatrix(p,cell.center)));mesh.computeBoundingSphere();mesh.computeBoundingBox();mesh.boundingSphere!.radius+=WIND_PADDING;mesh.boundingBox!.expandByScalar(WIND_PADDING);
      lod.addLevel(mesh,detail?60:0,.12);
    }
    lod.addLevel(new THREE.Group(),130,.12);group.add(lod);
  }
  prototypes.forEach(levels=>levels.slice(1).forEach(p=>{p.wood.dispose();p.leaves.dispose();}));[...ferns,litter].forEach(g=>g.dispose());
  Object.assign(group.userData,{assetSource:'Original authored branching trees, folded geometric leaves, curved fern and meadow blades, bark Canvas and localized litter. Reference concepts only.',treeCount:trees.length,treeCellSize:24,meadowCellSize:48,groves:FOREST_GROVES.length,groveCounts:FOREST_GROVES.map((_,index)=>trees.filter(p=>p.grove===index).length),treePlacements:trees.map(({x,z,y,scale,kind,grove,radius})=>({x,z,y,scale,kind,grove,radius,groundY:heightAt(x,z)})),minimumTreeSpacing:8.6,fernCount:placedFerns,litterCount:placedLitter,meadowCount,groundCover:{groveGrass:placedGrass,meadowGrass:meadowCount,ferns:placedFerns,litter:placedLitter},triangleBudget:'Small tree cells retain nearby crowns and shadows; mid/far LODs reduce distant leaf geometry. Meadow shares two instanced blade meshes.'});
  return {colliders,update(elapsed:number){time.value=elapsed;}};
}

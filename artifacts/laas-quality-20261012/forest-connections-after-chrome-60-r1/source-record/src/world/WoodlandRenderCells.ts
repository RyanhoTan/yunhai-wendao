import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {localMatrix,type createWoodlandPopulation} from './WoodlandPopulation';
import {type createWoodlandMaterials} from './WoodlandMaterials';
import {WoodlandLOD,type WoodlandLodField} from './WoodlandLOD';

const WIND_PADDING=.40;
function mergedMesh(parts:THREE.BufferGeometry[],material:THREE.Material,name:string,castShadow=false,depth?:THREE.Material){
  if(!parts.length)return null;
  const geometry=mergeGeometries(parts,false);parts.forEach(part=>part.dispose());if(!geometry)return null;
  geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.boundingBox!.expandByScalar(WIND_PADDING);geometry.boundingSphere!.radius+=WIND_PADDING;
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.castShadow=castShadow;mesh.receiveShadow=true;if(depth)mesh.customDepthMaterial=depth;return mesh;
}

/** Shared vertex buffers with one tiny cell ID per instance; no per-cell crown copy. */
function taggedInstances(source:THREE.BufferGeometry,count:number,cellId:number,legacySites?:readonly {x:number;z:number}[]){
  const geometry=new THREE.BufferGeometry();geometry.name=source.name;
  for(const [name,attribute] of Object.entries(source.attributes))geometry.setAttribute(name,attribute);
  geometry.setIndex(source.index);geometry.boundingBox=source.boundingBox?.clone()??null;geometry.boundingSphere=source.boundingSphere?.clone()??null;
  geometry.setAttribute('forestCellId',new THREE.InstancedBufferAttribute(new Float32Array(count).fill(cellId),1));
  if(legacySites)geometry.setAttribute('woodlandLegacyGround',new THREE.InstancedBufferAttribute(new Float32Array(count),1));
  return geometry;
}

export function createWoodlandRenderCells(group:THREE.Group,population:ReturnType<typeof createWoodlandPopulation>,materials:ReturnType<typeof createWoodlandMaterials>,heightAt:(x:number,z:number)=>number,field:WoodlandLodField,replacementEligible:(x:number,z:number)=>boolean=()=>false){
  const {cells,prototypes,grass,ferns,litter,meadowCells}=population;
  const {litterLevels}=materials;
  const pendingMasks:(()=>void)[]=[];
  const mask=(attribute:THREE.BufferAttribute|THREE.InterleavedBufferAttribute,sites:readonly {x:number;z:number}[])=>pendingMasks.push(()=>{
    const values=new Map<object,number>();
    sites.forEach((site,i)=>{let value=values.get(site);if(value===undefined){value=replacementEligible(site.x,site.z)?1:0;values.set(site,value);}attribute.setX(i,value);});attribute.needsUpdate=true;
  });
  const taggedGround=(source:THREE.BufferGeometry,count:number,cellId:number,sites:readonly {x:number;z:number}[])=>{
    const geometry=taggedInstances(source,count,cellId,sites);mask(geometry.getAttribute('woodlandLegacyGround'),sites);return geometry;
  };
  const forestLODs:WoodlandLOD[]=[],meadowLODs:WoodlandLOD[]=[],distantBatches=new Map<string,{center:THREE.Vector3;wood:THREE.BufferGeometry[];leaves:THREE.BufferGeometry[]}>();
    for(const cell of cells.values()){
      const index=`_${cell.x}_${cell.z}`;
      const elevations=[...cell.trees,...cell.plants,...cell.ferns].map(p=>p.y);
      const center=new THREE.Vector3(cell.x,elevations.length?(Math.min(...elevations)+Math.max(...elevations))*.5:heightAt(cell.x,cell.z),cell.z),lod=new WoodlandLOD(field,forestLODs.length);lod.position.copy(center);lod.name=`OriginalWoodlandCell${index}`;
      const forestCellId=forestLODs.length;forestLODs.push(lod);
      const nearDistance=Math.max(38,...[...cell.trees,...cell.plants,...cell.ferns].map(p=>Math.hypot(p.x-center.x,p.y-center.y,p.z-center.z)+16));
      for(let detail=0;detail<3;detail++){
        const {bark,living,depth}=materials.levels[detail];
        const level=new THREE.Group();level.name=`WoodlandCell${index}LOD${detail}`;
        const woodParts:THREE.BufferGeometry[]=[],leafParts:THREE.BufferGeometry[]=[],litterParts:THREE.BufferGeometry[]=[],litterSites:{x:number;z:number}[]=[];
        if(detail===0){
          // Detailed crowns share twelve immutable branch architectures instead of duplicating
          // every near vertex across the whole world at startup.
          for(let seed=0;seed<prototypes.length;seed++){
            const list=cell.trees.filter(t=>t.seed===seed);if(!list.length)continue;
            for(const part of ['Trunks','Leaves'] as const){
              const prototype=prototypes[seed][0],mesh=new THREE.InstancedMesh(taggedInstances(part==='Trunks'?prototype.wood:prototype.leaves,list.length,forestCellId),part==='Trunks'?bark:living,list.length);
              mesh.name=`WoodlandCell${index}_${part}LOD0`;mesh.castShadow=true;mesh.receiveShadow=true;mesh.customDepthMaterial=depth;
              list.forEach((tree,i)=>mesh.setMatrixAt(i,new THREE.Matrix4().makeTranslation(-center.x,-center.y,-center.z).multiply(tree.matrix)));
              mesh.computeBoundingSphere();mesh.boundingSphere!.radius+=WIND_PADDING;level.add(mesh);
            }
          }
        }else for(const tree of cell.trees){const transform=new THREE.Matrix4().makeTranslation(-center.x,-center.y,-center.z).multiply(tree.matrix),prototype=prototypes[tree.seed][detail];woodParts.push(prototype.wood.clone().applyMatrix4(transform));leafParts.push(prototype.leaves.clone().applyMatrix4(transform));}
        if(detail<2){
          for(const [population,shape,kind] of [[cell.plants,grass[detail],'Grass'],[cell.ferns,ferns[detail],'Ferns']] as const){
            const plants=population.filter((_,i)=>detail===0||i%2===0);if(!plants.length)continue;
            const mesh=new THREE.InstancedMesh(taggedGround(shape,plants.length,forestCellId,plants),living,plants.length);mesh.name=`WoodlandCell${index}_${kind}LOD${detail}`;mesh.receiveShadow=true;mesh.customDepthMaterial=depth;
            plants.forEach((plant,i)=>mesh.setMatrixAt(i,localMatrix(plant,center)));mesh.computeBoundingSphere();mesh.boundingSphere!.radius+=WIND_PADDING;level.add(mesh);
          }
          cell.litter.forEach((plant,i)=>{
            if(detail===1&&i%3)return;
            const shape=litter.clone(),position=shape.getAttribute('position'),heights=Array.from({length:position.count},(_,v)=>position.getY(v)*plant.scale);
            shape.applyMatrix4(localMatrix(plant,center));
            for(let v=0;v<position.count;v++)position.setY(v,heightAt(position.getX(v)+center.x,position.getZ(v)+center.z)-center.y+Math.max(.003,heights[v]*.60+.006));
            shape.computeVertexNormals();litterParts.push(shape);
            shape.setAttribute('forestCellId',new THREE.Float32BufferAttribute(new Float32Array(position.count).fill(forestCellId),1));
            shape.setAttribute('woodlandLegacyGround',new THREE.Float32BufferAttribute(new Float32Array(position.count),1));
            for(let v=0;v<position.count;v++)litterSites.push(plant);
          });
        }
        if(detail===2&&(woodParts.length||leafParts.length)){
          // Large far batches keep the continuous forest visible without a draw for every small cell.
          const bx=Math.floor(center.x/128),bz=Math.floor(center.z/128),key=`${bx},${bz}`;
          let batch=distantBatches.get(key);if(!batch){batch={center:new THREE.Vector3(bx*128+64,0,bz*128+64),wood:[],leaves:[]};distantBatches.set(key,batch);}
          for(const [parts,target] of [[woodParts,batch.wood],[leafParts,batch.leaves]])for(const part of parts){
            part.translate(center.x-batch.center.x,center.y,center.z-batch.center.z);
            part.setAttribute('forestCellId',new THREE.Float32BufferAttribute(new Float32Array(part.getAttribute('position').count).fill(forestCellId),1));target.push(part);
          }
        }else{
          for(const part of [...woodParts,...leafParts])part.setAttribute('forestCellId',new THREE.Float32BufferAttribute(new Float32Array(part.getAttribute('position').count).fill(forestCellId),1));
          for(const mesh of [mergedMesh(woodParts,bark,`WoodlandCell${index}_TrunksLOD${detail}`,true,depth),mergedMesh(leafParts,living,`WoodlandCell${index}_LeavesLOD${detail}`,true,depth),mergedMesh(litterParts,litterLevels[detail],`WoodlandCell${index}_LitterLOD${detail}`)])if(mesh){
            if(mesh.name.includes('_LitterLOD'))mask(mesh.geometry.getAttribute('woodlandLegacyGround'),litterSites);
            level.add(mesh);
          }
        }
        lod.addLevel(level,[0,nearDistance,Math.max(82,nearDistance+40)][detail]);
      }
      lod.addLevel(new THREE.Group(),1200,.10);group.add(lod);
      // A shared bound avoids frustum differences when far leaves switch in.
      for(const part of ['Trunks','Leaves']){
        const meshes:THREE.Mesh[]=[];lod.traverse(object=>{if(object instanceof THREE.Mesh&&object.name.includes(`_${part}LOD`))meshes.push(object);});
        const bounds=new THREE.Sphere();bounds.makeEmpty();meshes.forEach(m=>bounds.union(m instanceof THREE.InstancedMesh?m.boundingSphere!:m.geometry.boundingSphere!));
        meshes.forEach(m=>{if(m instanceof THREE.InstancedMesh)m.boundingSphere=bounds.clone();else m.geometry.boundingSphere=bounds.clone();});
      }
    }
  for(const [key,batch] of distantBatches){
    for(const [parts,material,name] of [[batch.wood,materials.levels[2].bark,'Wood'],[batch.leaves,materials.levels[2].living,'Leaves']] as const){
      const mesh=mergedMesh(parts,material,`ContinuousDistantForest_${key}_${name}`,true,materials.levels[2].depth);
      if(mesh){mesh.position.copy(batch.center);group.add(mesh);}
    }
  }
  group.userData.distantBatches=distantBatches.size;
  for(const [key,cell] of meadowCells){
    const elevations=cell.plants.map(p=>p.y);cell.center.y=(Math.min(...elevations)+Math.max(...elevations))*.5;
    const nearDistance=Math.max(36,...cell.plants.map(p=>(Math.hypot(p.x-cell.center.x,p.y-cell.center.y,p.z-cell.center.z)+4)/.88));
    const lod=new WoodlandLOD(field,population.cells.size+meadowLODs.length,true);meadowLODs.push(lod);lod.name=`OriginalOpenMeadow${key}`;lod.position.copy(cell.center);
    for(let detail=0;detail<2;detail++){
      const {living,depth}=materials.levels[detail];
      const plants=cell.plants.filter((_,i)=>detail===0||i%4===0),mesh=new THREE.InstancedMesh(taggedGround(grass[detail],plants.length,lod.cellId,plants),living,plants.length);
      mesh.name=`OpenMeadow${key}BladesLOD${detail}`;mesh.receiveShadow=true;mesh.customDepthMaterial=depth;
      plants.forEach((p,i)=>mesh.setMatrixAt(i,localMatrix(p,cell.center)));mesh.computeBoundingSphere();mesh.computeBoundingBox();mesh.boundingSphere!.radius+=WIND_PADDING;mesh.boundingBox!.expandByScalar(WIND_PADDING);
      lod.addLevel(mesh,detail?nearDistance:0);
    }
    lod.addLevel(new THREE.Group(),Math.max(110,nearDistance+50),.12);group.add(lod);
  }
  let masksReady=false;
  return {prepare(camera:THREE.Camera){
    // World rock solids are appended after forest construction. Evaluate once
    // on the first actual render, then release temporary placement closures.
    if(!masksReady){pendingMasks.forEach(update=>update());pendingMasks.length=0;masksReady=true;}
    group.updateWorldMatrix(true,false);camera.updateWorldMatrix(true,false);for(const lod of [...forestLODs,...meadowLODs]){lod.updateWorldMatrix(false,false);lod.update(camera);}field.flush();
  },forestLODs,meadowLODs};
}

import * as THREE from 'three';
import {landNoise} from './NaturalTerrain';
import {woodlandCover} from './ForestLayout';
import {woodlandRandom} from './WoodlandTree';
import type {GroundCoverKind} from './GroundCoverGeometry';

export type GroundTree={x:number;z:number;r:number;canopyRadius:number};
export type GroundPlacement={kind:GroundCoverKind;matrixOffset:number;r:number;g:number;b:number;x:number;y:number;z:number};
export type GroundCell={plants:GroundPlacement[];matrices:Float32Array};
export type GroundSupport={radius:number;height:number;roots:THREE.Vector3[];bounds:THREE.Box3};
export const GROUND_CELL_SIZE=8;

export function groundHabitat(heightAt:(x:number,z:number)=>number,x:number,z:number){
  if(x< -520||x>288||z< -289||z>119||woodlandCover(x,z)<.12)return null;
  const h=heightAt(x,z),dx=heightAt(x+.35,z)-heightAt(x-.35,z),dz=heightAt(x,z+.35)-heightAt(x,z-.35),slope=Math.hypot(dx,dz)/.7;
  return Number.isFinite(h+dx+dz)&&h>=.2&&slope<=.82?{h,dx,dz,slope}:null;
}

export function createGroundPlacementSampler(heightAt:(x:number,z:number)=>number,protectedAt:(x:number,z:number,r:number)=>boolean,trees:readonly GroundTree[],supports:Map<GroundCoverKind,GroundSupport>,blockedAt:(x:number,y:number,z:number,r:number,bounds?:THREE.Box3)=>boolean){
  const treeGrid=new Map<string,GroundTree[]>();
  const treeReach=Math.max(1,Math.ceil(Math.max(0,...trees.map(tree=>tree.canopyRadius*1.7))/12));
  for(const tree of trees){const key=`${Math.floor(tree.x/12)},${Math.floor(tree.z/12)}`,list=treeGrid.get(key)??[];list.push(tree);treeGrid.set(key,list);}
  const nearTrees=(x:number,z:number)=>{
    const list:GroundTree[]=[],cx=Math.floor(x/12),cz=Math.floor(z/12);
    for(let dz=-treeReach;dz<=treeReach;dz++)for(let dx=-treeReach;dx<=treeReach;dx++)list.push(...(treeGrid.get(`${cx+dx},${cz+dz}`)??[]));return list;
  };
  const point=new THREE.Vector3(),rotation=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),normal=new THREE.Vector3(),yaw=new THREE.Quaternion(),worldBounds=new THREE.Box3();
  const position=new THREE.Vector3(),scaleVector=new THREE.Vector3(),matrix=new THREE.Matrix4(),color=new THREE.Color();
  return (cx:number,cz:number)=>{
    const random=woodlandRandom(Math.imul(cx,73856093)^Math.imul(cz,19349663)^918273),placements:GroundPlacement[]=[],matrices:number[]=[];
    // Jittered candidates are filtered by continuous habitat patches, not a
    // uniform carpet. The cell seed makes revisiting restore identical plants.
    for(let candidate=0;candidate<1400;candidate++){
      const x=(cx+random())*GROUND_CELL_SIZE,z=(cz+random())*GROUND_CELL_SIZE;
      if(x< -520||x>288||z< -289||z>119)continue;
      const cover=woodlandCover(x,z);if(cover<.12||protectedAt(x,z,0))continue;
      const habitat=groundHabitat(heightAt,x,z);if(!habitat)continue;
      const {h,dx,dz,slope}=habitat;
      const moisture=THREE.MathUtils.clamp(.48+landNoise(x*.032+17,z*.029-11)*.32-slope*.20,0,1);
      const patch=THREE.MathUtils.clamp(.62+landNoise(x*.16,z*.14)*.31+landNoise(x*.053-4,z*.049+8)*.22,0,1);
      const neighbours=nearTrees(x,z);let rootDistance=Infinity,shade=0;
      for(const tree of neighbours){const d=Math.hypot(x-tree.x,z-tree.z);rootDistance=Math.min(rootDistance,d-tree.r);shade=Math.max(shade,1-THREE.MathUtils.smoothstep(d,tree.canopyRadius*.5,tree.canopyRadius*1.7));}
      if(random()>patch*(.45+cover*.55)||rootDistance<.10)continue;
      const choice=random();let kind:GroundCoverKind;
      // Fine blades need many independent rooted clumps, while larger ferns,
      // flowers and debris remain a much sparser ecological layer.
      if(candidate<1100)kind=choice<.93?'grass':choice<.985?'sedge':'clover';
      else if(shade>.3){
        // Broad fronds and accumulated dead leaves occupy moist, sheltered
        // root patches. Open edges retain smaller herbs and seed heads.
        if(choice<.30)kind=moisture>.35?'fern':'clover';
        else if(choice<.69)kind='litter';
        else if(choice<.78)kind='twig';
        else if(choice<.87)kind='clover';
        else if(choice<.95)kind='pebble';
        else kind=rootDistance<3?'mushroom':'sedge';
      }else if(choice<.29)kind='sedge';
      else if(choice<.49)kind='flowers';
      else if(choice<.68)kind='clover';
      else if(choice<.82)kind='litter';
      else if(choice<.90)kind='twig';
      else kind='pebble';
      const support=supports.get(kind)!;
      const scale=(kind==='grass'?.65+random()*.55:.72+random()*.55)*(kind==='grass'?1-shade*.20:1);
      // The complete inclined plant and its wind envelope clear a corridor,
      // not just the ground pivot or unrotated prototype radius.
      const radius=(support.radius+support.height*slope/Math.sqrt(1+slope*slope))*scale+.11;
      if(protectedAt(x,z,radius)||rootDistance<radius*.32)continue;
      normal.set(-dx/.7,1,-dz/.7).normalize();rotation.setFromUnitVectors(up,normal);yaw.setFromAxisAngle(up,random()*Math.PI*2);rotation.multiply(yaw);
      position.set(x,h+.001,z);matrix.compose(position,rotation,scaleVector.setScalar(scale));
      let sink=0;
      for(const root of support.roots){point.copy(root).applyMatrix4(matrix);sink=Math.max(sink,point.y-heightAt(point.x,point.z)+.001);}
      if(sink>.09)continue;
      position.y-=sink;matrix.setPosition(position);
      worldBounds.copy(support.bounds).applyMatrix4(matrix).expandByScalar(.11);
      if(blockedAt(x,position.y,z,radius,worldBounds))continue;
      color.setHSL((random()-.5)*.035+.28,.08+random()*.08,.76+random()*.15);
      placements.push({kind,matrixOffset:matrices.length,r:color.r,g:color.g,b:color.b,x,y:position.y,z});matrices.push(...matrix.elements);
    }
    return {plants:placements,matrices:new Float32Array(matrices)} satisfies GroundCell;
  };
}

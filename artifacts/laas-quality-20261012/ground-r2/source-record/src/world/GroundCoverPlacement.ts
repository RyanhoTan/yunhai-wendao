import * as THREE from 'three';
import {landNoise} from './NaturalTerrain';
import {woodlandCover} from './ForestLayout';
import {woodlandRandom} from './WoodlandTree';
import type {GroundCoverKind} from './GroundCoverGeometry';

export type GroundTree={x:number;z:number;r:number;canopyRadius:number};
export type GroundPlacement={kind:GroundCoverKind;matrix:THREE.Matrix4;color:THREE.Color;x:number;y:number;z:number};
export type GroundSupport={radius:number;height:number;roots:THREE.Vector3[]};
export const GROUND_CELL_SIZE=8;

export function createGroundPlacementSampler(heightAt:(x:number,z:number)=>number,protectedAt:(x:number,z:number,r:number)=>boolean,trees:readonly GroundTree[],supports:Map<GroundCoverKind,GroundSupport>,blockedAt:(x:number,y:number,z:number,r:number)=>boolean){
  const treeGrid=new Map<string,GroundTree[]>();
  for(const tree of trees){const key=`${Math.floor(tree.x/12)},${Math.floor(tree.z/12)}`,list=treeGrid.get(key)??[];list.push(tree);treeGrid.set(key,list);}
  const nearTrees=(x:number,z:number)=>{
    const list:GroundTree[]=[],cx=Math.floor(x/12),cz=Math.floor(z/12);
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)list.push(...(treeGrid.get(`${cx+dx},${cz+dz}`)??[]));return list;
  };
  const point=new THREE.Vector3(),rotation=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),normal=new THREE.Vector3(),yaw=new THREE.Quaternion();
  return (cx:number,cz:number)=>{
    const random=woodlandRandom(Math.imul(cx,73856093)^Math.imul(cz,19349663)^918273),placements:GroundPlacement[]=[];
    // Jittered candidates are filtered by continuous habitat patches, not a
    // uniform carpet. The cell seed makes revisiting restore identical plants.
    for(let candidate=0;candidate<1390;candidate++){
      const x=(cx+random())*GROUND_CELL_SIZE,z=(cz+random())*GROUND_CELL_SIZE;
      if(x< -520||x>288||z< -289||z>119)continue;
      const cover=woodlandCover(x,z);if(cover<.12)continue;
      const h=heightAt(x,z),dx=heightAt(x+.35,z)-heightAt(x-.35,z),dz=heightAt(x,z+.35)-heightAt(x,z-.35),slope=Math.hypot(dx,dz)/.7;
      if(!Number.isFinite(h+dx+dz)||h<.2||slope>.82)continue;
      const moisture=THREE.MathUtils.clamp(.48+landNoise(x*.032+17,z*.029-11)*.32-slope*.20,0,1);
      const patch=THREE.MathUtils.clamp(.62+landNoise(x*.16,z*.14)*.31+landNoise(x*.053-4,z*.049+8)*.22,0,1);
      const neighbours=nearTrees(x,z);let rootDistance=Infinity,shade=0;
      for(const tree of neighbours){const d=Math.hypot(x-tree.x,z-tree.z);rootDistance=Math.min(rootDistance,d-tree.r);shade=Math.max(shade,1-THREE.MathUtils.smoothstep(d,tree.canopyRadius*.5,tree.canopyRadius*1.7));}
      if(random()>patch*(.45+cover*.55)||rootDistance<.10)continue;
      const choice=random();let kind:GroundCoverKind;
      // Fine blades need many independent rooted clumps, while larger ferns,
      // flowers and debris remain a much sparser ecological layer.
      if(candidate<1200)kind=choice<.93?'grass':choice<.985?'sedge':'clover';
      else if(choice<.54)kind='grass';
      else if(choice<.62)kind=moisture>.48?'sedge':'flowers';
      else if(choice<.70)kind=shade>.3&&moisture>.4?'fern':'clover';
      else if(choice<.76)kind='clover';
      else if(choice<.87)kind='litter';
      else if(choice<.92)kind='twig';
      else if(choice<.98)kind='pebble';
      else kind=rootDistance<2.5&&shade>.45?'mushroom':'flowers';
      const support=supports.get(kind)!;
      const scale=(kind==='grass'?.65+random()*.55:.72+random()*.55)*(kind==='grass'?1-shade*.20:1);
      // The complete inclined plant and its wind envelope clear a corridor,
      // not just the ground pivot or unrotated prototype radius.
      const radius=(support.radius+support.height*slope/Math.sqrt(1+slope*slope))*scale+.11;
      if(protectedAt(x,z,radius)||rootDistance<radius*.32||blockedAt(x,h,z,radius))continue;
      normal.set(-dx/.7,1,-dz/.7).normalize();rotation.setFromUnitVectors(up,normal);yaw.setFromAxisAngle(up,random()*Math.PI*2);rotation.multiply(yaw);
      const position=new THREE.Vector3(x,h+.001,z),matrix=new THREE.Matrix4().compose(position,rotation,new THREE.Vector3(scale,scale,scale));
      let sink=0;
      for(const root of support.roots){point.copy(root).applyMatrix4(matrix);sink=Math.max(sink,point.y-heightAt(point.x,point.z)+.001);}
      if(sink>.09)continue;
      position.y-=sink;matrix.setPosition(position);
      const color=new THREE.Color().setHSL((random()-.5)*.035+.28,.08+random()*.08,.76+random()*.15);
      placements.push({kind,matrix,color,x,y:position.y,z});
    }
    return placements;
  };
}

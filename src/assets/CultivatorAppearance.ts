import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCultivatorHead } from './CultivatorHead';

/** Original Chinese costume and face, authored in the normalized character's metre frame. */
export function dressCultivator(rig: THREE.Group, visual: THREE.Group, bones: Map<string, THREE.Bone>) {
  const white = new THREE.MeshStandardMaterial({color:'#d4c7ac',roughness:.9,side:THREE.DoubleSide});
  const jade = new THREE.MeshStandardMaterial({color:'#315955',roughness:.75,side:THREE.DoubleSide});
  rig.updateMatrixWorld(true);
  const frameInverse = visual.matrixWorld.clone().invert();
  const bonePoint = (name:string) => bones.get(name)!.getWorldPosition(new THREE.Vector3()).applyMatrix4(frameInverse);
  const headPoint = bonePoint('Head');
  const parts=buildCultivatorHead(headPoint);
  const chest=bonePoint('Spine2'),hips=bonePoint('Hips');
  // Crossed lapels and a narrow scarf distinguish the robe from the source armour.
  const panel=(points:THREE.Vector3[],material:THREE.Material,bone:string)=>{
    const geometry=new THREE.BufferGeometry().setFromPoints(points);geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();parts.push({geometry,material,bone});
  };
  for(const side of [-1,1]){
    const end=-.07;
    panel([new THREE.Vector3(side*.105,chest.y+.11,-.135),new THREE.Vector3(side*.153,chest.y+.092,-.13),new THREE.Vector3(end,hips.y+.19,-.165),new THREE.Vector3(end-.043,hips.y+.20,-.17)],white,'Spine2');
    panel([new THREE.Vector3(side*.145,hips.y-.02,-.16),new THREE.Vector3(side*.225,hips.y-.02,-.11),new THREE.Vector3(side*.285,hips.y-.49,-.08),new THREE.Vector3(side*.123,hips.y-.49,-.16)],jade,'Hips');
  }
  const groups=new Map<string,THREE.BufferGeometry[]>();
  for(const part of parts){
    const bone=bones.get(part.bone)!;rig.updateMatrixWorld(true);
    part.geometry.applyMatrix4(bone.matrixWorld.clone().invert().multiply(visual.matrixWorld));
    const key=`${part.bone}:${part.material.uuid}`;const list=groups.get(key)??[];list.push(part.geometry);groups.set(key,list);
  }
  for(const [key,geometries] of groups){
    const boneName=key.split(':')[0],material=parts.find(p=>`${p.bone}:${p.material.uuid}`===key)!.material;
    const geometry=mergeGeometries(geometries.map(g=>g.index?g.toNonIndexed():g),false)!;
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`AuthoredCultivator_${boneName}`;mesh.castShadow=true;mesh.receiveShadow=true;bones.get(boneName)!.add(mesh);geometries.forEach(g=>g.dispose());
  }
  return {headPoint};
}

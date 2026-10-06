import { expect, test } from '@playwright/test';
import * as THREE from 'three';
import { createNaturalTerrain } from '../src/world/NaturalTerrain';
import { terrainHeight } from '../src/world/World';

test('playable natural surface agrees with character elevation on hills and coastal transition', () => {
  const root=new THREE.Group();createNaturalTerrain(root,terrainHeight,()=>100);root.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(),meshes:THREE.Mesh[]=[];root.traverse(m=>{if(m instanceof THREE.Mesh&&m.name.startsWith('NaturalTerrainChunk')&&m.name.endsWith('_80'))meshes.push(m);});
  let worst=0;
  for(let z=-294;z<135;z+=17.3)for(let x=-494;x<294;x+=23.7){
    if(Math.abs(x)<18&&Math.abs(z-7)<18)continue;
    // The stone bridge supplies its own deck, independent of the earth below.
    if(Math.hypot(x+55,z-80)<10)continue;
    ray.set(new THREE.Vector3(x,500,z),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObjects(meshes,false)[0];expect(hit).toBeDefined();
    worst=Math.max(worst,Math.abs(hit.point.y-terrainHeight(x,z)));
  }
  expect(worst,'feet and visible ground must remain close on the near 1m surface grid').toBeLessThan(.08);
  const normals=new Map<string,THREE.Vector3>();
  for(const object of meshes){const mesh=object as THREE.Mesh,p=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal');for(let i=0;i<p.count;i++){const key=`${p.getX(i)+mesh.parent!.position.x},${p.getZ(i)+mesh.parent!.position.z}`,normal=new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)),prior=normals.get(key);if(prior)expect(prior.distanceTo(normal),'shared chunk edges have identical normals').toBeLessThan(.00001);else normals.set(key,normal);}}
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  root.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const m of Array.isArray(object.material)?object.material:[object.material])materials.add(m);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
});

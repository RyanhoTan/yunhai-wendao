import * as THREE from 'three';
import {createIndexedTriangleCollision} from '../core/IndexedTriangleCollision';
import {createRockSurfaceMaterial} from './NaturalLandMaterial';
import type {GeologicalSurfaceData} from './GeologicalSurfaceData';

/** Identical GPU buffers, SAT world vertices and rain bounds for generated and
 * prebuilt terrain. No independently simplified collision or camera proxy. */
export function createGeologicalSurface(root:THREE.Group,data:GeologicalSurfaceData){
  const group=new THREE.Group();group.name='GeologicalEscarpments';root.add(group);
  const material=createRockSurfaceMaterial();
  const bodySolids=data.tiles.map(tile=>{
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(tile.positions,3));
    geometry.setAttribute('normal',new THREE.BufferAttribute(tile.normals,3));
    geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(tile.positions.length),3));
    geometry.setIndex(new THREE.BufferAttribute(tile.indices,1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,material);mesh.name=tile.name;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
    return createIndexedTriangleCollision(tile.positions,tile.indices,.08,.06);
  });
  const rainOccluders:THREE.Box3[]=[];
  for(let i=0;i<data.rainBounds.length;i+=6)rainOccluders.push(new THREE.Box3(new THREE.Vector3().fromArray(data.rainBounds,i),new THREE.Vector3().fromArray(data.rainBounds,i+3)));
  if(!data.tiles.length)material.dispose();
  const buffers=new Set<ArrayBufferLike>();let bodyCollisionBytes=0;
  for(const mesh of bodySolids){
    const indexed=mesh.indexedTriangles;
    for(const array of [indexed.positions,indexed.indices,indexed.cellOffsets,indexed.triangleIds]){bodyCollisionBytes+=array.byteLength;buffers.add(array.buffer);}
  }
  // Shared cache views retain their complete binary backing buffer, including
  // normals and rain bounds. Disclose that separately from collision payload.
  group.userData={...data.userData,bodyCollisionStorage:'indexed-float64',bodyCollisionBytes,bodyCollisionBackingBytes:[...buffers].reduce((n,buffer)=>n+buffer.byteLength,0)};
  return {rainOccluders,cameraMeshes:group.children as THREE.Mesh[],bodySolids,bakeData:data};
}

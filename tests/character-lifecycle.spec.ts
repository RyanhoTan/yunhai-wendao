import {expect,test} from '@playwright/test';
import * as THREE from 'three';
import {disposeObject3D,disposeSkeletons} from '../src/utils/dispose';

test('shared skinned primitives release bone textures once across teardown paths',()=>{
  const root=new THREE.Group(),skeleton=new THREE.Skeleton([new THREE.Bone()]);
  skeleton.computeBoneTexture();let releases=0;skeleton.boneTexture!.addEventListener('dispose',()=>releases++);
  for(let i=0;i<6;i++){const primitive=new THREE.SkinnedMesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial());primitive.skeleton=skeleton;root.add(primitive);}
  disposeSkeletons(root);expect(releases).toBe(1);expect(skeleton.boneTexture).toBeNull();
  disposeObject3D(root);expect(releases).toBe(1);
});

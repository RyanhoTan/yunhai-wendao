import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {bodyPointBlocked,bodyCollisionMesh,triangleBodySolid} from '../src/core/StaticBodyCollision';

test('safe save feet test includes rock overhangs without blocking empty space in their box',()=>{
  const mesh=bodyCollisionMesh([triangleBodySolid(new THREE.Vector3(0,2,0),new THREE.Vector3(8,2,0),new THREE.Vector3(0,2,8),.08,.06)]);
  expect(bodyPointBlocked([mesh],new THREE.Vector3(1,1,1))).toBe(true);
  expect(bodyPointBlocked([mesh],new THREE.Vector3(7,1,7))).toBe(false);
  expect(bodyPointBlocked([mesh],new THREE.Vector3(1,-1,1))).toBe(false);
  expect(bodyPointBlocked([mesh],new THREE.Vector3(1,2.06,1))).toBe(false);
});

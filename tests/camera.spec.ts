import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { constrainCameraBoom } from '../src/core/CameraBoom';

test('camera stays before a wall and also catches an intervening hill',()=>{
  const target = new THREE.Vector3(0,4.55,-3), desired = new THREE.Vector3(0,6.62,4.2);
  const wall = new THREE.Box3(new THREE.Vector3(-8,3.3,.85),new THREE.Vector3(8,7.7,1.35));
  constrainCameraBoom(target,desired,[wall],()=>1.8);
  expect(desired.z).toBeLessThan(wall.min.z-.18);
  expect(desired.z).toBeGreaterThan(target.z);
  const hillView = new THREE.Vector3(0,4,10);
  constrainCameraBoom(new THREE.Vector3(0,4,0),hillView,[],(_x,z)=>z>3&&z<5?5:0);
  expect(hillView.z).toBeLessThan(3);
});

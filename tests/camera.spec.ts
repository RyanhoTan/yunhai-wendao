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

test('camera footprint keeps clearance on a grazing approach to an actual rock face',()=>{
  const geometry=new THREE.PlaneGeometry(30,30);geometry.rotateY(Math.PI/2);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=new THREE.MeshBasicMaterial(),face=new THREE.Mesh(geometry,material);face.updateMatrixWorld(true);
  const target=new THREE.Vector3(1,0,0),desired=new THREE.Vector3(.1,0,10);
  constrainCameraBoom(target,desired,[],()=>-100,[face]);
  expect(desired.x).toBeGreaterThanOrEqual(.18);expect(desired.z).toBeLessThan(10);expect(desired.z).toBeGreaterThan(5);
  geometry.dispose();material.dispose();
});

test('camera broad phase uses world bounds of a translated rock face',()=>{
  const geometry=new THREE.PlaneGeometry(30,30);geometry.rotateY(Math.PI/2);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),face=new THREE.Mesh(geometry,material);face.position.x=10;face.updateMatrixWorld(true);
  const target=new THREE.Vector3(8,0,0),desired=new THREE.Vector3(12,0,0);constrainCameraBoom(target,desired,[],()=>-100,[face]);
  expect(desired.x).toBeLessThan(9.8);expect(desired.x).toBeGreaterThan(8);geometry.dispose();material.dispose();
});

test('camera keeps plane clearance between footprint sampling directions',()=>{
  const n=new THREE.Vector3(Math.cos(Math.PI/8),Math.sin(Math.PI/8),0),geometry=new THREE.PlaneGeometry(30,30);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),n));geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),face=new THREE.Mesh(geometry,material);face.updateMatrixWorld(true);
  const target=n.clone().multiplyScalar(1.2),desired=n.clone().multiplyScalar(.17).add(new THREE.Vector3(0,0,10));constrainCameraBoom(target,desired,[],()=>-100,[face]);
  expect(desired.dot(n)).toBeGreaterThanOrEqual(.18);expect(desired.z).toBeLessThan(10);geometry.dispose();material.dispose();
});

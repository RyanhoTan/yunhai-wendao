import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {bodyPointBlocked,bodyCollisionMesh,triangleBodySolid,transformedBoxBodySolid,createTransformedBoxBodySampler,constrainBodySolids} from '../src/core/StaticBodyCollision';

test('safe save feet test includes rock overhangs without blocking empty space in their box',()=>{
  const mesh=bodyCollisionMesh([triangleBodySolid(new THREE.Vector3(0,2,0),new THREE.Vector3(8,2,0),new THREE.Vector3(0,2,8),.08,.06)]);
  expect(bodyPointBlocked([mesh],new THREE.Vector3(1,1,1))).toBe(true);
  expect(bodyPointBlocked([mesh],new THREE.Vector3(7,1,7))).toBe(false);
  expect(bodyPointBlocked([mesh],new THREE.Vector3(1,-1,1))).toBe(false);
  expect(bodyPointBlocked([mesh],new THREE.Vector3(1,2.06,1))).toBe(false);
});

test('cached box basis matches independent eight-corner SAT for varied rigid poses and preserves its captured matrix',()=>{
  let largestError=0;
  for(let i=0;i<80;i++){
    const matrix=new THREE.Matrix4().compose(new THREE.Vector3(-210+i*1.7,4+i*.23,-142-i*.77),new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(i)*.23,i*.371,Math.cos(i)*.19)),new THREE.Vector3(.7+(i%3)*.3,.85,.9));
    const sample=createTransformedBoxBodySampler(matrix),box=new THREE.Box3(new THREE.Vector3(-2+i*.01,0,-.25),new THREE.Vector3(1+i*.01,.4,.3)),old=transformedBoxBodySolid(box,matrix),cached=sample(box);
    expect(cached.axes.length).toBe(old.axes.length);
    for(let j=0;j<old.axes.length;j++)for(const key of ['x','y','z','min','max'] as const)largestError=Math.max(largestError,Math.abs(cached.axes[j][key]-old.axes[j][key]));
    largestError=Math.max(largestError,cached.bounds.min.distanceTo(old.bounds.min),cached.bounds.max.distanceTo(old.bounds.max));
    matrix.makeTranslation(1000,1000,1000);expect(sample(box)).toEqual(cached);
  }
  expect(largestError).toBeLessThan(1.e-9);
});

test('rotated low wood blocks its physical side but clears diagonal envelope corners and overhead flight',()=>{
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(0,2,0),new THREE.Quaternion().setFromEuler(new THREE.Euler(.08,Math.PI/4,.12)),new THREE.Vector3(1,1,1));
  const mesh=bodyCollisionMesh([transformedBoxBodySolid(new THREE.Box3(new THREE.Vector3(-2,0,-.25),new THREE.Vector3(2,.5,.25)),matrix)]);
  expect(bodyPointBlocked([mesh],new THREE.Vector3(0,2,0))).toBe(true);
  expect(bodyPointBlocked([mesh],new THREE.Vector3(1.5,2,1.5)),'empty diagonal world-box corner is passable').toBe(false);
  expect(bodyPointBlocked([mesh],new THREE.Vector3(0,3.5,0)),'flight above the actual volume is free').toBe(false);
  const previous=new THREE.Vector3(0,2,3),desired=new THREE.Vector3(0,2,-3);
  expect(constrainBodySolids([mesh],previous,desired),'continuous fast crossing stops or slides outside wood').toBe(true);
  expect(bodyPointBlocked([mesh],desired)).toBe(false);
});

test('grounded sideways contact with sloping wood slides without lifting the feet',()=>{
  for(const yaw of [0,.37,1.1,2.4]){
    const matrix=new THREE.Matrix4().compose(new THREE.Vector3(0,2,0),new THREE.Quaternion().setFromEuler(new THREE.Euler(.22,yaw,.16)),new THREE.Vector3(1,1,1));
    const mesh=bodyCollisionMesh([transformedBoxBodySolid(new THREE.Box3(new THREE.Vector3(-3,0,-.4),new THREE.Vector3(3,.6,.4)),matrix)]);
    const previous=new THREE.Vector3(Math.sin(yaw)*4,2,Math.cos(yaw)*4),desired=new THREE.Vector3(-Math.sin(yaw)*4,2,-Math.cos(yaw)*4);
    expect(constrainBodySolids([mesh],previous,desired,true)).toBe(true);
    expect(desired.y,'a side face cannot add vertical displacement during grounded horizontal movement').toBe(2);
    expect(bodyPointBlocked([mesh],desired),'the same full SAT envelope still blocks penetration').toBe(false);
    const flightStart=previous.clone().setY(4),flightEnd=new THREE.Vector3(-Math.sin(yaw)*4,4,-Math.cos(yaw)*4),unobstructed=flightEnd.clone();
    expect(constrainBodySolids([mesh],flightStart,flightEnd)).toBe(false);expect(flightEnd.distanceTo(unobstructed)).toBeLessThan(1e-12);
  }
});

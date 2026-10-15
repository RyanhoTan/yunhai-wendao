# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: body-point.spec.ts >> grounded sideways contact with sloping wood slides without lifting the feet
- Location: tests/body-point.spec.ts:37:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 1

  Vector3 {
    "isVector3": true,
-   "x": -0,
+   "x": 0,
    "y": 4,
    "z": -4,
  }
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import * as THREE from 'three';
  3  | import {bodyPointBlocked,bodyCollisionMesh,triangleBodySolid,transformedBoxBodySolid,createTransformedBoxBodySampler,constrainBodySolids} from '../src/core/StaticBodyCollision';
  4  | 
  5  | test('safe save feet test includes rock overhangs without blocking empty space in their box',()=>{
  6  |   const mesh=bodyCollisionMesh([triangleBodySolid(new THREE.Vector3(0,2,0),new THREE.Vector3(8,2,0),new THREE.Vector3(0,2,8),.08,.06)]);
  7  |   expect(bodyPointBlocked([mesh],new THREE.Vector3(1,1,1))).toBe(true);
  8  |   expect(bodyPointBlocked([mesh],new THREE.Vector3(7,1,7))).toBe(false);
  9  |   expect(bodyPointBlocked([mesh],new THREE.Vector3(1,-1,1))).toBe(false);
  10 |   expect(bodyPointBlocked([mesh],new THREE.Vector3(1,2.06,1))).toBe(false);
  11 | });
  12 | 
  13 | test('cached box basis matches independent eight-corner SAT for varied rigid poses and preserves its captured matrix',()=>{
  14 |   let largestError=0;
  15 |   for(let i=0;i<80;i++){
  16 |     const matrix=new THREE.Matrix4().compose(new THREE.Vector3(-210+i*1.7,4+i*.23,-142-i*.77),new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(i)*.23,i*.371,Math.cos(i)*.19)),new THREE.Vector3(.7+(i%3)*.3,.85,.9));
  17 |     const sample=createTransformedBoxBodySampler(matrix),box=new THREE.Box3(new THREE.Vector3(-2+i*.01,0,-.25),new THREE.Vector3(1+i*.01,.4,.3)),old=transformedBoxBodySolid(box,matrix),cached=sample(box);
  18 |     expect(cached.axes.length).toBe(old.axes.length);
  19 |     for(let j=0;j<old.axes.length;j++)for(const key of ['x','y','z','min','max'] as const)largestError=Math.max(largestError,Math.abs(cached.axes[j][key]-old.axes[j][key]));
  20 |     largestError=Math.max(largestError,cached.bounds.min.distanceTo(old.bounds.min),cached.bounds.max.distanceTo(old.bounds.max));
  21 |     matrix.makeTranslation(1000,1000,1000);expect(sample(box)).toEqual(cached);
  22 |   }
  23 |   expect(largestError).toBeLessThan(1.e-9);
  24 | });
  25 | 
  26 | test('rotated low wood blocks its physical side but clears diagonal envelope corners and overhead flight',()=>{
  27 |   const matrix=new THREE.Matrix4().compose(new THREE.Vector3(0,2,0),new THREE.Quaternion().setFromEuler(new THREE.Euler(.08,Math.PI/4,.12)),new THREE.Vector3(1,1,1));
  28 |   const mesh=bodyCollisionMesh([transformedBoxBodySolid(new THREE.Box3(new THREE.Vector3(-2,0,-.25),new THREE.Vector3(2,.5,.25)),matrix)]);
  29 |   expect(bodyPointBlocked([mesh],new THREE.Vector3(0,2,0))).toBe(true);
  30 |   expect(bodyPointBlocked([mesh],new THREE.Vector3(1.5,2,1.5)),'empty diagonal world-box corner is passable').toBe(false);
  31 |   expect(bodyPointBlocked([mesh],new THREE.Vector3(0,3.5,0)),'flight above the actual volume is free').toBe(false);
  32 |   const previous=new THREE.Vector3(0,2,3),desired=new THREE.Vector3(0,2,-3);
  33 |   expect(constrainBodySolids([mesh],previous,desired),'continuous fast crossing stops or slides outside wood').toBe(true);
  34 |   expect(bodyPointBlocked([mesh],desired)).toBe(false);
  35 | });
  36 | 
  37 | test('grounded sideways contact with sloping wood slides without lifting the feet',()=>{
  38 |   for(const yaw of [0,.37,1.1,2.4]){
  39 |     const matrix=new THREE.Matrix4().compose(new THREE.Vector3(0,2,0),new THREE.Quaternion().setFromEuler(new THREE.Euler(.22,yaw,.16)),new THREE.Vector3(1,1,1));
  40 |     const mesh=bodyCollisionMesh([transformedBoxBodySolid(new THREE.Box3(new THREE.Vector3(-3,0,-.4),new THREE.Vector3(3,.6,.4)),matrix)]);
  41 |     const previous=new THREE.Vector3(Math.sin(yaw)*4,2,Math.cos(yaw)*4),desired=new THREE.Vector3(-Math.sin(yaw)*4,2,-Math.cos(yaw)*4);
  42 |     expect(constrainBodySolids([mesh],previous,desired,true)).toBe(true);
  43 |     expect(desired.y,'a side face cannot add vertical displacement during grounded horizontal movement').toBe(2);
  44 |     expect(bodyPointBlocked([mesh],desired),'the same full SAT envelope still blocks penetration').toBe(false);
  45 |     const flightStart=previous.clone().setY(4),flightEnd=new THREE.Vector3(-Math.sin(yaw)*4,4,-Math.cos(yaw)*4),unobstructed=flightEnd.clone();
> 46 |     expect(constrainBodySolids([mesh],flightStart,flightEnd)).toBe(false);expect(flightEnd).toEqual(unobstructed);
     |                                                                                             ^ Error: expect(received).toEqual(expected) // deep equality
  47 |   }
  48 | });
  49 | 
```
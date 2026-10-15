import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {fitGeologicalPatch} from '../src/world/GeologicalPatch';
import {refineGeologicalFaces,type GeologicalBaseTriangle} from '../src/world/GeologicalFaceRefinement';

function strip(){
  const faces:GeologicalBaseTriangle[]=[];
  for(let x=0;x<4;x++){
    const a=new THREE.Vector3(x,0,0),b=new THREE.Vector3(x+1,0,0),c=new THREE.Vector3(x,0,1),d=new THREE.Vector3(x+1,0,1),metadata={batch:x<2?'left':'right',cell:`${x},0`,row:0};
    faces.push({base:[a,c,b],metadata},{base:[b,c,d],metadata});
  }
  return faces;
}
const resolve=(p:Readonly<THREE.Vector3>)=>new THREE.Vector3(p.x,3*Math.exp(-((p.x-1)**2+(p.z-.5)**2)),p.z);
const select=(face:GeologicalBaseTriangle)=>face.metadata.cell==='0,0';

test('curved shared boundary grows into real neighbours until its coarse edges satisfy the same limits',()=>{
  const input=strip(),snapshot=input.map(t=>t.base.map(p=>p.toArray())),fitted=fitGeologicalPatch(input,select,resolve);
  expect(fitted.stats.converged).toBe(true);expect(fitted.stats.addedFaces).toBe(4);
  expect(fitted.patch.length).toBe(6);expect(fitted.outer.length).toBe(2);
  expect(new Set([...fitted.patch,...fitted.outer]).size).toBe(input.length);
  expect(input.map(t=>t.base.map(p=>p.toArray()))).toEqual(snapshot);
  const refined=refineGeologicalFaces(fitted.patch,resolve,{protectedEdgeKeys:fitted.protectedEdgeKeys});
  expect(refined.stats.converged).toBe(true);
  expect(refined.stats.protectedLengthViolations).toBe(0);expect(refined.stats.protectedCurvatureViolations).toBe(0);
});

test('an exhausted border-growth budget preserves the coarse neighbours and reports the actual failure',()=>{
  const input=strip(),fitted=fitGeologicalPatch(input,select,resolve,0);
  expect(fitted.stats.converged).toBe(false);expect(fitted.stats.addedFaces).toBe(0);
  expect(fitted.stats.unresolvedCurvature).toBeGreaterThan(0);
  expect(fitted.patch.length+fitted.outer.length).toBe(input.length);
});

test('an already flat border stays exactly at its original scope',()=>{
  const input=strip(),fitted=fitGeologicalPatch(input,select,p=>new THREE.Vector3(p.x,p.y,p.z));
  expect(fitted.stats.converged).toBe(true);expect(fitted.stats.addedFaces).toBe(0);
  expect(fitted.patch).toEqual(input.slice(0,2));expect(fitted.outer).toEqual(input.slice(2));
});

import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {nearestStaticFaceHit} from '../src/core/StaticFaceRaycast';

test('static face acceleration matches native triangles through transforms, sidedness and ray clipping',()=>{
  const geometry=new THREE.PlaneGeometry(24,20,48,40),p=geometry.getAttribute('position');
  for(let i=0;i<p.count;i++)p.setZ(i,Math.sin(p.getX(i)*.7)*1.3+Math.cos(p.getY(i)*.4)*.9);
  const material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>(geometry,material);
  mesh.position.set(3,7,-2);mesh.rotation.set(.25,.62,-.15);mesh.scale.set(1.2,.8,1.6);mesh.updateMatrixWorld(true);
  let hits=0,misses=0;
  for(const indexed of [true,false]){
    mesh.geometry=indexed?geometry:geometry.toNonIndexed();
    for(const side of [THREE.FrontSide,THREE.BackSide,THREE.DoubleSide]){
      material.side=side;
      for(let i=0;i<150;i++){
        const local=new THREE.Vector3(Math.sin(i*1.31)*16,Math.cos(i*.93)*14,Math.sin(i*.7)*1.1).applyMatrix4(mesh.matrixWorld);
        const origin=new THREE.Vector3(3+Math.sin(i*.32)*20,7+Math.cos(i*.2)*10,i%2?24:-28),direction=local.sub(origin).normalize();
        const ray=new THREE.Raycaster(origin,direction,i%9===0?36:.2,i%7===0?20:80),native=ray.intersectObject(mesh,false)[0]?.distance??Infinity,actual=nearestStaticFaceHit(ray,[mesh]);
        if(Number.isFinite(native)){hits++;expect(actual).toBeCloseTo(native,8);}else{misses++;expect(actual).toBe(Infinity);}
      }
    }
    if(!indexed)mesh.geometry.dispose();
  }
  expect(hits).toBeGreaterThan(100);expect(misses).toBeGreaterThan(100);geometry.dispose();material.dispose();
});

test('changed static positions and restricted draw range cannot retain stale or hidden triangles',()=>{
  const geometry=new THREE.PlaneGeometry(10,10,4,4),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material),ray=new THREE.Raycaster(new THREE.Vector3(1,1,8),new THREE.Vector3(0,0,-1));mesh.updateMatrixWorld(true);
  expect(nearestStaticFaceHit(ray,[mesh])).toBeCloseTo(8,8);
  const position=geometry.getAttribute('position');for(let i=0;i<position.count;i++)position.setZ(i,2);position.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();
  expect(nearestStaticFaceHit(ray,[mesh])).toBeCloseTo(6,8);
  mesh.layers.set(1);expect(nearestStaticFaceHit(ray,[mesh])).toBe(Infinity);ray.layers.set(1);expect(nearestStaticFaceHit(ray,[mesh])).toBeCloseTo(6,8);
  geometry.setDrawRange(0,0);expect(nearestStaticFaceHit(ray,[mesh])).toBe(Infinity);geometry.dispose();material.dispose();
});

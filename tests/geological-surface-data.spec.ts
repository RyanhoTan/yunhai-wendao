import {expect,test} from '@playwright/test';
import {encodeGeologicalSurface,decodeGeologicalSurface,type GeologicalSurfaceData} from '../src/world/GeologicalSurfaceData';

test('prebuilt surfaces preserve Float64 collision vertices and actual GPU buffers bit for bit',()=>{
  const original:GeologicalSurfaceData={tiles:[{name:'GeologicalFace_test',positions:new Float64Array([-0,Math.PI,1e-100,1.000000000000001,2,3,4,5,6]),normals:new Float32Array([0,1,0,0,1,0,0,1,0]),indices:new Uint32Array([0,2,1])}],rainBounds:new Float64Array([-3,-2,-1,7,8,9]),userData:{refinement:{converged:true},triangles:1}};
  const restored=decodeGeologicalSurface(encodeGeologicalSurface(original));
  expect(restored.userData).toEqual(original.userData);expect(restored.tiles[0].name).toBe(original.tiles[0].name);
  for(const key of ['positions','normals','indices'] as const){
    const a=original.tiles[0][key],b=restored.tiles[0][key];
    expect(Buffer.from(b.buffer,b.byteOffset,b.byteLength)).toEqual(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
  }
  expect([...restored.rainBounds]).toEqual([...original.rainBounds]);expect(Object.is(restored.tiles[0].positions[0],-0)).toBe(true);
});

test('surface loader rejects truncation, trailing data and out of range indices',()=>{
  const data:GeologicalSurfaceData={tiles:[{name:'one',positions:new Float64Array(9),normals:new Float32Array(9),indices:new Uint32Array([0,1,2])}],rainBounds:new Float64Array(6),userData:{}};
  const buffer=encodeGeologicalSurface(data);
  expect(()=>decodeGeologicalSurface(buffer.slice(0,7))).toThrow();
  expect(()=>decodeGeologicalSurface(buffer.slice(0,-8))).toThrow();
  const trailing=new Uint8Array(buffer.byteLength+8);trailing.set(new Uint8Array(buffer));expect(()=>decodeGeologicalSurface(trailing.buffer)).toThrow();
  data.tiles[0].indices[2]=3;expect(()=>decodeGeologicalSurface(encodeGeologicalSurface(data))).toThrow('Geological index outside tile');
});

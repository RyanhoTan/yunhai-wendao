# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: forest-floor-material.spec.ts >> broken rock material owns only its original three maps and keeps litter disabled
- Location: tests/forest-floor-material.spec.ts:33:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 1
Received: 0
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import * as THREE from 'three';
  3  | import {createNaturalLandMaterial,createRockSurfaceMaterial} from '../src/world/NaturalLandMaterial';
  4  | 
  5  | test('a failed litter map retains loaded stone and rejects combined world readiness',async()=>{
  6  |   const original=THREE.TextureLoader.prototype.load,descriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
  7  |   const requests:{url:string;texture:THREE.Texture;ready:()=>void;fail:(error:Error)=>void}[]=[];
  8  |   Object.defineProperty(globalThis,'document',{configurable:true,value:{}});
  9  |   THREE.TextureLoader.prototype.load=function(url,onLoad,_progress,onError){
  10 |     const texture=new THREE.Texture();requests.push({url,texture,ready:()=>onLoad?.(texture),fail:error=>onError?.(error)});return texture;
  11 |   };
  12 |   let material:ReturnType<typeof createNaturalLandMaterial>|undefined;
  13 |   try{
  14 |     material=createNaturalLandMaterial();
  15 |     const shader={uniforms:THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  16 |     material.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
  17 |     expect(requests.length).toBe(6);expect(shader.uniforms.uRockReady.value).toBe(0);expect(shader.uniforms.uForestFloorEnabled.value).toBe(0);
  18 |     requests.filter(request=>request.url.includes('/rock-face/')).forEach(request=>request.ready());
  19 |     await Promise.resolve();await Promise.resolve();
  20 |     expect(shader.uniforms.uRockReady.value).toBe(1);expect(shader.uniforms.uForestFloorEnabled.value).toBe(0);
  21 |     const error=new Error('Expected forest roughness load failure');
  22 |     requests.filter(request=>request.url.includes('/forest-floor/')).forEach(request=>request.url.includes('_rough_')?request.fail(error):request.ready());
  23 |     await expect((material as typeof material&{rockAssetsReady:Promise<unknown>}).rockAssetsReady).rejects.toBe(error);
  24 |     expect(shader.uniforms.uRockReady.value).toBe(1);expect(shader.uniforms.uForestFloorEnabled.value).toBe(0);
  25 |     const owned=new Set(Object.values(material).filter(value=>value instanceof THREE.Texture));
  26 |     expect(owned.size).toBe(6);requests.forEach(request=>expect(owned.has(request.texture)).toBe(true));
  27 |   }finally{
  28 |     material?.dispose();requests.forEach(request=>request.texture.dispose());THREE.TextureLoader.prototype.load=original;
  29 |     if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else Reflect.deleteProperty(globalThis,'document');
  30 |   }
  31 | });
  32 | 
  33 | test('broken rock material owns only its original three maps and keeps litter disabled',async()=>{
  34 |   const original=THREE.TextureLoader.prototype.load,descriptor=Object.getOwnPropertyDescriptor(globalThis,'document'),textures:THREE.Texture[]=[];
  35 |   Object.defineProperty(globalThis,'document',{configurable:true,value:{}});
  36 |   THREE.TextureLoader.prototype.load=function(_url,onLoad){const texture=new THREE.Texture();textures.push(texture);queueMicrotask(()=>onLoad?.(texture));return texture;};
  37 |   let material:ReturnType<typeof createRockSurfaceMaterial>|undefined;
  38 |   try{
  39 |     material=createRockSurfaceMaterial();
  40 |     const shader={uniforms:THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  41 |     material.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
  42 |     await (material as typeof material&{rockAssetsReady:Promise<unknown>}).rockAssetsReady;
> 43 |     expect(textures.length).toBe(3);expect(shader.uniforms.uRockReady.value).toBe(1);expect(shader.uniforms.uForestFloorEnabled.value).toBe(0);
     |                                                                              ^ Error: expect(received).toBe(expected) // Object.is equality
  44 |     expect(new Set(Object.values(material).filter(value=>value instanceof THREE.Texture)).size).toBe(3);
  45 |   }finally{
  46 |     material?.dispose();textures.forEach(texture=>texture.dispose());THREE.TextureLoader.prototype.load=original;
  47 |     if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else Reflect.deleteProperty(globalThis,'document');
  48 |   }
  49 | });
  50 | 
```
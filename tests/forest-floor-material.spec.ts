import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {createNaturalLandMaterial,createRockSurfaceMaterial} from '../src/world/NaturalLandMaterial';

test('a failed litter map retains loaded stone and rejects combined world readiness',async()=>{
  const original=THREE.TextureLoader.prototype.load,descriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
  const requests:{url:string;texture:THREE.Texture;ready:()=>void;fail:(error:Error)=>void}[]=[];
  Object.defineProperty(globalThis,'document',{configurable:true,value:{}});
  THREE.TextureLoader.prototype.load=function(url,onLoad,_progress,onError){
    const texture=new THREE.Texture<HTMLImageElement>();requests.push({url,texture,ready:()=>onLoad?.(texture),fail:error=>onError?.(error)});return texture;
  };
  let material:ReturnType<typeof createNaturalLandMaterial>|undefined;
  try{
    material=createNaturalLandMaterial();
    const shader={uniforms:THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
    material.onBeforeCompile(shader as Parameters<THREE.Material['onBeforeCompile']>[0],{} as THREE.WebGLRenderer);
    expect(requests.length).toBe(6);expect(shader.uniforms.uRockReady.value).toBe(0);expect(shader.uniforms.uForestFloorEnabled.value).toBe(0);
    requests.filter(request=>request.url.includes('/rock-face/')).forEach(request=>request.ready());
    await Promise.resolve();await Promise.resolve();
    expect(shader.uniforms.uRockReady.value).toBe(1);expect(shader.uniforms.uForestFloorEnabled.value).toBe(0);
    const error=new Error('Expected forest roughness load failure');
    requests.filter(request=>request.url.includes('/forest-floor/')).forEach(request=>request.url.includes('_rough_')?request.fail(error):request.ready());
    await expect((material as typeof material&{rockAssetsReady:Promise<unknown>}).rockAssetsReady).rejects.toBe(error);
    expect(shader.uniforms.uRockReady.value).toBe(1);expect(shader.uniforms.uForestFloorEnabled.value).toBe(0);
    const owned=new Set(Object.values(material).filter(value=>value instanceof THREE.Texture));
    expect(owned.size).toBe(6);requests.forEach(request=>expect(owned.has(request.texture)).toBe(true));
  }finally{
    material?.dispose();requests.forEach(request=>request.texture.dispose());THREE.TextureLoader.prototype.load=original;
    if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else Reflect.deleteProperty(globalThis,'document');
  }
});

test('broken rock material owns only its original three maps and keeps litter disabled',async()=>{
  const original=THREE.TextureLoader.prototype.load,descriptor=Object.getOwnPropertyDescriptor(globalThis,'document'),textures:THREE.Texture[]=[];
  Object.defineProperty(globalThis,'document',{configurable:true,value:{}});
  THREE.TextureLoader.prototype.load=function(_url,onLoad){const texture=new THREE.Texture<HTMLImageElement>();textures.push(texture);queueMicrotask(()=>onLoad?.(texture));return texture;};
  let material:ReturnType<typeof createRockSurfaceMaterial>|undefined;
  try{
    material=createRockSurfaceMaterial();
    const shader={uniforms:THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
    material.onBeforeCompile(shader as Parameters<THREE.Material['onBeforeCompile']>[0],{} as THREE.WebGLRenderer);
    await (material as typeof material&{rockAssetsReady:Promise<unknown>}).rockAssetsReady;
    expect(textures.length).toBe(3);expect(shader.uniforms.uRockReady.value).toBe(1);expect(shader.uniforms.uForestFloorEnabled.value).toBe(0);
    expect(new Set(Object.values(material).filter(value=>value instanceof THREE.Texture)).size).toBe(3);
  }finally{
    material?.dispose();textures.forEach(texture=>texture.dispose());THREE.TextureLoader.prototype.load=original;
    if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else Reflect.deleteProperty(globalThis,'document');
  }
});

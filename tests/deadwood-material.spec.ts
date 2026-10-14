import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {createForestDeadwoodMaterial} from '../src/world/ForestDeadwoodMaterial';

for(const failure of [false,true])test(`deadwood bark ${failure?'load failure rejects':'readiness enables'} the world before QA`,async()=>{
  const original=THREE.TextureLoader.prototype.load,descriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
  const requests:{url:string;texture:THREE.Texture;ready:()=>void;fail:(error:Error)=>void}[]=[];
  Object.defineProperty(globalThis,'document',{configurable:true,value:{}});
  THREE.TextureLoader.prototype.load=function(url,onLoad,_progress,onError){const texture=new THREE.Texture<HTMLImageElement>();requests.push({url,texture,ready:()=>onLoad?.(texture),fail:error=>onError?.(error)});return texture;};
  let result:ReturnType<typeof createForestDeadwoodMaterial>|undefined;
  try{
    result=createForestDeadwoodMaterial();const {material,depth}=result;
    const shader={uniforms:THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
    material.onBeforeCompile(shader as Parameters<THREE.Material['onBeforeCompile']>[0],{} as THREE.WebGLRenderer);
    expect(requests.length).toBe(3);expect(requests.every(request=>request.url.includes('/deadwood-bark/'))).toBe(true);
    expect(shader.uniforms.uDeadwoodBarkEnabled.value).toBe(0);
    const error=new Error('Expected bark normal map failure');
    for(const request of requests)if(failure&&request.url.includes('_nor_gl_'))request.fail(error);else request.ready();
    const promise=(material as typeof material&{rockAssetsReady:Promise<unknown>}).rockAssetsReady;
    if(failure){await expect(promise).rejects.toBe(error);expect(shader.uniforms.uDeadwoodBarkEnabled.value).toBe(0);}
    else{await promise;expect(shader.uniforms.uDeadwoodBarkEnabled.value).toBe(1);}
    const textures=new Set(Object.values(material).filter(value=>value instanceof THREE.Texture));
    requests.forEach(request=>expect(textures.has(request.texture),'world disposal owns every bark map').toBe(true));
    expect(Object.values(depth).filter(value=>value instanceof THREE.Texture).length,'depth shares only the field, without extra bark maps').toBe(1);
  }finally{
    const textures=new Set<THREE.Texture>();if(result)for(const material of [result.material,result.depth]){Object.values(material).forEach(value=>{if(value instanceof THREE.Texture)textures.add(value);});material.dispose();}textures.forEach(texture=>texture.dispose());
    THREE.TextureLoader.prototype.load=original;if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else Reflect.deleteProperty(globalThis,'document');
  }
});

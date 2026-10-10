import {expect,test} from '@playwright/test';
import * as THREE from 'three';
import {mkdir,writeFile} from 'node:fs/promises';
import {createNaturalForest} from '../src/world/NaturalForest';
import {createLimestoneOutcrops} from '../src/world/LimestoneOutcrops';
import {terrainSurfaceHeight,terrainHeight,protectedPoint} from '../src/world/World';
import {FOREST_APPROACH,MOUNTAIN_CIRCUIT,SECT_ASCENT,WEST_VALLEY_ROUTE} from '../src/world/WorldLayout';

test('far canopy switches without duplicate cells and limestone leaves the complete road corridor clear',async()=>{
  const root=new THREE.Group(),forest=createNaturalForest(root,terrainSurfaceHeight,protectedPoint);
  const outcrops=createLimestoneOutcrops(root,terrainSurfaceHeight,protectedPoint,forest.colliders);
  root.updateMatrixWorld(true);
  const woodland=root.getObjectByName('OriginalNaturalWoodland')!,cells=woodland.children.filter(o=>o.name.startsWith('OriginalWoodlandCell')) as THREE.LOD[];
  const batches=woodland.children.filter(o=>o.name.startsWith('OriginalDistantForest')) as THREE.Mesh[];
  expect(batches.length).toBeGreaterThan(4);expect(batches.length).toBeLessThan(cells.length/5);
  const mask=(batches[0].material as THREE.Material&{forestCellsTexture:THREE.DataTexture}).forestCellsTexture;
  const maskData=mask.image.data!;
  expect(mask.image.width).toBe(cells.length);
  const camera=new THREE.PerspectiveCamera(),frame={info:{render:{frame:0}}} as THREE.WebGLRenderer;
  let visibleNear=0,visibleFar=0;
  for(const distance of [2,90,850,1500,850,78,2]){
    camera.position.copy(cells[0].position).x+=distance;camera.updateMatrixWorld(true);
    cells.forEach(cell=>cell.update(camera));frame.info.render.frame++;
    batches[0].onBeforeRender(frame,new THREE.Scene(),camera,batches[0].geometry,batches[0].material as THREE.Material,new THREE.Group());
    cells.forEach((cell,i)=>expect(maskData[i],`camera ${distance}m cell ${i}`).toBe(cell.getCurrentLevel()===2?255:0));
    visibleNear+=cells.filter(cell=>cell.getCurrentLevel()===0).length;visibleFar+=Array.from(maskData).filter(v=>v===255).length;
  }
  expect(visibleNear).toBeGreaterThan(0);expect(visibleFar).toBeGreaterThan(0);
  let invalidBounds=0,invalidIds=0;
  for(const mesh of batches){
    const p=mesh.geometry.getAttribute('position'),ids=mesh.geometry.getAttribute('forestCellId');
    expect(ids.count).toBe(p.count);expect(p.count).toBeGreaterThan(0);
    const vertex=new THREE.Vector3();
    for(let i=0;i<p.count;i+=19){if(ids.getX(i)>=cells.length)invalidIds++;if(!mesh.geometry.boundingBox!.containsPoint(vertex.fromBufferAttribute(p,i)))invalidBounds++;}
  }
  expect(invalidIds).toBe(0);expect(invalidBounds).toBe(0);
  let roadSamples=0,blockedSamples=0;
  const body=new THREE.Box3();
  for(const route of [SECT_ASCENT,FOREST_APPROACH,MOUNTAIN_CIRCUIT,WEST_VALLEY_ROUTE])for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],length=Math.hypot(b.x-a.x,b.z-a.z),n=Math.ceil(length/.2);
    for(let j=0;j<=n;j++)for(const offset of [-4,-2,0,2,4]){
      const x=a.x+(b.x-a.x)*j/n-(b.z-a.z)/length*offset,z=a.z+(b.z-a.z)*j/n+(b.x-a.x)/length*offset,y=terrainHeight(x,z);
      body.min.set(x-.55,y,z-.55);body.max.set(x+.55,y+1.8,z+.55);
      if(outcrops.walls.some(w=>w.intersectsBox(body)))blockedSamples++;roadSamples++;
    }
  }
  expect(blockedSamples,'limestone leaves all five parallel walking lanes clear').toBe(0);
  const data=root.getObjectByName('OriginalLimestoneOutcrops')!.userData;
  expect(data.count).toBeGreaterThan(100);expect(data.cliffRibs).toBeGreaterThan(20);
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o.customDepthMaterial)materials.add(o.customDepthMaterial);}});
  for(const material of materials)for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);
  expect(textures.has(mask),'shader mask remains owned by a material for world teardown').toBe(true);
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
  await mkdir('artifacts/landscape-laas-20261010/regression-polish',{recursive:true});
  await writeFile('artifacts/landscape-laas-20261010/regression-polish/geometry.json',JSON.stringify({cells:cells.length,distantBatches:batches.length,roadSamples,outcrops:data.count,cliffRibs:data.cliffRibs,visibleNear,visibleFar},null,2));
});

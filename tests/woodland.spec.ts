import {expect,test} from '@playwright/test';
import * as THREE from 'three';
import {mkdir,writeFile} from 'node:fs/promises';
import {createNaturalForest} from '../src/world/NaturalForest';
import {FOREST_GROVES,woodlandCover} from '../src/world/ForestLayout';
import {protectedPoint,terrainHeight} from '../src/world/World';
import {createWoodlandTree,type WoodlandDetail} from '../src/world/WoodlandGeometry';
import {WORLD_LIMITS} from '../src/world/WorldLayout';

// Discrete frames avoid continuous screencast pressure on the shared workstation.
test.use({video:'off'});
const stage=process.env.WOODLAND_VALIDATION_STAGE??`forest-validation-${Date.now()}`;
if(!/^[a-z0-9-]+$/.test(stage))throw new Error('Invalid woodland evidence stage');
const evidenceRoot=`artifacts/laas-quality-20261012/${stage}`;

test('dense woodland and grass cover keep roads, water and tree foundations clear',async()=>{
  const root=new THREE.Group(),forest=createNaturalForest(root,terrainHeight,protectedPoint),woodland=root.getObjectByName('OriginalNaturalWoodland')!;
  const trees=woodland.userData.treePlacements as {x:number;z:number;y:number;groundY:number;radius:number;grove:number}[];
  expect(trees.length).toBeGreaterThan(1000);expect(trees.length).toBeLessThanOrEqual(1450);
  expect(trees.filter(t=>t.x<-300).length,'western canopy remains populated').toBeGreaterThan(240);
  let wooded=0,samples=0;
  for(let z=WORLD_LIMITS.minZ;z<126;z+=6)for(let x=WORLD_LIMITS.minX;x<WORLD_LIMITS.maxX;x+=6){samples++;if(woodlandCover(x,z)>.17)wooded++;}
  expect(wooded/samples,'canopy connects the former sparse islands').toBeGreaterThan(.30);
  expect(wooded/samples,'clear valleys and mountains remain between the woods').toBeLessThan(.58);
  expect(woodland.userData.meadowCount,'grass coverage replaces the sparse meadow tufts').toBeGreaterThan(15000);
  expect(woodland.userData.grassSiteCoverage,'most eligible grass sites have physical blades').toBeGreaterThan(.58);
  expect(woodland.userData.grassSiteCoverage,'under-canopy gaps remain for litter and ferns').toBeLessThan(.90);
  for(const tree of trees){
    expect(woodlandCover(tree.x,tree.z)).toBeGreaterThan(.16);expect(protectedPoint(tree.x,tree.z,tree.radius+.6)).toBe(false);
    expect(tree.y-tree.groundY,'trunks sink slightly into their sloped foundation').toBeLessThanOrEqual(.03);expect(tree.y-tree.groundY).toBeGreaterThan(-.75);
    expect(forest.colliders.some(c=>Math.hypot(c.x-tree.x,c.z-tree.z)<.01&&c.r>=tree.radius-.01)).toBe(true);
  }
  let minimumSpacing=Infinity;
  for(let i=0;i<trees.length;i++)for(let j=i+1;j<trees.length;j++)minimumSpacing=Math.min(minimumSpacing,Math.hypot(trees[i].x-trees[j].x,trees[i].z-trees[j].z));
  expect(minimumSpacing).toBeGreaterThanOrEqual(5.79);
  expect(woodland.userData.groveCounts.filter((n:number)=>n>0).length).toBe(FOREST_GROVES.length);
  root.updateMatrixWorld(true);
  const camera=new THREE.PerspectiveCamera();
  for(const tree of trees){
    const cell=root.getObjectByName(`OriginalWoodlandCell_${Math.floor(tree.x/24)*24+12}_${Math.floor(tree.z/24)*24+12}`) as THREE.LOD;
    camera.position.set(tree.x+2,tree.groundY+2,tree.z);camera.updateMatrixWorld();cell.update(camera);
    expect(cell.getCurrentLevel(),'a tree two metres away retains its detailed crown and leaf shadows').toBe(0);
  }
  let litterMin=Infinity,litterMax=-Infinity;const vertex=new THREE.Vector3();
  root.traverse(o=>{if(o instanceof THREE.Mesh&&o.name.includes('_LitterLOD0')){
    const p=o.geometry.getAttribute('position');for(let i=0;i<p.count;i++){vertex.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);const gap=vertex.y-terrainHeight(vertex.x,vertex.z);litterMin=Math.min(litterMin,gap);litterMax=Math.max(litterMax,gap);}
  }});
  expect(litterMin,'fallen leaves remain above the rendered ground').toBeGreaterThan(0);expect(litterMax,'curling leaves stay within six centimetres of the slope').toBeLessThan(.06);
  let grassRootMax=-Infinity,grassRootMin=Infinity,grassRootsChecked=0,nearGrassLodErrors=0;
  const transform=new THREE.Matrix4(),worldTransform=new THREE.Matrix4();
  root.traverse(o=>{if(o instanceof THREE.InstancedMesh&&(o.name.endsWith('_GrassLOD0')||o.name.endsWith('BladesLOD0'))){
    const p=o.geometry.getAttribute('position'),wind=o.geometry.getAttribute('woodlandWind');
    for(let instance=0;instance<o.count;instance+=7){
      o.getMatrixAt(instance,transform);worldTransform.multiplyMatrices(o.matrixWorld,transform);
      vertex.setFromMatrixPosition(worldTransform);camera.position.copy(vertex).y+=2;camera.updateMatrixWorld();
      const lod=o.parent!;if(lod instanceof THREE.LOD){lod.update(camera);if(lod.getCurrentLevel()!==0)nearGrassLodErrors++;}
      for(let i=0;i<p.count;i++)if(wind.getX(i)===0){
        vertex.fromBufferAttribute(p,i).applyMatrix4(worldTransform);const gap=vertex.y-terrainHeight(vertex.x,vertex.z);
        grassRootMax=Math.max(grassRootMax,gap);grassRootMin=Math.min(grassRootMin,gap);grassRootsChecked++;
      }
    }
  }});
  expect(grassRootsChecked).toBeGreaterThan(100000);
  expect(grassRootMax,'blade roots touch the actual heightfield across slope seams').toBeLessThan(.012);
  expect(nearGrassLodErrors,'grass next to the camera retains full geometry on steep cells').toBe(0);
  const triangleCounts=[0,1,2].map(detail=>{const p=createWoodlandTree(0,1289,detail as WoodlandDetail),triangles=(p.wood.index!.count+p.leaves.index!.count)/3;p.wood.dispose();p.leaves.dispose();return triangles;});
  await mkdir(evidenceRoot,{recursive:true});
  await writeFile(`${evidenceRoot}/vegetation-metrics.json`,JSON.stringify({trees:trees.length,groveCounts:woodland.userData.groveCounts,groundCover:woodland.userData.groundCover,eligibleGrassSites:woodland.userData.eligibleGrassSites,grassSiteCoverage:woodland.userData.grassSiteCoverage,woodedAreaFraction:wooded/samples,minimumSpacing,litterGap:{min:litterMin,max:litterMax},grassRootGap:{min:grassRootMin,max:grassRootMax,samples:grassRootsChecked},treeCellSize:24,meadowCellSize:32,nearMidFarTriangles:triangleCounts},null,2));
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);materials.add(o.material as THREE.Material);if(o.customDepthMaterial)materials.add(o.customDepthMaterial);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
});

test('real controls walk through woodland and fly above its open surroundings',async({page})=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('woodland-grove'));
  await mkdir(`${evidenceRoot}/woodland-motion-frames`,{recursive:true});
  const frames:string[]=[];const frame=async()=>{const path=`${evidenceRoot}/woodland-motion-frames/${String(frames.length).padStart(2,'0')}.png`;await page.screenshot({path});frames.push(path);};
  await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.elapsed),{timeout:30000}).toBeGreaterThan(1);
  const before=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position);
  await frame();
  await page.keyboard.down('KeyW');
  await expect.poll(()=>page.evaluate(p=>{const q=window.__THREE_GAME_DIAGNOSTICS__!.player.position;return Math.hypot(q.x-p.x,q.z-p.z);},before),{timeout:15000}).toBeGreaterThan(8);
  await page.keyboard.up('KeyW');await page.waitForTimeout(250);
  await frame();
  const after=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position);
  expect(Math.hypot(after.x-before.x,after.z-before.z)).toBeGreaterThan(4);
  expect(Math.abs(after.y-terrainHeight(after.x,after.z))).toBeLessThan(.18);
  await page.mouse.move(650,350);await page.mouse.down({button:'right'});await page.mouse.move(900,390,{steps:15});await page.mouse.up({button:'right'});
  await page.screenshot({path:`${evidenceRoot}/woodland-real-walk.png`});
  await frame();
  await page.keyboard.press('KeyF');await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.flying)).toBe(true);
  await page.keyboard.down('Space');await page.keyboard.down('KeyW');
  const perf=await page.evaluate(()=>new Promise(resolve=>{const start=performance.now();let frames=0;const tick=()=>{frames++;const duration=performance.now()-start;if(duration<2200)requestAnimationFrame(tick);else resolve({durationMs:duration,frames,fps:frames*1000/duration,diagnostics:window.__THREE_GAME_DIAGNOSTICS__});};requestAnimationFrame(tick);}));
  await page.keyboard.up('Space');await page.keyboard.up('KeyW');await page.screenshot({path:`${evidenceRoot}/woodland-real-flight.png`});
  await frame();
  await page.keyboard.down('KeyW');for(let i=0;i<8;i++){await page.waitForTimeout(140);await frame();}await page.keyboard.up('KeyW');
  const d=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);expect(d.player.position.y-terrainHeight(d.player.position.x,d.player.position.z)).toBeGreaterThan(12);expect(d.health).toBe(130);
  const gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas')!.getContext('webgl2')!,ext=gl.getExtension('WEBGL_debug_renderer_info')!;return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;});
  await writeFile(`${evidenceRoot}/woodland-input-metrics.json`,JSON.stringify({gpu,performanceValid:!/swiftshader|software|llvmpipe/i.test(gpu),before,after,perf,frames,errors},null,2));expect(errors).toEqual([]);
});

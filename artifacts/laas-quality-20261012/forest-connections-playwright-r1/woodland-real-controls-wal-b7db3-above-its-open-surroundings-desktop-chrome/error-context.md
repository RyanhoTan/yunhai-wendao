# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: woodland.spec.ts >> real controls walk through woodland and fly above its open surroundings
- Location: tests/woodland.spec.ts:76:1

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 8
Received:   7.143079925535355

Call Log:
- Timeout 15000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic "云海问道游戏场景" [ref=e3]
  - generic:
    - generic:
      - region "角色状态":
        - generic:
          - img
          - generic: 圆
        - generic:
          - generic:
            - strong: 练气圆满
            - generic: 云岚弟子
          - generic:
            - generic: 气血
            - generic: 130 / 130
          - generic:
            - generic: 灵气
            - generic: 120 / 120
          - generic:
            - generic: 修为 0 / 250
      - region "当前目标":
        - generic: 第一章 · 云岚初境
        - heading "唤醒灵脉" [level=2]
        - paragraph: 开启三座阵眼 0/3 · M 查看地图
        - button "修行札记 J" [ref=e4] [cursor=pointer]:
          - text: 修行札记
          - generic [ref=e5]: J
      - region "地图与菜单":
        - generic:
          - generic: 北
          - generic "当前位置小地图"
          - button "打开云岚山地图，M 键" [ref=e6] [cursor=pointer]
        - generic: 望月台 · 镇山古道
        - generic:
          - img
          - generic: "0"
          - generic: 灵石
        - navigation:
          - button "天气调试，P 键" [ref=e7] [cursor=pointer]: ☁
          - button "地图，M 键" [ref=e8] [cursor=pointer]:
            - img [ref=e9]
          - button "札记，J 键" [ref=e11] [cursor=pointer]:
            - img [ref=e12]
          - button "背包，I 键" [ref=e14] [cursor=pointer]:
            - img [ref=e15]
          - button "暂停，Esc 键" [ref=e17] [cursor=pointer]:
            - img [ref=e18]
        - button "角色选择，K 键" [ref=e20] [cursor=pointer]:
          - text: 角色
          - generic [ref=e21]: K
      - generic "五行选择":
        - button "1 金" [pressed] [ref=e22] [cursor=pointer]:
          - generic [ref=e23]: "1"
          - text: 金
        - button "2 木" [ref=e24] [cursor=pointer]:
          - generic [ref=e25]: "2"
          - text: 木
        - button "3 水" [ref=e26] [cursor=pointer]:
          - generic [ref=e27]: "3"
          - text: 水
        - button "4 火" [ref=e28] [cursor=pointer]:
          - generic [ref=e29]: "4"
          - text: 火
        - button "5 土" [ref=e30] [cursor=pointer]:
          - generic [ref=e31]: "5"
          - text: 土
        - generic: 金 · 飞剑
        - button "Z 护盾" [ref=e32] [cursor=pointer]:
          - generic [ref=e33]: Z
          - generic [ref=e34]: 护盾
      - generic "动作快捷键":
        - generic:
          - generic:
            - img
          - generic:
            - generic: 剑斩
            - generic: 左键
        - generic:
          - generic:
            - img
          - generic:
            - generic: 御雷
            - generic: Q
        - generic:
          - generic:
            - img
          - generic:
            - generic: 五行诀
            - generic: T
        - generic:
          - generic:
            - img
          - generic:
            - generic: 归墟
            - generic: G
        - generic:
          - generic:
            - img
          - generic:
            - generic: 灵压
            - generic: V
        - generic:
          - generic:
            - img
          - generic:
            - generic: 闪避
            - generic: Shift
        - generic:
          - generic:
            - img
          - generic:
            - generic: 御剑
            - generic: F
        - generic:
          - generic:
            - img
          - generic:
            - generic: 突破
            - generic: B
        - generic:
          - generic:
            - img
          - generic:
            - generic: 服丹
            - generic: H
          - generic: "2"
      - generic: W A S D 移动 · 右键拖动视角 · 滚轮远近
```

# Test source

```ts
  1   | import {expect,test} from '@playwright/test';
  2   | import * as THREE from 'three';
  3   | import {mkdir,writeFile} from 'node:fs/promises';
  4   | import {createNaturalForest} from '../src/world/NaturalForest';
  5   | import {FOREST_GROVES,woodlandCover} from '../src/world/ForestLayout';
  6   | import {FOREST_CONNECTIONS} from '../src/world/ForestHabitat';
  7   | import {protectedPoint,terrainHeight} from '../src/world/World';
  8   | import {createWoodlandTree,type WoodlandDetail} from '../src/world/WoodlandGeometry';
  9   | import {WORLD_LIMITS} from '../src/world/WorldLayout';
  10  | 
  11  | // Discrete frames avoid continuous screencast pressure on the shared workstation.
  12  | test.use({video:'off'});
  13  | const stage=process.env.WOODLAND_VALIDATION_STAGE??`forest-validation-${Date.now()}`;
  14  | if(!/^[a-z0-9-]+$/.test(stage))throw new Error('Invalid woodland evidence stage');
  15  | const evidenceRoot=`artifacts/laas-quality-20261012/${stage}`;
  16  | 
  17  | test('dense woodland and grass cover keep roads, water and tree foundations clear',async()=>{
  18  |   const root=new THREE.Group(),forest=createNaturalForest(root,terrainHeight,protectedPoint),woodland=root.getObjectByName('OriginalNaturalWoodland')!;
  19  |   const trees=woodland.userData.treePlacements as {x:number;z:number;y:number;groundY:number;radius:number;grove:number}[];
  20  |   expect(trees.length).toBeGreaterThan(1000);expect(woodland.userData.legacyTreeCount).toBeLessThanOrEqual(1450);
  21  |   expect(trees.length).toBeLessThanOrEqual(1450+FOREST_CONNECTIONS.reduce((sum,band)=>sum+band.limit,0));
  22  |   expect(trees.filter(t=>t.x<-300).length,'western canopy remains populated').toBeGreaterThan(240);
  23  |   let wooded=0,samples=0;
  24  |   for(let z=WORLD_LIMITS.minZ;z<126;z+=6)for(let x=WORLD_LIMITS.minX;x<WORLD_LIMITS.maxX;x+=6){samples++;if(woodlandCover(x,z)>.17)wooded++;}
  25  |   expect(wooded/samples,'woodland habitat mask retains a substantial forest envelope; this does not measure visible canopy continuity').toBeGreaterThan(.30);
  26  |   expect(wooded/samples,'clear valleys and mountains remain between the woods').toBeLessThan(.58);
  27  |   expect(woodland.userData.meadowCount,'grass coverage replaces the sparse meadow tufts').toBeGreaterThan(15000);
  28  |   expect(woodland.userData.grassSiteCoverage,'most eligible grass sites have physical blades').toBeGreaterThan(.58);
  29  |   expect(woodland.userData.grassSiteCoverage,'under-canopy gaps remain for litter and ferns').toBeLessThan(.90);
  30  |   for(const tree of trees){
  31  |     expect(woodlandCover(tree.x,tree.z)).toBeGreaterThan(.16);expect(protectedPoint(tree.x,tree.z,tree.radius+.6)).toBe(false);
  32  |     expect(tree.y-tree.groundY,'trunks sink slightly into their sloped foundation').toBeLessThanOrEqual(.03);expect(tree.y-tree.groundY).toBeGreaterThan(-.75);
  33  |     expect(forest.colliders.some(c=>Math.hypot(c.x-tree.x,c.z-tree.z)<.01&&c.r>=tree.radius-.01)).toBe(true);
  34  |   }
  35  |   let minimumSpacing=Infinity;
  36  |   for(let i=0;i<trees.length;i++)for(let j=i+1;j<trees.length;j++)minimumSpacing=Math.min(minimumSpacing,Math.hypot(trees[i].x-trees[j].x,trees[i].z-trees[j].z));
  37  |   expect(minimumSpacing).toBeGreaterThanOrEqual(5.79);
  38  |   expect(woodland.userData.groveCounts.filter((n:number)=>n>0).length).toBe(FOREST_GROVES.length+FOREST_CONNECTIONS.length);
  39  |   expect(woodland.userData.habitatStats.reduce((n:number,band:{accepted:number})=>n+band.accepted,woodland.userData.legacyTreeCount)).toBe(trees.length);
  40  |   root.updateMatrixWorld(true);
  41  |   const camera=new THREE.PerspectiveCamera();
  42  |   for(const tree of trees){
  43  |     const cell=root.getObjectByName(`OriginalWoodlandCell_${Math.floor(tree.x/24)*24+12}_${Math.floor(tree.z/24)*24+12}`) as THREE.LOD;
  44  |     camera.position.set(tree.x+2,tree.groundY+2,tree.z);camera.updateMatrixWorld();cell.update(camera);
  45  |     expect(cell.getCurrentLevel(),'a tree two metres away retains its detailed crown and leaf shadows').toBe(0);
  46  |   }
  47  |   let litterMin=Infinity,litterMax=-Infinity;const vertex=new THREE.Vector3();
  48  |   root.traverse(o=>{if(o instanceof THREE.Mesh&&o.name.includes('_LitterLOD0')){
  49  |     const p=o.geometry.getAttribute('position');for(let i=0;i<p.count;i++){vertex.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);const gap=vertex.y-terrainHeight(vertex.x,vertex.z);litterMin=Math.min(litterMin,gap);litterMax=Math.max(litterMax,gap);}
  50  |   }});
  51  |   expect(litterMin,'fallen leaves remain above the rendered ground').toBeGreaterThan(0);expect(litterMax,'curling leaves stay within six centimetres of the slope').toBeLessThan(.06);
  52  |   let grassRootMax=-Infinity,grassRootMin=Infinity,grassRootsChecked=0,nearGrassLodErrors=0;
  53  |   const transform=new THREE.Matrix4(),worldTransform=new THREE.Matrix4();
  54  |   root.traverse(o=>{if(o instanceof THREE.InstancedMesh&&(o.name.endsWith('_GrassLOD0')||o.name.endsWith('BladesLOD0'))){
  55  |     const p=o.geometry.getAttribute('position'),wind=o.geometry.getAttribute('woodlandWind');
  56  |     for(let instance=0;instance<o.count;instance+=7){
  57  |       o.getMatrixAt(instance,transform);worldTransform.multiplyMatrices(o.matrixWorld,transform);
  58  |       vertex.setFromMatrixPosition(worldTransform);camera.position.copy(vertex).y+=2;camera.updateMatrixWorld();
  59  |       const lod=o.parent!;if(lod instanceof THREE.LOD){lod.update(camera);if(lod.getCurrentLevel()!==0)nearGrassLodErrors++;}
  60  |       for(let i=0;i<p.count;i++)if(wind.getX(i)===0){
  61  |         vertex.fromBufferAttribute(p,i).applyMatrix4(worldTransform);const gap=vertex.y-terrainHeight(vertex.x,vertex.z);
  62  |         grassRootMax=Math.max(grassRootMax,gap);grassRootMin=Math.min(grassRootMin,gap);grassRootsChecked++;
  63  |       }
  64  |     }
  65  |   }});
  66  |   expect(grassRootsChecked).toBeGreaterThan(100000);
  67  |   expect(grassRootMax,'blade roots touch the actual heightfield across slope seams').toBeLessThan(.012);
  68  |   expect(nearGrassLodErrors,'grass next to the camera retains full geometry on steep cells').toBe(0);
  69  |   const triangleCounts=[0,1,2].map(detail=>{const p=createWoodlandTree(0,1289,detail as WoodlandDetail),triangles=(p.wood.index!.count+p.leaves.index!.count)/3;p.wood.dispose();p.leaves.dispose();return triangles;});
  70  |   await mkdir(evidenceRoot,{recursive:true});
  71  |   await writeFile(`${evidenceRoot}/vegetation-metrics.json`,JSON.stringify({trees:trees.length,groveCounts:woodland.userData.groveCounts,groundCover:woodland.userData.groundCover,eligibleGrassSites:woodland.userData.eligibleGrassSites,grassSiteCoverage:woodland.userData.grassSiteCoverage,woodedAreaFraction:wooded/samples,minimumSpacing,litterGap:{min:litterMin,max:litterMax},grassRootGap:{min:grassRootMin,max:grassRootMax,samples:grassRootsChecked},treeCellSize:24,meadowCellSize:32,nearMidFarTriangles:triangleCounts},null,2));
  72  |   const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  73  |   root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);materials.add(o.material as THREE.Material);if(o.customDepthMaterial)materials.add(o.customDepthMaterial);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  74  | });
  75  | 
  76  | test('real controls walk through woodland and fly above its open surroundings',async({page})=>{
  77  |   test.setTimeout(120000);
  78  |   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  79  |   await page.goto('/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('woodland-grove'));
  80  |   await mkdir(`${evidenceRoot}/woodland-motion-frames`,{recursive:true});
  81  |   const frames:string[]=[];const frame=async()=>{const path=`${evidenceRoot}/woodland-motion-frames/${String(frames.length).padStart(2,'0')}.png`;await page.screenshot({path});frames.push(path);};
  82  |   await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.elapsed),{timeout:30000}).toBeGreaterThan(1);
  83  |   const before=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position);
  84  |   await frame();
  85  |   await page.keyboard.down('KeyW');
> 86  |   await expect.poll(()=>page.evaluate(p=>{const q=window.__THREE_GAME_DIAGNOSTICS__!.player.position;return Math.hypot(q.x-p.x,q.z-p.z);},before),{timeout:15000}).toBeGreaterThan(8);
      |                                                                                                                                                                    ^ Error: expect(received).toBeGreaterThan(expected)
  87  |   await page.keyboard.up('KeyW');await page.waitForTimeout(250);
  88  |   await frame();
  89  |   const after=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position);
  90  |   expect(Math.hypot(after.x-before.x,after.z-before.z)).toBeGreaterThan(4);
  91  |   expect(Math.abs(after.y-terrainHeight(after.x,after.z))).toBeLessThan(.18);
  92  |   await page.mouse.move(650,350);await page.mouse.down({button:'right'});await page.mouse.move(900,390,{steps:15});await page.mouse.up({button:'right'});
  93  |   await page.screenshot({path:`${evidenceRoot}/woodland-real-walk.png`});
  94  |   await frame();
  95  |   await page.keyboard.press('KeyF');await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.flying)).toBe(true);
  96  |   await page.keyboard.down('Space');await page.keyboard.down('KeyW');
  97  |   const perf=await page.evaluate(()=>new Promise(resolve=>{const start=performance.now();let frames=0;const tick=()=>{frames++;const duration=performance.now()-start;if(duration<2200)requestAnimationFrame(tick);else resolve({durationMs:duration,frames,fps:frames*1000/duration,diagnostics:window.__THREE_GAME_DIAGNOSTICS__});};requestAnimationFrame(tick);}));
  98  |   await page.keyboard.up('Space');await page.keyboard.up('KeyW');await page.screenshot({path:`${evidenceRoot}/woodland-real-flight.png`});
  99  |   await frame();
  100 |   await page.keyboard.down('KeyW');for(let i=0;i<8;i++){await page.waitForTimeout(140);await frame();}await page.keyboard.up('KeyW');
  101 |   const d=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);expect(d.player.position.y-terrainHeight(d.player.position.x,d.player.position.z)).toBeGreaterThan(12);expect(d.health).toBe(130);
  102 |   const gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas')!.getContext('webgl2')!,ext=gl.getExtension('WEBGL_debug_renderer_info')!;return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;});
  103 |   await writeFile(`${evidenceRoot}/woodland-input-metrics.json`,JSON.stringify({gpu,performanceValid:!/swiftshader|software|llvmpipe/i.test(gpu),before,after,perf,frames,errors},null,2));expect(errors).toEqual([]);
  104 | });
  105 | 
```
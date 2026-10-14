# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: deadwood-runtime.spec.ts >> actual constructed deadwood stays grounded, leaves full roads clear and stops real walking at each form
- Location: tests/deadwood-runtime.spec.ts:9:1

# Error details

```
Error: walking into the solid wood stops at contact

expect(received).toBeLessThan(expected)

Expected: < 0.1
Received:   0.10795605507919959
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - main [ref=e2]:
    - generic "云海问道游戏场景" [active] [ref=e3]
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
        - generic: 松风林
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
  1  | import {test,expect} from '@playwright/test';
  2  | import * as THREE from 'three';
  3  | import {mkdir,readFile,writeFile} from 'node:fs/promises';
  4  | import {createHash} from 'node:crypto';
  5  | import {bodyPointBlocked,bodyCollisionMesh} from '../src/core/StaticBodyCollision';
  6  | import {terrainHeight} from '../src/world/World';
  7  | import {SECT_ASCENT,FOREST_APPROACH,MOUNTAIN_CIRCUIT,WEST_VALLEY_ROUTE} from '../src/world/WorldLayout';
  8  | 
  9  | test('actual constructed deadwood stays grounded, leaves full roads clear and stops real walking at each form',async({page})=>{
  10 |   test.setTimeout(180000);
  11 |   const stage=process.env.DEADWOOD_RUNTIME_STAGE??`deadwood-runtime-${Date.now()}`;
  12 |   if(!/^deadwood-runtime-[a-z0-9-]+$/.test(stage))throw new Error('Invalid deadwood stage');
  13 |   const out=`artifacts/laas-quality-20261012/${stage}`;await mkdir(out,{recursive:false});
  14 |   const files=['src/world/ForestDeadwood.ts','src/world/ForestDeadwoodGeometry.ts','src/world/ForestDeadwoodMaterial.ts','src/world/World.ts','src/world/NaturalForest.ts','src/core/StaticBodyCollision.ts','src/game/Game.ts','src/main.ts','src/vite-env.d.ts','tests/deadwood-runtime.spec.ts'];
  15 |   const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
  16 |   const errors:string[]=[],report:Record<string,unknown>={complete:false,sourceHashes:await hashes(),scope:'Actual constructed placement/contact/collision data, full eight-metre routes, ordinary close cameras and real W contact per form. Does not establish all-world free exploration or motion AA.'};
  17 |   const save=()=>writeFile(`${out}/status.json`,JSON.stringify({...report,errors},null,2)+'\n');await save();
  18 |   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  19 |   try{
  20 |     await page.goto('/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('quality-floor-noon'));
  21 |     const snapshot=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.inspectDecomposition(true));
  22 |     expect(snapshot.placements.length).toBeGreaterThan(10);
  23 |     for(const form of [0,1,2])expect(snapshot.placements.filter(piece=>piece.form===form).length).toBeGreaterThan(0);
  24 |     const meshes=Array.from(new Set(snapshot.solids.map(s=>s.seed)),seed=>bodyCollisionMesh(snapshot.solids.filter(s=>s.seed===seed).map(s=>({bounds:new THREE.Box3(new THREE.Vector3().fromArray(s.bounds[0]),new THREE.Vector3().fromArray(s.bounds[1])),axes:s.axes}))));
  25 |     let contacts=0,maxGap=-Infinity,minGap=Infinity;
  26 |     for(const piece of snapshot.placements){expect(piece.contacts.length).toBeGreaterThan(0);for(const p of piece.contacts){expect(p.every(Number.isFinite)).toBe(true);const gap=p[1]-terrainHeight(p[0],p[2]);maxGap=Math.max(maxGap,gap);minGap=Math.min(minGap,gap);contacts++;}}
  27 |     expect(contacts).toBeGreaterThan(snapshot.placements.length);expect(maxGap).toBeLessThan(.003);expect(minGap).toBeGreaterThan(-.171);
  28 |     let roadSamples=0,blocked=0;
  29 |     for(const route of [SECT_ASCENT,FOREST_APPROACH,MOUNTAIN_CIRCUIT,WEST_VALLEY_ROUTE])for(let i=1;i<route.length;i++){
  30 |       const a=route[i-1],b=route[i],length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length/.2);
  31 |       for(let j=0;j<=steps;j++)for(const offset of [-4,-2,0,2,4]){
  32 |         const x=a.x+(b.x-a.x)*j/steps-(b.z-a.z)/length*offset,z=a.z+(b.z-a.z)*j/steps+(b.x-a.x)/length*offset;
  33 |         if(bodyPointBlocked(meshes,new THREE.Vector3(x,terrainHeight(x,z),z)))blocked++;roadSamples++;
  34 |       }
  35 |     }
  36 |     report.geometry={snapshot,contacts,minGap,maxGap,roadSamples,blocked};await save();expect(blocked).toBe(0);
  37 |     const forms=[];
  38 |     for(const form of [0,1,2]){
  39 |       const ack=await page.evaluate(f=>window.__THREE_GAME_TEST_HOOKS__!.setState(`deadwood-${f}-noon`),form);
  40 |       const piece=snapshot.placements.find(p=>p.seed===ack.decompositionSeed)!;expect(piece?.form).toBe(form);
  41 |       await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setReducedMotion(false));
  42 |       const start=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);await page.screenshot({path:`${out}/form-${form}-before.png`});
  43 |       const samples=[];await page.keyboard.down('KeyW');
  44 |       try{for(let i=0;i<12;i++){await page.waitForTimeout(150);const d=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);samples.push(d.player.position);expect(bodyPointBlocked(meshes,new THREE.Vector3(d.player.position.x,d.player.position.y,d.player.position.z))).toBe(false);}}
  45 |       finally{await page.keyboard.up('KeyW');}
  46 |       const end=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);await page.screenshot({path:`${out}/form-${form}-contact.png`});
  47 |       expect(end.flying).toBe(false);expect(Math.abs(end.player.position.y-terrainHeight(end.player.position.x,end.player.position.z))).toBeLessThan(.08);
  48 |       const last=samples.at(-1)!,prev=samples.at(-3)!;
  49 |       expect(Math.hypot(end.player.position.x-start.player.position.x,end.player.position.z-start.player.position.z),'real W actually approaches the selected fallen trunk').toBeGreaterThan(.15);
> 50 |       expect(Math.hypot(last.x-prev.x,last.z-prev.z),'walking into the solid wood stops at contact').toBeLessThan(.10);
     |                                                                                                      ^ Error: walking into the solid wood stops at contact
  51 |       const contact= snapshot.solids.filter(s=>s.seed===piece.seed).some(s=>s.axes.every(axis=>{const projection=end.player.position.x*axis.x+end.player.position.y*axis.y+end.player.position.z*axis.z;return projection>=axis.min-.025&&projection<=axis.max+.025;}));
  52 |       expect(contact,'stopped feet touch a conservative solid of the exact chosen trunk, not another obstacle').toBe(true);
  53 |       const orbit=[];await page.mouse.move(640,340);await page.mouse.down({button:'right'});
  54 |       try{for(let i=0;i<12;i++){
  55 |         await page.mouse.move(640+Math.sin(i*.4)*160,340+Math.sin(i*.3)*55,{steps:3});await page.waitForTimeout(80);const d=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
  56 |         const target=new THREE.Vector3(d.camera.target.x,d.camera.target.y,d.camera.target.z),camera=new THREE.Vector3(d.camera.position.x,d.camera.position.y,d.camera.position.z),delta=camera.clone().sub(target),length=delta.length(),ray=new THREE.Ray(target,delta.normalize());
  57 |         let intrusions=0;
  58 |         for(const b of snapshot.cameraBounds){const box=new THREE.Box3(new THREE.Vector3().fromArray(b[0]),new THREE.Vector3().fromArray(b[1])).expandByScalar(.18);if(box.containsPoint(target))continue;const hit=ray.intersectBox(box,new THREE.Vector3());if(hit&&hit.distanceTo(target)<length-.03)intrusions++;}
  59 |         expect(intrusions,'ordinary camera boom remains on the player side of deadwood proxies').toBe(0);orbit.push(d.camera);
  60 |       }}
  61 |       finally{await page.mouse.up({button:'right'});}
  62 |       await page.screenshot({path:`${out}/form-${form}-orbit.png`});forms.push({form,seed:piece.seed,contact,start,end,samples,orbit});
  63 |     }
  64 |     report.forms=forms;report.sourceHashesAtEnd=await hashes();expect(report.sourceHashesAtEnd).toEqual(report.sourceHashes);expect(errors).toEqual([]);
  65 |     report.complete=true;await save();
  66 |   }catch(error){report.failure=String(error);await save();throw error;}
  67 | });
  68 | 
```
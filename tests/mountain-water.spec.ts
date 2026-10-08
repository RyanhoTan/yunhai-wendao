import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
import {WATERCOURSE,JADE_POOL,WATERFALLS,waterSection} from '../src/world/WaterLayout';
import {createMountainWater} from '../src/world/MountainWater';
import * as THREE from 'three';
import {terrainHeight,protectedPoint} from '../src/world/World';
import {walk} from './helpers/navigation';

const out='artifacts/shanhai-map-20261008/water';
test('water surfaces follow physical shallow beds and preserve a walkable lower creek',()=>{
  let shallowWorst=0,buried=0;
  for(let i=1;i<WATERCOURSE.length;i++){
    const a=WATERCOURSE[i-1],b=WATERCOURSE[i],dist=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(dist*2);
    for(let j=0;j<=steps;j++){
      const t=j/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+(b.y-a.y)*t;
      const ground=terrainHeight(x,z);buried=Math.max(buried,ground-y);expect(protectedPoint(x,z,1)).toBe(true);
      for(const side of [-.8,.8]){const width=(a.r+(b.r-a.r)*t)*side,px=x-(b.z-a.z)/dist*width,pz=z+(b.x-a.x)/dist*width;buried=Math.max(buried,terrainHeight(px,pz)-y);}
      if(i>=8&&j>0){const prior=terrainHeight(a.x+(b.x-a.x)*(j-1)/steps,a.z+(b.z-a.z)*(j-1)/steps);shallowWorst=Math.max(shallowWorst,Math.abs(prior-ground)/(dist/steps));}
    }
  }
  console.log({buried,shallowWorst,falls:WATERFALLS.map(f=>WATERCOURSE[f.from].y-WATERCOURSE[f.to].y)});
  expect(buried).toBeLessThan(.08);expect(shallowWorst).toBeLessThan(.4);
  expect(JADE_POOL.y-terrainHeight(JADE_POOL.x,JADE_POOL.z)).toBeCloseTo(.5,2);
  for(let i=0;i<48;i++){const angle=i/48*Math.PI*2,ground=terrainHeight(JADE_POOL.x+Math.cos(angle)*JADE_POOL.rx,JADE_POOL.z+Math.sin(angle)*JADE_POOL.rz);expect(ground,'pond perimeter meets its banks').toBeGreaterThan(JADE_POOL.y-.1);}
});

test('flat and falling water share continuous cross-sections at all four lips',()=>{
  const root=new THREE.Group();createMountainWater(root);root.updateMatrixWorld(true);
  const meshes=root.children[0].children.filter(o=>o instanceof THREE.Mesh&&['CascadingWater','FlowingCreek'].includes(o.name));const ray=new THREE.Raycaster();
  for(const f of WATERFALLS)for(const i of [f.from,f.to]){
    const p=WATERCOURSE[i],s=waterSection(i);
    for(const offset of [-.8,-.4,0,.4,.8]){ray.set(new THREE.Vector3(p.x+s.x*offset,p.y+100,p.z+s.z*offset),new THREE.Vector3(0,-1,0));const hits=ray.intersectObjects(meshes,false);expect(hits.length,`water lip ${i}, section ${offset}`).toBeGreaterThan(0);expect(hits[0].point.y).toBeCloseTo(p.y+.035,2);}
  }
  const geo=new Set<THREE.BufferGeometry>(),mat=new Set<THREE.Material>();root.traverse(o=>{if(o instanceof THREE.Mesh){geo.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])mat.add(m);}});geo.forEach(g=>g.dispose());mat.forEach(m=>m.dispose());
});

test('real input crosses Jade Pool, follows the creek and resumes a saved bank position',async({page})=>{
  test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await mkdir(out,{recursive:true});await page.goto('/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('jade-pool'));
  const route=[];
  await walk(page,JADE_POOL.x,JADE_POOL.z);await page.screenshot({path:`${out}/jade-wading.png`});
  for(const [i,p] of WATERCOURSE.slice(7,-1).entries()){
    await walk(page,p.x,p.z);const d=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);route.push(d.player.position);
    expect(d.flying).toBe(false);expect(Math.abs(d.player.position.y-terrainHeight(d.player.position.x,d.player.position.z))).toBeLessThan(.08);
    if(i===3){await page.keyboard.press('Escape');await page.locator('[data-action=save]').click();await page.reload();await page.locator('[data-action=continue]').click();const loaded=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!.player.position);expect(Math.hypot(loaded.x-p.x,loaded.z-p.z)).toBeLessThan(1.5);}
  }
  await page.screenshot({path:`${out}/creek-to-sea.png`});await page.keyboard.press('KeyM');await expect(page.getByRole('dialog',{name:'山川舆图'})).toContainText('叠瀑谷');await page.screenshot({path:`${out}/water-map.png`});
  expect(errors).toEqual([]);await writeFile(`${out}/creek-input.json`,JSON.stringify({route,errors},null,2));
});

test('waterfall motion advances during play, freezes on pause and keeps GPU resources stable',async({page})=>{
  test.setTimeout(60000);await mkdir(out,{recursive:true});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?test=1');await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!;h.setState('waterfall');h.setReducedMotion(false);});
  await page.waitForTimeout(500);
  const capture=async(name:string)=>{
    const bytes=await page.locator('#game-canvas').screenshot({animations:'disabled'});await writeFile(`${out}/${name}.png`,bytes);return PNG.sync.read(bytes);
  };
  const before=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);const a=await capture('motion-0s');await page.waitForTimeout(2500);const b=await capture('motion-2s');const after=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);
  // Upper curtain only: excludes hero, sword, HUD, sky and leaves.
  let changed=0,total=0;for(let y=140;y<250;y++)for(let x=650;x<830;x++){const i=(y*a.width+x)*4,d=Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2]);if(d>10)changed++;total++;}
  expect(changed/total).toBeGreaterThan(.008);expect(after.renderer.geometries).toBe(before.renderer.geometries);expect(after.renderer.textures).toBe(before.renderer.textures);
  await page.keyboard.press('Escape');await page.waitForTimeout(150);const c=await capture('paused-0s');await page.waitForTimeout(500);const d=await capture('paused-1s');
  const curtain=(p:PNG)=>Buffer.concat(Array.from({length:110},(_,y)=>p.data.subarray(((y+140)*p.width+650)*4,((y+140)*p.width+830)*4)));
  expect(curtain(c).equals(curtain(d))).toBe(true);
  await page.keyboard.press('Escape');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setReducedMotion(true));await page.waitForTimeout(150);const reduced=await capture('reduced-0s');await page.waitForTimeout(500);expect(curtain(reduced).equals(curtain(await capture('reduced-1s')))).toBe(true);
  expect(errors).toEqual([]);await writeFile(`${out}/motion-report.json`,JSON.stringify({changedRatio:changed/total,before:before.renderer,after:after.renderer,errors},null,2));
});

test('real low sword flight climbs the cataracts with physical clearance',async({page})=>{
  await page.goto('/?test=1');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('jade-pool'));
  await page.keyboard.press('KeyF');await page.keyboard.down('KeyW');await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyC');
  const samples=[];
  try{for(let i=0;i<55;i++){await page.waitForTimeout(90);const d=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__!);samples.push(d.player.position);expect(d.flying).toBe(true);expect(d.player.position.y-terrainHeight(d.player.position.x,d.player.position.z)).toBeGreaterThan(2.5);}}
  finally{for(const key of ['KeyW','ShiftLeft','KeyC'])await page.keyboard.up(key);}
  expect(Math.max(...samples.map(p=>terrainHeight(p.x,p.z)))).toBeGreaterThan(25);
  await mkdir(out,{recursive:true});await writeFile(`${out}/flight-input.json`,JSON.stringify(samples,null,2));await page.screenshot({path:`${out}/live-flight.png`});
});

import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({channel:'chromium',headless:true});
try {
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5188/frostbound-sword.html?capture=1');await page.waitForFunction(()=>!!window.__SWORD_PREVIEW__);
 const results=await page.evaluate(async()=>{
  const players=await import('/src/assets/PlayerCharacters.ts');const THREE=await import('/node_modules/.vite/deps/three.js');await players.loadPlayerCharacterAssets();const results=[];
  for(const id of ['jade-blossom','shadowbound-wanderer']){
   const actor=players.createPlayerCharacter(id);actor.resetPose(true);actor.root.updateMatrixWorld(true);const sword=actor.root.getObjectByName('flyingSword');const samples=[];const point=new THREE.Vector3();
   actor.root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');
    for(const side of ['Left','Right']){const joints=new Set(mesh.skeleton.bones.flatMap((b,i)=>b.name.includes(side+'Foot')||b.name.includes(side+'Toe')?[i]:[]));let y=Infinity,sole=null;
     for(let i=0;i<indices.count;i++){let weight=0;for(let k=0;k<4;k++)if(joints.has(indices.getComponent(i,k)))weight+=weights.getComponent(i,k);if(weight<.5)continue;mesh.getVertexPosition(i,point);point.applyMatrix4(mesh.matrixWorld);if(point.y<y){y=point.y;sole=point.clone()}}
     if(!sole)continue;const ray=new THREE.Raycaster(new THREE.Vector3(sole.x,sole.y+.25,sole.z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(sword,true)[0];samples.push({mesh:mesh.name,side,sole:sole.toArray(),surface:hit?.point.toArray()??null,gap:hit?sole.y-hit.point.y:null});
    }});
   results.push({id,diagnostics:actor.diagnostics(),samples});actor.dispose();
  }return results;
 });await writeFile('artifacts/frostbound-sword-20261010/review-foot-contact.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
}finally{await browser.close()}

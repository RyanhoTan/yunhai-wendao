import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const browser=await chromium.launch({channel:'chromium',headless:true});
try {
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5188/frostbound-sword.html?capture=1');await page.waitForFunction(()=>!!window.__SWORD_PREVIEW__);
 const results=await page.evaluate(async()=>{
  const players=await import('/src/assets/PlayerCharacters.ts');const THREE=await import('/node_modules/.vite/deps/three.js');await players.loadPlayerCharacterAssets();const output=[];
  for(const id of ['jade-blossom','shadowbound-wanderer']){
   const actor=players.createPlayerCharacter(id);actor.resetPose(true);actor.root.updateMatrixWorld(true);const sword=actor.root.getObjectByName('flyingSword');
   // Static imported/deformed flight mesh. Grid is an analysis acceleration structure,
   // preserving every triangle and exact native vertex coordinates, not runtime geometry.
   const cell=.012,bins=new Map(),triangles=[];const point=new THREE.Vector3();
   sword.traverse(mesh=>{if(!mesh.isMesh)return;const pos=mesh.geometry.getAttribute('position'),index=mesh.geometry.index;const vertices=[];
    for(let i=0;i<pos.count;i++){point.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);vertices.push(point.clone())}
    for(let i=0;i<(index?.count??pos.count);i+=3){const a=vertices[index?index.getX(i):i],b=vertices[index?index.getX(i+1):i+1],c=vertices[index?index.getX(i+2):i+2];const denom=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(denom)<1e-16)continue;
     const tri={a,b,c,denom};const n=triangles.push(tri)-1;
     for(let gx=Math.floor(Math.min(a.x,b.x,c.x)/cell);gx<=Math.floor(Math.max(a.x,b.x,c.x)/cell);gx++)for(let gz=Math.floor(Math.min(a.z,b.z,c.z)/cell);gz<=Math.floor(Math.max(a.z,b.z,c.z)/cell);gz++){const key=gx+','+gz;let bin=bins.get(key);if(!bin){bin=[];bins.set(key,bin)}bin.push(n)}
    }});
   const surface=(x,z,above)=>{const bin=bins.get(Math.floor(x/cell)+','+Math.floor(z/cell))??[];let high=-Infinity;
    for(const i of bin){const {a,b,c,denom}=triangles[i],u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/denom,v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/denom,t=1-u-v;if(Math.min(u,v,t)<-1e-9)continue;const y=u*a.y+v*b.y+t*c.y;if(y<=above&&y>high)high=y}return high===-Infinity?null:high};
   const feet=[];
   actor.root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');
    for(const side of ['Left','Right']){const joints=new Set(mesh.skeleton.bones.flatMap((b,i)=>b.name.includes(side+'Foot')||b.name.includes(side+'Toe')?[i]:[])),vertices=[];
     for(let i=0;i<indices.count;i++){let weight=0;for(let k=0;k<4;k++)if(joints.has(indices.getComponent(i,k)))weight+=weights.getComponent(i,k);if(weight>.5)vertices.push(i)}
     if(vertices.length)feet.push({mesh,side,vertices})}});
   const duration=id==='jade-blossom'?3.0416667461395264:.15;const steps=id==='jade-blossom'?184:10;const dt=duration/steps;const frames=[],crosschecks=[];
   for(let step=0;step<=steps+3;step++){
    if(step)actor.animate(dt,step*dt,0,true,0);actor.root.updateMatrixWorld(true);const frame={step,time:step*dt,motionTime:actor.diagnostics().motionTime,feet:[]};
    for(const foot of feet){let lowest=Infinity,lowestPoint;const positions=[];
     for(const vertex of foot.vertices){foot.mesh.getVertexPosition(vertex,point);point.applyMatrix4(foot.mesh.matrixWorld);const p=point.clone();positions.push(p);if(p.y<lowest){lowest=p.y;lowestPoint=p}}
     const sole=positions.filter(p=>p.y<=lowest+.010);let hits=0,misses=0,minGap=Infinity,maxGap=-Infinity;const missing=[];
     for(const p of sole){const y=surface(p.x,p.z,p.y+.25);if(y===null){misses++;if(missing.length<6)missing.push(p.toArray())}else{hits++;minGap=Math.min(minGap,p.y-y);maxGap=Math.max(maxGap,p.y-y)}}
     const y=surface(lowestPoint.x,lowestPoint.z,lowestPoint.y+.25);const entry={side:foot.side,weightedVertexCount:positions.length,soleBandVertices:sole.length,hits,misses,lowestSole:lowestPoint.toArray(),lowestSoleSurfaceY:y,lowestSoleGap:y===null?null:lowestPoint.y-y,minSoleBandGap:hits?minGap:null,maxSoleBandGap:hits?maxGap:null,soleBandBounds:{min:[Math.min(...sole.map(p=>p.x)),lowest,Math.min(...sole.map(p=>p.z))],max:[Math.max(...sole.map(p=>p.x)),Math.max(...sole.map(p=>p.y)),Math.max(...sole.map(p=>p.z))]},missingExamples:missing};frame.feet.push(entry);
     if([0,Math.floor(steps/4),Math.floor(steps/2),Math.floor(steps*3/4),steps,steps+3].includes(step)){const ray=new THREE.Raycaster(new THREE.Vector3(lowestPoint.x,lowestPoint.y+.25,lowestPoint.z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(sword,true)[0];crosschecks.push({step,side:foot.side,gridY:y,rayY:hit?.point.y??null,delta:y!==null&&hit?y-hit.point.y:null})}
    }frames.push(frame);
   }
   const all=frames.flatMap(f=>f.feet.map(foot=>({...foot,step:f.step,time:f.time})));output.push({id,duration,sampleInterval:dt,frameCount:frames.length,soleBandHeight:.010,definition:'Actual skin-weighted foot/toe vertices within 1cm of each current foot minimum; contact tested against exact imported/deformed mesh triangles at every sampled pose.',summary:{testedSoleBandVertices:all.reduce((n,f)=>n+f.soleBandVertices,0),misses:all.reduce((n,f)=>n+f.misses,0),framesWithMissingFootprint:frames.filter(f=>f.feet.some(foot=>foot.misses)).length,lowestSoleMisses:all.filter(f=>f.lowestSoleGap===null).length,maxLowestSoleGap:Math.max(...all.flatMap(f=>f.lowestSoleGap===null?[]:[f.lowestSoleGap])),maxSoleBandGap:Math.max(...all.flatMap(f=>f.maxSoleBandGap===null?[]:[f.maxSoleBandGap])),minSoleBandGap:Math.min(...all.flatMap(f=>f.minSoleBandGap===null?[]:[f.minSoleBandGap]))},rayCrosschecks:crosschecks,frames});actor.dispose();
  }return output;
 });const source=await readFile('src/assets/FrostboundSword.ts');const evidence={sourceSHA256:createHash('sha256').update(source).digest('hex'),scope:'Independent read-only actor clones. Jade complete float cycle including first wrapped samples; Shadow source has no float clip, so verified rest pose only.',results};await writeFile('artifacts/frostbound-sword-20261010/review-flight-cycle.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(results.map(r=>({id:r.id,duration:r.duration,frameCount:r.frameCount,summary:r.summary,crosscheckDeltaMax:Math.max(...r.rayCrosschecks.flatMap(p=>p.delta===null?[]:[Math.abs(p.delta)]))}))));
}finally{await browser.close()}

import {expect,test} from '@playwright/test';
import * as THREE from 'three';
import {createHash} from 'node:crypto';
import {mkdir,open,readFile,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createWoodlandTree,type WoodlandArchitecture,type WoodlandDetail,type WoodlandTree} from '../src/world/WoodlandTree';
import {createWoodlandPopulation} from '../src/world/WoodlandPopulation';
import {createWoodlandRenderCells} from '../src/world/WoodlandRenderCells';
import {createWoodlandLodField} from '../src/world/WoodlandLOD';
import {createWoodlandMaterials} from '../src/world/WoodlandMaterials';

// These tests allocate no browser/WebGL renderer. CPU bounds and envelopes do
// not establish aesthetic quality, screen-space dither quality or GPU timing.
test.describe.configure({mode:'serial'});
test.setTimeout(180000);
const stage=process.env.FOREST_CANOPY_VALIDATION_STAGE??`forest-canopy-validation-${Date.now()}`;
if(!/^forest-canopy-validation-[a-z0-9-]+$/.test(stage))throw new Error('Invalid canopy evidence directory');
const out=`artifacts/laas-quality-20261012/${stage}`;
const sourceFiles=[...['WoodlandTree','WoodlandPrimitives','WoodlandGeometry','WoodlandPopulation','WoodlandLOD','WoodlandMaterials','WoodlandRenderCells','NaturalForest','ForestLayout','WorldLayout','World'].map(n=>`src/world/${n}.ts`),'src/game/Game.ts','tests/forest-canopy.spec.ts','package.json','package-lock.json'];
const report:Record<string,unknown>={complete:false,fullRequiredVisualCoverage:false,visualAcceptance:false,scope:'Independent CPU geometry, foundations, continuous LOD and main/shadow field checks; no visual acceptance or GPU measurement.',tests:[],sourceHashes:{}};
const results:{name:string;status:string;errors:string[]}[]=[];
let ownsEvidence=false;
const prototypes:WoodlandTree[][]=[];
const disposeGeometry=new Set<THREE.BufferGeometry>(),disposeMaterial=new Set<THREE.Material>(),disposeTexture=new Set<THREE.Texture>();
const track=(p:WoodlandTree)=>{disposeGeometry.add(p.wood);disposeGeometry.add(p.leaves);return p;};
const save=()=>ownsEvidence?writeFile(`${out}/status.json`,JSON.stringify({...report,tests:results},null,2)+'\n'):Promise.resolve();

test.beforeAll(async()=>{
  await mkdir(out,{recursive:true});
  // Exclusive creation closes the check-then-write race between two processes.
  const marker=await open(`${out}/status.json`,'wx');
  ownsEvidence=true;
  try{await marker.writeFile(JSON.stringify(report,null,2)+'\n');}finally{await marker.close();}
  report.sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async file=>{
    const bytes=await readFile(file),record=`${out}/source-record/${file}`;await mkdir(dirname(record),{recursive:true});await writeFile(record,bytes);
    return [file,createHash('sha256').update(bytes).digest('hex')];
  })));
  await save();
  for(let kind=0;kind<3;kind++)for(let architecture=0;architecture<4;architecture++){
    // Hold the species seed fixed across architectures: simple scale or yaw
    // changes must not masquerade as four independent branching structures.
    prototypes.push([0,1,2].map(detail=>track(createWoodlandTree(kind,1289+kind*181,detail as WoodlandDetail,architecture as WoodlandArchitecture))));
  }
});
test.afterEach(async({},info)=>{results.push({name:info.title,status:info.status??'unknown',errors:info.errors.map(e=>e.message??String(e))});await save();});
test.afterAll(async()=>{
  if(!ownsEvidence)return;
  const end=Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
  report.sourceHashesAtEnd=end;report.sourcesStable=JSON.stringify(end)===JSON.stringify(report.sourceHashes);
  report.complete=results.length===4&&results.every(r=>r.status==='passed')&&report.sourcesStable===true;
  disposeGeometry.forEach(g=>g.dispose());disposeMaterial.forEach(m=>m.dispose());disposeTexture.forEach(t=>t.dispose());await save();
});

function vertices(g:THREE.BufferGeometry){return g.getAttribute('position');}
function rawBox(g:THREE.BufferGeometry){const box=new THREE.Box3(),p=vertices(g),v=new THREE.Vector3();for(let i=0;i<p.count;i++)box.expandByPoint(v.fromBufferAttribute(p,i));return box;}
function components(g:THREE.BufferGeometry):number[][]{
  const p=vertices(g),index=g.getIndex()!,parent=Int32Array.from({length:p.count},(_,i)=>i);
  const find=(i:number):number=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  for(let i=0;i<index.count;i+=3){const a=find(index.getX(i));parent[find(index.getX(i+1))]=a;parent[find(index.getX(i+2))]=a;}
  const groups=new Map<number,number[]>();for(let i=0;i<p.count;i++){const key=find(i),list=groups.get(key)??[];list.push(i);groups.set(key,list);}return [...groups.values()];
}
function componentBox(g:THREE.BufferGeometry,ids:number[]){const box=new THREE.Box3(),p=vertices(g),v=new THREE.Vector3();ids.forEach(i=>box.expandByPoint(v.fromBufferAttribute(p,i)));return box;}
const triangles=(g:THREE.BufferGeometry)=>(g.getIndex()?.count??vertices(g).count)/3;

test('all 36 tree buffers have physical leaves, fixed roots and conservative actual wind envelopes',async()=>{
  const rows:unknown[]=[];let invalid=0,boundsFailures=0,rootFailures=0,rootVertices=0,leafDiameters:number[]=[];
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),delta=new THREE.Vector3();
  for(let id=0;id<prototypes.length;id++)for(let detail=0;detail<3;detail++){
    const prototype=prototypes[id][detail];let checked=0,rootComponentCount=0;
    for(const g of [prototype.wood,prototype.leaves]){
      const p=vertices(g),wind=g.getAttribute('woodlandWind'),sway=g.getAttribute('woodlandSway'),normal=g.getAttribute('normal'),uv=g.getAttribute('uv'),index=g.getIndex()!;
      expect(wind.count).toBe(p.count);expect(sway.count).toBe(p.count);expect(normal.count).toBe(p.count);expect(uv.count).toBe(p.count);expect(index.count%3).toBe(0);
      const box=g.boundingBox!,sphere=g.boundingSphere!;
      for(let i=0;i<p.count;i++){
        a.fromBufferAttribute(p,i);b.fromBufferAttribute(normal,i);const w=wind.getX(i),s=sway.getX(i);
        if(!Number.isFinite(a.lengthSq()+b.lengthSq()+w+s)||Math.abs(b.length()-1)>1e-4||w<0||w>1||s<0||s>1)invalid++;
        // World-wind maximum is .269m X / .128m Z at unit weights. The
        // production tree's minimum scale is .82; use its inverse to bound
        // every vertex in local coordinates, including its sphere's corners.
        for(const sx of [-1,1])for(const sz of [-1,1]){
          delta.set(sx*(.22*s+.049*w)/.82,0,sz*(.10*s+.028*w)/.82);c.copy(a).add(delta);
          if(!box.containsPoint(c)||sphere.distanceToPoint(c)>1e-5)boundsFailures++;
        }
        checked++;
      }
      for(let i=0;i<index.count;i+=3){
        const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];if(ids.some(n=>n<0||n>=p.count)){invalid++;continue;}
        a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]).sub(a);c.fromBufferAttribute(p,ids[2]).sub(a);if(b.cross(c).lengthSq()<1e-16)invalid++;
      }
    }
    const p=vertices(prototype.wood),wind=prototype.wood.getAttribute('woodlandWind'),sway=prototype.wood.getAttribute('woodlandSway');
    for(const ids of components(prototype.wood)){
      const box=componentBox(prototype.wood,ids);
      // Root sweeps are actual disconnected low wood meshes; this does not
      // depend on authored branch names or a stored common bounding sphere.
      if(box.min.y<1e-6&&box.max.y<.8){rootComponentCount++;for(const i of ids){rootVertices++;if(wind.getX(i)!==0||sway.getX(i)!==0)rootFailures++;}}
    }
    for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i))<1e-6){rootVertices++;if(wind.getX(i)!==0||sway.getX(i)!==0)rootFailures++;}
    expect(rawBox(prototype.wood).min.y,'actual trunk base reaches the origin').toBeCloseTo(0,6);
    if(detail<2)expect(rootComponentCount,'near and mid preserve physical fixed root sweeps').toBeGreaterThanOrEqual(4);
    expect(prototype.trunkSegments.length).toBeGreaterThan(3);expect(prototype.trunkSegments[0].a[1]).toBe(0);
    if(detail===0){
      const leafPoints=vertices(prototype.leaves),parts=components(prototype.leaves);expect(parts.length).toBe(prototype.leafCount);
      for(const ids of parts){
        let diameter=0;for(const i of ids)for(const j of ids){a.fromBufferAttribute(leafPoints,i);b.fromBufferAttribute(leafPoints,j);diameter=Math.max(diameter,a.distanceTo(b));}leafDiameters.push(diameter);
        if(ids.length<4||diameter<.06||diameter>.35)invalid++;
      }
    }
    rows.push({kind:id>>2,architecture:id%4,detail,vertices:checked,woodTriangles:triangles(prototype.wood),leafTriangles:triangles(prototype.leaves),rawLeafBounds:rawBox(prototype.leaves),rootComponents:rootComponentCount});
  }
  leafDiameters=leafDiameters.sort((a,b)=>a-b);
  report.geometry={rows,invalid,boundsFailures,rootFailures,rootVertices,nearPhysicalLeaves:leafDiameters.length,leafDiameterMetres:{min:leafDiameters[0],median:leafDiameters[Math.floor(leafDiameters.length*.5)],p99:leafDiameters[Math.floor(leafDiameters.length*.99)],max:leafDiameters.at(-1)},limits:'All actual vertices; conservative coefficient envelope, not a GPU wind simulation. Triangle totals are recorded, not raised into an aesthetic threshold.'};await save();
  expect(invalid,'finite attributes, unit normals, valid triangles and leaf dimensions').toBe(0);expect(boundsFailures,'actual wind envelope remains in the returned common box AND sphere').toBe(0);expect(rootFailures,'all physical root components and ground-contact vertices remain fixed').toBe(0);expect(rootVertices).toBeGreaterThan(100);
});

function supports(g:THREE.BufferGeometry,yMin:number,yMax:number){
  const p=vertices(g),directions=Array.from({length:16},(_,i)=>[Math.cos(i*Math.PI/8),Math.sin(i*Math.PI/8)]),global=new Array<number>(16).fill(-Infinity),bands=Array.from({length:8},()=>new Array<number>(16).fill(-Infinity));
  for(let i=0;i<p.count;i++){
    directions.forEach(([x,z],j)=>{global[j]=Math.max(global[j],p.getX(i)*x+p.getZ(i)*z);});
  }
  // Proxy triangles may cross an entire band without placing a vertex in it.
  // Clip the actual indexed surface to each height slab, avoiding a false
  // silhouette gap from comparing only vertex counts at different densities.
  const clip=(poly:number[][],y:number,above:boolean)=>{
    const result:number[][]=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],insideA=above?a[1]>=y:a[1]<=y,insideB=above?b[1]>=y:b[1]<=y;
      if(insideA)result.push(a);
      if(insideA!==insideB){const t=(y-a[1])/(b[1]-a[1]);result.push(a.map((v,j)=>v+(b[j]-v)*t));}
    }
    return result;
  };
  const index=g.getIndex()!,span=(yMax-yMin)/8;
  for(let i=0;i<index.count;i+=3){
    const triangle=[0,1,2].map(j=>{const id=index.getX(i+j);return [p.getX(id),p.getY(id),p.getZ(id)];}),lo=Math.min(...triangle.map(v=>v[1])),hi=Math.max(...triangle.map(v=>v[1]));
    for(let band=Math.max(0,Math.floor((lo-yMin)/span));band<=Math.min(7,Math.floor((hi-yMin)/span));band++){
      const polygon=clip(clip(triangle,yMin+span*band,true),yMin+span*(band+1),false);
      for(const v of polygon)directions.forEach(([x,z],j)=>{bands[band][j]=Math.max(bands[band][j],v[0]*x+v[2]*z);});
    }
  }
  return {global,bands};
}
test('LOD crowns retain actual directional silhouettes and every authored cluster rather than just copied bounds',async()=>{
  const rows:unknown[]=[],failures:string[]=[];let missingClusters=0,worstClusterDistance=0,worstSupportDelta=0,worstBandDelta=0;
  for(let id=0;id<prototypes.length;id++){
    const levels=prototypes[id],near=levels[0],box=rawBox(near.leaves),reference=supports(near.leaves,box.min.y,box.max.y),counts=levels.map(p=>triangles(p.wood)+triangles(p.leaves));
    expect(counts[0]).toBeGreaterThan(counts[1]);expect(counts[1]).toBeGreaterThan(counts[2]);
    const row:Record<string,unknown>={kind:id>>2,architecture:id%4,triangles:counts,details:[]};
    for(let detail=0;detail<3;detail++){
      const prototype=levels[detail],p=vertices(prototype.leaves),actual=rawBox(prototype.leaves),profile=supports(prototype.leaves,box.min.y,box.max.y);
      let clusterDistance=0,supportDelta=0,bandDelta=0;
      for(const {center} of near.clusterLayout){let closest=Infinity;for(let i=0;i<p.count;i++){const dx=p.getX(i)-center[0],dy=p.getY(i)-center[1],dz=p.getZ(i)-center[2];closest=Math.min(closest,Math.hypot(dx,dy,dz));}clusterDistance=Math.max(clusterDistance,closest);if(closest>.45)missingClusters++;}
      for(let dir=0;dir<16;dir++){
        supportDelta=Math.max(supportDelta,Math.abs(profile.global[dir]-reference.global[dir]));
        for(let band=0;band<8;band++)if(Number.isFinite(reference.bands[band][dir]))bandDelta=Math.max(bandDelta,Math.abs(profile.bands[band][dir]-reference.bands[band][dir]));
      }
      worstClusterDistance=Math.max(worstClusterDistance,clusterDistance);worstSupportDelta=Math.max(worstSupportDelta,supportDelta);worstBandDelta=Math.max(worstBandDelta,bandDelta);
      if(Math.abs(actual.min.y-box.min.y)>.0001||Math.abs(actual.max.y-box.max.y)>.0001)failures.push(`${id}/${detail} crown height changes`);
      if(supportDelta>=near.radius*.12)failures.push(`${id}/${detail} 16-direction support ${supportDelta} >= ${near.radius*.12}`);
      if(bandDelta>=near.radius*.25)failures.push(`${id}/${detail} clipped-band support ${bandDelta} >= ${near.radius*.25}`);
      (row.details as unknown[]).push({detail,actualBounds:actual,clusterDistance,supportDelta,bandDelta});
    }
    rows.push(row);
  }
  report.crownLod={rows,failures,missingClusters,worstClusterDistance,worstSupportDelta,worstBandDelta,method:'Actual vertex global support functions in 16 azimuths; actual indexed triangle surfaces clipped into 8 height bands; nearest actual leaf vertex to every near crown cluster. Metadata common sphere equality is not a silhouette criterion.'};await save();expect(missingClusters).toBe(0);expect(failures,'12% global and 25% local actual crown-radius limits').toEqual([]);
});

function invariantBranchSignature(p:WoodlandTree){
  const centers=components(p.wood).map(ids=>componentBox(p.wood,ids)).filter(box=>box.max.y>.8).map(box=>box.getCenter(new THREE.Vector3()));
  const pairwise:number[]=[];for(let i=0;i<centers.length;i++)for(let j=i+1;j<centers.length;j++)pairwise.push(centers[i].distanceTo(centers[j])/p.height);pairwise.sort((a,b)=>a-b);
  return {components:centers.length,quantiles:[.1,.25,.5,.75,.9].map(q=>pairwise[Math.floor((pairwise.length-1)*q)])};
}
test('architecture variants change actual branching topology or rigid-transform-invariant proportions',async()=>{
  const rows:unknown[]=[];
  for(let kind=0;kind<3;kind++){
    const signatures=[0,1,2,3].map(architecture=>invariantBranchSignature(prototypes[kind*4+architecture][0]));
    for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){
      const left=signatures[a],right=signatures[b],rms=Math.sqrt(left.quantiles.reduce((sum,x,i)=>sum+(x-right.quantiles[i])**2,0)/left.quantiles.length);
      rows.push({kind,a,b,left,right,rms});expect(left.components!==right.components||rms>.02,`species ${kind} architectures ${a}/${b} cannot differ only by scale/rotation`).toBe(true);
    }
    const young=prototypes[kind*4][0],veteran=prototypes[kind*4+2][0];expect(veteran.trunkSegments.length,'forked veteran has real additional leaders').toBeGreaterThan(young.trunkSegments.length);
  }
  report.architecture={rows,method:'Connected actual wood components and pairwise centroid distances normalized by actual height; invariant to uniform scale, translation and rotation. Same seed per species.'};await save();
});

test('actual cells retain grounded trunks and share continuous main-camera weights with all shadow and merged levels',async()=>{
  const height=(x:number,z:number)=>20+(x+210)*.12+(z+220)*.08;
  const protectedOutside=(x:number,z:number,extra:number)=>x-extra< -240||x+extra> -186||z-extra< -249||z+extra> -187;
  const population=createWoodlandPopulation(height,protectedOutside);population.prototypes.flat().forEach(track);[...population.grass,...population.ferns,population.litter].forEach(g=>disposeGeometry.add(g));
  const field=createWoodlandLodField(population.cells.size+population.meadowCells.size),materials=createWoodlandMaterials(field),group=new THREE.Group();disposeTexture.add(field.texture);
  const rendering=createWoodlandRenderCells(group,population,materials,height,field);group.updateMatrixWorld(true);
  group.traverse(o=>{if(o instanceof THREE.Mesh){disposeGeometry.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>disposeMaterial.add(m));if(o.customDepthMaterial)disposeMaterial.add(o.customDepthMaterial);}});
  materials.levels.forEach(level=>[level.bark,level.living,level.depth].forEach(m=>disposeMaterial.add(m)));disposeMaterial.add(materials.litterMaterial);
  let groundMaximum=-Infinity,groundMinimum=Infinity,groundSamples=0,rootWindFailures=0;
  const v=new THREE.Vector3();
  for(const tree of population.trees){
    const p=population.prototypes[tree.seed][0].wood,pos=vertices(p),sway=p.getAttribute('woodlandSway'),wind=p.getAttribute('woodlandWind');
    for(let i=0;i<pos.count;i++)if(Math.abs(pos.getY(i))<1e-6){v.fromBufferAttribute(pos,i).applyMatrix4(tree.matrix);const gap=v.y-height(v.x,v.z);groundMaximum=Math.max(groundMaximum,gap);groundMinimum=Math.min(groundMinimum,gap);groundSamples++;if(sway.getX(i)!==0||wind.getX(i)!==0)rootWindFailures++;}
    const base=population.prototypes[tree.seed][0].trunkSegments[0].a;v.fromArray(base).applyMatrix4(tree.matrix);expect(v.y-height(v.x,v.z),'actual low main trunk reaches the slope').toBeLessThanOrEqual(.03);expect(v.y-height(v.x,v.z)).toBeGreaterThan(-.75);
  }
  expect(population.trees.length).toBeGreaterThan(20);expect(groundSamples).toBeGreaterThan(100);expect(groundMaximum,'all root contact vertices stay on or slightly within the slope').toBeLessThanOrEqual(.012);expect(groundMinimum).toBeGreaterThan(-.75);expect(rootWindFailures).toBe(0);
  const camera=new THREE.PerspectiveCamera(),cell=rendering.forestLODs[0],distance0=cell.levels[1].distance,distance1=cell.levels[2].distance,center=new THREE.Vector3().setFromMatrixPosition(cell.matrixWorld);
  const weights=()=>[0,1,2].map(i=>field.data[cell.cellId*4+i]/255),walk:unknown[]=[];let overlap0=0,overlap1=0,maximumWeightStep=0,maximumSumError=0,visibleZeroByteLayers=0,nearTreeChecks=0;let previous:number[]|undefined;
  const sample=(d:number)=>{camera.position.copy(center).x+=d;camera.updateMatrixWorld(true);rendering.prepare(camera);return weights();};
  expect(sample(10),'10m camera keeps the full detailed crown').toEqual([1,0,0]);
  for(const tree of population.trees){
    const owner=rendering.forestLODs.find(lod=>lod.name===`OriginalWoodlandCell_${Math.floor(tree.x/24)*24+12}_${Math.floor(tree.z/24)*24+12}`)!;
    camera.position.set(tree.x+10,tree.y+1.6,tree.z);camera.updateMatrixWorld(true);rendering.prepare(camera);
    expect([0,1,2].map(i=>field.data[owner.cellId*4+i]/255),'every real tree retains LOD0 ten metres from the camera').toEqual([1,0,0]);nearTreeChecks++;
  }
  for(let d=0;d<=distance1+10;d+=.5){
    const w=sample(d),sum=w.reduce((a,b)=>a+b,0);maximumSumError=Math.max(maximumSumError,Math.abs(sum-1));if(previous)maximumWeightStep=Math.max(maximumWeightStep,...w.map((a,i)=>Math.abs(a-previous![i])));previous=w;
    if(w[0]>0&&w[1]>0)overlap0++;if(w[1]>0&&w[2]>0)overlap1++;walk.push({distance:d,weights:w,levelVisibility:cell.levels.map(l=>l.object.visible)});
    for(let level=0;level<3;level++){
      if(w[level]>0)expect(cell.levels[level].object.visible,'a nonzero encoded level must be drawn').toBe(true);
      if(!cell.levels[level].object.visible)expect(w[level]).toBe(0);
      if(w[level]===0&&cell.levels[level].object.visible)visibleZeroByteLayers++;
    }
  }
  expect(overlap0).toBeGreaterThan(8);expect(overlap1).toBeGreaterThan(8);expect(maximumSumError).toBeLessThanOrEqual(2/255);expect(maximumWeightStep).toBeLessThan(.09);
  expect(sample(1200).reduce((a,b)=>a+b,0),'all canopy layers fade at distant cull').toBeGreaterThan(.3);expect(weights().reduce((a,b)=>a+b,0)).toBeLessThan(.7);expect(sample(1211)).toEqual([0,0,0]);
  const fieldTests:unknown[]=[];let shaderFailures=0;
  for(let level=0;level<3;level++){
    const shaders=[materials.levels[level].bark,materials.levels[level].living,materials.levels[level].depth].map((material,i)=>{
      const template=i===2?THREE.ShaderLib.depth:THREE.ShaderLib.standard,shader={uniforms:THREE.UniformsUtils.clone(template.uniforms),vertexShader:template.vertexShader,fragmentShader:template.fragmentShader};
      material.onBeforeCompile(shader as Parameters<THREE.Material['onBeforeCompile']>[0],{} as THREE.WebGLRenderer);return shader;
    });
    const guards=shaders.map(s=>s.fragmentShader.slice(s.fragmentShader.indexOf('vec3 woodlandWeights='),s.fragmentShader.indexOf('discard;')+8));
    for(const shader of shaders)if(shader.uniforms.uForestCells.value!==field.texture||shader.uniforms.uForestCellCount.value!==field.count||shader.uniforms.uWoodlandTime!==materials.time)shaderFailures++;
    if(!guards[0]||guards.some(g=>g!==guards[0]))shaderFailures++;
    fieldTests.push({level,sameDataTexture:shaders.every(s=>s.uniforms.uForestCells.value===field.texture),sameGeneratedDitherGuard:guards.every(g=>g===guards[0])});
  }
  sample(distance0);const mainWeights=Array.from(field.data),shadowCamera=new THREE.PerspectiveCamera();shadowCamera.position.set(900,100,900);shadowCamera.updateMatrixWorld(true);
  group.traverse(o=>{if(o instanceof THREE.Mesh)o.onBeforeRender({} as THREE.WebGLRenderer,new THREE.Scene(),shadowCamera,o.geometry,Array.isArray(o.material)?o.material[0]:o.material,new THREE.Group());});
  expect(Array.from(field.data),'shadow draw callbacks must not recompute the main-camera field').toEqual(mainWeights);expect(rendering.forestLODs.every(l=>l.autoUpdate===false)).toBe(true);expect(shaderFailures).toBe(0);
  let instancedIds=0,mergedIds=0,idFailures=0,budgetTriangles=0,meshCount=0,renderedVertices=0,renderBoundsFailures=0;
  const instanceMatrix=new THREE.Matrix4(),point=new THREE.Vector3(),offsetPoint=new THREE.Vector3();
  group.traverse(o=>{
    if(!(o instanceof THREE.Mesh)||o.material===materials.litterMaterial)return;meshCount++;budgetTriangles+=triangles(o.geometry)*(o instanceof THREE.InstancedMesh?o.count:1);
    const ids=o.geometry.getAttribute('forestCellId'),p=vertices(o.geometry),sway=o.geometry.getAttribute('woodlandSway'),wind=o.geometry.getAttribute('woodlandWind');
    if(!ids){idFailures++;return;}
    if(o instanceof THREE.InstancedMesh){instancedIds+=ids.count;if(ids.count!==o.count)idFailures++;}else{mergedIds+=ids.count;if(ids.count!==p.count)idFailures++;}
    for(let i=0;i<ids.count;i++)if(ids.getX(i)<0||ids.getX(i)>=field.count||!Number.isInteger(ids.getX(i)))idFailures++;
    for(let instance=0;instance<(o instanceof THREE.InstancedMesh?o.count:1);instance++){
      if(o instanceof THREE.InstancedMesh)o.getMatrixAt(instance,instanceMatrix);else instanceMatrix.identity();
      for(let i=0;i<p.count;i++){
        point.fromBufferAttribute(p,i).applyMatrix4(instanceMatrix);const s=sway.getX(i),w=wind.getX(i),sphere=o instanceof THREE.InstancedMesh?o.boundingSphere!:o.geometry.boundingSphere!;
        for(const sx of [-1,1])for(const sz of [-1,1]){offsetPoint.set(point.x+sx*(.22*s+.049*w),point.y,point.z+sz*(.10*s+.028*w));if(sphere.distanceToPoint(offsetPoint)>1e-5)renderBoundsFailures++;if(!(o instanceof THREE.InstancedMesh)&&!o.geometry.boundingBox!.containsPoint(offsetPoint))renderBoundsFailures++;}
        renderedVertices++;
      }
    }
  });
  report.cells={syntheticSlopedFoundation:{height:'20 + (x+210)*.12 + (z+220)*.08',trees:population.trees.length,groundSamples,groundMinimum,groundMaximum,rootWindFailures},forestCells:rendering.forestLODs.length,meadowCells:rendering.meadowLODs.length,nearTreeChecks,thresholds:[distance0,distance1],walkStepMetres:.5,walk,overlap0,overlap1,maximumWeightStep,maximumSumError,visibleZeroByteLayers,fieldTests,instancedIds,mergedIds,idFailures,renderedVertices,renderBoundsFailures,allocatedAllLevelTriangles:budgetTriangles,meshCount,limitations:'Synthetic cropped population uses real placement/render builders. Allocated all-level triangles are not visible draw calls or GPU cost; shader hooks and shared uniform ownership are checked without compiling GLSL or proving visual dither quality.'};await save();
  expect(instancedIds).toBeGreaterThan(0);expect(mergedIds).toBeGreaterThan(0);expect(idFailures).toBe(0);expect(renderBoundsFailures,'actual merged and every instance wind envelope fits renderer culling bounds').toBe(0);
});

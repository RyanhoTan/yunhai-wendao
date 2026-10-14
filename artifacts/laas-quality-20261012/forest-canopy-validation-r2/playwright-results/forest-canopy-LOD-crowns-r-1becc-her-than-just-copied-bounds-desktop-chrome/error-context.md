# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: forest-canopy.spec.ts >> LOD crowns retain actual directional silhouettes and every authored cluster rather than just copied bounds
- Location: tests/forest-canopy.spec.ts:134:1

# Error details

```
Error: 12% global and 25% local actual crown-radius limits

expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 16

- Array []
+ Array [
+   "0/1 clipped-band support 2.333041871408711 >= 0.6556685452986495",
+   "0/2 clipped-band support 2.274060279365555 >= 0.6556685452986495",
+   "1/2 clipped-band support 1.7610579122532837 >= 1.0463724301082535",
+   "2/1 clipped-band support 5.455991023841248 >= 1.6973778540647024",
+   "2/2 clipped-band support 5.455991023841248 >= 1.6973778540647024",
+   "3/1 clipped-band support 1.8919985694158978 >= 1.0123323178564967",
+   "3/2 clipped-band support 1.9454354644302878 >= 1.0123323178564967",
+   "6/1 clipped-band support 1.8431551456451412 >= 1.2362919464007005",
+   "6/2 clipped-band support 2.1549213763286534 >= 1.2362919464007005",
+   "7/2 clipped-band support 1.8367354447402926 >= 0.7704879448311641",
+   "8/1 clipped-band support Infinity >= 0.6009175010339447",
+   "8/2 clipped-band support Infinity >= 0.6009175010339447",
+   "9/2 clipped-band support 2.173525585432272 >= 1.221282288335021",
+   "10/2 clipped-band support 1.7310412502000743 >= 1.2991665582781435",
+ ]
```

# Test source

```ts
  56  | test('all 36 tree buffers have physical leaves, fixed roots and conservative actual wind envelopes',async()=>{
  57  |   const rows:unknown[]=[];let invalid=0,boundsFailures=0,rootFailures=0,rootVertices=0,leafDiameters:number[]=[];
  58  |   const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),delta=new THREE.Vector3();
  59  |   for(let id=0;id<prototypes.length;id++)for(let detail=0;detail<3;detail++){
  60  |     const prototype=prototypes[id][detail];let checked=0,rootComponentCount=0;
  61  |     for(const g of [prototype.wood,prototype.leaves]){
  62  |       const p=vertices(g),wind=g.getAttribute('woodlandWind'),sway=g.getAttribute('woodlandSway'),normal=g.getAttribute('normal'),uv=g.getAttribute('uv'),index=g.getIndex()!;
  63  |       expect(wind.count).toBe(p.count);expect(sway.count).toBe(p.count);expect(normal.count).toBe(p.count);expect(uv.count).toBe(p.count);expect(index.count%3).toBe(0);
  64  |       const box=g.boundingBox!,sphere=g.boundingSphere!;
  65  |       for(let i=0;i<p.count;i++){
  66  |         a.fromBufferAttribute(p,i);b.fromBufferAttribute(normal,i);const w=wind.getX(i),s=sway.getX(i);
  67  |         if(!Number.isFinite(a.lengthSq()+b.lengthSq()+w+s)||Math.abs(b.length()-1)>1e-4||w<0||w>1||s<0||s>1)invalid++;
  68  |         // World-wind maximum is .269m X / .128m Z at unit weights. The
  69  |         // production tree's minimum scale is .82; use its inverse to bound
  70  |         // every vertex in local coordinates, including its sphere's corners.
  71  |         for(const sx of [-1,1])for(const sz of [-1,1]){
  72  |           delta.set(sx*(.22*s+.049*w)/.82,0,sz*(.10*s+.028*w)/.82);c.copy(a).add(delta);
  73  |           if(!box.containsPoint(c)||sphere.distanceToPoint(c)>1e-5)boundsFailures++;
  74  |         }
  75  |         checked++;
  76  |       }
  77  |       for(let i=0;i<index.count;i+=3){
  78  |         const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];if(ids.some(n=>n<0||n>=p.count)){invalid++;continue;}
  79  |         a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]).sub(a);c.fromBufferAttribute(p,ids[2]).sub(a);if(b.cross(c).lengthSq()<1e-16)invalid++;
  80  |       }
  81  |     }
  82  |     const p=vertices(prototype.wood),wind=prototype.wood.getAttribute('woodlandWind'),sway=prototype.wood.getAttribute('woodlandSway');
  83  |     for(const ids of components(prototype.wood)){
  84  |       const box=componentBox(prototype.wood,ids);
  85  |       // Root sweeps are actual disconnected low wood meshes; this does not
  86  |       // depend on authored branch names or a stored common bounding sphere.
  87  |       if(box.min.y<1e-6&&box.max.y<.8){rootComponentCount++;for(const i of ids){rootVertices++;if(wind.getX(i)!==0||sway.getX(i)!==0)rootFailures++;}}
  88  |     }
  89  |     for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i))<1e-6){rootVertices++;if(wind.getX(i)!==0||sway.getX(i)!==0)rootFailures++;}
  90  |     expect(rawBox(prototype.wood).min.y,'actual trunk base reaches the origin').toBeCloseTo(0,6);
  91  |     if(detail<2)expect(rootComponentCount,'near and mid preserve physical fixed root sweeps').toBeGreaterThanOrEqual(4);
  92  |     expect(prototype.trunkSegments.length).toBeGreaterThan(3);expect(prototype.trunkSegments[0].a[1]).toBe(0);
  93  |     if(detail===0){
  94  |       const leafPoints=vertices(prototype.leaves),parts=components(prototype.leaves);expect(parts.length).toBe(prototype.leafCount);
  95  |       for(const ids of parts){
  96  |         let diameter=0;for(const i of ids)for(const j of ids){a.fromBufferAttribute(leafPoints,i);b.fromBufferAttribute(leafPoints,j);diameter=Math.max(diameter,a.distanceTo(b));}leafDiameters.push(diameter);
  97  |         if(ids.length<4||diameter<.06||diameter>.35)invalid++;
  98  |       }
  99  |     }
  100 |     rows.push({kind:id>>2,architecture:id%4,detail,vertices:checked,woodTriangles:triangles(prototype.wood),leafTriangles:triangles(prototype.leaves),rawLeafBounds:rawBox(prototype.leaves),rootComponents:rootComponentCount});
  101 |   }
  102 |   leafDiameters=leafDiameters.sort((a,b)=>a-b);
  103 |   report.geometry={rows,invalid,boundsFailures,rootFailures,rootVertices,nearPhysicalLeaves:leafDiameters.length,leafDiameterMetres:{min:leafDiameters[0],median:leafDiameters[Math.floor(leafDiameters.length*.5)],p99:leafDiameters[Math.floor(leafDiameters.length*.99)],max:leafDiameters.at(-1)},limits:'All actual vertices; conservative coefficient envelope, not a GPU wind simulation. Triangle totals are recorded, not raised into an aesthetic threshold.'};await save();
  104 |   expect(invalid,'finite attributes, unit normals, valid triangles and leaf dimensions').toBe(0);expect(boundsFailures,'actual wind envelope remains in the returned common box AND sphere').toBe(0);expect(rootFailures,'all physical root components and ground-contact vertices remain fixed').toBe(0);expect(rootVertices).toBeGreaterThan(100);
  105 | });
  106 | 
  107 | function supports(g:THREE.BufferGeometry,yMin:number,yMax:number){
  108 |   const p=vertices(g),directions=Array.from({length:16},(_,i)=>[Math.cos(i*Math.PI/8),Math.sin(i*Math.PI/8)]),global=new Array<number>(16).fill(-Infinity),bands=Array.from({length:8},()=>new Array<number>(16).fill(-Infinity));
  109 |   for(let i=0;i<p.count;i++){
  110 |     directions.forEach(([x,z],j)=>{global[j]=Math.max(global[j],p.getX(i)*x+p.getZ(i)*z);});
  111 |   }
  112 |   // Proxy triangles may cross an entire band without placing a vertex in it.
  113 |   // Clip the actual indexed surface to each height slab, avoiding a false
  114 |   // silhouette gap from comparing only vertex counts at different densities.
  115 |   const clip=(poly:number[][],y:number,above:boolean)=>{
  116 |     const result:number[][]=[];
  117 |     for(let i=0;i<poly.length;i++){
  118 |       const a=poly[i],b=poly[(i+1)%poly.length],insideA=above?a[1]>=y:a[1]<=y,insideB=above?b[1]>=y:b[1]<=y;
  119 |       if(insideA)result.push(a);
  120 |       if(insideA!==insideB){const t=(y-a[1])/(b[1]-a[1]);result.push(a.map((v,j)=>v+(b[j]-v)*t));}
  121 |     }
  122 |     return result;
  123 |   };
  124 |   const index=g.getIndex()!,span=(yMax-yMin)/8;
  125 |   for(let i=0;i<index.count;i+=3){
  126 |     const triangle=[0,1,2].map(j=>{const id=index.getX(i+j);return [p.getX(id),p.getY(id),p.getZ(id)];}),lo=Math.min(...triangle.map(v=>v[1])),hi=Math.max(...triangle.map(v=>v[1]));
  127 |     for(let band=Math.max(0,Math.floor((lo-yMin)/span));band<=Math.min(7,Math.floor((hi-yMin)/span));band++){
  128 |       const polygon=clip(clip(triangle,yMin+span*band,true),yMin+span*(band+1),false);
  129 |       for(const v of polygon)directions.forEach(([x,z],j)=>{bands[band][j]=Math.max(bands[band][j],v[0]*x+v[2]*z);});
  130 |     }
  131 |   }
  132 |   return {global,bands};
  133 | }
  134 | test('LOD crowns retain actual directional silhouettes and every authored cluster rather than just copied bounds',async()=>{
  135 |   const rows:unknown[]=[],failures:string[]=[];let missingClusters=0,worstClusterDistance=0,worstSupportDelta=0,worstBandDelta=0;
  136 |   for(let id=0;id<prototypes.length;id++){
  137 |     const levels=prototypes[id],near=levels[0],box=rawBox(near.leaves),reference=supports(near.leaves,box.min.y,box.max.y),counts=levels.map(p=>triangles(p.wood)+triangles(p.leaves));
  138 |     expect(counts[0]).toBeGreaterThan(counts[1]);expect(counts[1]).toBeGreaterThan(counts[2]);
  139 |     const row:Record<string,unknown>={kind:id>>2,architecture:id%4,triangles:counts,details:[]};
  140 |     for(let detail=0;detail<3;detail++){
  141 |       const prototype=levels[detail],p=vertices(prototype.leaves),actual=rawBox(prototype.leaves),profile=supports(prototype.leaves,box.min.y,box.max.y);
  142 |       let clusterDistance=0,supportDelta=0,bandDelta=0;
  143 |       for(const {center} of near.clusterLayout){let closest=Infinity;for(let i=0;i<p.count;i++){const dx=p.getX(i)-center[0],dy=p.getY(i)-center[1],dz=p.getZ(i)-center[2];closest=Math.min(closest,Math.hypot(dx,dy,dz));}clusterDistance=Math.max(clusterDistance,closest);if(closest>.45)missingClusters++;}
  144 |       for(let dir=0;dir<16;dir++){
  145 |         supportDelta=Math.max(supportDelta,Math.abs(profile.global[dir]-reference.global[dir]));
  146 |         for(let band=0;band<8;band++)if(Number.isFinite(reference.bands[band][dir]))bandDelta=Math.max(bandDelta,Math.abs(profile.bands[band][dir]-reference.bands[band][dir]));
  147 |       }
  148 |       worstClusterDistance=Math.max(worstClusterDistance,clusterDistance);worstSupportDelta=Math.max(worstSupportDelta,supportDelta);worstBandDelta=Math.max(worstBandDelta,bandDelta);
  149 |       if(Math.abs(actual.min.y-box.min.y)>.0001||Math.abs(actual.max.y-box.max.y)>.0001)failures.push(`${id}/${detail} crown height changes`);
  150 |       if(supportDelta>=near.radius*.12)failures.push(`${id}/${detail} 16-direction support ${supportDelta} >= ${near.radius*.12}`);
  151 |       if(bandDelta>=near.radius*.25)failures.push(`${id}/${detail} clipped-band support ${bandDelta} >= ${near.radius*.25}`);
  152 |       (row.details as unknown[]).push({detail,actualBounds:actual,clusterDistance,supportDelta,bandDelta});
  153 |     }
  154 |     rows.push(row);
  155 |   }
> 156 |   report.crownLod={rows,failures,missingClusters,worstClusterDistance,worstSupportDelta,worstBandDelta,method:'Actual vertex global support functions in 16 azimuths; actual indexed triangle surfaces clipped into 8 height bands; nearest actual leaf vertex to every near crown cluster. Metadata common sphere equality is not a silhouette criterion.'};await save();expect(missingClusters).toBe(0);expect(failures,'12% global and 25% local actual crown-radius limits').toEqual([]);
      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  ^ Error: 12% global and 25% local actual crown-radius limits
  157 | });
  158 | 
  159 | function invariantBranchSignature(p:WoodlandTree){
  160 |   const centers=components(p.wood).map(ids=>componentBox(p.wood,ids)).filter(box=>box.max.y>.8).map(box=>box.getCenter(new THREE.Vector3()));
  161 |   const pairwise:number[]=[];for(let i=0;i<centers.length;i++)for(let j=i+1;j<centers.length;j++)pairwise.push(centers[i].distanceTo(centers[j])/p.height);pairwise.sort((a,b)=>a-b);
  162 |   return {components:centers.length,quantiles:[.1,.25,.5,.75,.9].map(q=>pairwise[Math.floor((pairwise.length-1)*q)])};
  163 | }
  164 | test('architecture variants change actual branching topology or rigid-transform-invariant proportions',async()=>{
  165 |   const rows:unknown[]=[];
  166 |   for(let kind=0;kind<3;kind++){
  167 |     const signatures=[0,1,2,3].map(architecture=>invariantBranchSignature(prototypes[kind*4+architecture][0]));
  168 |     for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){
  169 |       const left=signatures[a],right=signatures[b],rms=Math.sqrt(left.quantiles.reduce((sum,x,i)=>sum+(x-right.quantiles[i])**2,0)/left.quantiles.length);
  170 |       rows.push({kind,a,b,left,right,rms});expect(left.components!==right.components||rms>.02,`species ${kind} architectures ${a}/${b} cannot differ only by scale/rotation`).toBe(true);
  171 |     }
  172 |     const young=prototypes[kind*4][0],veteran=prototypes[kind*4+2][0];expect(veteran.trunkSegments.length,'forked veteran has real additional leaders').toBeGreaterThan(young.trunkSegments.length);
  173 |   }
  174 |   report.architecture={rows,method:'Connected actual wood components and pairwise centroid distances normalized by actual height; invariant to uniform scale, translation and rotation. Same seed per species.'};await save();
  175 | });
  176 | 
  177 | test('actual cells retain grounded trunks and share continuous main-camera weights with all shadow and merged levels',async()=>{
  178 |   const height=(x:number,z:number)=>20+(x+210)*.12+(z+220)*.08;
  179 |   const protectedOutside=(x:number,z:number,extra:number)=>x-extra< -240||x+extra> -186||z-extra< -249||z+extra> -187;
  180 |   const population=createWoodlandPopulation(height,protectedOutside);population.prototypes.flat().forEach(track);[...population.grass,...population.ferns,population.litter].forEach(g=>disposeGeometry.add(g));
  181 |   const field=createWoodlandLodField(population.cells.size+population.meadowCells.size),materials=createWoodlandMaterials(field),group=new THREE.Group();disposeTexture.add(field.texture);
  182 |   const rendering=createWoodlandRenderCells(group,population,materials,height,field);group.updateMatrixWorld(true);
  183 |   group.traverse(o=>{if(o instanceof THREE.Mesh){disposeGeometry.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>disposeMaterial.add(m));if(o.customDepthMaterial)disposeMaterial.add(o.customDepthMaterial);}});
  184 |   materials.levels.forEach(level=>[level.bark,level.living,level.depth].forEach(m=>disposeMaterial.add(m)));disposeMaterial.add(materials.litterMaterial);
  185 |   let groundMaximum=-Infinity,groundMinimum=Infinity,groundSamples=0,rootWindFailures=0;
  186 |   const v=new THREE.Vector3();
  187 |   for(const tree of population.trees){
  188 |     const p=population.prototypes[tree.seed][0].wood,pos=vertices(p),sway=p.getAttribute('woodlandSway'),wind=p.getAttribute('woodlandWind');
  189 |     for(let i=0;i<pos.count;i++)if(Math.abs(pos.getY(i))<1e-6){v.fromBufferAttribute(pos,i).applyMatrix4(tree.matrix);const gap=v.y-height(v.x,v.z);groundMaximum=Math.max(groundMaximum,gap);groundMinimum=Math.min(groundMinimum,gap);groundSamples++;if(sway.getX(i)!==0||wind.getX(i)!==0)rootWindFailures++;}
  190 |     const base=population.prototypes[tree.seed][0].trunkSegments[0].a;v.fromArray(base).applyMatrix4(tree.matrix);expect(v.y-height(v.x,v.z),'actual low main trunk reaches the slope').toBeLessThanOrEqual(.03);expect(v.y-height(v.x,v.z)).toBeGreaterThan(-.75);
  191 |   }
  192 |   expect(population.trees.length).toBeGreaterThan(20);expect(groundSamples).toBeGreaterThan(100);expect(groundMaximum,'all root contact vertices stay on or slightly within the slope').toBeLessThanOrEqual(.012);expect(groundMinimum).toBeGreaterThan(-.75);expect(rootWindFailures).toBe(0);
  193 |   const camera=new THREE.PerspectiveCamera(),cell=rendering.forestLODs[0],distance0=cell.levels[1].distance,distance1=cell.levels[2].distance,center=new THREE.Vector3().setFromMatrixPosition(cell.matrixWorld);
  194 |   const weights=()=>[0,1,2].map(i=>field.data[cell.cellId*4+i]/255),walk:unknown[]=[];let overlap0=0,overlap1=0,maximumWeightStep=0,maximumSumError=0,visibleZeroByteLayers=0;let previous:number[]|undefined;
  195 |   const sample=(d:number)=>{camera.position.copy(center).x+=d;camera.updateMatrixWorld(true);rendering.prepare(camera);return weights();};
  196 |   expect(sample(10),'10m camera keeps the full detailed crown').toEqual([1,0,0]);
  197 |   for(let d=0;d<=distance1+10;d+=.5){
  198 |     const w=sample(d),sum=w.reduce((a,b)=>a+b,0);maximumSumError=Math.max(maximumSumError,Math.abs(sum-1));if(previous)maximumWeightStep=Math.max(maximumWeightStep,...w.map((a,i)=>Math.abs(a-previous![i])));previous=w;
  199 |     if(w[0]>0&&w[1]>0)overlap0++;if(w[1]>0&&w[2]>0)overlap1++;walk.push({distance:d,weights:w,levelVisibility:cell.levels.map(l=>l.object.visible)});
  200 |     for(let level=0;level<3;level++){
  201 |       if(w[level]>0)expect(cell.levels[level].object.visible,'a nonzero encoded level must be drawn').toBe(true);
  202 |       if(!cell.levels[level].object.visible)expect(w[level]).toBe(0);
  203 |       if(w[level]===0&&cell.levels[level].object.visible)visibleZeroByteLayers++;
  204 |     }
  205 |   }
  206 |   expect(overlap0).toBeGreaterThan(8);expect(overlap1).toBeGreaterThan(8);expect(maximumSumError).toBeLessThanOrEqual(2/255);expect(maximumWeightStep).toBeLessThan(.09);
  207 |   expect(sample(1200).reduce((a,b)=>a+b,0),'all canopy layers fade at distant cull').toBeGreaterThan(.3);expect(weights().reduce((a,b)=>a+b,0)).toBeLessThan(.7);expect(sample(1211)).toEqual([0,0,0]);
  208 |   const fieldTests:unknown[]=[];let shaderFailures=0;
  209 |   for(let level=0;level<3;level++){
  210 |     const shaders=[materials.levels[level].bark,materials.levels[level].living,materials.levels[level].depth].map((material,i)=>{
  211 |       const template=i===2?THREE.ShaderLib.depth:THREE.ShaderLib.standard,shader={uniforms:THREE.UniformsUtils.clone(template.uniforms),vertexShader:template.vertexShader,fragmentShader:template.fragmentShader};
  212 |       material.onBeforeCompile(shader as Parameters<THREE.Material['onBeforeCompile']>[0],{} as THREE.WebGLRenderer);return shader;
  213 |     });
  214 |     const guards=shaders.map(s=>s.fragmentShader.slice(s.fragmentShader.indexOf('vec3 woodlandWeights='),s.fragmentShader.indexOf('discard;')+8));
  215 |     for(const shader of shaders)if(shader.uniforms.uForestCells.value!==field.texture||shader.uniforms.uForestCellCount.value!==field.count||shader.uniforms.uWoodlandTime!==materials.time)shaderFailures++;
  216 |     if(!guards[0]||guards.some(g=>g!==guards[0]))shaderFailures++;
  217 |     fieldTests.push({level,sameDataTexture:shaders.every(s=>s.uniforms.uForestCells.value===field.texture),sameGeneratedDitherGuard:guards.every(g=>g===guards[0])});
  218 |   }
  219 |   sample(distance0);const mainWeights=Array.from(field.data),shadowCamera=new THREE.PerspectiveCamera();shadowCamera.position.set(900,100,900);shadowCamera.updateMatrixWorld(true);
  220 |   group.traverse(o=>{if(o instanceof THREE.Mesh)o.onBeforeRender({} as THREE.WebGLRenderer,new THREE.Scene(),shadowCamera,o.geometry,Array.isArray(o.material)?o.material[0]:o.material,new THREE.Group());});
  221 |   expect(Array.from(field.data),'shadow draw callbacks must not recompute the main-camera field').toEqual(mainWeights);expect(rendering.forestLODs.every(l=>l.autoUpdate===false)).toBe(true);expect(shaderFailures).toBe(0);
  222 |   let instancedIds=0,mergedIds=0,idFailures=0,budgetTriangles=0,meshCount=0;
  223 |   group.traverse(o=>{if(!(o instanceof THREE.Mesh)||o.material===materials.litterMaterial)return;meshCount++;budgetTriangles+=triangles(o.geometry)*(o instanceof THREE.InstancedMesh?o.count:1);const ids=o.geometry.getAttribute('forestCellId'),p=vertices(o.geometry);if(!ids){idFailures++;return;}if(o instanceof THREE.InstancedMesh){instancedIds+=ids.count;if(ids.count!==o.count)idFailures++;}else{mergedIds+=ids.count;if(ids.count!==p.count)idFailures++;}for(let i=0;i<ids.count;i++)if(ids.getX(i)<0||ids.getX(i)>=field.count||!Number.isInteger(ids.getX(i)))idFailures++;});
  224 |   expect(instancedIds).toBeGreaterThan(0);expect(mergedIds).toBeGreaterThan(0);expect(idFailures).toBe(0);
  225 |   report.cells={syntheticSlopedFoundation:{height:'20 + (x+210)*.12 + (z+220)*.08',trees:population.trees.length,groundSamples,groundMinimum,groundMaximum,rootWindFailures},forestCells:rendering.forestLODs.length,meadowCells:rendering.meadowLODs.length,thresholds:[distance0,distance1],walkStepMetres:.5,walk,overlap0,overlap1,maximumWeightStep,maximumSumError,visibleZeroByteLayers,fieldTests,instancedIds,mergedIds,idFailures,allocatedAllLevelTriangles:budgetTriangles,meshCount,limitations:'Synthetic cropped population uses real placement/render builders. Allocated all-level triangles are not visible draw calls or GPU cost; shader hooks and shared uniform ownership are checked without compiling GLSL or proving visual dither quality.'};await save();
  226 | });
  227 | 
```
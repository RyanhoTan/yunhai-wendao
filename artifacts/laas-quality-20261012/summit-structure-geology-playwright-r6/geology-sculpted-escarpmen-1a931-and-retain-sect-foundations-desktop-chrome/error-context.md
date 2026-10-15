# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: geology.spec.ts >> sculpted escarpments have real detail, remain outside full road width and retain sect foundations
- Location: tests/geology.spec.ts:14:1

# Error details

```
RangeError: Maximum call stack size exceeded
```

# Test source

```ts
  42  |     const ledge=landNoise(bed,p.x*.012+p.z*.015+19);
  43  |     const bedPhase=bed-Math.floor(bed);
  44  |     // A broken lip projects from a bed, then retreats into its weathered
  45  |     // face. Local variation prevents a continuous ring around the mountain.
  46  |     const lip=(1-smooth(bedPhase,.52,.98))*smooth(bedPhase,0,.30)
  47  |       *smooth(landNoise(p.x*.052+p.y*.009+8,p.z*.047-21),-.55,.30);
  48  |     // These blocks turn and end with elevation. A nearly height-invariant
  49  |     // rib field produced the same vertical pleat through the entire wall.
  50  |     const ribs=landNoise(p.x*.033+p.y*.040,p.z*.039-p.y*.032);
  51  |     const fracture=landNoise(p.x*.49+p.y*.11+23,p.z*.43-p.y*.08-9);
  52  |     const channels=Math.abs(landNoise(p.x*.072+p.z*.015,p.y*.028+p.z*.060));
  53  |     const mountainShoulder=(1-smooth(Math.abs(p.x),110,155))*(1-smooth(Math.abs(p.z-7),100,143))*smooth(p.y,32,60);
  54  |     // The summit skin follows the same unequal, faulted beds as its mass.
  55  |     // Recesses cut into the projected rock volume, with the base behind them.
  56  |     const bedDetail=THREE.MathUtils.lerp(ledge*1.6+lip*1.5,summitBedRelief(p.x,p.y,p.z),mountainShoulder);
  57  |     let depth=Math.max(.12,1.9+bedDetail+ribs*2.2+fracture*.34-channels*.80)*exposure;
  58  |     depth=Math.min(12,depth*(1+mountainShoulder*.60));
  59  |     // Large shelves remain embedded, and stop before protected water/building
  60  |     // volumes. Road exposure independently preserves walking headroom.
  61  |     if(surfaceExposure(p.x+normal.x*depth,p.y,p.z+normal.z*depth)<.02){
  62  |       let lo=0,hi=depth;
  63  |       for(let i=0;i<10;i++){const m=(lo+hi)*.5;if(surfaceExposure(p.x+normal.x*m,p.y,p.z+normal.z*m)>=.02)lo=m;else hi=m;}
  64  |       depth=lo;
  65  |     }
  66  |     return p.clone().addScaledVector(normal,depth-.025*(1-exposure));
  67  |   };
  68  |   const clip=(poly:THREE.Vector3[],height:number,above:boolean)=>{
  69  |     const result:THREE.Vector3[]=[];
  70  |     for(let i=0;i<poly.length;i++){
  71  |       const a=poly[i],b=poly[(i+1)%poly.length],insideA=above?a.y>=height:a.y<=height,insideB=above?b.y>=height:b.y<=height;
  72  |       if(insideA)result.push(a);
  73  |       if(insideA!==insideB)result.push(a.clone().lerp(b,(height-a.y)/(b.y-a.y)));
  74  |     }
  75  |     return result;
  76  |   };
  77  |   const baseFaces:GeologicalBaseTriangle[]=[];
  78  |   for(const cell of eligible){
  79  |     const [x,z]=cell.split(',').map(Number);
  80  |     const corners=[new THREE.Vector3(x,heightAt(x,z),z),new THREE.Vector3(x,heightAt(x,z+1),z+1),new THREE.Vector3(x+1,heightAt(x+1,z),z),new THREE.Vector3(x+1,heightAt(x+1,z+1),z+1)];
  81  |     const key=`${Math.floor(x/48)},${Math.floor(z/48)}`;
  82  |     for(const indices of [[0,1,2],[2,1,3]]){
  83  |       const triangle=indices.map(i=>corners[i]),lo=Math.min(...triangle.map(p=>p.y)),hi=Math.max(...triangle.map(p=>p.y));
  84  |       for(let row=Math.floor(lo/bandHeight);row<=Math.floor(hi/bandHeight);row++){
  85  |         const poly=clip(clip(triangle,row*bandHeight,true),(row+1)*bandHeight,false);
  86  |         for(let i=1;i<poly.length-1;i++){
  87  |           if(new THREE.Vector3().subVectors(poly[i],poly[0]).cross(new THREE.Vector3().subVectors(poly[i+1],poly[0])).lengthSq()<1e-12)continue;
  88  |           const metadata:GeologicalFaceOwnership={batch:key,cell,row};
  89  |           baseFaces.push({base:[poly[0],poly[i],poly[i+1]],metadata});
  90  |         }
  91  |       }
  92  |     }
  93  |     cells++;
  94  |   }
  95  |   // This module refines the main mountain, keeping other land and the coast
  96  |   // at their existing resolution. All main-mountain tiles share decisions.
  97  |   // Lock only edges shared with the unchanged outer mesh to keep it conforming.
  98  |   const inPatch=(t:GeologicalBaseTriangle)=>t.base.every(p=>p.x>=-170&&p.x<=170&&p.z>=-160&&p.z<=94);
  99  |   const patch=baseFaces.filter(inPatch),outer=baseFaces.filter(t=>!inPatch(t));
  100 |   const baseKey=(p:THREE.Vector3)=>canonicalGeologicalBase(p).toArray().join(',');
  101 |   const faceEdges=(t:GeologicalBaseTriangle)=>{const keys=t.base.map(baseKey);return keys.map((a,i)=>{const b=keys[(i+1)%3];return a<b?`${a}|${b}`:`${b}|${a}`;});};
  102 |   const patchEdges=new Set(patch.flatMap(faceEdges)),protectedEdgeKeys=new Set<string>();
  103 |   for(const t of outer)for(const key of faceEdges(t))if(patchEdges.has(key))protectedEdgeKeys.add(key);
  104 |   patchEdges.clear();
  105 |   onProgress?.({phase:'base',inputTriangles:baseFaces.length,patchTriangles:patch.length,outerTriangles:outer.length,protectedEdges:protectedEdgeKeys.size});
  106 |   const refined=refineGeologicalFaces(patch,p=>point(new THREE.Vector3(p.x,p.y,p.z)),{maxTriangles:650000,protectedEdgeKeys,onInputConsumed:()=>{baseFaces.length=0;patch.length=0;}});
  107 |   onProgress?.({phase:'refined',...refined.stats});
  108 |   const boundaryVertices=new Map<string,GeologicalRefinementVertex>();
  109 |   for(const edge of protectedEdgeKeys)for(const key of edge.split('|')){const vertex=refined.vertexCache.get(key);if(vertex)boundaryVertices.set(key,vertex);}
  110 |   refined.vertexCache.clear();
  111 |   const refinedBounds=new Map<string,THREE.Box3>();
  112 |   const append=(triangle:{metadata:GeologicalFaceOwnership;vertices:readonly GeologicalRefinementVertex[]})=>{
  113 |     const {metadata,vertices}=triangle,[a,b,c]=vertices;
  114 |     if(new THREE.Vector3().subVectors(b.world,a.world).cross(new THREE.Vector3().subVectors(c.world,a.world)).lengthSq()<1e-12)return;
  115 |     const batch:Batch=batches.get(metadata.batch)??{positions:[],indices:[],vertices:new Map(),solids:[]};batches.set(metadata.batch,batch);
  116 |     for(const vertex of vertices){
  117 |       let index=batch.vertices.get(vertex.key);
  118 |       if(index===undefined){index=batch.positions.length/3;batch.vertices.set(vertex.key,index);batch.positions.push(...vertex.world.toArray());}
  119 |       batch.indices.push(index);
  120 |     }
  121 |     batch.solids.push(triangleBodySolid(a.world,b.world,c.world,.08,.06));
  122 |     const boundsKey=`${metadata.cell}/${metadata.row}`,box=refinedBounds.get(boundsKey)??new THREE.Box3();
  123 |     for(const vertex of vertices)box.expandByPoint(vertex.world);
  124 |     refinedBounds.set(boundsKey,box);
  125 |   };
  126 |   for(let i=0;i<refined.triangles.length;i++){
  127 |     append(refined.triangles[i]);
  128 |     // Release each authoring face as its runtime representation is built.
  129 |     delete refined.triangles[i];
  130 |   }
  131 |   const outerVertices=new Map<string,GeologicalRefinementVertex>();
  132 |   for(const t of outer){
  133 |     const vertices=t.base.map(p=>{const base=canonicalGeologicalBase(p),key=base.toArray().join(',');let vertex=outerVertices.get(key)??boundaryVertices.get(key);
  134 |       if(!vertex){vertex={key,base,world:point(base)};outerVertices.set(key,vertex);}return vertex;});
  135 |     append({metadata:t.metadata,vertices});
  136 |   }
  137 |   const unchangedOuterTriangles=outer.length;
  138 |   // Collision faces already own their points; release authoring/probe data
  139 |   // before allocating GPU buffers and cross-tile normals.
  140 |   outerVertices.clear();boundaryVertices.clear();refined.triangles.length=0;
  141 |   baseFaces.length=0;patch.length=0;outer.length=0;
> 142 |   cameraOccluders.push(...refinedBounds.values());
      |                   ^ RangeError: Maximum call stack size exceeded
  143 |   const sharedNormals=new Map<string,THREE.Vector3>();
  144 |   for(const batch of batches.values()){
  145 |     const keys=Array.from(batch.vertices.keys()),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),face=new THREE.Vector3();
  146 |     for(let i=0;i<batch.indices.length;i+=3){
  147 |       const ids=batch.indices.slice(i,i+3);a.fromArray(batch.positions,ids[0]*3);b.fromArray(batch.positions,ids[1]*3);c.fromArray(batch.positions,ids[2]*3);face.subVectors(b,a).cross(c.sub(a));
  148 |       for(const id of ids){const n=sharedNormals.get(keys[id])??new THREE.Vector3();n.add(face);sharedNormals.set(keys[id],n);}
  149 |     }
  150 |   }
  151 |   for(const [key,batch] of batches){
  152 |     if(!batch.indices.length)continue;
  153 |     const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(batch.positions,3));
  154 |     geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(batch.positions.length),3));geometry.setIndex(batch.indices);
  155 |     const normals=Array.from(batch.vertices.keys()).flatMap(key=>(sharedNormals.get(key)??new THREE.Vector3(0,1,0)).clone().normalize().toArray());geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.computeBoundingBox();geometry.computeBoundingSphere();
  156 |     const mesh=new THREE.Mesh(geometry,material);mesh.name=`GeologicalFace_${key}`;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
  157 |     bodySolids.push(bodyCollisionMesh(batch.solids));
  158 |   }
  159 |   if(!group.children.length)material.dispose();
  160 |   group.userData={cells,tiles:group.children.length,triangles:bodySolids.reduce((n,b)=>n+b.solids.length,0),bandHeight,maxOutward:12,coastLimitZ:94,refinement:{...refined.stats,scope:'main-mountain',bounds:{minX:-170,maxX:170,minZ:-160,maxZ:94},unchangedOuterTriangles}};
  161 |   return {rainOccluders:cameraOccluders,cameraMeshes:group.children as THREE.Mesh[],bodySolids};
  162 | }
  163 | 
```
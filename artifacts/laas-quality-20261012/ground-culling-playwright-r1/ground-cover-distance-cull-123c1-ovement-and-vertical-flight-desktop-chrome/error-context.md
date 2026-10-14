# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ground-cover.spec.ts >> distance culling retains complete visible envelopes during subthreshold movement and vertical flight
- Location: tests/ground-cover.spec.ts:11:1

# Error details

```
Error: same-tile vertical flight removes wholly distant ground

expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 102
```

# Test source

```ts
  1   | import {test,expect} from '@playwright/test';
  2   | import * as THREE from 'three';
  3   | import {mkdir,writeFile,readFile} from 'node:fs/promises';
  4   | import {createHash} from 'node:crypto';
  5   | import {createGroundCover} from '../src/world/GroundCover';
  6   | import {terrainSurfaceHeight,groundCoverProtectedPoint,roadDistance} from '../src/world/TerrainField';
  7   | import {ascentDistance} from '../src/world/MountainLayout';
  8   | import {createGroundObstacleQuery} from '../src/world/GroundCoverObstacles';
  9   | import {bodyCollisionMesh,boxBodySolid,triangleBodySolid,bodyPointBlocked} from '../src/core/StaticBodyCollision';
  10  | 
  11  | test('distance culling retains complete visible envelopes during subthreshold movement and vertical flight',async()=>{
  12  |   test.setTimeout(120000);
  13  |   const stage=process.env.GROUND_CULLING_STAGE??`ground-culling-validation-${Date.now()}`;
  14  |   if(!/^ground-culling-validation-[a-z0-9-]+$/.test(stage))throw new Error('Invalid culling evidence stage');
  15  |   const out=`artifacts/laas-quality-20261012/${stage}`;await mkdir(out,{recursive:false});
  16  |   const files=['src/world/GroundCover.ts','src/world/GroundCoverPlacement.ts','tests/ground-cover.spec.ts'];
  17  |   const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
  18  |   const sourceHashes=await hashes(),ground=createGroundCover(new THREE.Group(),terrainSurfaceHeight,groundCoverProtectedPoint,[{x:-216,z:-224,r:.5,canopyRadius:5}],{value:0});
  19  |   const camera=new THREE.PerspectiveCamera(),matrix=new THREE.Matrix4(),box=new THREE.Box3(),corner=new THREE.Vector3();
  20  |   const anchor=new THREE.Vector3(-212,terrainSurfaceHeight(-212,-220)+2,-220),records=[];
  21  |   const identity=(kind:string,m:THREE.Matrix4)=>`${kind}:${m.elements.join(',')}`;
  22  |   let checked=0,nearby=0,omitted=0,maxSphereOverflow=-Infinity,maxRadius=0;
  23  |   for(const offset of [[0,0,0],[.74,0,0],[0,.74,0],[0,0,.74],[.42,.42,.42],[0,20,0],[0,36,0],[0,0,0]]){
  24  |     camera.position.copy(anchor).add(new THREE.Vector3(...offset));camera.updateMatrixWorld();ground.prepare(camera);
  25  |     const selected=new Set<string>();
  26  |     for(const [kind,mesh] of ground.meshes)for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);selected.add(identity(kind,matrix));}
  27  |     const cx=Math.floor(camera.position.x/8),cz=Math.floor(camera.position.z/8);
  28  |     let visible=0,missing=0;
  29  |     for(let z=cz-4;z<=cz+4;z++)for(let x=cx-4;x<=cx+4;x++){
  30  |       const cell=ground.cache.get(`${x},${z}`)!;expect(cell.spheres.length).toBe(cell.plants.length*4);
  31  |       for(let i=0;i<cell.plants.length;i++){
  32  |         const plant=cell.plants[i],s=i*4;matrix.fromArray(cell.matrices,plant.matrixOffset);
  33  |         box.copy(ground.supports.get(plant.kind)!.bounds).applyMatrix4(matrix).expandByScalar(.11);
  34  |         const radius=cell.spheres[s+3];maxRadius=Math.max(maxRadius,radius);
  35  |         for(let j=0;j<8;j++){
  36  |           corner.set(j&1?box.max.x:box.min.x,j&2?box.max.y:box.min.y,j&4?box.max.z:box.min.z);
  37  |           maxSphereOverflow=Math.max(maxSphereOverflow,corner.distanceTo(new THREE.Vector3(cell.spheres[s],cell.spheres[s+1],cell.spheres[s+2]))-radius);
  38  |         }
  39  |         checked++;
  40  |         if(box.distanceToPoint(camera.position)<=24){visible++;if(!selected.has(identity(plant.kind,matrix)))missing++;}
  41  |         if(box.distanceToPoint(camera.position)<=10)nearby++;
  42  |         if(!selected.has(identity(plant.kind,matrix)))omitted++;
  43  |       }
  44  |     }
  45  |     expect(missing,'independent transformed boxes inside shader range remain submitted').toBe(0);
  46  |     records.push({offset,submitted:selected.size,visibleEnvelopes:visible,missing});
  47  |   }
  48  |   expect(maxSphereOverflow,'cached Float32 spheres enclose actual transformed geometry and wind').toBeLessThanOrEqual(0);
  49  |   expect(nearby).toBeGreaterThan(1000);expect(omitted).toBeGreaterThan(1000);
> 50  |   expect(records[6].submitted,'same-tile vertical flight removes wholly distant ground').toBe(0);
      |                                                                                          ^ Error: same-tile vertical flight removes wholly distant ground
  51  |   expect(records.at(-1)!.submitted).toBe(records[0].submitted);
  52  |   const sourceHashesAtEnd=await hashes();expect(sourceHashesAtEnd).toEqual(sourceHashes);
  53  |   await writeFile(`${out}/metrics.json`,JSON.stringify({sourceHashes,sourceHashesAtEnd,checked,nearby,omitted,maxSphereOverflow,maxRadius,records,scope:'Independent actual transformed geometry envelope coverage, Float32 sphere containment, subthreshold 3D movement and same-tile vertical flight; does not establish pixel equality or frame cost.'},null,2)+'\n');
  54  |   const disposed=new Set<THREE.Material>();for(const mesh of ground.meshes.values()){mesh.geometry.dispose();mesh.dispose();for(const material of [mesh.material as THREE.Material,mesh.customDepthMaterial!])if(!disposed.has(material)){material.dispose();disposed.add(material);}}
  55  | });
  56  | 
  57  | test('full fern envelope excludes late rock slabs even when its pivot clears the player volume',()=>{
  58  |   const meshes:ReturnType<typeof bodyCollisionMesh>[]=[],walls:THREE.Box3[]=[],blocked=createGroundObstacleQuery(walls,meshes);
  59  |   expect(blocked(0,0,0,.9)).toBe(false);
  60  |   meshes.push(bodyCollisionMesh([boxBodySolid(new THREE.Box3(new THREE.Vector3(.8,0,-1),new THREE.Vector3(1.2,1,1)))]));
  61  |   expect(bodyPointBlocked(meshes,new THREE.Vector3(0,0,0))).toBe(false);
  62  |   expect(blocked(0,0,0,.9)).toBe(true);expect(blocked(0,0,0,.2)).toBe(false);
  63  |   meshes.splice(0,1,bodyCollisionMesh([triangleBodySolid(new THREE.Vector3(.8,0,-1),new THREE.Vector3(.8,0,1),new THREE.Vector3(.8,1,0),.02,.02)]));
  64  |   expect(blocked(0,0,0,.9)).toBe(true);expect(blocked(0,0,0,.2)).toBe(false);
  65  |   walls.push(new THREE.Box3(new THREE.Vector3(-.3,0,-.1),new THREE.Vector3(-.2,.5,.1)));
  66  |   expect(blocked(0,0,0,.25)).toBe(true);
  67  |   walls.push(new THREE.Box3(new THREE.Vector3(2,1.3,-.1),new THREE.Vector3(2.2,1.5,.1)));
  68  |   const tallTiltedEnvelope=new THREE.Box3(new THREE.Vector3(1.9,-.25,-.2),new THREE.Vector3(2.25,1.4,.2));
  69  |   expect(blocked(2,0,0,.1,tallTiltedEnvelope)).toBe(true);
  70  | });
  71  | 
  72  | test('real forest-floor roots, complete tilted silhouettes and deterministic cache remain grounded and clear',async()=>{
  73  |   test.setTimeout(120000);
  74  |   const stage=process.env.GROUND_VALIDATION_STAGE??`ground-validation-${Date.now()}`;
  75  |   if(!/^ground-validation-[a-z0-9-]+$/.test(stage))throw new Error('Invalid ground evidence stage');
  76  |   const out=`artifacts/laas-quality-20261012/${stage}`;await mkdir(out,{recursive:false});
  77  |   const sourceFiles=['GroundCover','GroundCoverGeometry','GroundCoverPlacement','GroundCoverMaterials','GroundCoverObstacles','GroundUnderstoryGeometry','GroundCoverage','TerrainField'].map(name=>`src/world/${name}.ts`).concat(['tests/ground-cover.spec.ts']);
  78  |   const hashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
  79  |   const sourceHashes=await hashes();
  80  |   const root=new THREE.Group(),trees=[{x:-391,z:-150,r:.55,canopyRadius:5},{x:-216,z:-224,r:.50,canopyRadius:5}];
  81  |   const obstacleHeight=terrainSurfaceHeight(-219,-226),obstacle=new THREE.Box3(new THREE.Vector3(-220,obstacleHeight-.3,-227),new THREE.Vector3(-218,obstacleHeight+1.5,-225));
  82  |   const ground=createGroundCover(root,terrainSurfaceHeight,groundCoverProtectedPoint,trees,{value:0},createGroundObstacleQuery([],[bodyCollisionMesh([boxBodySolid(obstacle)])]));
  83  |   const camera=new THREE.PerspectiveCamera(),matrix=new THREE.Matrix4(),point=new THREE.Vector3(),counts:Record<string,number>={};
  84  |   let roots=0,maxGap=-Infinity,minGap=Infinity,roadIntrusions=0,rootWindFailures=0,boundsFailures=0,obstacleIntrusions=0;
  85  |   const instanceBox=new THREE.Box3();
  86  |   const snapshots=new Map<string,number[]>();
  87  |   for(const [x,z] of [[-394,-142],[-215,-222]]){
  88  |     camera.position.set(x,terrainSurfaceHeight(x,z)+2,z);camera.updateMatrixWorld();ground.prepare(camera);root.updateMatrixWorld(true);
  89  |     for(const [kind,mesh] of ground.meshes){
  90  |       counts[kind]=(counts[kind]??0)+mesh.count;
  91  |       const p=mesh.geometry.getAttribute('position'),wind=mesh.geometry.getAttribute('woodlandWind'),sway=mesh.geometry.getAttribute('woodlandSway'),support=ground.supports.get(kind)!;
  92  |       for(let instance=0;instance<mesh.count;instance++){
  93  |         mesh.getMatrixAt(instance,matrix);point.setFromMatrixPosition(matrix);
  94  |         if(instanceBox.copy(support.bounds).applyMatrix4(matrix).expandByScalar(.10).intersectsBox(obstacle))obstacleIntrusions++;
  95  |         const id=`${kind}:${point.x.toFixed(5)}:${point.z.toFixed(5)}`;if(Math.hypot(point.x-x,point.z-z)<14)snapshots.set(id,Array.from(matrix.elements));
  96  |         for(const local of support.roots){point.copy(local).applyMatrix4(matrix);const gap=point.y-terrainSurfaceHeight(point.x,point.z);roots++;minGap=Math.min(minGap,gap);maxGap=Math.max(maxGap,gap);}
  97  |         for(let vertex=0;vertex<p.count;vertex++){
  98  |           point.fromBufferAttribute(p,vertex).applyMatrix4(matrix);
  99  |           if(point.y-terrainSurfaceHeight(point.x,point.z)>-.015&&Math.min(roadDistance(point.x,point.z),ascentDistance(point.x,point.z))<4.55)roadIntrusions++;
  100 |           if(mesh.boundingSphere!.distanceToPoint(point)>.0001)boundsFailures++;
  101 |           if(p.getY(vertex)<.0001&&(wind.getX(vertex)!==0||sway.getX(vertex)!==0))rootWindFailures++;
  102 |         }
  103 |       }
  104 |     }
  105 |   }
  106 |   expect(roots).toBeGreaterThan(1000);expect(maxGap).toBeLessThan(.003);expect(minGap).toBeGreaterThan(-.20);
  107 |   expect(roadIntrusions,'entire inclined plants leave the eight metre deck and body margin clear').toBe(0);
  108 |   expect(rootWindFailures).toBe(0);expect(boundsFailures).toBe(0);
  109 |   expect(obstacleIntrusions,'production slab query excludes the complete transformed plant envelope').toBe(0);
  110 |   const geometries=Array.from(ground.meshes.values(),m=>m.geometry),materials=Array.from(ground.meshes.values(),m=>m.material);
  111 |   for(let i=0;i<35;i++){camera.position.set(-450+i*4,terrainSurfaceHeight(-450+i*4,-150)+2,-150);camera.updateMatrixWorld();ground.prepare(camera);expect(ground.cache.size).toBeLessThanOrEqual(256);}
  112 |   let restored=0;
  113 |   for(const [x,z] of [[-394,-142],[-215,-222]]){
  114 |     camera.position.set(x,terrainSurfaceHeight(x,z)+2,z);camera.updateMatrixWorld();ground.prepare(camera);
  115 |     for(const [kind,mesh] of ground.meshes){
  116 |       expect(mesh.geometry).toBe(geometries[Array.from(ground.meshes.keys()).indexOf(kind)]);expect(mesh.material).toBe(materials[Array.from(ground.meshes.keys()).indexOf(kind)]);
  117 |       for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix);const old=snapshots.get(`${kind}:${point.x.toFixed(5)}:${point.z.toFixed(5)}`);if(old){expect(Array.from(matrix.elements)).toEqual(old);restored++;}}
  118 |     }
  119 |   }
  120 |   expect(restored).toBe(snapshots.size);
  121 |   const sourceHashesAtEnd=await hashes();expect(sourceHashesAtEnd).toEqual(sourceHashes);
  122 |   await writeFile(`${out}/ground-metrics.json`,JSON.stringify({sourceHashes,sourceHashesAtEnd,roots,gap:{min:minGap,max:maxGap},counts,roadIntrusions,rootWindFailures,boundsFailures,obstacleIntrusions,restored,cachedCells:ground.cache.size,scope:'Actual terrain height roots, tilted full geometry road and production obstacle clearance, deterministic revisit after cache eviction and stable pooled geometry/material objects. Does not prove visual quality or runtime FPS.'},null,2)+'\n');
  123 |   const disposed=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  124 |   for(const mesh of ground.meshes.values()){mesh.geometry.dispose();mesh.dispose();for(const material of [mesh.material as THREE.Material,mesh.customDepthMaterial!]){if(disposed.has(material))continue;for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);material.dispose();disposed.add(material);}}
  125 |   textures.forEach(texture=>texture.dispose());
  126 | });
  127 | 
```
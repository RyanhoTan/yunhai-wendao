import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createGroundCover} from '../src/world/GroundCover';
import {terrainSurfaceHeight,groundCoverProtectedPoint,roadDistance} from '../src/world/TerrainField';
import {ascentDistance} from '../src/world/MountainLayout';
import {createGroundObstacleQuery} from '../src/world/GroundCoverObstacles';
import {bodyCollisionMesh,boxBodySolid,triangleBodySolid,bodyPointBlocked} from '../src/core/StaticBodyCollision';

test('distance culling retains complete visible envelopes during subthreshold movement and vertical flight',async()=>{
  test.setTimeout(120000);
  const stage=process.env.GROUND_CULLING_STAGE??`ground-culling-validation-${Date.now()}`;
  if(!/^ground-culling-validation-[a-z0-9-]+$/.test(stage))throw new Error('Invalid culling evidence stage');
  const out=`artifacts/laas-quality-20261012/${stage}`;await mkdir(out,{recursive:false});
  const files=['src/world/GroundCover.ts','src/world/GroundCoverPlacement.ts','tests/ground-cover.spec.ts'];
  const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
  const sourceHashes=await hashes(),ground=createGroundCover(new THREE.Group(),terrainSurfaceHeight,groundCoverProtectedPoint,[{x:-216,z:-224,r:.5,canopyRadius:5}],{value:0});
  const camera=new THREE.PerspectiveCamera(),matrix=new THREE.Matrix4(),box=new THREE.Box3(),corner=new THREE.Vector3();
  const anchor=new THREE.Vector3(-212,terrainSurfaceHeight(-212,-220)+2,-220),records=[];
  const identity=(kind:string,m:THREE.Matrix4)=>`${kind}:${m.elements.join(',')}`;
  let checked=0,nearby=0,omitted=0,maxSphereOverflow=-Infinity,maxRadius=0;
  for(const offset of [[0,0,0],[.74,0,0],[0,.74,0],[0,0,.74],[.42,.42,.42],[0,20,0],[0,80,0],[0,0,0]]){
    camera.position.copy(anchor).add(new THREE.Vector3(...offset));camera.updateMatrixWorld();ground.prepare(camera);
    const selected=new Set<string>();
    for(const [kind,mesh] of ground.meshes)for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);selected.add(identity(kind,matrix));}
    const cx=Math.floor(camera.position.x/8),cz=Math.floor(camera.position.z/8);
    let visible=0,missing=0;
    for(let z=cz-4;z<=cz+4;z++)for(let x=cx-4;x<=cx+4;x++){
      const cell=ground.cache.get(`${x},${z}`)!;expect(cell.spheres.length).toBe(cell.plants.length*4);
      for(let i=0;i<cell.plants.length;i++){
        const plant=cell.plants[i],s=i*4;matrix.fromArray(cell.matrices,plant.matrixOffset);
        box.copy(ground.supports.get(plant.kind)!.bounds).applyMatrix4(matrix).expandByScalar(.11);
        const radius=cell.spheres[s+3];maxRadius=Math.max(maxRadius,radius);
        for(let j=0;j<8;j++){
          corner.set(j&1?box.max.x:box.min.x,j&2?box.max.y:box.min.y,j&4?box.max.z:box.min.z);
          maxSphereOverflow=Math.max(maxSphereOverflow,corner.distanceTo(new THREE.Vector3(cell.spheres[s],cell.spheres[s+1],cell.spheres[s+2]))-radius);
        }
        checked++;
        if(box.distanceToPoint(camera.position)<=24){visible++;if(!selected.has(identity(plant.kind,matrix)))missing++;}
        if(box.distanceToPoint(camera.position)<=10)nearby++;
        if(!selected.has(identity(plant.kind,matrix)))omitted++;
      }
    }
    expect(missing,'independent transformed boxes inside shader range remain submitted').toBe(0);
    records.push({offset,submitted:selected.size,visibleEnvelopes:visible,missing});
  }
  const sourceHashesAtEnd=await hashes();expect(sourceHashesAtEnd).toEqual(sourceHashes);
  await writeFile(`${out}/metrics.json`,JSON.stringify({sourceHashes,sourceHashesAtEnd,checked,nearby,omitted,maxSphereOverflow,maxRadius,records,scope:'Independent actual transformed geometry envelope coverage, Float32 sphere containment, subthreshold 3D movement and same-tile vertical flight; does not establish pixel equality or frame cost.'},null,2)+'\n');
  expect(maxSphereOverflow,'cached Float32 spheres enclose actual transformed geometry and wind').toBeLessThanOrEqual(0);
  expect(nearby).toBeGreaterThan(1000);expect(omitted).toBeGreaterThan(1000);
  expect(records[6].submitted,'same-tile high flight removes wholly distant ground').toBe(0);
  expect(records.at(-1)!.submitted).toBe(records[0].submitted);
  const disposed=new Set<THREE.Material>();for(const mesh of ground.meshes.values()){mesh.geometry.dispose();mesh.dispose();for(const material of [mesh.material as THREE.Material,mesh.customDepthMaterial!])if(!disposed.has(material)){material.dispose();disposed.add(material);}}
});

test('full fern envelope excludes late rock slabs even when its pivot clears the player volume',()=>{
  const meshes:ReturnType<typeof bodyCollisionMesh>[]=[],walls:THREE.Box3[]=[],blocked=createGroundObstacleQuery(walls,meshes);
  expect(blocked(0,0,0,.9)).toBe(false);
  meshes.push(bodyCollisionMesh([boxBodySolid(new THREE.Box3(new THREE.Vector3(.8,0,-1),new THREE.Vector3(1.2,1,1)))]));
  expect(bodyPointBlocked(meshes,new THREE.Vector3(0,0,0))).toBe(false);
  expect(blocked(0,0,0,.9)).toBe(true);expect(blocked(0,0,0,.2)).toBe(false);
  meshes.splice(0,1,bodyCollisionMesh([triangleBodySolid(new THREE.Vector3(.8,0,-1),new THREE.Vector3(.8,0,1),new THREE.Vector3(.8,1,0),.02,.02)]));
  expect(blocked(0,0,0,.9)).toBe(true);expect(blocked(0,0,0,.2)).toBe(false);
  walls.push(new THREE.Box3(new THREE.Vector3(-.3,0,-.1),new THREE.Vector3(-.2,.5,.1)));
  expect(blocked(0,0,0,.25)).toBe(true);
  walls.push(new THREE.Box3(new THREE.Vector3(2,1.3,-.1),new THREE.Vector3(2.2,1.5,.1)));
  const tallTiltedEnvelope=new THREE.Box3(new THREE.Vector3(1.9,-.25,-.2),new THREE.Vector3(2.25,1.4,.2));
  expect(blocked(2,0,0,.1,tallTiltedEnvelope)).toBe(true);
});

test('physical obstacle query follows an existing body mesh when it is moved',()=>{
  const mesh=bodyCollisionMesh([boxBodySolid(new THREE.Box3(new THREE.Vector3(-1,0,-1),new THREE.Vector3(1,1,1)))]),blocked=createGroundObstacleQuery([],[mesh]);
  const probe=new THREE.Box3(new THREE.Vector3(-.2,0,-.2),new THREE.Vector3(.2,.5,.2));
  expect(blocked(0,0,0,.2,probe)).toBe(true);
  const moved=bodyCollisionMesh([boxBodySolid(new THREE.Box3(new THREE.Vector3(9,0,-1),new THREE.Vector3(11,1,1)))]);
  mesh.bounds.copy(moved.bounds);mesh.solids.splice(0,mesh.solids.length,...moved.solids);
  expect(blocked(0,0,0,.2,probe),'same bounds object no longer blocks its old location').toBe(false);
  probe.translate(new THREE.Vector3(10,0,0));expect(blocked(10,0,0,.2,probe)).toBe(true);
});

test('real forest-floor roots, complete tilted silhouettes and deterministic cache remain grounded and clear',async()=>{
  test.setTimeout(120000);
  const stage=process.env.GROUND_VALIDATION_STAGE??`ground-validation-${Date.now()}`;
  if(!/^ground-validation-[a-z0-9-]+$/.test(stage))throw new Error('Invalid ground evidence stage');
  const out=`artifacts/laas-quality-20261012/${stage}`;await mkdir(out,{recursive:false});
  const sourceFiles=['GroundCover','GroundCoverGeometry','GroundCoverPlacement','GroundCoverMaterials','GroundCoverObstacles','GroundUnderstoryGeometry','GroundCoverage','TerrainField'].map(name=>`src/world/${name}.ts`).concat(['tests/ground-cover.spec.ts']);
  const hashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
  const sourceHashes=await hashes();
  const root=new THREE.Group(),trees=[{x:-391,z:-150,r:.55,canopyRadius:5},{x:-216,z:-224,r:.50,canopyRadius:5}];
  const obstacleHeight=terrainSurfaceHeight(-219,-226),obstacle=new THREE.Box3(new THREE.Vector3(-220,obstacleHeight-.3,-227),new THREE.Vector3(-218,obstacleHeight+1.5,-225));
  const ground=createGroundCover(root,terrainSurfaceHeight,groundCoverProtectedPoint,trees,{value:0},createGroundObstacleQuery([],[bodyCollisionMesh([boxBodySolid(obstacle)])]));
  const camera=new THREE.PerspectiveCamera(),matrix=new THREE.Matrix4(),point=new THREE.Vector3(),counts:Record<string,number>={};
  let roots=0,maxGap=-Infinity,minGap=Infinity,roadIntrusions=0,rootWindFailures=0,boundsFailures=0,obstacleIntrusions=0;
  const instanceBox=new THREE.Box3();
  const snapshots=new Map<string,number[]>();
  for(const [x,z] of [[-394,-142],[-215,-222]]){
    camera.position.set(x,terrainSurfaceHeight(x,z)+2,z);camera.updateMatrixWorld();ground.prepare(camera);root.updateMatrixWorld(true);
    for(const [kind,mesh] of ground.meshes){
      counts[kind]=(counts[kind]??0)+mesh.count;
      const p=mesh.geometry.getAttribute('position'),wind=mesh.geometry.getAttribute('woodlandWind'),sway=mesh.geometry.getAttribute('woodlandSway'),support=ground.supports.get(kind)!;
      for(let instance=0;instance<mesh.count;instance++){
        mesh.getMatrixAt(instance,matrix);point.setFromMatrixPosition(matrix);
        if(instanceBox.copy(support.bounds).applyMatrix4(matrix).expandByScalar(.10).intersectsBox(obstacle))obstacleIntrusions++;
        const id=`${kind}:${point.x.toFixed(5)}:${point.z.toFixed(5)}`;if(Math.hypot(point.x-x,point.z-z)<14)snapshots.set(id,Array.from(matrix.elements));
        for(const local of support.roots){point.copy(local).applyMatrix4(matrix);const gap=point.y-terrainSurfaceHeight(point.x,point.z);roots++;minGap=Math.min(minGap,gap);maxGap=Math.max(maxGap,gap);}
        for(let vertex=0;vertex<p.count;vertex++){
          point.fromBufferAttribute(p,vertex).applyMatrix4(matrix);
          if(point.y-terrainSurfaceHeight(point.x,point.z)>-.015&&Math.min(roadDistance(point.x,point.z),ascentDistance(point.x,point.z))<4.55)roadIntrusions++;
          if(mesh.boundingSphere!.distanceToPoint(point)>.0001)boundsFailures++;
          if(p.getY(vertex)<.0001&&(wind.getX(vertex)!==0||sway.getX(vertex)!==0))rootWindFailures++;
        }
      }
    }
  }
  expect(roots).toBeGreaterThan(1000);expect(maxGap).toBeLessThan(.003);expect(minGap).toBeGreaterThan(-.20);
  expect(roadIntrusions,'entire inclined plants leave the eight metre deck and body margin clear').toBe(0);
  expect(rootWindFailures).toBe(0);expect(boundsFailures).toBe(0);
  expect(obstacleIntrusions,'production slab query excludes the complete transformed plant envelope').toBe(0);
  const geometries=Array.from(ground.meshes.values(),m=>m.geometry),materials=Array.from(ground.meshes.values(),m=>m.material);
  for(let i=0;i<35;i++){camera.position.set(-450+i*4,terrainSurfaceHeight(-450+i*4,-150)+2,-150);camera.updateMatrixWorld();ground.prepare(camera);expect(ground.cache.size).toBeLessThanOrEqual(256);}
  let restored=0;
  for(const [x,z] of [[-394,-142],[-215,-222]]){
    camera.position.set(x,terrainSurfaceHeight(x,z)+2,z);camera.updateMatrixWorld();ground.prepare(camera);
    for(const [kind,mesh] of ground.meshes){
      expect(mesh.geometry).toBe(geometries[Array.from(ground.meshes.keys()).indexOf(kind)]);expect(mesh.material).toBe(materials[Array.from(ground.meshes.keys()).indexOf(kind)]);
      for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix);const old=snapshots.get(`${kind}:${point.x.toFixed(5)}:${point.z.toFixed(5)}`);if(old){expect(Array.from(matrix.elements)).toEqual(old);restored++;}}
    }
  }
  expect(restored).toBe(snapshots.size);
  const sourceHashesAtEnd=await hashes();expect(sourceHashesAtEnd).toEqual(sourceHashes);
  await writeFile(`${out}/ground-metrics.json`,JSON.stringify({sourceHashes,sourceHashesAtEnd,roots,gap:{min:minGap,max:maxGap},counts,roadIntrusions,rootWindFailures,boundsFailures,obstacleIntrusions,restored,cachedCells:ground.cache.size,scope:'Actual terrain height roots, tilted full geometry road and production obstacle clearance, deterministic revisit after cache eviction and stable pooled geometry/material objects. Does not prove visual quality or runtime FPS.'},null,2)+'\n');
  const disposed=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  for(const mesh of ground.meshes.values()){mesh.geometry.dispose();mesh.dispose();for(const material of [mesh.material as THREE.Material,mesh.customDepthMaterial!]){if(disposed.has(material))continue;for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);material.dispose();disposed.add(material);}}
  textures.forEach(texture=>texture.dispose());
});

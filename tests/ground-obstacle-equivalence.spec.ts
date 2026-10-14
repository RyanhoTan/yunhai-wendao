import {test,expect} from '@playwright/test';
import {Box3,Matrix4,Quaternion,Euler,Vector3} from 'three';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createGroundObstacleQuery} from '../src/world/GroundCoverObstacles';
import {createGroundObstacleQuery as baselineQuery} from '../artifacts/laas-quality-20261012/deadwood-terrain-constant-r1/baseline-GroundCoverObstacles';
import {bodyCollisionMesh,transformedBoxBodySolid,type BodyCollisionMesh} from '../src/core/StaticBodyCollision';

test('scalar broad phase matches the original Box3 query for actual oblique solids, bounds edges and late assembly',async()=>{
  const directory='artifacts/laas-quality-20261012/deadwood-terrain-constant-r1';
  const files=['src/world/GroundCoverObstacles.ts',`${directory}/original-GroundCoverObstacles.ts`,`${directory}/baseline-GroundCoverObstacles.ts`,'tests/ground-obstacle-equivalence.spec.ts'];
  const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
  const sourceHashes=await hashes(),walls:Box3[]=[],meshes:BodyCollisionMesh[]=[],old=baselineQuery(walls,meshes),next=createGroundObstacleQuery(walls,meshes);
  let checks=0,differences=0,hits=0;
  const compare=(x:number,y:number,z:number,r:number,bounds?:Box3)=>{const a=old(x,y,z,r,bounds),b=next(x,y,z,r,bounds);checks++;if(a!==b)differences++;if(b)hits++;};
  compare(0,0,0,1);
  for(let i=0;i<45;i++){
    const matrix=new Matrix4().compose(new Vector3((i%9)*2-8,Math.sin(i)*.8,Math.floor(i/9)*2-4),new Quaternion().setFromEuler(new Euler(Math.sin(i)*.3,i*.43,Math.cos(i)*.2)),new Vector3(1,1,1));
    meshes.push(bodyCollisionMesh([transformedBoxBodySolid(new Box3(new Vector3(-1,0,-.3),new Vector3(1,.6,.3)),matrix)]));
  }
  walls.push(new Box3(new Vector3(-.3,0,-.2),new Vector3(.3,.5,.2)));
  let seed=975317;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<12000;i++){
    const x=random()*24-12,z=random()*16-8,y=random()*3-1,r=random()*.9;
    const box=new Box3(new Vector3(x-r,y-.2,z-r),new Vector3(x+r,y+.1+random()*1.4,z+r));
    compare(x,y,z,r,i%2?box:undefined);
  }
  for(const mesh of meshes)for(const p of [mesh.bounds.min,mesh.bounds.max])for(const epsilon of [-1.e-12,0,1.e-12])compare(p.x+epsilon,p.y,p.z,.55);
  const moved=bodyCollisionMesh([transformedBoxBodySolid(new Box3(new Vector3(-1,0,-.3),new Vector3(1,.6,.3)),new Matrix4().makeTranslation(80,0,0))]);
  meshes[0].bounds.copy(moved.bounds);meshes[0].solids.splice(0,meshes[0].solids.length,...moved.solids);
  compare(80,0,0,.2);compare(-8,0,-4,.2);
  compare(0,0,0,.2,new Box3());compare(NaN,0,0,.2);
  const sourceHashesAtEnd=await hashes();await writeFile(`${directory}/obstacle-equivalence.json`,JSON.stringify({sourceHashes,sourceHashesAtEnd,checks,differences,hits,scope:'Original Box3 implementation versus scalar query, actual rigid oblique body solids, touching edges, finite random envelopes, late append and changed existing bounds; no FPS or visual claim.'},null,2)+'\n');
  expect(sourceHashesAtEnd).toEqual(sourceHashes);expect(differences).toBe(0);expect(hits).toBeGreaterThan(100);
});

import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {execFileSync} from 'node:child_process';
import * as THREE from 'three';

const stage=process.argv[2];if(!/^[a-z0-9-]+$/.test(stage??''))throw new Error('Supply an evidence stage');
execFileSync(process.execPath,['scripts/bake-geological-surface.mjs','--check'],{stdio:'pipe'});
const directory=`artifacts/laas-quality-20261012/${stage}`;
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null},appType:'custom'});
try{
  const {decodeGeologicalSurface}=await server.ssrLoadModule('/src/world/GeologicalSurfaceData.ts');
  const {createIndexedTriangleCollision}=await server.ssrLoadModule('/src/core/IndexedTriangleCollision.ts');
  const {triangleBodySolid}=await server.ssrLoadModule('/src/core/StaticBodyCollision.ts');
  const {terrainHeight,rockSurfaceExposure}=await server.ssrLoadModule('/src/world/TerrainField.ts');
  const {ascentDistance}=await server.ssrLoadModule('/src/world/MountainLayout.ts');
  const manifest=JSON.parse(await readFile('public/assets/terrain/geological/manifest.json','utf8'));
  const bytes=await readFile(`public/assets/terrain/geological/${manifest.file}`),data=decodeGeologicalSurface(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const point=new THREE.Vector3(-56.53463832078468,120.62289469636323,-56.56285658623508),hits=[];
  for(const tile of data.tiles){
    const mesh=createIndexedTriangleCollision(tile.positions,tile.indices);if(!mesh.bounds.containsPoint(point))continue;
    const d=mesh.indexedTriangles,x=Math.floor(point.x/d.cellSize)-d.minCellX,z=Math.floor(point.z/d.cellSize)-d.minCellZ,cell=z*d.width+x;
    const ids=new Set(d.triangleIds.subarray(d.cellOffsets[cell],d.cellOffsets[cell+1]));
    for(const id of ids){
      const vertices=Array.from({length:3},(_,i)=>new THREE.Vector3().fromArray(d.positions,d.indices[id*3+i]*3));
      const solid=triangleBodySolid(...vertices,d.below,d.above);
      if(!solid.bounds.containsPoint(point)||!solid.axes.every(a=>{const p=point.x*a.x+point.y*a.y+point.z*a.z;return p>a.min+1e-5&&p<a.max-1e-5;}))continue;
      hits.push({tile:tile.name,id,vertices:vertices.map(v=>({point:v.toArray(),ascentDistance:ascentDistance(v.x,v.z),aboveStandingGround:v.y-terrainHeight(v.x,v.z),worldExposure:rockSurfaceExposure(v.x,v.y,v.z)})),axisMargins:solid.axes.map(a=>{const p=point.x*a.x+point.y*a.y+point.z*a.z;return {axis:[a.x,a.y,a.z],min:p-a.min,max:a.max-p};})});
    }
  }
  const report={sourceHash:manifest.sourceHash,binaryHash:manifest.sha256,point:point.toArray(),hits};
  await mkdir(directory,{recursive:true});await writeFile(`${directory}/contact.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await server.close();}

import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import * as THREE from 'three';

process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const output='public/assets/terrain/geological',manifestPath=`${output}/manifest.json`;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function sources(){
  const files=new Map(),queue=['src/world/GeologicalEscarpments.ts','src/world/TerrainField.ts'];
  for(let i=0;i<queue.length;i++){
    const file=queue[i];if(files.has(file))continue;
    const bytes=await readFile(file);files.set(file,bytes);
    for(const match of bytes.toString().matchAll(/from\s*['"]([.][^'"]+)['"]/g)){
      const dependency=posix.normalize(posix.join(dirname(file),`${match[1]}.ts`));if(!files.has(dependency))queue.push(dependency);
    }
  }
  files.set('scripts/bake-geological-surface.mjs',await readFile(new URL(import.meta.url)));
  files.set('node_modules/three/package.json',await readFile('node_modules/three/package.json'));
  const hashes=Object.fromEntries([...files].sort(([a],[b])=>a.localeCompare(b)).map(([file,bytes])=>[file,sha(bytes)]));
  return {sourceHash:sha(JSON.stringify(hashes)),hashes};
}
const before=await sources();
try{
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  if(manifest.version===1&&manifest.sourceHash===before.sourceHash&&manifest.file===`surface-${before.sourceHash}.bin`
    &&JSON.stringify(manifest.sourceHashes)===JSON.stringify(before.hashes)){
    const bytes=await readFile(`${output}/${manifest.file}`);
    if(bytes.byteLength===manifest.byteLength&&sha(bytes)===manifest.sha256){console.log(`Geological surface cache verified: ${manifest.byteLength} bytes`);process.exit(0);}
  }
}catch{/* A missing or damaged cache is rebuilt below, never silently used. */}
if(process.argv.includes('--check'))throw new Error('Geological surface cache is missing or stale; run npm run bake:geology');
const started=performance.now(),server=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom'});
try{
  const {createGeologicalEscarpments}=await server.ssrLoadModule('/src/world/GeologicalEscarpments.ts');
  const {terrainSurfaceHeight,rockSurfaceExposure}=await server.ssrLoadModule('/src/world/TerrainField.ts');
  const {encodeGeologicalSurface,decodeGeologicalSurface}=await server.ssrLoadModule('/src/world/GeologicalSurfaceData.ts');
  const root=new THREE.Group();
  const surface=createGeologicalEscarpments(root,terrainSurfaceHeight,rockSurfaceExposure,record=>console.log(`Geology ${record.phase}: ${((performance.now()-started)/1000).toFixed(1)}s`));
  if(!surface.bakeData.userData.refinement.converged||!surface.bakeData.userData.refinement.patchBoundary.converged)throw new Error('Refusing to bake unconverged geological surface');
  const encoded=encodeGeologicalSurface(surface.bakeData),restored=decodeGeologicalSurface(encoded);
  const equal=(a,b)=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).equals(Buffer.from(b.buffer,b.byteOffset,b.byteLength));
  for(let i=0;i<restored.tiles.length;i++)for(const key of ['positions','normals','indices'])if(!equal(restored.tiles[i][key],surface.bakeData.tiles[i][key]))throw new Error(`Baked tile ${i} ${key} differs from generated surface`);
  if(!equal(restored.rainBounds,surface.bakeData.rainBounds))throw new Error('Baked rain bounds differ from generated surface');
  const bytes=new Uint8Array(encoded),after=await sources();
  if(before.sourceHash!==after.sourceHash)throw new Error('Geological source changed during bake; rerun');
  const file=`surface-${before.sourceHash}.bin`,manifest={version:1,sourceHash:before.sourceHash,sourceHashes:before.hashes,file,sha256:sha(bytes),byteLength:bytes.byteLength,triangles:surface.bakeData.userData.triangles,bakeMilliseconds:performance.now()-started};
  await mkdir(output,{recursive:true});await writeFile(`${output}/${file}.tmp`,bytes);await rename(`${output}/${file}.tmp`,`${output}/${file}`);
  await writeFile(`${manifestPath}.tmp`,JSON.stringify(manifest,null,2)+'\n');await rename(`${manifestPath}.tmp`,manifestPath);
  console.log(`Baked ${manifest.triangles} geological triangles into ${manifest.byteLength} bytes in ${(manifest.bakeMilliseconds/1000).toFixed(1)}s`);
}finally{await server.close();}

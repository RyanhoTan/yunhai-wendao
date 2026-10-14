import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(directory,'../../..');
const names=['src/world/ForestDeadwoodGeometry.ts','src/world/WoodlandPrimitives.ts'],sha=b=>crypto.createHash('sha256').update(b).digest('hex'),hashes=()=>Object.fromEntries(names.map(name=>[name,sha(fs.readFileSync(path.join(repo,name)))]));
const sourceHashStart=hashes(),startTimeUtc=new Date().toISOString(),three=pathToFileURL(path.join(repo,'node_modules/three/build/three.module.js')).href;
const compile=(file,primitives)=>{let code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:9,module:99}}).outputText.replaceAll("from 'three'","from '"+three+"'");if(primitives)code=code.replaceAll("from './WoodlandPrimitives'","from '"+primitives+"'");return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');};
const oldPrimitives=compile(path.join(directory,'baseline-WoodlandPrimitives.ts')),newPrimitives=compile(path.join(repo,names[1])),baseline=await import(compile(path.join(directory,'baseline-ForestDeadwoodGeometry.ts'),oldPrimitives)),final=await import(compile(path.join(repo,names[0]),newPrimitives));
const bytes=a=>Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength),jsonBytes=value=>Buffer.from(JSON.stringify(value),'utf8'),errors=[],samples=[];
for(let form=0;form<3;form++)for(let i=0;i<64;i++){
 const seed=(1289+i*7919)>>>0,a=baseline.createForestDeadwoodGeometry(seed,form),b=final.createForestDeadwoodGeometry(seed,form),differences=[];
 const compareBytes=(name,left,right)=>{if(Buffer.compare(left,right))differences.push(name);};
 compareBytes('attribute names',jsonBytes(Object.keys(a.geometry.attributes)),jsonBytes(Object.keys(b.geometry.attributes)));
 for(const name of Object.keys(a.geometry.attributes)){const x=a.geometry.attributes[name],y=b.geometry.attributes[name];if(!y){differences.push(name+' missing');continue;}compareBytes(name,bytes(x),bytes(y));compareBytes(name+' descriptor',jsonBytes({array:x.array.constructor.name,attribute:x.constructor.name,size:x.itemSize,count:x.count,normalized:x.normalized,usage:x.usage,version:x.version}),jsonBytes({array:y.array.constructor.name,attribute:y.constructor.name,size:y.itemSize,count:y.count,normalized:y.normalized,usage:y.usage,version:y.version}));}
 compareBytes('index',bytes(a.geometry.index),bytes(b.geometry.index));
 compareBytes('metadata',jsonBytes(a.geometry.userData),jsonBytes(b.geometry.userData));
 compareBytes('contactIndices',jsonBytes(a.contactIndices),jsonBytes(b.contactIndices));
 compareBytes('solidBounds',jsonBytes(a.solidBounds),jsonBytes(b.solidBounds));
 compareBytes('dimensions',jsonBytes([a.length,a.radius,a.height]),jsonBytes([b.length,b.radius,b.height]));
 compareBytes('geometry bounds',jsonBytes([a.geometry.boundingBox,a.geometry.boundingSphere]),jsonBytes([b.geometry.boundingBox,b.geometry.boundingSphere]));
 if(differences.length)errors.push({form,seed,differences});samples.push({form,seed,attributeCount:Object.keys(a.geometry.attributes).length,vertexCount:a.geometry.attributes.position.count,triangles:a.geometry.index.count/3,byteExact:differences.length===0});
 a.geometry.dispose();b.geometry.dispose();
}
const capturedBaseline=JSON.parse(fs.readFileSync(path.join(directory,'baseline-fingerprints.json'),'utf8')),capturedFinal=JSON.parse(fs.readFileSync(path.join(directory,'final-fingerprints.json'),'utf8'));
if(JSON.stringify(capturedBaseline.samples)!==JSON.stringify(capturedFinal.samples))errors.push({check:'persisted fingerprints differ'});
const writerDefaultExact=JSON.stringify(capturedBaseline.writerSnapshots)===JSON.stringify(capturedFinal.writerSnapshots);if(!writerDefaultExact)errors.push({check:'Writer default finalized output differs'});
const sourceHashEnd=hashes(),sameSource=JSON.stringify(sourceHashStart)===JSON.stringify(sourceHashEnd),result={status:errors.length||!sameSource?'failed':'byte_exact_passed',sampleCount:192,startTimeUtc,endTimeUtc:new Date().toISOString(),sourceHashStart,sourceHashEnd,sameSource,comparison:'Buffer.compare on every raw attribute/index array plus UTF-8 JSON byte compare on descriptors, metadata, contacts, BOX, dimensions, bounds. Persisted SHA fingerprints also equal.',writerDefaultExact,errorCount:errors.length,errors,samples,performance:{baseline:capturedBaseline.cpuGeometryOnly,final:capturedFinal.cpuGeometryOnly,reductionPercent:100*(1-capturedFinal.cpuGeometryOnly.totalMs/capturedBaseline.cpuGeometryOnly.totalMs),speedup:capturedBaseline.cpuGeometryOnly.totalMs/capturedFinal.cpuGeometryOnly.totalMs,scope:'Single separate-process 192-model generation pass, excludes hashing/validation, not whole-game cold startup/FPS.'}};
fs.writeFileSync(path.join(directory,'exact-comparison.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,samples:192,errorCount:errors.length,writerDefaultExact,sameSource,performanceReductionPercent:result.performance.reductionPercent},null,2));
if(result.status!=='byte_exact_passed')process.exitCode=1;


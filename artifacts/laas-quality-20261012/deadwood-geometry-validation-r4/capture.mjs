import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
const directory=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(directory,'../../..'),mode=process.argv[2];
if(!['baseline','final'].includes(mode))throw new Error('Use baseline or final.');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),arrayBytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const sourcePaths=mode==='baseline'?['baseline-ForestDeadwoodGeometry.ts','baseline-WoodlandPrimitives.ts'].map(p=>path.join(directory,p)):['src/world/ForestDeadwoodGeometry.ts','src/world/WoodlandPrimitives.ts'].map(p=>path.join(repo,p));
const hashes=()=>Object.fromEntries(sourcePaths.map(p=>[path.relative(repo,p),sha(fs.readFileSync(p))]));
const sourceHashStart=hashes(),startTimeUtc=new Date().toISOString(),three=pathToFileURL(path.join(repo,'node_modules/three/build/three.module.js')).href;
const compile=(file,primitives)=>{let code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:9,module:99}}).outputText.replaceAll("from 'three'","from '"+three+"'");if(primitives)code=code.replaceAll("from './WoodlandPrimitives'","from '"+primitives+"'");return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');};
const primitivesUrl=compile(sourcePaths[1]),module=await import(compile(sourcePaths[0],primitivesUrl)),writerModule=await import(primitivesUrl),THREE=await import(three);
const attribute=a=>({constructor:a.constructor.name,arrayConstructor:a.array.constructor.name,itemSize:a.itemSize,count:a.count,normalized:a.normalized,usage:a.usage,gpuType:a.gpuType,name:a.name,version:a.version,sha256:sha(arrayBytes(a.array))});
const fingerprint=r=>{const g=r.geometry;return {attributes:Object.fromEntries(Object.keys(g.attributes).sort().map(name=>[name,attribute(g.attributes[name])])),index:attribute(g.index),metadata:{json:JSON.stringify(g.userData),sha256:sha(JSON.stringify(g.userData))},contacts:{values:r.contactIndices,sha256:sha(JSON.stringify(r.contactIndices))},boxes:{values:r.solidBounds.map(b=>[...b.min.toArray(),...b.max.toArray()]),sha256:sha(JSON.stringify(r.solidBounds))},dimensions:{length:r.length,radius:r.radius,height:r.height},name:g.name,bounds:{box:[...g.boundingBox.min.toArray(),...g.boundingBox.max.toArray()],sphere:[...g.boundingSphere.center.toArray(),g.boundingSphere.radius]}};};
const samples=[],timings=[],errors=[],range=[0,1,2].map(()=>({tri:[Infinity,0],normalMaxError:0,contacts:[Infinity,0],boxes:[Infinity,0]}));
for(let form=0;form<3;form++)for(let i=0;i<64;i++){
 const seed=(1289+i*7919)>>>0,before=performance.now(),r=module.createForestDeadwoodGeometry(seed,form),elapsed=performance.now()-before;
 timings.push({form,seed,milliseconds:elapsed});
 const g=r.geometry,p=g.attributes.position,n=g.attributes.normal,index=g.index,bb=g.boundingBox,contacts=new Set(r.contactIndices),fail=message=>errors.push({form,seed,message});
 for(const name of ['position','normal','color','uv','woodlandWind','woodlandSway','woodlandCluster','woodlandLegacyGround']){const a=g.attributes[name];if(!a||a.count!==p.count)fail('attribute/count '+name);else for(const value of a.array)if(!Number.isFinite(value)){fail('nonfinite '+name);break;}}
 for(let v=0;v<p.count;v++){const length=Math.hypot(n.getX(v),n.getY(v),n.getZ(v));range[form].normalMaxError=Math.max(range[form].normalMaxError,Math.abs(length-1));if(Math.abs(length-1)>1e-5)fail('normal '+v);const role=g.attributes.woodlandCluster.getX(v);if(!Number.isInteger(role)||role<0||role>4)fail('role');if(g.attributes.woodlandWind.getX(v)!==0||g.attributes.woodlandSway.getX(v)!==0)fail('static wind');if(role<3&&p.getY(v)===0&&!contacts.has(v))fail('missing contact');}
 for(let q=0;q<index.count;q+=3){const a=index.getX(q),b=index.getX(q+1),c=index.getX(q+2),ux=p.getX(b)-p.getX(a),uy=p.getY(b)-p.getY(a),uz=p.getZ(b)-p.getZ(a),vx=p.getX(c)-p.getX(a),vy=p.getY(c)-p.getY(a),vz=p.getZ(c)-p.getZ(a);if((uy*vz-uz*vy)**2+(uz*vx-ux*vz)**2+(ux*vy-uy*vx)**2<1e-16)fail('degenerate');}
 for(const v of contacts)if(v<0||v>=p.count||p.getY(v)!==0||g.attributes.woodlandCluster.getX(v)>2)fail('contact');
 if(!contacts.size||bb.min.y!==0||Math.abs(bb.min.x+bb.max.x)>1e-6||Math.abs(bb.min.z+bb.max.z)>1e-6)fail('root/center');
 if(r.length<2.4||r.length>4.8||r.radius>.55||r.height<.25||r.height>.65)fail('dimensions');
 if(index.count/3<1500||index.count/3>5500)fail('budget');
 for(const b of r.solidBounds)if(b.isEmpty()||[...b.min.toArray(),...b.max.toArray()].some(v=>!Number.isFinite(v))||b.min.x<bb.min.x-.003||b.max.x>bb.max.x+.003||b.min.y<bb.min.y-.003||b.max.y>bb.max.y+.003||b.min.z<bb.min.z-.003||b.max.z>bb.max.z+.003)fail('solid bounds');
 for(const p of g.userData.voidProbes)if(r.solidBounds.some(b=>b.containsPoint({x:p[0],y:p[1],z:p[2]})))fail('void closed');
 samples.push({form,seed,fingerprint:fingerprint(r)});
 for(const [name,value]of Object.entries({tri:index.count/3,contacts:contacts.size,boxes:r.solidBounds.length})){range[form][name][0]=Math.min(range[form][name][0],value);range[form][name][1]=Math.max(range[form][name][1],value);}
 g.dispose();
}
const writerSnapshots=[];
for(const padding of [0,.11]){const w=new writerModule.Writer(p=>p.y*.25);w.vertex(new THREE.Vector3(0,0,0),new THREE.Color('#678953'),0,0,0);w.vertex(new THREE.Vector3(.31,.52,.11),new THREE.Color('#a87e55'),.4,.8,.6);w.vertex(new THREE.Vector3(-.17,.22,.46),new THREE.Color('#69725e'),.8,.3,.2);w.triangle(0,1,2);const g=w.finish('writer-default-compatibility',padding);writerSnapshots.push({padding,attributes:Object.fromEntries(Object.keys(g.attributes).sort().map(name=>[name,attribute(g.attributes[name])])),index:attribute(g.index),box:[...g.boundingBox.min.toArray(),...g.boundingBox.max.toArray()],sphere:[...g.boundingSphere.center.toArray(),g.boundingSphere.radius]});g.dispose();}
const sourceHashEnd=hashes(),sameSource=JSON.stringify(sourceHashStart)===JSON.stringify(sourceHashEnd),ordered=timings.map(x=>x.milliseconds).sort((a,b)=>a-b),total=ordered.reduce((a,b)=>a+b,0);
const result={status:errors.length||!sameSource?'failed':'passed',mode,sampleCount:192,seedFormula:'(1289+i*7919)>>>0, i=0..63; forms=0,1,2',startTimeUtc,endTimeUtc:new Date().toISOString(),sourceHashStart,sourceHashEnd,sameSource,errorCount:errors.length,errors,range,cpuGeometryOnly:{totalMs:total,meanMs:total/192,p50Ms:ordered[96],p95Ms:ordered[Math.floor(192*.95)],maxMs:ordered[191],timings},writerSnapshots,samples,scope:'CPU data/per-generation time only. No GPU/startup/FPS or visual-quality acceptance.'};
fs.writeFileSync(path.join(directory,mode+'-fingerprints.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,mode,samples:192,errorCount:errors.length,totalMs:total,p50Ms:ordered[96],p95Ms:ordered[182],sameSource},null,2));
if(result.status!=='passed')process.exitCode=1;


import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';

const source=fs.readFileSync(new URL('../src/world/GeologicalFaceRefinement.ts',import.meta.url),'utf8');
const threeUrl=new URL('../node_modules/three/build/three.module.js',import.meta.url).href;
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll("from 'three'","from '"+threeUrl+"'");
const {refineGeologicalFaces,canonicalGeologicalBase,canonicalGeologicalEdgeKey,GEOLOGICAL_MAX_EDGE_LENGTH,GEOLOGICAL_MAX_MIDPOINT_ERROR}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
// Disable only the scalar-cache lookup/storage in a separate compiled module.
// The reference recomputes every edge metric and follows the same topology,
// diagnostics and budget rules, without adding a production testing option.
const metricCacheDeclaration='const goodEdgeMetrics = new Map();';
assert.ok(compiled.includes(metricCacheDeclaration),'uncached oracle must disable the named scalar cache');
const uncachedCompiled=compiled.replace(metricCacheDeclaration,metricCacheDeclaration+' goodEdgeMetrics.get=()=>undefined; goodEdgeMetrics.set=()=>goodEdgeMetrics;');
const {refineGeologicalFaces:refineWithoutMetricCache}=await import('data:text/javascript;base64,'+Buffer.from(uncachedCompiled).toString('base64'));
const v=(x,y=0,z=0)=>new THREE.Vector3(x,y,z);
const identity=p=>p.clone();
const ownership=(batch='tile-a',cell='0,0',row=0)=>({batch,cell,row,payload:{unchanged:true}});
const triangle=(points,metadata=ownership())=>({base:points,metadata});
const area=(a,b,c)=>b.clone().sub(a).cross(c.clone().sub(a));
function assertNoTJunction(result){
  const vertices=Array.from(new Map(result.triangles.flatMap(t=>t.vertices.map(p=>[p.key,p.base]))).values());
  for(const t of result.triangles)for(let i=0;i<3;i++){
    const a=t.vertices[i].base,b=t.vertices[(i+1)%3].base,d=b.clone().sub(a),length=d.lengthSq();if(!length)continue;
    for(const p of vertices){
      const fraction=p.clone().sub(a).dot(d)/length;if(fraction<=1e-8||fraction>=1-1e-8)continue;
      assert.ok(p.distanceTo(a.clone().addScaledVector(d,fraction))>1e-7,'active vertex lies inside an unsplit base edge');
    }
  }
}
function assertActualCriteria(result,resolve,protectedEdgeKeys=new Set()){
  for(const t of result.triangles)for(let i=0;i<3;i++){
    const a=t.vertices[i],b=t.vertices[(i+1)%3],mid=resolve(canonicalGeologicalBase(a.base.clone().add(b.base).multiplyScalar(.5)));
    if(!protectedEdgeKeys.has(canonicalGeologicalEdgeKey(a.base,b.base))){
      assert.ok(a.world.distanceTo(b.world)<=GEOLOGICAL_MAX_EDGE_LENGTH);
      assert.ok(mid.distanceTo(a.world.clone().add(b.world).multiplyScalar(.5))<=GEOLOGICAL_MAX_MIDPOINT_ERROR);
    }
    assert.strictEqual(result.vertexCache.get(a.key),a);
  }
}
function assertActiveCache(result){
  const active=new Map();
  for(const t of result.triangles)for(const vertex of t.vertices){
    const existing=active.get(vertex.key);if(existing)assert.strictEqual(existing,vertex,'all triangles share the same canonical vertex object');
    active.set(vertex.key,vertex);assert.strictEqual(result.vertexCache.get(vertex.key),vertex);
  }
  assert.deepEqual(new Set(result.vertexCache.keys()),new Set(active.keys()),'cache must contain exactly active triangle points');
  assert.equal(result.stats.cachedVertices,active.size);assert.equal(result.stats.activeVertices,active.size);
}

test('one/two/three globally marked edges use conforming green/red splits and preserve winding',()=>{
  const cases=[
    {points:[v(0),v(4),v(2,0,1)],pattern:1,count:2},
    {points:[v(0),v(4),v(0,0,1)],pattern:2,count:3},
    {points:[v(0),v(4),v(0,0,4)],pattern:3,count:4},
  ];
  for(const c of cases){
    const protectedEdgeKeys=new Set(c.points.flatMap((a,i)=>a.distanceTo(c.points[(i+1)%3])<=GEOLOGICAL_MAX_EDGE_LENGTH?[canonicalGeologicalEdgeKey(a,c.points[(i+1)%3])]:[]));
    const metadata=ownership(),result=refineGeologicalFaces([triangle(c.points,metadata)],identity,{maxIterations:1,protectedEdgeKeys});
    assert.equal(result.triangles.length,c.count);assert.equal(result.stats.rounds[0].splitPatterns[c.pattern],1);
    const original=area(...c.points),sum=new THREE.Vector3();
    for(const t of result.triangles){assert.strictEqual(t.metadata,metadata);const normal=area(...t.vertices.map(p=>p.base));assert.ok(normal.dot(original)>0);sum.add(normal);}
    assert.ok(sum.distanceTo(original)<1e-10);
    assertNoTJunction(result);assertActiveCache(result);
  }
});

test('canonical protected edge keys ignore orientation and sub-quantum jitter without mutating input',()=>{
  const a=v(-0,1,2),b=v(4,3,0),before=[a.toArray(),b.toArray()],key=canonicalGeologicalEdgeKey(a,b);
  assert.equal(key,canonicalGeologicalEdgeKey(b,a));
  assert.equal(key,canonicalGeologicalEdgeKey(v(4+4e-8,3-4e-8,-0),v(0,1+4e-8,2)));
  assert.deepEqual([a.toArray(),b.toArray()],before);
});

test('locked patch boundary is unchanged while free edges converge across batches and boundary errors stay visible',()=>{
  const a=v(0),b=v(3),c=v(0,0,3),d=v(3,0,3),outside=v(0,0,-2),left=ownership('left','0,0',3),right=ownership('right','1,0',4);
  const protectedEdgeKeys=new Set([canonicalGeologicalEdgeKey(a,b)]),resolve=p=>v(p.x,p.y+.125*p.x*p.x,p.z);
  const input=[triangle([a,b,c],left),triangle([b,d,c],right)],result=refineGeologicalFaces(input,resolve,{protectedEdgeKeys});
  assert.equal(result.stats.converged,true);assert.equal(result.stats.remainingEdges,0);assert.ok(result.stats.iterations>0);
  assert.equal(result.stats.protectedEdges,1);assert.equal(result.stats.protectedLengthViolations,1);assert.equal(result.stats.protectedCurvatureViolations,1);
  assert.equal(result.stats.maxProtectedWorldEdgeLength,Math.sqrt(9+1.125**2));assert.equal(result.stats.maxProtectedMidpointError,.28125);
  assert.ok(result.stats.maxWorldEdgeLength>=Math.sqrt(9+1.125**2));assert.ok(result.stats.maxMidpointError>=.28125);
  assert.ok(result.stats.maxUnprotectedWorldEdgeLength<=2.6);assert.ok(result.stats.maxUnprotectedMidpointError<=.12);
  const protectedOccurrences=result.triangles.flatMap(t=>t.vertices.map((a,i)=>canonicalGeologicalEdgeKey(a.base,t.vertices[(i+1)%3].base))).filter(key=>protectedEdgeKeys.has(key));
  assert.equal(protectedOccurrences.length,1,'original shared boundary segment must remain whole');
  assert.ok(result.triangles.every(t=>t.metadata===left||t.metadata===right));
  assertActualCriteria(result,resolve,protectedEdgeKeys);assertNoTJunction(result);
  // The old exterior triangle keeps its unsplit boundary; combining it with
  // the refined patch must not introduce an active point inside that edge.
  const exterior={vertices:[b,a,outside].map(base=>({base,key:canonicalGeologicalBase(base).toArray().join(','),world:resolve(base)}))};
  assertNoTJunction({triangles:[...result.triangles,exterior]});
});

test('an over-curved locked boundary never hides the remaining unsatisfied free edge',()=>{
  // For y=.125*x*x, chord-midpoint error is .03125*dx*dx. Each
  // free edge would need |dx|<=sqrt(.12/.03125)<2, so no triangle
  // joining the locked x=0 and x=4 endpoints can satisfy both free edges.
  const a=v(0),b=v(4),c=v(0,0,4),d=v(4,0,4),protectedEdgeKeys=new Set([canonicalGeologicalEdgeKey(a,b)]);
  const result=refineGeologicalFaces([triangle([a,b,c]),triangle([b,d,c])],p=>v(p.x,p.y+.125*p.x*p.x,p.z),{protectedEdgeKeys});
  assert.equal(result.stats.converged,false);assert.equal(result.stats.stopReason,'iteration-limit');assert.equal(result.stats.iterations,8);
  assert.ok(result.stats.remainingCurvatureEdges>0);assert.ok(result.stats.maxUnprotectedMidpointError>.12);
  assert.equal(result.stats.protectedEdges,1);assert.equal(result.stats.maxProtectedMidpointError,.5);
  assertNoTJunction(result);
});

test('all protected violations are reported but neither split nor fail reachable convergence',()=>{
  const points=[v(0),v(4),v(0,0,4)],protectedEdgeKeys=new Set(points.map((a,i)=>canonicalGeologicalEdgeKey(a,points[(i+1)%3])));
  const result=refineGeologicalFaces([triangle(points)],identity,{protectedEdgeKeys,maxIterations:0});
  assert.equal(result.triangles.length,1);assert.equal(result.stats.iterations,0);assert.equal(result.stats.converged,true);assert.equal(result.stats.stopReason,'converged');
  assert.equal(result.stats.protectedEdges,3);assert.equal(result.stats.protectedLengthViolations,3);assert.equal(result.stats.protectedCurvatureViolations,0);
  assert.equal(result.stats.maxProtectedWorldEdgeLength,Math.sqrt(32));assert.equal(result.stats.maxProtectedMidpointError,0);
  assert.equal(result.stats.remainingEdges,0);assert.equal(result.stats.maxUnprotectedWorldEdgeLength,0);
  assertNoTJunction(result);
  const onlyOne=new Set([canonicalGeologicalEdgeKey(points[0],points[1])]),limited=refineGeologicalFaces([triangle(points)],identity,{protectedEdgeKeys:onlyOne,maxIterations:0});
  assert.equal(limited.stats.converged,false);assert.equal(limited.stats.stopReason,'iteration-limit');assert.equal(limited.stats.remainingLengthEdges,2);assert.equal(limited.stats.protectedLengthViolations,1);
});

test('canonical shared edge crosses two batches/cells/rows with exactly shared active vertex records',()=>{
  const left=ownership('48m-tile-left','47,0',12),right=ownership('48m-tile-right','48,0',13),calls=new Map();
  const resolve=p=>{const key=p.toArray().join(',');calls.set(key,(calls.get(key)??0)+1);return p.clone();};
  const input=[
    triangle([v(0),v(4),v(0,0,4)],left),
    triangle([v(4+4e-8),v(4,0,4),v(0,0,4+4e-8)],right),
  ],result=refineGeologicalFaces(input,resolve);
  assert.equal(result.stats.converged,true);assert.equal(result.stats.stopReason,'converged');
  assert.ok(result.triangles.some(t=>t.metadata===left));assert.ok(result.triangles.some(t=>t.metadata===right));
  for(const t of result.triangles){assert.ok(t.metadata===left||t.metadata===right);assert.strictEqual(t.metadata.payload.unchanged,true);}
  assertActiveCache(result);
  assert.ok(Array.from(result.vertexCache.keys()).every(key=>calls.has(key)));
  const shared=result.vertexCache.get('2,0,2');
  assert.ok(shared);assert.ok(result.triangles.filter(t=>t.metadata===left).some(t=>t.vertices.includes(shared)));assert.ok(result.triangles.filter(t=>t.metadata===right).some(t=>t.vertices.includes(shared)));
  assert.equal(result.stats.degenerateBaseTriangles,0);assert.equal(result.stats.degenerateWorldTriangles,0);
  assertNoTJunction(result);assertActualCriteria(result,identity);
});

test('analytic parabola is split for actual midpoint curvature even when every input edge is short',()=>{
  const resolve=p=>v(p.x,p.y+.8*p.x*p.x,p.z),input=[triangle([v(0),v(1),v(0,0,1)])],result=refineGeologicalFaces(input,resolve);
  assert.ok(input[0].base.every(p=>p.y===0),'caller input vectors are untouched');
  assert.equal(result.stats.iterations,1);assert.ok(result.triangles.length>1);assert.equal(result.stats.converged,true);
  assertActualCriteria(result,resolve);assertNoTJunction(result);
  assert.ok(result.stats.maxMidpointError<=.12);
});

test('bounded refinement of an analytic curved patch converges in actual space across a shared diagonal',()=>{
  const resolve=p=>v(p.x,p.y+.7*Math.sin(p.x*1.8)+.3*Math.cos(p.z*1.5),p.z),result=refineGeologicalFaces([
    triangle([v(0),v(4),v(0,0,4)]),
    triangle([v(4),v(4,0,4),v(0,0,4)],ownership('tile-b','1,0',2)),
  ],resolve);
  assert.equal(result.stats.converged,true);assert.equal(result.stats.remainingEdges,0);
  assert.equal(result.stats.degenerateBaseTriangles,0);assert.equal(result.stats.degenerateWorldTriangles,0);
  assertActualCriteria(result,resolve);assertNoTJunction(result);
  const repeat=refineGeologicalFaces([
    triangle([v(0),v(4),v(0,0,4)]),
    triangle([v(4),v(4,0,4),v(0,0,4)],ownership('tile-b','1,0',2)),
  ],resolve);
  assert.deepEqual(result.triangles.map(t=>t.vertices.map(p=>[p.key,...p.world.toArray()])),repeat.triangles.map(t=>t.vertices.map(p=>[p.key,...p.world.toArray()])));
  assert.deepEqual(result.stats,repeat.stats);assertActiveCache(result);assertActiveCache(repeat);
});

test('iteration and triangle budgets report residual error and never partially split a round',()=>{
  const input=[triangle([v(0),v(4),v(0,0,4)]),triangle([v(4),v(4,0,4),v(0,0,4)],ownership('tile-b','1,0',7))];
  const limited=refineGeologicalFaces(input,identity,{maxIterations:0});
  assert.equal(limited.triangles.length,2);assert.equal(limited.stats.converged,false);assert.equal(limited.stats.stopReason,'iteration-limit');assert.ok(limited.stats.remainingLengthEdges>0);
  const budget=refineGeologicalFaces(input,identity,{maxTriangles:3});
  assert.equal(budget.triangles.length,2);assert.equal(budget.stats.iterations,0);assert.equal(budget.stats.stopReason,'triangle-limit');assert.equal(budget.stats.converged,false);
  assertNoTJunction(budget);assertActiveCache(budget);assertActiveCache(limited);assert.equal(budget.vertexCache.size,4);
});

test('canonical resolution exhaustion is honest and cannot cause an unbounded loop',()=>{
  const result=refineGeologicalFaces([triangle([v(0),v(1e-6),v(0,0,1e-6)])],p=>p.clone().multiplyScalar(5e6));
  assert.equal(result.stats.converged,false);assert.equal(result.stats.stopReason,'canonical-resolution');assert.ok(result.stats.unrefinableEdges>0);assert.ok(result.stats.iterations<=8);
});

test('resolver scratch vectors cannot corrupt shared base/world cache and invalid data is rejected',()=>{
  const scratch=new THREE.Vector3(),result=refineGeologicalFaces([triangle([v(0),v(1),v(0,0,1)])],p=>{p.x+=10;return scratch.copy(p);});
  for(const cached of result.vertexCache.values()){assert.equal(cached.world.x,cached.base.x+10);assert.equal(cached.world.z,cached.base.z);}
  assert.deepEqual(canonicalGeologicalBase(v(-0,-0,-0)).toArray(),[0,0,0]);
  assert.throws(()=>refineGeologicalFaces([triangle([v(NaN),v(1),v(0,0,1)])],identity),/finite/);
  assert.throws(()=>refineGeologicalFaces([triangle([v(0),v(1),v(0,0,1)])],()=>v(Infinity)),/finite/);
  assert.throws(()=>refineGeologicalFaces([],identity,{maxIterations:17}),/maxIterations/);
  assert.throws(()=>refineGeologicalFaces([],identity,{maxTriangles:0}),/maxTriangles/);
  assert.equal(refineGeologicalFaces([],identity).stats.converged,true);
});

test('an already resolved many-face patch retains no unused midpoint probes',()=>{
  const width=40,points=Array.from({length:(width+1)**2},(_,index)=>v(index%(width+1),0,Math.floor(index/(width+1))));
  const input=[];for(let z=0;z<width;z++)for(let x=0;x<width;x++){
    const i=z*(width+1)+x,a=points[i],b=points[i+1],c=points[i+width+1],d=points[i+width+2];
    input.push(triangle([a,b,c],ownership(x<width/2?'left':'right',x+','+z,z)),triangle([b,d,c],ownership(x<width/2?'left':'right',x+','+z,z)));
  }
  let evaluations=0;const resolve=p=>{evaluations++;return v(p.x,.2*Math.sin(p.x*.7)+.1*Math.cos(p.z*.6),p.z);},result=refineGeologicalFaces(input,resolve);
  assert.equal(result.stats.converged,true);assert.equal(result.stats.iterations,0);assert.equal(result.triangles.length,2*width*width);
  assert.equal(result.vertexCache.size,(width+1)**2);assert.equal(result.stats.activeEdges,3*width*width+2*width);
  assert.ok(evaluations>3*result.vertexCache.size,'the omitted probes were actually resolved for curvature');
  assertActiveCache(result);assertActualCriteria(result,resolve);
});

test('input-consumed callback releases authoring arrays before scanning without changing geometry or stats',()=>{
  const makeInput=()=>[triangle([v(0),v(4),v(0,0,4)],ownership('left','0,0',1)),triangle([v(4),v(4,0,4),v(0,0,4)],ownership('right','1,0',2))];
  const resolve=p=>v(p.x,p.y+.7*Math.sin(p.x*1.8)+.3*Math.cos(p.z*1.5),p.z),input=makeInput(),allFaces=input.slice(),metadata=input.map(t=>t.metadata),originalVectors=input.flatMap(t=>t.base);
  const expected=refineGeologicalFaces(makeInput(),resolve);let calls=0,evaluations=0,evaluationsAtConsumption=-1;
  const actual=refineGeologicalFaces(input,p=>{evaluations++;return resolve(p);},{onInputConsumed:()=>{
    calls++;evaluationsAtConsumption=evaluations;assert.equal(input.length,2);
    // The cache owns copies, so even releasing or recycling the original
    // clipper positions is safe once this callback runs.
    for(const p of originalVectors)p.set(10000,-10000,10000);
    allFaces.length=0;input.length=0;
  }});
  assert.equal(calls,1);assert.equal(evaluationsAtConsumption,4,'callback follows canonical input construction and precedes midpoint probes');
  assert.equal(input.length,0);assert.equal(allFaces.length,0);assert.equal(actual.stats.inputTriangles,2);
  const geometry=result=>result.triangles.map(t=>({vertices:t.vertices.map(p=>({key:p.key,base:p.base.toArray(),world:p.world.toArray()})),metadata:t.metadata}));
  assert.deepEqual(geometry(actual),geometry(expected));assert.deepEqual(actual.stats,expected.stats);
  assert.ok(actual.triangles.every(t=>metadata.includes(t.metadata)));assertActiveCache(actual);assertActualCriteria(actual,resolve);assertNoTJunction(actual);
  const untouched=makeInput(),snapshot=untouched.map(t=>({points:t.base.map(p=>p.toArray()),metadata:t.metadata}));refineGeologicalFaces(untouched,resolve);
  assert.equal(untouched.length,2);assert.deepEqual(untouched.map(t=>({points:t.base.map(p=>p.toArray()),metadata:t.metadata})),snapshot);
  let emptyCalls=0;const empty=refineGeologicalFaces([],identity,{onInputConsumed:()=>{emptyCalls++;}});assert.equal(emptyCalls,1);assert.equal(empty.stats.inputTriangles,0);
});

test('scalar edge reuse exactly preserves geometry, diagnostics and rounds while reducing deterministic resolver calls',()=>{
  let cachedEvaluations=0,uncachedEvaluations=0,multiroundCases=0,improvedCases=0;
  for(let seed=0;seed<24;seed++){
    const width=4,spacing=seed%2?1.3:2.1,points=Array.from({length:(width+1)**2},(_,i)=>v((i%(width+1)-2)*spacing,0,(Math.floor(i/(width+1))-2)*spacing)),input=[];
    for(let z=0;z<width;z++)for(let x=0;x<width;x++){
      const i=z*(width+1)+x,a=points[i],b=points[i+1],c=points[i+width+1],d=points[i+width+2],metadata=ownership(x<2?'left':'right',x+','+z,z);
      input.push(triangle([a,b,c],metadata),triangle([b,d,c],metadata));
    }
    const protectedEdgeKeys=new Set();if(seed%3)for(let z=0;z<width;z++)protectedEdgeKeys.add(canonicalGeologicalEdgeKey(points[z*(width+1)],points[(z+1)*(width+1)]));
    const scratch=new THREE.Vector3(),resolve=p=>scratch.set(p.x,p.y+.4*Math.sin(p.x*(.8+seed*.017))+.15*Math.cos(p.z*1.1)+(seed%4===0?.13*p.x*p.x:0),p.z);
    const options={protectedEdgeKeys,maxIterations:seed%5===0?0:seed%5===1?2:8,maxTriangles:seed%4===0?40:10000};let cachedCalls=0,uncachedCalls=0;
    const actual=refineGeologicalFaces(input,p=>{cachedCalls++;return resolve(p);},options),expected=refineWithoutMetricCache(input,p=>{uncachedCalls++;return resolve(p);},options);
    const geometry=result=>result.triangles.map(t=>({vertices:t.vertices.map(p=>({key:p.key,base:p.base.toArray(),world:p.world.toArray()})),metadata:t.metadata}));
    assert.deepEqual(geometry(actual),geometry(expected));assert.deepEqual(actual.stats,expected.stats);assertActiveCache(actual);
    assert.ok(actual.triangles.every(t=>input.some(original=>original.metadata===t.metadata)));
    assert.ok(cachedCalls<=uncachedCalls);if(actual.stats.iterations>0)multiroundCases++;if(cachedCalls<uncachedCalls)improvedCases++;
    if(actual.stats.converged)assertActualCriteria(actual,p=>resolve(p).clone(),protectedEdgeKeys);
    assertNoTJunction(actual);cachedEvaluations+=cachedCalls;uncachedEvaluations+=uncachedCalls;
  }
  assert.ok(multiroundCases>0);assert.ok(improvedCases>0);assert.ok(cachedEvaluations<uncachedEvaluations);
  console.log(JSON.stringify({oracle:'uncached-edge-metrics',cases:24,multiroundCases,cachedEvaluations,uncachedEvaluations}));
});

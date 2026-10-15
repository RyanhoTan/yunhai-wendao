import * as THREE from 'three';

export const GEOLOGICAL_BASE_QUANTUM=1e-6;
export const GEOLOGICAL_MAX_EDGE_LENGTH=2.6;
export const GEOLOGICAL_MAX_MIDPOINT_ERROR=.12;

export type GeologicalFaceOwnership={batch:string;cell:string;row:number};
export type GeologicalBaseTriangle<M=GeologicalFaceOwnership>={base:readonly [THREE.Vector3,THREE.Vector3,THREE.Vector3];metadata:M};
export type GeologicalRefinementVertex={readonly key:string;readonly base:THREE.Vector3;readonly world:THREE.Vector3};
export type GeologicalRefinedTriangle<M=GeologicalFaceOwnership>={vertices:readonly [GeologicalRefinementVertex,GeologicalRefinementVertex,GeologicalRefinementVertex];metadata:M};
export type GeologicalPointResolver=(base:Readonly<THREE.Vector3>)=>THREE.Vector3;
export type GeologicalRefinementOptions={maxIterations?:number;maxTriangles?:number;protectedEdgeKeys?:ReadonlySet<string>;onInputConsumed?:()=>void};
export type GeologicalRefinementStop='converged'|'iteration-limit'|'triangle-limit'|'canonical-resolution';
export type GeologicalRefinementRound={iteration:number;trianglesBefore:number;trianglesAfter:number;markedEdges:number;appliedEdges:number;unrefinableEdges:number;splitPatterns:readonly [number,number,number,number]};
export type GeologicalEdgeDiagnostic={key:string;baseA:number[];baseB:number[];worldA:number[];worldB:number[];worldMidpoint:number[];length:number;error:number;protected:boolean};
export type GeologicalRefinementStats={
  inputTriangles:number;outputTriangles:number;iterations:number;converged:boolean;stopReason:GeologicalRefinementStop;
  cachedVertices:number;activeVertices:number;activeEdges:number;appliedEdges:number;remainingEdges:number;remainingLengthEdges:number;remainingCurvatureEdges:number;unrefinableEdges:number;
  protectedEdges:number;protectedLengthViolations:number;protectedCurvatureViolations:number;maxProtectedWorldEdgeLength:number;maxProtectedMidpointError:number;
  maxWorldEdgeLength:number;maxMidpointError:number;maxUnprotectedWorldEdgeLength:number;maxUnprotectedMidpointError:number;
  degenerateBaseTriangles:number;degenerateWorldTriangles:number;rounds:GeologicalRefinementRound[];
  worstCurvatureEdges:GeologicalEdgeDiagnostic[];
};
export type GeologicalRefinementResult<M=GeologicalFaceOwnership>={triangles:GeologicalRefinedTriangle<M>[];vertexCache:Map<string,GeologicalRefinementVertex>;stats:GeologicalRefinementStats};
type EdgeMetrics={
  activeEdges:number;remainingEdges:number;remainingLengthEdges:number;remainingCurvatureEdges:number;unrefinableEdges:number;
  protectedEdges:number;protectedLengthViolations:number;protectedCurvatureViolations:number;maxProtectedWorldEdgeLength:number;maxProtectedMidpointError:number;
  maxWorldEdgeLength:number;maxMidpointError:number;maxUnprotectedWorldEdgeLength:number;maxUnprotectedMidpointError:number;
};
const unorderedEdgeKey=(a:string,b:string)=>a<b?a+'|'+b:b+'|'+a;
const edgeKey=(a:GeologicalRefinementVertex,b:GeologicalRefinementVertex)=>unorderedEdgeKey(a.key,b.key);

/** The same physical-coordinate key used by the clipped escarpment batches. */
export function canonicalGeologicalBase(base:Readonly<THREE.Vector3>):THREE.Vector3{
  const values=[base.x,base.y,base.z].map(value=>{
    if(!Number.isFinite(value))throw new RangeError('Geological base coordinates must be finite.');
    const integer=Math.round(value*1e6);
    if(!Number.isSafeInteger(integer))throw new RangeError('Geological base coordinate exceeds the exact 1e-6 domain.');
    const quantised=integer/1e6;return quantised===0?0:quantised;
  });
  return new THREE.Vector3(values[0],values[1],values[2]);
}

/** Canonical undirected key for locking an input patch's shared boundary. */
export function canonicalGeologicalEdgeKey(a:Readonly<THREE.Vector3>,b:Readonly<THREE.Vector3>):string{
  return unorderedEdgeKey(canonicalGeologicalBase(a).toArray().join(','),canonicalGeologicalBase(b).toArray().join(','));
}

/**
 * Refines a conforming base mesh in whole-mesh rounds. An edge shared by any
 * batch/cell/row receives the identical cached midpoint and split decision.
 * This preserves the resolver's shape; it does not generate displacement.
 *
 * Metadata remains the original reference. Do not mutate returned vertex
 * records. vertexCache contains exactly the active triangle vertices; unused
 * curvature probes are transient and can be evaluated again in a later round.
 * The resolver must therefore be deterministic for a canonical base point.
 * Satisfied edges reuse only their two scalar metrics across rounds. Their
 * endpoints stay unchanged because green/red splits preserve unmarked edges.
 * This temporary metric cache is cleared before returning the active mesh.
 * Existing non-matching input edge partitions must be fixed by the clipper.
 * Protected input edges retain their original partition so an unrefined
 * neighbouring patch can meet them. They are measured and reported separately;
 * converged/remaining* concern only unprotected edges. maxWorldEdgeLength and
 * maxMidpointError still include all edges, including protected violations.
 * onInputConsumed runs once after input positions have been copied into the
 * canonical mesh, before the first edge scan. The caller can release its base
 * face arrays then; it must retain metadata values and protected edge keys.
 */
export function refineGeologicalFaces<M>(
  input:readonly GeologicalBaseTriangle<M>[],
  resolve:GeologicalPointResolver,
  options:GeologicalRefinementOptions={},
):GeologicalRefinementResult<M>{
  const inputTriangles=input.length,maxIterations=options.maxIterations??8,maxTriangles=options.maxTriangles??Math.max(250000,inputTriangles);
  const protectedEdgeKeys=options.protectedEdgeKeys;
  if(!Number.isSafeInteger(maxIterations)||maxIterations<0||maxIterations>16)throw new RangeError('maxIterations must be an integer from 0 through 16.');
  if(!Number.isSafeInteger(maxTriangles)||maxTriangles<1)throw new RangeError('maxTriangles must be a positive safe integer.');
  const vertexCache=new Map<string,GeologicalRefinementVertex>();
  const checkedWorld=(canonical:THREE.Vector3)=>{
    // Callers may return a reusable scratch vector. Consume it immediately
    // and clone only when storing a vertex across later resolver calls.
    const world=resolve(canonical.clone());
    if(!Number.isFinite(world.x)||!Number.isFinite(world.y)||!Number.isFinite(world.z))throw new RangeError('Geological resolver returned a non-finite world point.');
    return world;
  };
  const vertex=(base:Readonly<THREE.Vector3>)=>{
    const canonical=canonicalGeologicalBase(base),key=canonical.toArray().join(','),existing=vertexCache.get(key);if(existing)return existing;
    // A resolver may use mutable temporary vectors; neither it nor a later
    // call may modify the canonical base or a previously returned world point.
    const world=checkedWorld(canonical).clone();
    const result:GeologicalRefinementVertex={key,base:canonical,world};vertexCache.set(key,result);return result;
  };
  let triangles:GeologicalRefinedTriangle<M>[]=input.map(t=>({vertices:[vertex(t.base[0]),vertex(t.base[1]),vertex(t.base[2])],metadata:t.metadata}));
  options.onInputConsumed?.();
  const rounds:GeologicalRefinementRound[]=[];let appliedEdges=0,iterations=0,stopReason:GeologicalRefinementStop='converged';
  const goodEdgeMetrics=new Map<string,{length:number;error:number}>();
  const inspect=()=>{
    const seen=new Set<string>(),marked=new Map<string,GeologicalRefinementVertex>();
    const worstCurvatureEdges:GeologicalEdgeDiagnostic[]=[];
    const metrics:EdgeMetrics={activeEdges:0,remainingEdges:0,remainingLengthEdges:0,remainingCurvatureEdges:0,unrefinableEdges:0,protectedEdges:0,protectedLengthViolations:0,protectedCurvatureViolations:0,maxProtectedWorldEdgeLength:0,maxProtectedMidpointError:0,maxWorldEdgeLength:0,maxMidpointError:0,maxUnprotectedWorldEdgeLength:0,maxUnprotectedMidpointError:0};
    for(const triangle of triangles)for(let i=0;i<3;i++){
      const a=triangle.vertices[i],b=triangle.vertices[(i+1)%3],key=edgeKey(a,b);if(seen.has(key))continue;seen.add(key);
      const cached=goodEdgeMetrics.get(key);
      let base:THREE.Vector3|undefined,midpointKey:string|undefined,existing:GeologicalRefinementVertex|undefined,world:THREE.Vector3|undefined,length:number,error:number;
      if(cached){length=cached.length;error=cached.error;}
      else{
        base=canonicalGeologicalBase(a.base.clone().add(b.base).multiplyScalar(.5));midpointKey=base.toArray().join(',');existing=vertexCache.get(midpointKey);world=existing?.world??checkedWorld(base);
        length=a.world.distanceTo(b.world);error=world.distanceTo(a.world.clone().add(b.world).multiplyScalar(.5));
        if(length<=GEOLOGICAL_MAX_EDGE_LENGTH&&error<=GEOLOGICAL_MAX_MIDPOINT_ERROR)goodEdgeMetrics.set(key,{length,error});
      }
      if(!Number.isFinite(length)||!Number.isFinite(error))throw new RangeError('Geological edge metric is non-finite.');
      if(error>GEOLOGICAL_MAX_MIDPOINT_ERROR&&(worstCurvatureEdges.length<8||error>worstCurvatureEdges[worstCurvatureEdges.length-1].error)){
        worstCurvatureEdges.push({key,baseA:a.base.toArray(),baseB:b.base.toArray(),worldA:a.world.toArray(),worldB:b.world.toArray(),worldMidpoint:world!.toArray(),length,error,protected:protectedEdgeKeys?.has(key)??false});
        worstCurvatureEdges.sort((a,b)=>b.error-a.error);worstCurvatureEdges.length=Math.min(8,worstCurvatureEdges.length);
      }
      const lengthViolation=length>GEOLOGICAL_MAX_EDGE_LENGTH,curvatureViolation=error>GEOLOGICAL_MAX_MIDPOINT_ERROR;
      metrics.maxWorldEdgeLength=Math.max(metrics.maxWorldEdgeLength,length);metrics.maxMidpointError=Math.max(metrics.maxMidpointError,error);
      if(protectedEdgeKeys?.has(key)){
        metrics.protectedEdges++;metrics.protectedLengthViolations+=Number(lengthViolation);metrics.protectedCurvatureViolations+=Number(curvatureViolation);
        metrics.maxProtectedWorldEdgeLength=Math.max(metrics.maxProtectedWorldEdgeLength,length);metrics.maxProtectedMidpointError=Math.max(metrics.maxProtectedMidpointError,error);
      }else{
        metrics.maxUnprotectedWorldEdgeLength=Math.max(metrics.maxUnprotectedWorldEdgeLength,length);metrics.maxUnprotectedMidpointError=Math.max(metrics.maxUnprotectedMidpointError,error);
        if(lengthViolation||curvatureViolation){
          metrics.remainingEdges++;metrics.remainingLengthEdges+=Number(lengthViolation);metrics.remainingCurvatureEdges+=Number(curvatureViolation);
          if(midpointKey===a.key||midpointKey===b.key)metrics.unrefinableEdges++;
          else marked.set(key,existing??{key:midpointKey!,base:base!,world:world!.clone()});
        }
      }
    }
    metrics.activeEdges=seen.size;seen.clear();return {marked,metrics,worstCurvatureEdges};
  };
  let scan=inspect();
  while(true){
    const {marked,metrics}=scan;
    if(!metrics.remainingEdges){stopReason='converged';break;}
    if(iterations===maxIterations){stopReason='iteration-limit';break;}
    if(!marked.size){stopReason='canonical-resolution';break;}
    // Refine a curved face as a region. Splitting only its failing edge can
    // repeatedly create another long diagonal against an unsplit face edge.
    // Its neighbours still use green splits, with globally shared decisions.
    const failingEdges=new Set(marked.keys());
    for(const t of triangles){
      if(!t.vertices.some((a,i)=>failingEdges.has(edgeKey(a,t.vertices[(i+1)%3]))))continue;
      for(let i=0;i<3;i++){
        const a=t.vertices[i],b=t.vertices[(i+1)%3],key=edgeKey(a,b);
        if(marked.has(key)||protectedEdgeKeys?.has(key))continue;
        const base=canonicalGeologicalBase(a.base.clone().add(b.base).multiplyScalar(.5)),keyMid=base.toArray().join(',');
        if(keyMid===a.key||keyMid===b.key)continue;
        marked.set(key,vertexCache.get(keyMid)??{key:keyMid,base,world:checkedWorld(base).clone()});
      }
    }
    failingEdges.clear();
    let predicted=0;const patterns:[number,number,number,number]=[0,0,0,0];
    for(const t of triangles){let count=0;for(let i=0;i<3;i++)if(marked.has(edgeKey(t.vertices[i],t.vertices[(i+1)%3])))count++;predicted+=1+count;patterns[count]++;}
    // A partially applied round would leave unmatched neighbours. Reject the
    // entire round when its predicted triangle count exceeds the budget.
    if(predicted>maxTriangles){stopReason='triangle-limit';break;}
    for(const key of marked.keys())goodEdgeMetrics.delete(key);
    // Only a round that can be applied may make its midpoints persistent.
    // Different edge probes can quantise to one physical point; canonicalise
    // their records here so every emitted triangle shares the same object.
    for(const [key,midpoint] of marked){
      const existing=vertexCache.get(midpoint.key);
      if(existing)marked.set(key,existing);else vertexCache.set(midpoint.key,midpoint);
    }
    const next:GeologicalRefinedTriangle<M>[]=[];
    const emit=(metadata:M,a:GeologicalRefinementVertex,b:GeologicalRefinementVertex,c:GeologicalRefinementVertex)=>next.push({vertices:[a,b,c],metadata});
    for(const t of triangles){
      const [a,b,c]=t.vertices,ab=marked.get(edgeKey(a,b)),bc=marked.get(edgeKey(b,c)),ca=marked.get(edgeKey(c,a)),count=Number(!!ab)+Number(!!bc)+Number(!!ca);
      if(!count){next.push(t);continue;}
      if(count===1){
        if(ab){emit(t.metadata,a,ab,c);emit(t.metadata,ab,b,c);}
        else if(bc){emit(t.metadata,b,bc,a);emit(t.metadata,bc,c,a);}
        else{emit(t.metadata,c,ca!,b);emit(t.metadata,ca!,a,b);}
      }else if(count===3){
        emit(t.metadata,a,ab!,ca!);emit(t.metadata,ab!,b,bc!);emit(t.metadata,ca!,bc!,c);emit(t.metadata,ab!,bc!,ca!);
      }else{
        const [left,centre,right,leftMid,rightMid]=ab&&bc?[a,b,c,ab,bc]:bc&&ca?[b,c,a,bc,ca]:[c,a,b,ca!,ab!];
        emit(t.metadata,centre,rightMid,leftMid);
        // Use the shorter actual-space diagonal, with a deterministic tie.
        if(left.world.distanceToSquared(rightMid.world)<=leftMid.world.distanceToSquared(right.world)){
          emit(t.metadata,left,leftMid,rightMid);emit(t.metadata,left,rightMid,right);
        }else{emit(t.metadata,left,leftMid,right);emit(t.metadata,leftMid,rightMid,right);}
      }
    }
    rounds.push({iteration:iterations+1,trianglesBefore:triangles.length,trianglesAfter:next.length,markedEdges:metrics.remainingEdges,appliedEdges:marked.size,unrefinableEdges:metrics.unrefinableEdges,splitPatterns:patterns});
    appliedEdges+=marked.size;marked.clear();triangles=next;iterations++;scan=inspect();
  }
  // A rejected round's pending probes also stay outside the returned cache.
  scan.marked.clear();goodEdgeMetrics.clear();
  const cross=new THREE.Vector3(),side=new THREE.Vector3();let degenerateBaseTriangles=0,degenerateWorldTriangles=0;
  for(const t of triangles){
    const [a,b,c]=t.vertices;
    if(cross.subVectors(b.base,a.base).cross(side.subVectors(c.base,a.base)).lengthSq()<1e-24)degenerateBaseTriangles++;
    if(cross.subVectors(b.world,a.world).cross(side.subVectors(c.world,a.world)).lengthSq()<1e-24)degenerateWorldTriangles++;
  }
  const stats:GeologicalRefinementStats={
    inputTriangles,outputTriangles:triangles.length,iterations,converged:scan.metrics.remainingEdges===0,stopReason,
    // Every split retains all old vertices and uses each committed midpoint.
    cachedVertices:vertexCache.size,activeVertices:vertexCache.size,appliedEdges,...scan.metrics,
    degenerateBaseTriangles,degenerateWorldTriangles,rounds,worstCurvatureEdges:scan.worstCurvatureEdges,
  };
  return {triangles,vertexCache,stats};
}

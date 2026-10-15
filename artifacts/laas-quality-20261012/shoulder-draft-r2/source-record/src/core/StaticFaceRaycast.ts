import * as THREE from 'three';

type Node={bounds:THREE.Box3;start:number;end:number;left?:Node;right?:Node};
type FaceTree={order:Uint32Array;root:Node;position:THREE.BufferAttribute|THREE.InterleavedBufferAttribute;index:THREE.BufferAttribute|null;positionVersion:number;indexVersion:number};
const trees=new WeakMap<THREE.BufferGeometry,FaceTree>();

/** Static triangle acceleration. Rendering and collision use the same vertices;
 * bounding volumes only reject empty space, never substitute a solid surface. */
function treeFor(geometry:THREE.BufferGeometry):FaceTree{
  const position=geometry.getAttribute('position'),index=geometry.index;
  const positionVersion=position instanceof THREE.InterleavedBufferAttribute?position.data.version:position.version;
  const previous=trees.get(geometry);
  if(previous&&previous.position===position&&previous.index===index&&previous.positionVersion===positionVersion&&previous.indexVersion===(index?.version??0))return previous;
  const count=Math.floor((index?.count??position.count)/3),order=Uint32Array.from({length:count},(_,i)=>i);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  const read=(triangle:number)=>{
    const i=triangle*3;
    a.fromBufferAttribute(position,index?index.getX(i):i);b.fromBufferAttribute(position,index?index.getX(i+1):i+1);c.fromBufferAttribute(position,index?index.getX(i+2):i+2);
  };
  const build=(start:number,end:number,depth:number):Node=>{
    const bounds=new THREE.Box3();
    for(let i=start;i<end;i++){read(order[i]);bounds.expandByPoint(a).expandByPoint(b).expandByPoint(c);}
    const node:Node={bounds,start,end};
    if(end-start<=16||depth>=32)return node;
    const size=bounds.getSize(new THREE.Vector3()),axis=size.x>=size.y&&size.x>=size.z?'x':size.y>=size.z?'y':'z',split=(bounds.min[axis]+bounds.max[axis])*.5;
    let lo=start,hi=end-1;
    while(lo<=hi){read(order[lo]);if((a[axis]+b[axis]+c[axis])/3<split)lo++;else{const id=order[lo];order[lo]=order[hi];order[hi--]=id;}}
    // A flat/coincident cluster still terminates in bounded leaves.
    const middle=lo===start||lo===end?Math.floor((start+end)/2):lo;
    node.left=build(start,middle,depth+1);node.right=build(middle,end,depth+1);return node;
  };
  const tree={order,root:build(0,count,0),position,index,positionVersion,indexVersion:index?.version??0};trees.set(geometry,tree);return tree;
}

/** Nearest distance, with Three.js front/back/double-side and near/far rules. */
export function nearestStaticFaceHit(raycaster:THREE.Raycaster,meshes:readonly THREE.Mesh[]):number{
  let nearest=raycaster.far;
  const inverse=new THREE.Matrix4(),ray=new THREE.Ray(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),hit=new THREE.Vector3();let found=false;
  for(const mesh of meshes){
    if(!mesh.layers.test(raycaster.layers))continue;
    // Animated or multi-material geometry retains Three.js's native semantics.
    if(mesh instanceof THREE.SkinnedMesh||Array.isArray(mesh.material)||Object.keys(mesh.geometry.morphAttributes).length||mesh.geometry.drawRange.start!==0||mesh.geometry.drawRange.count!==Infinity){
      const result=raycaster.intersectObject(mesh,false)[0];if(result&&result.distance<=nearest){nearest=result.distance;found=true;}continue;
    }
    const tree=treeFor(mesh.geometry);inverse.copy(mesh.matrixWorld).invert();ray.copy(raycaster.ray).applyMatrix4(inverse);
    const stack=[tree.root];
    while(stack.length){
      const node=stack.pop()!;
      if(!ray.intersectBox(node.bounds,hit))continue;
      if(!node.bounds.containsPoint(ray.origin)&&hit.applyMatrix4(mesh.matrixWorld).distanceTo(raycaster.ray.origin)>nearest)continue;
      if(node.left){stack.push(node.left,node.right!);continue;}
      for(let i=node.start;i<node.end;i++){
        const j=tree.order[i]*3,index=tree.index,position=tree.position;
        a.fromBufferAttribute(position,index?index.getX(j):j);b.fromBufferAttribute(position,index?index.getX(j+1):j+1);c.fromBufferAttribute(position,index?index.getX(j+2):j+2);
        const side=mesh.material.side;
        const point=side===THREE.BackSide?ray.intersectTriangle(c,b,a,true,hit):ray.intersectTriangle(a,b,c,side===THREE.FrontSide,hit);
        if(!point)continue;
        const distance=point.applyMatrix4(mesh.matrixWorld).distanceTo(raycaster.ray.origin);
        if(distance>=raycaster.near&&distance<=nearest){nearest=distance;found=true;}
      }
    }
  }
  return found?nearest:Infinity;
}

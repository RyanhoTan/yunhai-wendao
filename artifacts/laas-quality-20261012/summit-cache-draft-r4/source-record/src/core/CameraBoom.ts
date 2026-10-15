import * as THREE from 'three';
import {nearbyStaticOccluders} from './StaticOccluderIndex';
import {nearestStaticFaceHit} from './StaticFaceRaycast';

/** Keep the entire camera boom on the player's side of solid architecture/terrain. */
export function constrainCameraBoom(target: THREE.Vector3, desired: THREE.Vector3, boxes: THREE.Box3[], height: (x:number,z:number)=>number,rockFaces:readonly THREE.Mesh[]=[]): void {
  const direction = desired.clone().sub(target), length = direction.length();
  if (length < 0.001) return;
  direction.divideScalar(length);
  const ray = new THREE.Ray(target,direction), hit = new THREE.Vector3();
  let allowed = length;
  for (const box of nearbyStaticOccluders(boxes,Math.min(target.x,desired.x)-.18,Math.max(target.x,desired.x)+.18,Math.min(target.z,desired.z)-.18,Math.max(target.z,desired.z)+.18)) {
    const expanded = box.clone().expandByScalar(0.18);
    if (expanded.containsPoint(target)) continue;
    if (ray.intersectBox(expanded,hit)) allowed = Math.min(allowed,Math.max(0.25,target.distanceTo(hit)-0.18));
  }
  // Curved overhanging rock uses its actual triangles; broad boxes around
  // shelves could otherwise shorten the boom in empty road-side space.
  if(rockFaces.length){
    const rockBounds=rockFaces.map(mesh=>({mesh,bounds:mesh.geometry.boundingBox?.clone().applyMatrix4(mesh.matrixWorld)}));
    const right=new THREE.Vector3().crossVectors(direction,new THREE.Vector3(0,1,0));
    if(right.lengthSq()<1e-8)right.set(1,0,0);else right.normalize();
    const up=new THREE.Vector3().crossVectors(right,direction).normalize(),raycaster=new THREE.Raycaster(),endpoint=new THREE.Vector3();
    // The .20m sample octagon encloses the .18m footprint against a broad
    // plane, including grazing angles between the eight directions. It is
    // still a discrete approximation for very small corners and curved faces.
    const diagonal=.20/Math.SQRT2;
    for(const [rx,uy] of [[0,0],[.20,0],[-.20,0],[0,.20],[0,-.20],[diagonal,diagonal],[-diagonal,diagonal],[diagonal,-diagonal],[-diagonal,-diagonal]]){
      endpoint.copy(target).addScaledVector(direction,allowed).addScaledVector(right,rx).addScaledVector(up,uy);
      const cast=endpoint.sub(target),castLength=cast.length();cast.divideScalar(castLength);raycaster.set(target,cast);raycaster.near=.2;raycaster.far=castLength;
      const candidates=rockBounds.filter(({bounds})=>{
        if(!bounds||!raycaster.ray.intersectBox(bounds,hit))return false;
        return bounds.containsPoint(target)||target.distanceTo(hit)<=castLength;
      }).map(({mesh})=>mesh);
      const rockDistance=nearestStaticFaceHit(raycaster,candidates);
      if(Number.isFinite(rockDistance))allowed=Math.min(allowed,Math.max(.25,rockDistance*cast.dot(direction)-.22));
    }
  }
  // Sampling catches hills between the hero and camera, not just under the endpoint.
  for (let distance=0.5;distance<allowed;distance+=0.35) {
    ray.at(distance,hit);
    if (hit.y < height(hit.x,hit.z)+0.25) { allowed=Math.max(0.25,distance-0.35); break; }
  }
  desired.copy(target).addScaledVector(direction,allowed);
}

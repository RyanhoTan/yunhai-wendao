import * as THREE from 'three';

/** Keep the entire camera boom on the player's side of solid architecture/terrain. */
export function constrainCameraBoom(target: THREE.Vector3, desired: THREE.Vector3, boxes: THREE.Box3[], height: (x:number,z:number)=>number): void {
  const direction = desired.clone().sub(target), length = direction.length();
  if (length < 0.001) return;
  direction.divideScalar(length);
  const ray = new THREE.Ray(target,direction), hit = new THREE.Vector3();
  let allowed = length;
  for (const box of boxes) {
    const expanded = box.clone().expandByScalar(0.18);
    if (expanded.containsPoint(target)) continue;
    if (ray.intersectBox(expanded,hit)) allowed = Math.min(allowed,Math.max(0.25,target.distanceTo(hit)-0.18));
  }
  // Sampling catches hills between the hero and camera, not just under the endpoint.
  for (let distance=0.5;distance<allowed;distance+=0.35) {
    ray.at(distance,hit);
    if (hit.y < height(hit.x,hit.z)+0.25) { allowed=Math.max(0.25,distance-0.35); break; }
  }
  desired.copy(target).addScaledVector(direction,allowed);
}

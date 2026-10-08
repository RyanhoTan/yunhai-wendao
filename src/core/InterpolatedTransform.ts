import * as THREE from 'three';

/** Present fixed-step motion between ticks without changing the simulation state. */
export class InterpolatedTransform {
  readonly position = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  private previousPosition = new THREE.Vector3();
  private previousQuaternion = new THREE.Quaternion();
  private savedPosition = new THREE.Vector3();
  private savedRotation = new THREE.Euler();

  constructor(private readonly object: THREE.Object3D) { this.reset(); }

  capturePrevious(): void {
    this.previousPosition.copy(this.object.position);
    this.previousQuaternion.copy(this.object.quaternion);
  }

  sample(alpha: number): void {
    const weight = THREE.MathUtils.clamp(alpha, 0, 1);
    this.position.lerpVectors(this.previousPosition, this.object.position, weight);
    this.quaternion.slerpQuaternions(this.previousQuaternion, this.object.quaternion, weight);
  }

  reset(): void { this.capturePrevious(); this.sample(1); }

  apply(): void {
    this.savedPosition.copy(this.object.position);
    this.savedRotation.copy(this.object.rotation);
    this.object.position.copy(this.position);
    this.object.quaternion.copy(this.quaternion);
  }

  restore(): void {
    this.object.position.copy(this.savedPosition);
    // Preserve the simulation's Euler yaw, including turns past +/-90 degrees.
    // Copying a quaternion back would canonicalize XYZ into a different Euler triple.
    this.object.rotation.copy(this.savedRotation);
    // World-space queries between draws must also see the authoritative pose.
    this.object.updateMatrixWorld(true);
  }
}

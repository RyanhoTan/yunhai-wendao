import * as THREE from 'three';

/** Bone textures belong to skeletons rather than materials. Shared primitives release once. */
export function disposeSkeletons(root: THREE.Object3D): void {
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse(object => { if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton); });
  for (const skeleton of skeletons) skeleton.dispose();
}

export function disposeObject3D(root: THREE.Object3D): void {
  disposeSkeletons(root);
  root.traverse((object: THREE.Object3D) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) {
      disposeMaterial(material);
    }
  });
}

function disposeMaterial(material: THREE.Material): void {
  const values = Object.values(material as unknown as Record<string, unknown>);
  for (const value of values) {
    if (isThreeTexture(value)) {
      value.dispose();
    }
  }
  material.dispose();
}

function isThreeTexture(value: unknown): value is THREE.Texture {
  return Boolean(value && typeof value === 'object' && (value as { isTexture?: boolean }).isTexture);
}

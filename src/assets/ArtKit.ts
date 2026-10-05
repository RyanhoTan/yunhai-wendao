import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Original, shared surface roles for the Yunhai school and its landscape. */
export const artMaterials = {
  ivory: new THREE.MeshStandardMaterial({ color: 0xeee7cd, roughness: 0.87 }),
  jade: new THREE.MeshStandardMaterial({ color: 0x27695e, roughness: 0.64 }),
  teal: new THREE.MeshStandardMaterial({ color: 0x387f77, roughness: 0.68 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xc8a858, roughness: 0.4, metalness: 0.65 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x172a2b, roughness: 0.9 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xdbad88, roughness: 0.9 }),
  hair: new THREE.MeshStandardMaterial({ color: 0x152529, roughness: 0.68 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xabc8bf, metalness: 0.78, roughness: 0.25 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x798980, roughness: 0.94 }),
  paleStone: new THREE.MeshStandardMaterial({ color: 0xb0b3a1, roughness: 0.95 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6d4840, roughness: 0.81 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x254d4a, roughness: 0.6 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x467265, roughness: 0.94 }),
  leafLight: new THREE.MeshStandardMaterial({ color: 0x678969, roughness: 0.95 }),
  blossom: new THREE.MeshStandardMaterial({ color: 0xd89f9a, roughness: 0.9 }),
  bark: new THREE.MeshStandardMaterial({ color: 0x665649, roughness: 0.98 }),
  spirit: new THREE.MeshStandardMaterial({ color: 0xbbdfcc, emissive: 0x4d987f, emissiveIntensity: 0.33, roughness: 0.42 }),
  warning: new THREE.MeshStandardMaterial({ color: 0xb7634d, emissive: 0x943826, emissiveIntensity: 0.3, roughness: 0.58 }),
  lantern: new THREE.MeshStandardMaterial({ color: 0xf6d394, emissive: 0xe9a652, emissiveIntensity: 0.5, roughness: 0.75 }),
} satisfies Record<string, THREE.MeshStandardMaterial>;
for (const [name, material] of Object.entries(artMaterials)) material.name = name;

export const artGeometry = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 14, 10),
  ico: new THREE.IcosahedronGeometry(1, 1),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 10),
  torus: new THREE.TorusGeometry(1, 0.045, 5, 40),
};

export type Surface = keyof typeof artMaterials;

export function mesh(
  parent: THREE.Object3D, geometry: THREE.BufferGeometry, surface: Surface,
  position: [number, number, number], scale: [number, number, number] = [1, 1, 1],
  rotation: [number, number, number] = [0, 0, 0],
) {
  const result = new THREE.Mesh(geometry, artMaterials[surface]);
  result.position.set(...position);
  result.scale.set(...scale);
  result.rotation.set(...rotation);
  result.castShadow = true;
  result.receiveShadow = true;
  parent.add(result);
  return result;
}

/** Bake authored static detail by surface; pivots are baked separately by callers. */
export function bake(group: THREE.Group) {
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  group.updateMatrixWorld(true);
  const inverseRoot = group.matrixWorld.clone().invert();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const source = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    const geometry = source.applyMatrix4(inverseRoot.clone().multiply(object.matrixWorld));
    // Shared recipes all provide position, normal and UV. Vertex colors are only terrain.
    geometry.deleteAttribute('color');
    const list = byMaterial.get(object.material) ?? [];
    list.push(geometry);
    byMaterial.set(object.material, list);
  });
  group.clear();
  for (const [material, geometries] of byMaterial) {
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((part) => part.dispose());
    if (!geometry) continue;
    const merged = new THREE.Mesh(geometry, material);
    merged.name = `${group.name || 'authored'}_${material.name || 'surface'}`;
    merged.castShadow = true;
    merged.receiveShadow = true;
    group.add(merged);
  }
  return group;
}

export function tube(points: THREE.Vector3[], radius = 0.035, segments = 20) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 5, false);
}

export function taperedCloth(rings: { y: number; x: number; z: number }[], segments = 24, scallop = 0) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  rings.forEach((ring, row) => {
    for (let col = 0; col <= segments; col++) {
      const theta = col / segments * Math.PI * 2;
      const ripple = 1 + Math.sin(theta * 8) * 0.025;
      positions.push(Math.cos(theta) * ring.x * ripple, ring.y + (row === 0 ? Math.cos(theta * 4) * scallop : 0), Math.sin(theta) * ring.z * ripple);
      uvs.push(col / segments, row / (rings.length - 1));
      if (row < rings.length - 1 && col < segments) {
        const a = row * (segments + 1) + col, b = a + segments + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function seededRandom(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

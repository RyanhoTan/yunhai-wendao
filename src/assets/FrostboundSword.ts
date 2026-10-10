import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const FROSTBOUND_SWORD = {
  id: 'frostbound-arcblade', asset: 'assets/weapons/frostbound-arcblade.glb',
  rawGripY: .675, gripY: .03, tipY: 1.04, flightScale: 3.2,
} as const;
let heldTemplate: THREE.Group | undefined;
let flightTemplate: THREE.Group | undefined;
let pending: Promise<void> | undefined;

/** Complete the textured import before characters can create their hand sockets. */
export async function loadFrostboundSwordAssets(): Promise<void> {
  if (heldTemplate && flightTemplate) return;
  if (pending) return pending;
  pending = (async () => {
    const asset = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}${FROSTBOUND_SWORD.asset}`);
    const root = new THREE.Group(); root.name = 'FrostboundArcblade';
    root.userData.weapon = FROSTBOUND_SWORD.id; root.userData.asset = FROSTBOUND_SWORD.asset;
    const visual = asset.scene; visual.name = 'FrostboundVisual'; root.add(visual);
    // Meshy exported the point downwards. Turn the whole asset without changing its PBR maps.
    const scale = (FROSTBOUND_SWORD.tipY - FROSTBOUND_SWORD.gripY) / FROSTBOUND_SWORD.rawGripY;
    visual.rotation.z = Math.PI; visual.scale.setScalar(scale);
    visual.position.y = FROSTBOUND_SWORD.gripY + FROSTBOUND_SWORD.rawGripY * scale;
    visual.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      node.name = 'FrostboundArcbladeMesh'; node.receiveShadow = true;
      // This very fine mesh keeps its authored detail; a thin weapon shadow need not
      // submit another 116k triangles to the distant sun's shadow map.
      node.castShadow = false;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        const pbr = material as THREE.MeshStandardMaterial;
        if (pbr.map) pbr.map.anisotropy = 4;
      }
    });
    root.updateMatrixWorld(true);
    const tip = new THREE.Object3D(); tip.name = 'SwordTipSocket'; tip.position.set(0, FROSTBOUND_SWORD.tipY, -.00041 * scale); root.add(tip);
    const grip = new THREE.Object3D(); grip.name = 'SwordGripSocket'; grip.position.set(0, FROSTBOUND_SWORD.gripY, 0); root.add(grip);
    const flying = root.clone(true);
    // Preserve the imported guard and grip. Only broaden the blade for the existing
    // two-foot flight stance, fading smoothly back to the authored guard seam.
    flying.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const original = node.geometry, geometry = new THREE.BufferGeometry();
      // Position and normal change; authored indices and UVs remain shared.
      geometry.setIndex(original.index);
      for (const name of Object.keys(original.attributes)) {
        const attribute = original.getAttribute(name);
        geometry.setAttribute(name, name === 'position' || name === 'normal' ? attribute.clone() : attribute);
      }
      const position = geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        const t = 1 - THREE.MathUtils.smoothstep(position.getY(i), .52, .565);
        position.setX(i, position.getX(i) * (1 + t * 3.8));
      }
      geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); node.geometry = geometry;
    });
    flying.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(), points: number[] = [];
    for (const x of [-.065, 0, .065]) {
      ray.set(new THREE.Vector3(x, 1.1 / FROSTBOUND_SWORD.flightScale, .1), new THREE.Vector3(0, 0, -1));
      const hit = ray.intersectObject(flying, true)[0]; if (hit) points.push(hit.point.z);
    }
    if (points.length !== 3) throw new Error('御剑模型缺少有效剑面');
    flying.userData.deckZ = Math.max(...points);
    // Publish both immutable templates together, after all preparation succeeded.
    heldTemplate = root; flightTemplate = flying;
  })();
  try { await pending; } finally { pending = undefined; }
}

export function makeFrostboundSword(scale = 1): THREE.Group {
  const template = scale > 1 ? flightTemplate : heldTemplate;
  if (!template) throw new Error('霜刃资源尚未加载');
  const root = template.clone(true); root.scale.setScalar(scale); return root;
}

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

export type ImportedCreature = 'wolf' | 'beast';
const library = new Map<ImportedCreature, GLTF>();
export const CREATURE_NAMES = { spirit: '浊气妖灵', guardian: '镇山石灵', wolf: '苍狼妖兽', beast: '赤脊兽' };
const heights = { wolf: 1.5, beast: 3.2 };

export async function loadCreatureAssets(): Promise<void> {
  await Promise.all((['wolf', 'beast'] as const).map(async kind => {
    if (library.has(kind)) return;
    const asset = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/creatures/${kind}.glb`);
    for (const suffix of ['Idle', 'Walk', 'Attack']) {
      if (!asset.animations.some(clip => clip.name === suffix || clip.name.endsWith(`_${suffix}`))) throw new Error(`${kind}缺少${suffix}动作`);
    }
    const materials = new Set<THREE.MeshStandardMaterial>();
    asset.scene.traverse(node => { if (node instanceof THREE.Mesh) for (const mat of Array.isArray(node.material) ? node.material : [node.material]) if (mat instanceof THREE.MeshStandardMaterial) materials.add(mat); });
    for (const material of materials) {
      material.metalness = 0; material.roughness = .88;
      // Keep authored light/dark anatomical regions, adapting green hide to rusty red.
      if (kind === 'beast' && material.name === 'Green') material.color.set('#6d4436');
      if (kind === 'beast' && material.name === 'LightGreen') material.color.set('#a77c58');
    }
    library.set(kind, asset);
  }));
}

export function createCreatureModel(kind: ImportedCreature) {
  const asset = library.get(kind); if (!asset) throw new Error(`妖兽资源尚未加载：${kind}`);
  const root = new THREE.Group(); root.name = kind === 'wolf' ? 'CanglangBeast' : 'RedRidgeBeast';
  const visual = clone(asset.scene) as THREE.Group; root.add(visual); visual.rotation.y = Math.PI;
  visual.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(visual), size = bounds.getSize(new THREE.Vector3());
  visual.scale.multiplyScalar(heights[kind] / size.y); visual.updateMatrixWorld(true);
  bounds.setFromObject(visual); visual.position.y -= bounds.min.y;
  // Centre the gameplay body on the torso, leaving the long tail visual-only.
  const torso = visual.getObjectByName('Torso'); if (torso) { const p = torso.getWorldPosition(new THREE.Vector3()); visual.position.x -= p.x; visual.position.z -= p.z; }
  const skeletons: THREE.Skeleton[] = [];
  visual.traverse(node => {
    if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; }
    if (node instanceof THREE.SkinnedMesh) {
      const common = skeletons.find(s => s.bones.length === node.skeleton.bones.length && s.bones.every((bone, i) => bone === node.skeleton.bones[i] && s.boneInverses[i].equals(node.skeleton.boneInverses[i])));
      if (common) node.skeleton = common; else skeletons.push(node.skeleton);
    }
  });
  const mixer = new THREE.AnimationMixer(visual);
  const clip = (name: string) => asset.animations.find(clip => clip.name === name) ?? asset.animations.find(clip => clip.name.endsWith(`_${name}`))!;
  const actions = { idle: mixer.clipAction(clip('Idle')), walk: mixer.clipAction(clip('Walk')), attack: mixer.clipAction(clip('Attack')) };
  for (const [name, action] of Object.entries(actions)) action.play().setEffectiveWeight(name === 'idle' ? 1 : 0);
  actions.attack.paused = true; mixer.update(0);
  let motion = 'idle', detailed = true;
  return {
    root,
    animate(dt: number, _time: number, moving: boolean, attack: number) {
      motion = attack > 0 ? 'attack' : moving ? 'walk' : 'idle';
      if (dt === 0) return;
      if (!detailed) return;
      for (const [name, action] of Object.entries(actions)) {
        action.setEffectiveWeight(THREE.MathUtils.lerp(action.getEffectiveWeight(), name === motion ? 1 : 0, 1 - Math.exp(-dt * 20)));
      }
      // Map the authored bite to the existing telegraph; AI owns world translation.
      if (attack > 0) {
        const contact = kind === 'wolf' ? .55 : .5;
        const phase = attack <= 1 ? attack * contact : contact + Math.min(1, attack - 1) * (1 - contact);
        actions.attack.time = Math.min(.999, phase) * actions.attack.getClip().duration;
      }
      mixer.update(dt);
    },
    setDetail(high: boolean) { detailed = high; /* Each asset is <7k triangles; keep its actual silhouette at all distances. */ },
    resetPose() { motion = 'idle'; for (const [name, action] of Object.entries(actions)) { action.time = 0; action.setEffectiveWeight(name === 'idle' ? 1 : 0); } mixer.update(0); },
    diagnostics() { return { loaded: true, species: kind, motion, motionTime: actions[motion as keyof typeof actions].time, clips: Object.values(actions).map(a => a.getClip().name) }; },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(visual); },
  };
}

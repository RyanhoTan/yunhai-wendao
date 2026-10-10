import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { makeSword } from './Models';
import { disposeSkeletons } from '../utils/dispose';

export const PLAYER_CHARACTERS = [
  { id: 'jade-blossom', name: '翡翠花影', subtitle: '清风拂袖 · 白衣问道', portrait: 'assets/character/jade-blossom-portrait.webp' },
  { id: 'shadowbound-wanderer', name: '玄影行者', subtitle: '玄影随行 · 执剑山海', portrait: 'assets/character/shadowbound-wanderer-portrait.webp' },
] as const;
export type PlayerCharacterId = typeof PLAYER_CHARACTERS[number]['id'];
export const DEFAULT_CHARACTER: PlayerCharacterId = 'jade-blossom';
export const isPlayerCharacterId = (value: unknown): value is PlayerCharacterId => PLAYER_CHARACTERS.some(character => character.id === value);
export const CHARACTER_STORAGE_KEY = 'yunhai-wendao-character-v1';
export function readCharacterSelection(): PlayerCharacterId {
  try { const id = localStorage.getItem(CHARACTER_STORAGE_KEY); return isPlayerCharacterId(id) ? id : DEFAULT_CHARACTER; }
  catch { return DEFAULT_CHARACTER; }
}
const JADE_CLIPS = {
  idle: '01a11fb8-e419-76bb-a2d1-d4129835f21a',
  walk: 'Walking_Woman', run: 'Running', slash: 'Triple_Combo_Attack',
  float: '01a11fb1-5971-7214-b4d6-d2845f63064b',
  crouchSlash: 'Jump_Over_Obstacle_2', land: 'Jump_Over_Obstacle_2',
} as const;
type Motion = keyof typeof JADE_CLIPS;
type CharacterLibrary = { scene: THREE.Group; clips: Map<Motion, THREE.AnimationClip>; sources: Partial<Record<Motion, string>> };
const libraries = new Map<PlayerCharacterId, CharacterLibrary>();
let pendingLoad: Promise<void> | undefined;

/** Anchor every clip to the same body proxy. The game alone owns world movement. */
function inPlace(source: THREE.AnimationClip, name: Motion, anchor: THREE.Vector3) {
  const clip = source.clone(); clip.name = name;
  for (const track of clip.tracks) {
    if (track.name === 'mixamorigHips.position') {
      for (let i = 0; i < track.values.length; i += 3) {
        track.values[i] = anchor.x; track.values[i + 2] = anchor.z;
      }
    }
    // AI loops have different first/last poses. Ease the final quarter-second
    // back to the first pose, including hips height, without moving the actor.
    if (name !== 'idle' && name !== 'float') continue;
    const size = track.getValueSize(), first = Array.from(track.values.slice(0, size));
    const q = new THREE.Quaternion(), start = new THREE.Quaternion();
    if (size === 4) start.fromArray(first);
    for (let i = 0; i < track.times.length; i++) {
      const t = THREE.MathUtils.smoothstep(track.times[i], clip.duration - .25, clip.duration);
      if (!t) continue;
      if (size === 4) q.fromArray(track.values, i * size).slerp(start, t).toArray(track.values, i * size);
      else for (let axis = 0; axis < size; axis++) track.values[i * size + axis] = THREE.MathUtils.lerp(track.values[i * size + axis], first[axis], t);
    }
  }
  return clip;
}

export async function loadPlayerCharacterAssets() {
  if (libraries.size === PLAYER_CHARACTERS.length) return;
  if (pendingLoad) return pendingLoad;
  pendingLoad = (async () => {
    const assets = await Promise.all(PLAYER_CHARACTERS.map(character => new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/character/${character.id}.glb`)));
    const prepared = new Map<PlayerCharacterId, CharacterLibrary>();
    for (const [index, asset] of assets.entries()) {
      const id = PLAYER_CHARACTERS[index].id, hips = asset.scene.getObjectByName('mixamorigHips');
      if (!hips) throw new Error(`角色 ${id} 缺少 Hips 骨骼`);
      const clips = new Map<Motion, THREE.AnimationClip>(), sources: Partial<Record<Motion, string>> = {};
      for (const name of Object.keys(JADE_CLIPS) as Motion[]) {
        const sourceName = id === 'shadowbound-wanderer' && name === 'walk' ? 'Walking' : JADE_CLIPS[name];
        const source = asset.animations.find(clip => clip.name === sourceName);
        // Missing motions remain the authored rest pose. Never borrow or create clips.
        if (!source) continue;
        sources[name] = sourceName;
        clips.set(name, inPlace(source, name, hips.position));
      }
      prepared.set(id, { scene: asset.scene, clips, sources });
    }
    for (const [id, library] of prepared) libraries.set(id, library);
  })();
  try { await pendingLoad; } finally { pendingLoad = undefined; }
}

export function createPlayerCharacter(id: PlayerCharacterId = DEFAULT_CHARACTER) {
  const library = libraries.get(id);
  if (!library) throw new Error(`角色 ${id} 资源尚未加载`);
  const root = new THREE.Group(); root.name = `Player-${id}`;
  const visual = new THREE.Group(); root.add(visual);
  const model = clone(library.scene) as THREE.Group; visual.add(model);
  model.rotation.y = Math.PI;
  model.updateMatrixWorld(true);
  // Measure actual skinned vertices, not cached bounds from a different pose.
  const bounds = new THREE.Box3().setFromObject(model, true);
  model.scale.setScalar(1.82 / bounds.getSize(new THREE.Vector3()).y);
  model.updateMatrixWorld(true);
  bounds.setFromObject(model, true);
  model.position.y -= bounds.min.y;
  const bones = new Map<string, THREE.Bone>(), meshes: THREE.SkinnedMesh[] = [];
  model.traverse(node => {
    if (node instanceof THREE.Bone) bones.set(node.name.replace(/^mixamorig:?/, ''), node);
    if (node instanceof THREE.Mesh) {
      node.castShadow = true; node.receiveShadow = true;
      // Imported animation moves beyond the rest-pose bounding sphere.
      if (node instanceof THREE.SkinnedMesh) { node.frustumCulled = false; meshes.push(node); }
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        const pbr = material as THREE.MeshStandardMaterial;
        if (pbr.map) pbr.map.anisotropy = 4;
      }
    }
  });
  for (const name of ['Hips', 'RightHand', 'LeftUpLeg', 'LeftFoot', 'RightFoot']) {
    if (!bones.has(name)) throw new Error(`角色骨骼缺失：${name}`);
  }
  const mixer = new THREE.AnimationMixer(model), actions = new Map<Motion, THREE.AnimationAction>();
  for (const [name, clip] of library.clips) {
    const action = mixer.clipAction(clip); action.play(); action.setEffectiveWeight(name === 'idle' ? 1 : 0);
    actions.set(name, action);
  }
  mixer.update(0); root.updateMatrixWorld(true);
  const restLegInverse = bones.get('LeftUpLeg')!.quaternion.clone().invert();
  const legDelta = new THREE.Quaternion(), legEuler = new THREE.Euler();

  // Identify actual sole vertices, using foot weights rather than robe hem height.
  const supports: { mesh: THREE.SkinnedMesh; vertex: number }[] = [];
  const point = new THREE.Vector3();
  for (const mesh of meshes) {
    const indices = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
    for (const side of ['Left', 'Right']) {
      const footJoints = new Set(mesh.skeleton.bones.flatMap((bone, index) =>
        bone.name.includes(`${side}Foot`) || bone.name.includes(`${side}Toe`) ? [index] : []));
      let lowest = Infinity, vertex = -1;
      for (let i = 0; i < indices.count; i++) {
        let weight = 0;
        for (let k = 0; k < 4; k++) if (footJoints.has(indices.getComponent(i, k))) weight += weights.getComponent(i, k);
        if (weight < .5) continue;
        mesh.getVertexPosition(i, point); point.applyMatrix4(mesh.matrixWorld);
        if (point.y < lowest) { lowest = point.y; vertex = i; }
      }
      if (vertex >= 0) supports.push({ mesh, vertex });
    }
  }
  if (!supports.length) throw new Error('角色缺少可用的脚底蒙皮');
  const supportHeight = () => {
    root.updateMatrixWorld(true);
    let height = Infinity;
    for (const support of supports) {
      support.mesh.getVertexPosition(support.vertex, point); point.applyMatrix4(support.mesh.matrixWorld); root.worldToLocal(point);
      height = Math.min(height, point.y);
    }
    return height;
  };

  const heldSword = makeSword(); heldSword.name = 'heldSword';
  const socket = new THREE.Group(); socket.name = 'SwordHandSocket'; bones.get('RightHand')!.add(socket);
  const handScale = bones.get('RightHand')!.getWorldScale(new THREE.Vector3());
  socket.scale.set(1 / handScale.x, 1 / handScale.y, 1 / handScale.z);
  heldSword.position.set(0, .07, 0);
  heldSword.rotation.x = -Math.PI / 2;
  socket.add(heldSword);
  const flyingSword = makeSword(3.2); flyingSword.name = 'flyingSword';
  flyingSword.rotation.x = -Math.PI / 2; flyingSword.position.set(0, -.16, 1.1); root.add(flyingSword);
  const swordSurfaceY = flyingSword.position.y + Number(flyingSword.userData.deckZ) * 3.2;
  const plantFeet = (flying: boolean) => { visual.position.y += (flying ? swordSurfaceY : .022) - supportHeight(); };

  const bonePoint = new THREE.Vector3(), childPoint = new THREE.Vector3(), direction = new THREE.Vector3();
  const turn = new THREE.Quaternion(), parentRotation = new THREE.Quaternion(), target = new THREE.Quaternion();
  const aimCastingArm = (name: string, childName: string, weight: number) => {
    const bone = bones.get(name)!, child = bones.get(childName)!;
    root.updateMatrixWorld(true); bone.getWorldPosition(bonePoint); child.getWorldPosition(childPoint);
    direction.set(-Math.sin(root.rotation.y), name === 'LeftArm' ? -.12 : .08, -Math.cos(root.rotation.y)).normalize();
    turn.setFromUnitVectors(childPoint.sub(bonePoint).normalize(), direction);
    bone.getWorldQuaternion(target); bone.parent!.getWorldQuaternion(parentRotation);
    target.premultiply(turn).premultiply(parentRotation.invert()); bone.quaternion.slerp(target, weight);
  };
  let current: Motion = 'idle', wasFlying = false, landing = 0, castWeight = 0;
  const resetPose = (flying = false) => {
    current = flying ? 'float' : 'idle'; wasFlying = flying; landing = 0; castWeight = 0;
    for (const [name, action] of actions) { action.time = 0; action.setEffectiveWeight(name === current ? 1 : 0); }
    mixer.update(0); plantFeet(flying); heldSword.visible = !flying; flyingSword.visible = flying;
  };
  const animate = (dt: number, _time: number, speed: number, flying: boolean, attack: number, dashProgress = -1, casting = 0) => {
    if (dt === 0) { if (wasFlying !== flying) resetPose(flying); return; }
    if (wasFlying && !flying) landing = .3;
    wasFlying = flying; landing = Math.max(0, landing - dt);
    current = flying ? 'float' : attack > 0 ? 'slash' : dashProgress >= 0 ? 'crouchSlash' : landing > 0 ? 'land' : speed > .08 ? speed < 2 ? 'walk' : 'run' : 'idle';
    const blend = 1 - Math.exp(-dt * 24);
    for (const [name, action] of actions) {
      action.setEffectiveWeight(THREE.MathUtils.lerp(action.getEffectiveWeight(), name === current ? 1 : 0, blend));
      action.paused = name === 'slash' || name === 'land' || name === 'crouchSlash';
      if (name === 'run') action.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / 6.35, .3, 1.6));
      if (name === 'walk') action.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / 1.35, .3, 1.6));
      if (name === 'slash' && attack > 0) {
        const seconds = attack * .45;
        // Use the first of the supplied three swings for the game's single hit.
        // Its forward sweep (.52–.70 s) spans the .12–.24 s damage window.
        action.time = seconds < .12 ? seconds / .12 * .52 : seconds < .24 ? .52 + (seconds - .12) / .12 * .18 : .70 + (seconds - .24) / .21 * .25;
      }
      if (name === 'land') action.time = .65 + (1 - landing / .3) * .22;
      if (name === 'crouchSlash' && dashProgress >= 0) action.time = .18 + Math.min(1, dashProgress) * .55;
    }
    mixer.update(dt);
    // Preserve the existing Jade casting overlay. Newly imported characters use
    // their own supplied joint animation only, including when casting spells.
    castWeight = id === 'jade-blossom' ? casting : 0;
    if (castWeight > 0) { aimCastingArm('LeftArm', 'LeftForeArm', castWeight * .92); aimCastingArm('LeftForeArm', 'LeftHand', castWeight * .92); }
    plantFeet(flying); heldSword.visible = !flying; flyingSword.visible = flying;
  };
  resetPose();
  return { root, animate, resetPose, diagnostics() {
    root.updateMatrixWorld(true);
    const tip = heldSword.getObjectByName('SwordTipSocket')!.getWorldPosition(new THREE.Vector3()); root.worldToLocal(tip);
    const hips = bones.get('Hips')!;
    // Report swing relative to idle; absolute Euler X wraps at ±PI on this rig.
    legDelta.copy(restLegInverse).multiply(bones.get('LeftUpLeg')!.quaternion);
    legEuler.setFromQuaternion(legDelta);
    return { model: id, weapon: String(heldSword.userData.weapon), asset: `assets/character/${id}.glb`, sourceClip: library.sources[current] ?? 'rest-pose',
      rootOffset: { x: hips.position.x, z: hips.position.z },
      leftLeg: legEuler.x, swordTip: { x: tip.x, y: tip.y, z: tip.z },
      motion: current, bones: bones.size, clips: [...actions.keys()],
      flightSupportGap: supportHeight() - swordSurfaceY, flyingSwordVisible: flyingSword.visible,
      motionTime: actions.get(current)?.time ?? 0, castingWeight: castWeight };
  }, dispose() { mixer.stopAllAction(); mixer.uncacheRoot(model); disposeSkeletons(model); } };
}

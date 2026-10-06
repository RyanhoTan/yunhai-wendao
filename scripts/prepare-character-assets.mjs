/** Offline intake; no FBX parser or third-party template engine is shipped to players.
 * Run: node scripts/prepare-character-assets.mjs ../reference-samurai-template
 * Requires this project's npm dependencies and Python 3 with Pillow.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const project = path.resolve(import.meta.dirname, '..');
const reference = path.resolve(process.argv[2] ?? path.join(project, '../reference-samurai-template'));
const output = path.join(project, 'public/assets/character');
const motionFiles = {
  idle: 'Idle.fbx', walk: 'Walk.fbx', run: 'Run.fbx',
  slash: 'fight animations/Slash.fbx', crouchSlash: 'fight animations/Crouchslash.fbx',
  float: 'fight animations/floating.fbx', land: 'fight animations/Landing.fbx', hop: 'Jump.fbx',
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const arrayBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const boundsJSON = box => ({ min: box.min.toArray(), max: box.max.toArray() });

// FBXLoader's image path requires a DOM, but this intake intentionally replaces all
// materials and extracts source images directly from the companion GLB instead.
globalThis.window = { URL };
const originalTextureLoad = THREE.TextureLoader.prototype.load;
THREE.TextureLoader.prototype.load = () => new THREE.Texture();
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({ target: this }); });
  }
};

async function readFBX(relativePath) {
  const bytes = await fs.readFile(path.join(reference, relativePath));
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    return { object: new FBXLoader().parse(arrayBuffer(bytes), ''), bytes, warnings: [...new Set(warnings)] };
  } finally { console.warn = warn; }
}

function boneMap(object) {
  const result = new Map();
  object.traverse(node => {
    if (!node.isBone) return;
    result.set(node.name, node);
    result.set(node.name.replace(/^mixamorig:?/, ''), node);
  });
  return result;
}

function retarget(source, name, bones) {
  const sourceClip = source.animations[0];
  assert(sourceClip, `${name}: no animation found`);
  const hips = bones.get('Hips');
  const ratios = sourceClip.tracks.filter(track => track.name.endsWith('.position')).flatMap(track => {
    const node = THREE.PropertyBinding.parseTrackName(track.name).nodeName;
    const bone = bones.get(node);
    if (!bone || bone === hips) return [];
    const length = Math.hypot(...track.values.slice(0, 3));
    return length > 1e-6 && bone.position.length() > 1e-6 ? [bone.position.length() / length] : [];
  }).sort((a, b) => a - b);
  const ratio = ratios[ratios.length >> 1] ?? 1;
  const unitScale = ratio > .5 && ratio < 2 ? 1 : ratio;
  const tracks = sourceClip.tracks.flatMap(original => {
    const node = THREE.PropertyBinding.parseTrackName(original.name).nodeName;
    if (!bones.has(node)) return [];
    const track = original.clone();
    if (track.name.endsWith('.position')) {
      for (let index = 0; index < track.values.length; index++) track.values[index] *= unitScale;
      if (node === hips.name) {
        // Freeze only horizontal controller-owned travel. Y and every other
        // joint's tracks retain the source pose, including crouches and jumps.
        for (let index = 0; index < track.values.length; index += 3) {
          track.values[index] = hips.position.x;
          track.values[index + 2] = hips.position.z;
        }
      }
    }
    return [track];
  });
  const clip = new THREE.AnimationClip(name, sourceClip.duration, tracks).optimize();
  assert(clip.validate(), `${name}: invalid tracks`);
  assert(tracks.length >= 20, `${name}: too few bound tracks`);
  for (const joint of ['Hips', 'Head', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg']) {
    assert(tracks.some(track => track.name === `${bones.get(joint).name}.quaternion`), `${name}: missing ${joint}`);
  }
  return { clip, unitScale, originalTracks: sourceClip.tracks.length };
}

// Keep the exported binary geometry/skin unchanged, adding only external PBR
// image references. glTF images use flipY=false; a texture transform converts
// the retained FBX UV convention without changing UV values or bone units.
function dressGLB(buffer, textureIntake) {
  const original = Buffer.from(buffer);
  const jsonLength = original.readUInt32LE(12);
  const document = JSON.parse(original.subarray(20, 20 + jsonLength).toString('utf8'));
  const tail = original.subarray(20 + jsonLength);
  document.images = [];
  document.textures = [];
  document.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
  document.extensionsUsed = [...new Set([...(document.extensionsUsed ?? []), 'KHR_texture_transform', 'EXT_texture_webp'])];
  document.extensionsRequired = [...new Set([...(document.extensionsRequired ?? []), 'EXT_texture_webp'])];
  for (const material of document.materials) {
    const source = textureIntake.materials[material.name];
    assert(source, `texture palette missing ${material.name}`);
    const textureInfo = role => {
      const index = document.images.length;
      document.images.push({ uri: source.maps[role] });
      document.textures.push({ sampler: 0, extensions: { EXT_texture_webp: { source: index } } });
      return { index, extensions: { KHR_texture_transform: { offset: [0, 1], scale: [1, -1] } } };
    };
    material.pbrMetallicRoughness ??= {};
    material.pbrMetallicRoughness.baseColorTexture = textureInfo('baseColor');
    material.pbrMetallicRoughness.metallicRoughnessTexture = textureInfo('metalRoughness');
    material.pbrMetallicRoughness.metallicFactor = 1;
    material.pbrMetallicRoughness.roughnessFactor = 1;
    material.normalTexture = textureInfo('normal');
  }
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
  json.copy(padded);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + padded.length + tail.length, 8);
  header.writeUInt32LE(padded.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, padded, tail]);
}

async function extractTextures() {
  const bytes = await fs.readFile(path.join(reference, 'public/models/textures.glb'));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const jsonLength = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  const binary = bytes.subarray(28 + jsonLength);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'yunhai-character-textures-'));
  const jobs = [];
  const materials = {};
  try {
    for (const material of document.materials) {
      const maps = {
        baseColor: material.pbrMetallicRoughness?.baseColorTexture,
        normal: material.normalTexture,
        metalRoughness: material.pbrMetallicRoughness?.metallicRoughnessTexture,
      };
      materials[material.name] = { maps: {} };
      for (const [role, texture] of Object.entries(maps)) {
        if (!texture) continue;
        const image = document.images[document.textures[texture.index].source];
        const view = document.bufferViews[image.bufferView];
        const raw = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
        const source = path.join(temporary, `${material.name}-${role}.source`);
        const filename = `textures/${material.name}-${role}.webp`;
        const destination = path.join(output, filename);
        await fs.writeFile(source, raw);
        jobs.push({ source, destination, material: material.name, role, sha256: sha256(raw) });
        materials[material.name].maps[role] = filename;
      }
    }
    await fs.mkdir(path.join(output, 'textures'), { recursive: true });
    const results = JSON.parse(execFileSync('python3', ['-c', `
import json, sys
from PIL import Image
jobs=json.load(sys.stdin)
for job in jobs:
    with Image.open(job['source']) as source:
        job['sourceDimensions']=list(source.size)
        image=source.convert('RGB')
        image.thumbnail((1024,1024),Image.Resampling.LANCZOS)
        quality={'baseColor':87,'normal':92,'metalRoughness':80}[job['role']]
        image.save(job['destination'],'WEBP',quality=quality,method=6)
        job['quality']=quality
        job['dimensions']=list(image.size)
        del job['source']
print(json.dumps(jobs))
`], { input: JSON.stringify(jobs), maxBuffer: 1024 * 1024 }).toString());
    for (const result of results) {
      const bytes = await fs.readFile(result.destination);
      materials[result.material][result.role] = { dimensions: result.dimensions, sourceDimensions: result.sourceDimensions, quality: result.quality, bytes: bytes.length, sha256: sha256(bytes), sourceSha256: result.sha256 };
    }
    return { sourceSha256: sha256(bytes), materials };
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}

try {
  await fs.mkdir(path.join(output, 'metadata'), { recursive: true });
  const body = await readFBX('public/models/tpose.fbx');
  const model = body.object;
  model.name = 'YunhaiSourceHumanoid';
  model.animations = [];
  model.updateMatrixWorld(true);
  const bones = boneMap(model);
  const originalBounds = new THREE.Box3().setFromObject(model);
  const meshes = [];
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    const originalVertexCount = mesh.geometry.attributes.position.count;
    const groups = mesh.geometry.groups.map(group => {
      const localBounds = new THREE.Box3();
      const worldBounds = new THREE.Box3();
      for (let index = group.start; index < group.start + group.count; index++) {
        const vertex = mesh.geometry.index ? mesh.geometry.index.getX(index) : index;
        const point = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, vertex);
        localBounds.expandByPoint(point);
        worldBounds.expandByPoint(point.applyMatrix4(mesh.matrixWorld));
      }
      return { ...group, material: mesh.material[group.materialIndex].name, localBounds: boundsJSON(localBounds), worldBounds: boundsJSON(worldBounds) };
    });
    mesh.geometry = mergeVertices(mesh.geometry, 1e-6);
    // Export every source joint, including unweighted end markers. glTF only
    // recreates skin.joints as Bone objects; append unused joints after the
    // weighted ones so existing skin indices keep their exact meaning.
    const terminalBones = [...new Set(bones.values())].filter(bone => !mesh.skeleton.bones.includes(bone));
    mesh.skeleton = new THREE.Skeleton(
      [...mesh.skeleton.bones, ...terminalBones],
      [...mesh.skeleton.boneInverses, ...terminalBones.map(bone => bone.matrixWorld.clone().invert())],
    );
    // FBXLoader supports four influences; renormalize after its documented
    // truncation rather than leaving deficient weight sums in the GLB skin.
    mesh.normalizeSkinWeights();
    mesh.material = mesh.material.map(original => new THREE.MeshStandardMaterial({ name: original.name, color: 0xffffff, roughness: .75, metalness: 0, side: THREE.DoubleSide }));
    meshes.push({ name: mesh.name, originalVertices: originalVertexCount, vertices: mesh.geometry.attributes.position.count, triangles: mesh.geometry.index.count / 3, position: mesh.position.toArray(), scale: mesh.scale.toArray(), quaternion: mesh.quaternion.toArray(), groups, bones: mesh.skeleton.bones.map(bone => bone.name) });
  });
  const clips = [];
  const motions = {};
  for (const [name, filename] of Object.entries(motionFiles)) {
    const relativePath = `public/animations/${filename}`;
    const source = await readFBX(relativePath);
    const motion = retarget(source.object, name, bones);
    clips.push(THREE.AnimationClip.toJSON(motion.clip));
    const hips = motion.clip.tracks.find(track => track.name === `${bones.get('Hips').name}.position`);
    const ys = Array.from(hips.values).filter((_, index) => index % 3 === 1);
    motions[name] = { source: relativePath, sourceSha256: sha256(source.bytes), duration: motion.clip.duration, tracks: motion.clip.tracks.length, originalTracks: motion.originalTracks, unitScale: motion.unitScale, horizontalRootMotion: 'frozen at bind hips X/Z', hipsY: { min: Math.min(...ys), max: Math.max(...ys) } };
  }
  const glb = await new GLTFExporter().parseAsync(model, { binary: true, onlyVisible: false });
  const bodyPath = path.join(output, 'body.glb');
  const motionPath = path.join(output, 'motions.json');
  await fs.writeFile(motionPath, JSON.stringify({ schemaVersion: 1, clips }));
  const textureIntake = await extractTextures();
  await fs.writeFile(bodyPath, dressGLB(glb, textureIntake));
  const loaded = await new GLTFLoader().parseAsync(glb, '');
  const loadedBones = boneMap(loaded.scene);
  assert.equal(new Set(loadedBones.values()).size, new Set(bones.values()).size, 'GLB lost bones');
  const loadedBounds = new THREE.Box3().setFromObject(loaded.scene);
  assert(loadedBounds.min.distanceTo(originalBounds.min) < .001 && loadedBounds.max.distanceTo(originalBounds.max) < .001, 'GLB changed skin bounds');
  const measuredJoints = ['Head', 'Hips', 'LeftFoot', 'RightFoot', 'LeftHand', 'RightHand'];
  const bindJoints = Object.fromEntries(measuredJoints.map(name => [name, loadedBones.get(name).getWorldPosition(new THREE.Vector3()).toArray()]));
  const poseChecks = {};
  for (const json of clips) {
    const clip = THREE.AnimationClip.parse(json);
    for (const track of clip.tracks) assert(loadedBones.has(THREE.PropertyBinding.parseTrackName(track.name).nodeName), `${clip.name}: unbound ${track.name}`);
    const mixer = new THREE.AnimationMixer(loaded.scene);
    const action = mixer.clipAction(clip).play();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    const samples = [];
    for (const phase of [0, .25, .5, .75, .999]) {
      mixer.setTime(clip.duration * phase);
      loaded.scene.updateMatrixWorld(true);
      loaded.scene.traverse(mesh => { if (mesh.isSkinnedMesh) mesh.computeBoundingBox(); });
      const box = new THREE.Box3().setFromObject(loaded.scene);
      assert(box.min.toArray().concat(box.max.toArray()).every(Number.isFinite), `${clip.name}: non-finite pose`);
      assert(box.max.y < 350 && box.min.y > -100, `${clip.name}: broken unit conversion`);
      const joints = Object.fromEntries(measuredJoints.map(name => [name, loadedBones.get(name).getWorldPosition(new THREE.Vector3()).toArray()]));
      samples.push({ phase, bounds: boundsJSON(box), joints });
    }
    const dynamic = clip.tracks.some(track => Array.from(track.values).some((value, index) => Math.abs(value - track.values[index % track.getValueSize()]) > .00001));
    const differs = (a, b) => measuredJoints.some(name => new THREE.Vector3(...a[name]).distanceTo(new THREE.Vector3(...b[name])) > .00001);
    assert(samples.some(sample => differs(sample.joints, bindJoints)), `${clip.name}: still in bind pose`);
    if (dynamic) assert(samples.slice(1).some(sample => differs(sample.joints, samples[0].joints)), `${clip.name}: animated joints are static`);
    motions[clip.name].poseType = dynamic ? 'animated' : 'static authored pose';
    poseChecks[clip.name] = samples;
    mixer.stopAllAction(); mixer.uncacheRoot(loaded.scene);
  }
  const foot = bones.get('LeftFoot').getWorldPosition(new THREE.Vector3());
  const toe = bones.get('LeftToeBase').getWorldPosition(new THREE.Vector3());
  const forward = toe.clone().sub(foot).setY(0).normalize();
  const motionBytes = await fs.readFile(motionPath);
  const bodyBytes = await fs.readFile(bodyPath);
  const textureBytes = Object.values(textureIntake.materials).reduce((total, material) => total + Object.keys(material.maps).reduce((sum, role) => sum + material[role].bytes, 0), 0);
  assert(bodyBytes.length <= 8 * 1024 * 1024, 'model budget exceeded');
  assert(motionBytes.length <= 2 * 1024 * 1024, 'motion budget exceeded');
  assert(textureBytes <= 5 * 1024 * 1024, 'texture budget exceeded');
  const intake = {
    schemaVersion: 1,
    source: { repository: 'https://github.com/achrefelouafi/SamuraiThirdPersonTemplateThreeJS', commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: reference }).toString().trim(), bodySha256: sha256(body.bytes), textureLibrarySha256: textureIntake.sourceSha256 },
    model: { path: 'body.glb', bytes: bodyBytes.length, sha256: sha256(bodyBytes), units: 'bone and world coordinates in centimeters; mesh geometry in meters with mesh scale 100, preserved without flattening', bounds: boundsJSON(originalBounds), bones: new Set(bones.values()).size, meshes, forward: forward.toArray(), foot: foot.toArray(), toe: toe.toArray() },
    animations: { path: 'motions.json', bytes: motionBytes.length, sha256: sha256(motionBytes), clips: motions, poseChecks },
    textures: { bytes: textureBytes, maxDimension: 1024, format: 'WebP RGB: baseColor quality87, normal quality92, metalRoughness quality80', sourceUV: 'FBX UV retained; body.glb references external images and sets KHR_texture_transform offset=[0,1], scale=[1,-1], so GLTFLoader flipY=false is correct. Do not add another flip.', materials: textureIntake.materials },
    sourceWarnings: body.warnings,
    verification: { glbRoundTrip: 'bounds and all bones preserved', clipsBoundToRoundTripRig: true, poseSampleCount: clips.length * 5, skinBoundsRecomputedEachPose: true, poseDiffersFromBindChecked: true, dynamicJointMotionChecked: true, budgetPassed: true },
  };
  await fs.writeFile(path.join(output, 'metadata/intake.json'), `${JSON.stringify(intake, null, 2)}\n`);
  console.log(JSON.stringify({ bodyBytes: bodyBytes.length, motionBytes: motionBytes.length, textureBytes, bones: intake.model.bones, triangles: meshes.reduce((sum, mesh) => sum + mesh.triangles, 0), vertices: meshes.reduce((sum, mesh) => sum + mesh.vertices, 0), clips: Object.keys(motions), checks: intake.verification }, null, 2));
} finally { THREE.TextureLoader.prototype.load = originalTextureLoad; }

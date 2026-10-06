import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Point = { x: number; z: number };
type Plant = Point & { y: number; scale: number; yaw: number; kind: number; tint: number; region: number };
type Collider = Point & { r: number };
type Buffers = { position: number[]; normal: number[]; uv: number[]; color: number[]; wind: number[] };

const randomFrom = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const regionOf = (x: number, z: number) => (x < 0 ? 0 : 1) + Math.min(2, Math.max(0, Math.floor((z + 294) / 140))) * 2;
const emptyBuffers = (): Buffers => ({ position: [], normal: [], uv: [], color: [], wind: [] });

function geometryFrom(buffers: Buffers, wind = false) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.color, 3));
  if (wind) geometry.setAttribute('forestWind', new THREE.Float32BufferAttribute(buffers.wind, 1));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
}

/** Six-sided trunks and small tapering branch sections follow authored, asymmetric centerlines. */
function branch(buffers: Buffers, from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, sides: number) {
  const axis = to.clone().sub(from).normalize(), cross = new THREE.Vector3(0, 0, 1);
  if (Math.abs(axis.z) > 0.8) cross.set(1, 0, 0);
  const u = cross.cross(axis).normalize(), v = axis.clone().cross(u).normalize();
  const vertex = (center: THREE.Vector3, radius: number, angle: number) => center.clone().addScaledVector(u, Math.cos(angle) * radius).addScaledVector(v, Math.sin(angle) * radius);
  for (let side = 0; side < sides; side++) {
    const a = side / sides * Math.PI * 2, b = (side + 1) / sides * Math.PI * 2;
    const points = [vertex(from, r0, a), vertex(from, r0, b), vertex(to, r1, b), vertex(to, r1, a)];
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const p = points[index], angle = index === 0 || index === 3 ? a : b;
      const normal = u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v, Math.sin(angle));
      const shade = 0.70 + THREE.MathUtils.clamp(p.y / 7, 0, 1) * 0.27;
      buffers.position.push(p.x, p.y, p.z); buffers.normal.push(normal.x, normal.y, normal.z);
      buffers.uv.push((side + (index === 1 || index === 2 ? 1 : 0)) / sides, p.y * 0.64);
      buffers.color.push(shade, shade, shade * 0.96);
    }
  }
}

/** Alpha cards carry small painted twigs and individual leaves; cards form irregular crown lobes. */
function foliageCard(buffers: Buffers, center: THREE.Vector3, width: number, height: number, yaw: number, pitch: number, tile: number, tint = 1) {
  const u = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const v = new THREE.Vector3(Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch));
  const normal = u.clone().cross(v).normalize();
  const offsets = [[-1, -1], [1, -1], [1, 1], [-1, 1]], ix = tile % 2, iy = Math.floor(tile / 2);
  for (const index of [0, 1, 2, 0, 2, 3]) {
    const [x, y] = offsets[index], p = center.clone().addScaledVector(u, x * width / 2).addScaledVector(v, y * height / 2);
    buffers.position.push(p.x, p.y, p.z); buffers.normal.push(normal.x, normal.y, normal.z);
    buffers.uv.push(ix * 0.5 + (x + 1) * 0.25, 1 - iy * 0.5 - (1 - y) * 0.25);
    buffers.color.push(tint, tint, tint * 0.95); buffers.wind.push(0.4 + Math.max(0, p.y) * 0.065);
  }
}

function treePrototype(kind: number) {
  const bark = emptyBuffers(), leaves = emptyBuffers(), random = randomFrom(8907 + kind * 793);
  const h = [6.1, 8.2, 5.6][kind], bend = [0.35, -0.16, 0.76][kind];
  const trunk = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(bend * 0.1, h * 0.26, -0.06), new THREE.Vector3(bend * 0.62, h * 0.60, 0.11), new THREE.Vector3(bend, h, -0.13)];
  const sides = kind === 1 ? 5 : 6;
  for (let i = 0; i < 3; i++) branch(bark, trunk[i], trunk[i + 1], [0.28, 0.18, 0.105][i], [0.18, 0.105, 0.025][i], sides);
  for (let i = 0; i < (kind === 0 ? 3 : 2); i++) {
    const angle = i * 2.35 + kind;
    branch(bark, new THREE.Vector3(0, 0.16, 0), new THREE.Vector3(Math.sin(angle) * 0.74, 0.025, Math.cos(angle) * 0.74), 0.14, 0.03, 3);
  }
  const arms = kind === 1 ? 5 : 4, tips: THREE.Vector3[] = [];
  for (let i = 0; i < arms; i++) {
    const angle = i * 2.39996 + kind * 0.63, height = h * (0.49 + i / arms * 0.30);
    const spread = kind === 1 ? 1.40 + random() * 0.60 : 2.12 + random() * 0.8;
    const start = new THREE.Vector3(bend * height / h, height, 0.04);
    const elbow = start.clone().add(new THREE.Vector3(Math.sin(angle) * spread * 0.5, 0.37, Math.cos(angle) * spread * 0.5));
    const tip = start.clone().add(new THREE.Vector3(Math.sin(angle) * spread, kind === 1 ? 1.22 : 0.70 + random() * 0.45, Math.cos(angle) * spread));
    branch(bark, start, elbow, 0.09, 0.055, 3); branch(bark, elbow, tip, 0.055, 0.012, 3); tips.push(tip);
    if (i < (kind === 2 ? 3 : 2)) {
      const twig = elbow.clone().add(new THREE.Vector3(Math.sin(angle + 0.85) * 0.83, 0.73, Math.cos(angle + 0.85) * 0.83));
      branch(bark, elbow, twig, 0.045, 0.007, 3);
    }
  }
  for (const tip of tips) {
    const count = kind === 1 ? 14 : kind === 2 ? 19 : 18;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.39996, radius = Math.sqrt(random()) * (kind === 1 ? 0.78 : 1.09);
      const center = tip.clone().add(new THREE.Vector3(Math.sin(angle) * radius, (random() - 0.36) * 1.3, Math.cos(angle) * radius));
      foliageCard(leaves, center, 1.87 + random() * 0.67, 1.45 + random() * 0.45, random() * Math.PI * 2, (random() - 0.5) * 1.8, kind === 1 ? 1 : 0, 0.85 + random() * 0.17);
    }
  }
  for (let i = 0; i < (kind === 1 ? 10 : 12); i++) {
    const angle = i * 2.39996;
    foliageCard(leaves, new THREE.Vector3(bend + Math.sin(angle) * 0.81, h - 0.37 + (random() - 0.1) * 1.2, Math.cos(angle) * 0.81), 1.91, 1.61, angle, (random() - 0.5) * 1.7, kind === 1 ? 1 : 0, 0.97);
  }
  return { bark: geometryFrom(bark), leaves: geometryFrom(leaves, true) };
}

function barkTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 512;
  const ctx = canvas.getContext('2d'); if (!ctx) return null;
  const random = randomFrom(73507); ctx.fillStyle = '#807665'; ctx.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 88; i++) {
    const x = random() * 256, y = random() * 512, length = 32 + random() * 175;
    ctx.strokeStyle = i % 3 ? 'rgba(53,47,38,0.45)' : 'rgba(197,178,141,0.34)'; ctx.lineWidth = 0.6 + random() * 2;
    for (const dy of [-512, 0, 512]) {
      ctx.beginPath(); ctx.moveTo(x, y + dy); ctx.bezierCurveTo(x - 3, y + length * 0.3 + dy, x + 4, y + length * 0.7 + dy, x + 1, y + length + dy); ctx.stroke();
    }
  }
  for (let i = 0; i < 1300; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(220,199,160,0.15)' : 'rgba(35,32,29,0.2)'; ctx.fillRect(random() * 256, random() * 512, 0.5 + random(), 1.5 + random() * 4);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8;
  texture.name = 'OriginalLongitudinalBarkGrooves'; return texture;
}

/** Four original atlas cells: broad twigs, slender twigs, fern pinnules, and meadow blades. */
function foliageAtlas() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d'); if (!ctx) return null;
  const random = randomFrom(380191);
  const leaf = (x: number, y: number, angle: number, length: number, width: number, tint: string) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); const gradient = ctx.createLinearGradient(-width, 0, width, -length);
    gradient.addColorStop(0, tint); gradient.addColorStop(1, '#afc976'); ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-width, -length * 0.31, -width * 0.55, -length * 0.8, 0, -length);
    ctx.bezierCurveTo(width * 0.67, -length * 0.75, width * 0.76, -length * 0.22, 0, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(229,232,167,0.35)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(0, -length * 0.88); ctx.stroke();
    for (let vein = 1; vein < 4; vein++) { ctx.beginPath(); ctx.moveTo(0, -length * vein / 4); ctx.lineTo(width * 0.50, -length * (vein / 4 + 0.08)); ctx.stroke(); }
    ctx.restore();
  };
  for (let tile = 0; tile < 2; tile++) {
    ctx.save(); ctx.translate(tile * 512, 0);
    // Dense but irregular fine-leaf masses establish crown coverage at gameplay distances.
    // Hundreds of distinct overlapping leaves retain a ragged botanical silhouette and small holes.
    for (let i = 0; i < 260; i++) {
      const angle = i * 2.39996, radius = Math.sqrt(random()) * (173 + Math.sin(angle * 5) * 25);
      const x = 256 + Math.sin(angle) * radius, y = 256 + Math.cos(angle) * radius * 0.88;
      leaf(x, y, angle + (random() - 0.5) * 1.9, 32 + random() * 26, tile === 0 ? 18 + random() * 12 : 13 + random() * 11, tile === 0 ? (i % 3 ? '#4c7334' : '#648447') : (i % 3 ? '#709549' : '#809f53'));
    }
    const branches = tile === 0 ? 7 : 8;
    for (let twig = 0; twig < branches; twig++) {
      const angle = twig * 2.39996, endX = 256 + Math.sin(angle) * (136 + random() * 55), endY = 263 + Math.cos(angle) * (133 + random() * 45);
      ctx.strokeStyle = '#746943'; ctx.lineWidth = 2.1; ctx.beginPath(); ctx.moveTo(251, 378); ctx.quadraticCurveTo(251, 231, endX, endY); ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const t = 0.20 + i / 15, x = THREE.MathUtils.lerp(253, endX, t), y = THREE.MathUtils.lerp(318, endY, t), side = i % 2 ? -1 : 1;
        leaf(x + side * 4, y, angle + side * 0.95, tile === 0 ? 35 + random() * 20 : 39 + random() * 18, tile === 0 ? 19 + random() * 9 : 13 + random() * 8, tile === 0 ? '#486c32' : '#689145');
      }
    }
    ctx.restore();
  }
  ctx.save(); ctx.translate(0, 512); ctx.strokeStyle = '#5b7939'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(252, 478); ctx.quadraticCurveTo(266, 256, 240, 29); ctx.stroke();
  for (let i = 0; i < 22; i++) {
    const y = 454 - i * 18, spread = Math.sin((i + 2) / 26 * Math.PI) * 130;
    for (const side of [-1, 1]) leaf(252 - i * 0.36, y, side * 1.0, spread, 10 + (1 - i / 22) * 4, i % 3 ? '#4b773b' : '#648c46');
  }
  ctx.restore();
  ctx.save(); ctx.translate(512, 512);
  for (let i = 0; i < 54; i++) {
    const x = 68 + random() * 375, height = 190 + random() * 270, bend = (random() - 0.5) * 94;
    const gradient = ctx.createLinearGradient(x, 490, x + bend, 490 - height); gradient.addColorStop(0, '#526339'); gradient.addColorStop(1, i % 5 ? '#9fb55c' : '#cfbf7a'); ctx.fillStyle = gradient;
    const width = 3 + random() * 2;
    ctx.beginPath(); ctx.moveTo(x - width, 490); ctx.quadraticCurveTo(x + bend * 0.2 - width, 490 - height * 0.52, x + bend, 490 - height);
    ctx.quadraticCurveTo(x + bend * 0.5 + width, 490 - height * 0.45, x + width, 490); ctx.fill();
  }
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; texture.name = 'OriginalWoodlandTwigFernMeadowAtlas'; return texture;
}

function windMaterial(map: THREE.Texture | null, name: string, strength: number) {
  const material = new THREE.MeshStandardMaterial({ map, color: 0xd2dbbb, vertexColors: true, alphaTest: 0.30, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.93, emissive: 0x17200e, emissiveIntensity: 0.075 });
  material.name = name;
  const time = { value: 0 };
  material.userData.time = time;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uForestTime = time;
    shader.vertexShader = 'attribute float forestWind; uniform float uForestTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      float forestPhase = position.x * 0.71 + position.z * 0.58;
      #ifdef USE_INSTANCING
        forestPhase += instanceMatrix[3].x * 0.14 + instanceMatrix[3].z * 0.17;
      #endif
      transformed.x += sin(uForestTime * 1.35 + forestPhase + position.y * 0.43) * forestWind * ${strength.toFixed(4)};
      transformed.z += cos(uForestTime * 0.87 + forestPhase * 1.14) * forestWind * ${(strength * 0.53).toFixed(4)};
    `);
  };
  material.customProgramCacheKey = () => `original-natural-forest-wind-${strength}`;
  return material;
}

function plantMatrix(plant: Plant) {
  return new THREE.Matrix4().compose(new THREE.Vector3(plant.x, plant.y, plant.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), plant.yaw), new THREE.Vector3(plant.scale, plant.scale * (0.90 + plant.kind * 0.08), plant.scale));
}

/** Original woodland with terrain-aware placement and six spatial regions for frustum culling. */
export function createNaturalForest(root: THREE.Group, heightAt: (x: number, z: number) => number, isProtected: (x: number, z: number, extra: number) => boolean) {
  const group = new THREE.Group(); group.name = 'OriginalNaturalWoodland'; root.add(group);
  const random = randomFrom(547319), colliders: Collider[] = [], planted: Plant[] = [];
  const legal = (x: number, z: number, extra: number) => {
    if (z > 126 || Math.abs(x) > 289 || z < -289 || isProtected(x, z, extra)) return false;
    const h = heightAt(x, z); if (!Number.isFinite(h) || h < 0.16) return false;
    const dx = (heightAt(x + 1, z) - heightAt(x - 1, z)) / 2, dz = (heightAt(x, z + 1) - heightAt(x, z - 1)) / 2;
    return Number.isFinite(dx + dz) && Math.hypot(dx, dz) <= 0.65;
  };
  const woodlandCenters = [{ x: -205, z: -225 }, { x: -90, z: -135 }, { x: 180, z: -150 }, { x: 225, z: 25 }, { x: -195, z: 54 }, { x: 88, z: -238 }];
  for (let attempt = 0; attempt < 20000 && planted.length < 700; attempt++) {
    const center = woodlandCenters[Math.floor(random() * woodlandCenters.length)], clustered = random() < 0.72;
    const x = clustered ? center.x + (random() + random() + random() - 1.5) * 73 : (random() * 2 - 1) * 286;
    const z = clustered ? center.z + (random() + random() + random() - 1.5) * 62 : -286 + random() * 400;
    const scale = 0.72 + random() * 0.66;
    if (Math.abs(x) > 283 || z > 117 || !legal(x, z, 5.4 * scale)) continue;
    const woodland = (Math.sin(x * 0.035 + z * 0.014) + Math.cos(z * 0.038 - x * 0.009) + 2) / 4;
    if (random() > 0.29 + woodland * 0.70 || planted.some((p) => Math.hypot(p.x - x, p.z - z) < 5.2)) continue;
    const kind = random() < 0.28 ? 1 : random() < 0.53 ? 0 : 2;
    planted.push({ x, z, y: heightAt(x, z) - 0.025, scale, yaw: random() * Math.PI * 2, kind, tint: 0.81 + random() * 0.26, region: regionOf(x, z) });
    colliders.push({ x, z, r: 0.31 * scale });
  }
  const atlas = foliageAtlas(), barkMap = barkTexture();
  const barkMaterial = new THREE.MeshStandardMaterial({ map: barkMap, color: 0x9b8d73, vertexColors: true, roughness: 0.98 }); barkMaterial.name = 'OriginalBranchingTreeBark';
  const leafMaterial = windMaterial(atlas, 'OriginalFineTwigAndLeafCanopies', 0.11), grassMaterial = windMaterial(atlas, 'OriginalMeadowGrassWind', 0.17), fernMaterial = windMaterial(atlas, 'OriginalWoodlandFernWind', 0.055);
  const prototypes = [0, 1, 2].map(treePrototype);
  for (let region = 0; region < 6; region++) {
    const trees = planted.filter((plant) => plant.region === region), trunkParts: THREE.BufferGeometry[] = [];
    for (const plant of trees) {
      const geometry = prototypes[plant.kind].bark.clone(); geometry.applyMatrix4(plantMatrix(plant)); trunkParts.push(geometry);
    }
    const trunks = mergeGeometries(trunkParts, false); trunkParts.forEach((part) => part.dispose());
    if (trunks) { const mesh = new THREE.Mesh(trunks, barkMaterial); mesh.name = `WoodlandRegion${region}_BentTrunksAndForks`; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); }
    for (let kind = 0; kind < 3; kind++) {
      const list = trees.filter((plant) => plant.kind === kind); if (!list.length) continue;
      const leaves = new THREE.InstancedMesh(prototypes[kind].leaves, leafMaterial, list.length); leaves.name = `WoodlandRegion${region}_Crown${kind}`; leaves.receiveShadow = true;
      list.forEach((plant, index) => { leaves.setMatrixAt(index, plantMatrix(plant)); leaves.setColorAt(index, new THREE.Color().setScalar(plant.tint)); });
      leaves.instanceMatrix.needsUpdate = true; leaves.computeBoundingBox(); leaves.computeBoundingSphere(); group.add(leaves);
    }
  }
  prototypes.forEach((prototype) => prototype.bark.dispose());

  // Fine crossed meadow cards replace opaque cone-shaped ground cover.
  const grassBuffers = emptyBuffers();
  for (let i = 0; i < 2; i++) foliageCard(grassBuffers, new THREE.Vector3(0, 0.36, 0), 1.31, 0.72, i * Math.PI / 2, 0, 3, 0.93);
  const grassGeometry = geometryFrom(grassBuffers, true), grassVertices = grassGeometry.getAttribute('position'), grassWind = grassGeometry.getAttribute('forestWind'), ground: Plant[] = [];
  for (let i = 0; i < grassWind.count; i++) grassWind.setX(i, Math.max(0, grassVertices.getY(i)) * 1.8);
  for (let attempt = 0; attempt < 115000 && ground.length < 7000; attempt++) {
    const x = (random() * 2 - 1) * 286, z = -286 + random() * 405;
    if (!legal(x, z, 0.45)) continue;
    const meadow = (Math.sin(x * 0.048 + z * 0.021) * Math.cos(z * 0.068 - x * 0.023) + 1) / 2;
    if (random() > 0.23 + meadow * 0.77) continue;
    ground.push({ x, z, y: heightAt(x, z) - 0.006, scale: 0.66 + random() * 0.8, yaw: random() * Math.PI * 2, kind: 0, tint: 0.75 + random() * 0.36, region: regionOf(x, z) });
  }
  for (let region = 0; region < 6; region++) {
    const list = ground.filter((p) => p.region === region); if (!list.length) continue;
    const grass = new THREE.InstancedMesh(grassGeometry, grassMaterial, list.length); grass.name = `WoodlandRegion${region}_FineGrass`; grass.receiveShadow = true;
    list.forEach((plant, index) => { grass.setMatrixAt(index, plantMatrix(plant)); grass.setColorAt(index, new THREE.Color().setScalar(plant.tint)); });
    grass.instanceMatrix.needsUpdate = true; grass.computeBoundingBox(); grass.computeBoundingSphere(); group.add(grass);
  }
  const fernBuffers = emptyBuffers();
  for (let i = 0; i < 5; i++) foliageCard(fernBuffers, new THREE.Vector3(Math.sin(i * 2.39996) * 0.26, 0.29, Math.cos(i * 2.39996) * 0.26), 0.54, 0.66, i * 2.39996, -0.46, 2, 0.92);
  const fernGeometry = geometryFrom(fernBuffers, true), fernVertices = fernGeometry.getAttribute('position'), fernWind = fernGeometry.getAttribute('forestWind'), ferns: Plant[] = [];
  for (let i = 0; i < fernWind.count; i++) fernWind.setX(i, Math.max(0, fernVertices.getY(i)) * 1.25);
  for (let attempt = 0; attempt < 4000 && ferns.length < 350; attempt++) {
    const tree = planted[Math.floor(random() * planted.length)]; if (!tree) break;
    const angle = random() * Math.PI * 2, distance = 1.2 + random() * 3.5, x = tree.x + Math.sin(angle) * distance, z = tree.z + Math.cos(angle) * distance;
    if (!legal(x, z, 0.8)) continue;
    ferns.push({ x, z, y: heightAt(x, z) - 0.01, scale: 0.71 + random() * 0.62, yaw: random() * 6.28, kind: 0, tint: 0.79 + random() * 0.25, region: x < 0 ? 0 : 1 });
  }
  for (let side = 0; side < 2; side++) {
    const list = ferns.filter((fern) => fern.region === side); if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(fernGeometry, fernMaterial, list.length); mesh.name = `OriginalForestFloorFerns${side}`; mesh.receiveShadow = true;
    list.forEach((fern, index) => { mesh.setMatrixAt(index, plantMatrix(fern)); mesh.setColorAt(index, new THREE.Color().setScalar(fern.tint)); });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere(); group.add(mesh);
  }

  const stoneGeometry = new THREE.IcosahedronGeometry(1, 1), stoneVertices = stoneGeometry.getAttribute('position');
  for (let i = 0; i < stoneVertices.count; i++) { const x = stoneVertices.getX(i), y = stoneVertices.getY(i), z = stoneVertices.getZ(i); const scale = 1 + Math.sin(x * 4 + z * 5) * 0.12; stoneVertices.setXYZ(i, x * scale, y * (0.69 + Math.cos(z * 3) * 0.09), z * scale); }
  stoneGeometry.computeVertexNormals();
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x7d8174, roughness: 0.96 }); stoneMaterial.name = 'OriginalSparseForestWeatheredStones';
  const stones: Plant[] = [];
  for (let attempt = 0; attempt < 2600 && stones.length < 65; attempt++) {
    const x = (random() * 2 - 1) * 281, z = -281 + random() * 394, scale = 0.30 + random() * 0.71;
    if (!legal(x, z, scale + 0.7)) continue;
    stones.push({ x, z, y: heightAt(x, z) + scale * 0.24, scale, yaw: random() * 6.28, kind: 0, tint: 0.81 + random() * 0.21, region: 0 });
    if (scale > 0.7) colliders.push({ x, z, r: scale * 0.91 });
  }
  const stoneMesh = new THREE.InstancedMesh(stoneGeometry, stoneMaterial, stones.length); stoneMesh.name = 'OriginalWoodlandScatteredStones'; stoneMesh.receiveShadow = true;
  stones.forEach((stone, index) => { stoneMesh.setMatrixAt(index, plantMatrix(stone)); stoneMesh.setColorAt(index, new THREE.Color().setScalar(stone.tint)); });
  stoneMesh.instanceMatrix.needsUpdate = true; stoneMesh.computeBoundingBox(); stoneMesh.computeBoundingSphere(); group.add(stoneMesh);

  // Sloped terrain receives real trunk shadows; flat crown decals could intersect hills.
  group.userData.assetSource = 'Original procedural branching geometry and hand-painted Canvas bark/twig/fern/grass atlas; reference concepts only.';
  group.userData.treeCount = planted.length;
  group.userData.regions = 6;
  group.userData.triangleBudget = 'Approximately 320k full-forest triangles including one trunk shadow pass; actual visibility is region culled.';
  return { colliders, update(time: number) { for (const material of [leafMaterial, grassMaterial, fernMaterial]) material.userData.time.value = time; } };
}

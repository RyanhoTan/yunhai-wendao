import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SectBuildingPlacement } from './SectLayout';

type Vec = [number, number, number];
type Kind = SectBuildingPlacement['kind'];
type Surface = 'stone' | 'wood' | 'darkWood' | 'ivory' | 'roof' | 'gold';
type Roof = {
  width: number; depth: number; y: number; rise: number; ridge: number;
  innerDepth?: number; curl: number; sides?: 6;
};
export type SectRoofTriangle = [THREE.Vector3, THREE.Vector3, THREE.Vector3];

function buildingProfile(kind: Kind) {
  switch (kind) {
    case 'library': return { wallInset: .65, wallHeight: 4, eaveHeight: 4.94, height: 12.14 };
    case 'alchemy': return { wallInset: .65, wallHeight: 3.35, eaveHeight: 4.5, height: 7.09 };
    case 'residence': return { wallInset: .65, wallHeight: 2.85, eaveHeight: 3.6, height: 5.49 };
    case 'pavilion': return { wallInset: 0, wallHeight: 3, eaveHeight: 3.9, height: 6.58 };
    case 'gate': return { wallInset: 0, wallHeight: 3.8, eaveHeight: 4.1, height: 5.88 };
  }
}

/** Measurements are shared with feet-height and collision code; entrance faces local +Z. */
export function getSectBuildingDimensions(p: SectBuildingPlacement) {
  const profile = buildingProfile(p.kind), wallWidth = p.width - profile.wallInset * 2, wallDepth = p.depth - profile.wallInset * 2;
  const postPositions: { x: number; z: number; r: number; bottom: number; top: number }[] = [];
  const addPost = (x: number, z: number, r: number) => postPositions.push({ x, z, r, bottom: p.floor, top: p.floor + profile.wallHeight });
  if (p.kind === 'pavilion') {
    const radius = Math.min(p.width, p.depth) * .36;
    for (let i = 0; i < 6; i++) addPost(Math.cos(i * Math.PI / 3) * radius, Math.sin(i * Math.PI / 3) * radius, .255);
  } else if (p.kind === 'gate') {
    for (const side of [-1, 1]) addPost(side * p.width * .37, 0, .42);
  } else {
    const bays = p.kind === 'residence' ? 3 : 5, radius = p.kind === 'residence' ? .195 : .27;
    for (let i = 0; i <= bays; i++) for (const side of [-1, 1]) addPost(-wallWidth / 2 + i * wallWidth / bays, side * wallDepth / 2, radius);
    for (const side of [-1, 1]) for (const z of [-wallDepth / 4, wallDepth / 4]) addPost(side * wallWidth / 2, z, radius);
  }
  return {
    ...profile, wallWidth, wallDepth, entryWidth: p.entryWidth, postPositions,
    stairDepth: p.kind === 'gate' ? 0 : 2.4, stairWidth: p.kind === 'gate' ? 0 : p.entryWidth + 1.2,
    stairCount: p.kind === 'gate' ? 0 : Math.ceil(p.floor / .15),
    stairStart: p.kind === 'pavilion' ? p.width / 2 * Math.sqrt(3) / 2 : p.depth / 2,
    upperWalls: p.kind === 'library' ? [{ x: 0, z: 0, width: wallWidth * .77, depth: wallDepth * .71, bottom: 6.23, top: 9.18 }] : [],
  };
}

function createMaterials() {
  const standard = (name: Surface, color: number, roughness: number, metalness = 0) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness, vertexColors: true });
    material.name = `Sect_${name}`; return material;
  };
  const kit = {
    stone: standard('stone', 0xbab9ac, .94), wood: standard('wood', 0x8b3e2d, .64),
    darkWood: standard('darkWood', 0x594333, .84), ivory: standard('ivory', 0xe7dcc1, .95),
    roof: standard('roof', 0x296866, .46), gold: standard('gold', 0xc4a15c, .4, .64),
  };
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#deddd4'; ctx.fillRect(0, 0, 256, 256);
    let seed = 6049;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 6500; i++) {
      ctx.fillStyle = random() > .5 ? 'rgba(76,85,68,.055)' : 'rgba(255,255,246,.12)';
      ctx.fillRect(random() * 256, random() * 256, .8, .8);
    }
    const map = new THREE.CanvasTexture(canvas); map.name = 'Sect_LimestoneGrain';
    map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(3, 3); map.anisotropy = 4; kit.stone.map = map;
  }
  return kit;
}
let sharedMaterials: ReturnType<typeof createMaterials> | undefined;
const plaqueMaterials = new Map<string, THREE.MeshStandardMaterial>();

function plaqueMaterial(label: string) {
  const existing = plaqueMaterials.get(label); if (existing) return existing;
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .75, vertexColors: true });
  material.name = `Sect_Plaque_${label}`;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#184d43'; ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#c7a85f'; ctx.lineWidth = 3; ctx.strokeRect(6, 6, 500, 116);
    ctx.fillStyle = '#dfbf77'; ctx.font = '75px "Noto Serif CJK SC", serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 256, 69);
    const map = new THREE.CanvasTexture(canvas); map.name = `Sect_PlaqueMap_${label}`;
    map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; material.map = map;
  }
  plaqueMaterials.set(label, material); return material;
}

/** A material batch per building retains culling without hundreds of roof-detail draw calls. */
class Builder {
  readonly root = new THREE.Group();
  readonly roofTriangles: SectRoofTriangle[] = [];
  readonly roofBounds: THREE.Box3[] = [];
  readonly materials = sharedMaterials ??= createMaterials();
  private readonly buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private readonly boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly columnGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);
  private readonly hexGeometry = new THREE.CylinderGeometry(1, 1, 1, 6);
  private readonly tileCapGeometry = new THREE.CircleGeometry(1, 5);
  private readonly sphereGeometry = new THREE.SphereGeometry(1, 8, 6);
  add(material: Surface | THREE.Material, source: THREE.BufferGeometry, position: Vec = [0, 0, 0], scale: Vec = [1, 1, 1], rotation: Vec = [0, 0, 0], tint = 0xffffff) {
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    const geometry = source.clone().applyMatrix4(matrix);
    const color = new THREE.Color(tint), colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const key = typeof material === 'string' ? this.materials[material] : material;
    const bucket = this.buckets.get(key) ?? []; bucket.push(geometry); this.buckets.set(key, bucket);
  }
  box(material: Surface, position: Vec, scale: Vec, rotation?: Vec, tint?: number) { this.add(material, this.boxGeometry, position, scale, rotation, tint); }
  column(material: Surface, position: Vec, scale: Vec, rotation?: Vec, tint?: number) { this.add(material, this.columnGeometry, position, scale, rotation, tint); }
  hex(material: Surface, position: Vec, scale: Vec, rotation?: Vec) { this.add(material, this.hexGeometry, position, scale, rotation); }
  sphere(material: Surface, position: Vec, scale: Vec) { this.add(material, this.sphereGeometry, position, scale); }
  tileCap(position: Vec, yaw: number) { this.add('roof', this.tileCapGeometry, position, [.057, .057, 1], [0, yaw, 0], 0xc4d8cf); }
  tube(material: Surface, points: THREE.Vector3[], radius: number, segments = 8, sides = 3, tint?: number) {
    const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, sides, false);
    this.add(material, geometry, undefined, undefined, undefined, tint); geometry.dispose();
  }
  tileRoll(points: THREE.Vector3[], tint: number) {
    const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 5, .046, 3, false);
    const source = geometry.index!, normals = geometry.getAttribute('normal'), indices: number[] = [];
    // The roof shell hides each roll's lower face. Keep the raised two-sided ceramic crest.
    for (let i = 0; i < source.count; i += 3) {
      const a = source.getX(i), c = source.getX(i + 1), d = source.getX(i + 2);
      if (normals.getY(a) + normals.getY(c) + normals.getY(d) >= 0) indices.push(a, c, d);
    }
    geometry.setIndex(indices); this.add('roof', geometry, undefined, undefined, undefined, tint); geometry.dispose();
  }
  finish() {
    let triangles = 0;
    for (const [material, parts] of this.buckets) {
      const geometry = mergeGeometries(parts); parts.forEach(g => g.dispose());
      if (!geometry) throw new Error(`Cannot merge sect architecture material ${material.name}`);
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material); mesh.name = `${this.root.name}_${material.name}`;
      mesh.castShadow = mesh.receiveShadow = true; this.root.add(mesh);
      triangles += geometry.index ? geometry.index.count / 3 : geometry.getAttribute('position').count / 3;
    }
    this.boxGeometry.dispose(); this.columnGeometry.dispose(); this.hexGeometry.dispose(); this.sphereGeometry.dispose(); this.tileCapGeometry.dispose();
    this.root.userData.roofTriangles = this.roofTriangles;
    this.root.userData.roofBounds = this.roofBounds;
    this.root.userData.architectureMetrics = { triangles, meshes: this.root.children.length, materials: this.buckets.size };
    return this.root;
  }
}

function roofPoint(roof: Roof, face: number, u: number, t: number) {
  const y = roof.y + roof.rise * Math.pow(1 - t, 1.65) + .13 * Math.pow(t, 7)
    + roof.curl * Math.pow(Math.abs(u), 6) * Math.pow(t, 6);
  if (roof.sides === 6) {
    const angle0 = face * Math.PI / 3, angle1 = (face + 1) * Math.PI / 3;
    const blend = (u + 1) / 2, radius = Math.min(roof.width, roof.depth) / 2;
    return new THREE.Vector3((Math.cos(angle0) * (1 - blend) + Math.cos(angle1) * blend) * radius * t,
      y, (Math.sin(angle0) * (1 - blend) + Math.sin(angle1) * blend) * radius * t);
  }
  const x = roof.ridge + (roof.width / 2 - roof.ridge) * t;
  const z = (roof.innerDepth ?? 0) + (roof.depth / 2 - (roof.innerDepth ?? 0)) * t;
  return face % 2 === 0 ? new THREE.Vector3(u * x, y, (face === 0 ? 1 : -1) * z)
    : new THREE.Vector3((face === 1 ? 1 : -1) * x, y, u * z);
}

function addRoof(b: Builder, roof: Roof) {
  const firstTriangle=b.roofTriangles.length;
  const cols = roof.sides === 6 ? 8 : 12, rows = 6, faces = roof.sides ?? 4;
  for (const underside of [false, true]) {
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (let face = 0; face < faces; face++) {
      const start = positions.length / 3;
      for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
        const p = roofPoint(roof, face, c / cols * 2 - 1, r / rows);
        positions.push(p.x, p.y - (underside ? .16 : 0), p.z); uvs.push(p.x / 2, p.z / 2);
      }
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const a = start + r * (cols + 1) + c, d = a + cols + 1;
        for (const triple of [[a, a + 1, d], [a + 1, d + 1, d]]) {
          const [p0, p1, p2] = triple.map(i => new THREE.Vector3().fromArray(positions, i * 3));
          const normal = p1.clone().sub(p0).cross(p2.clone().sub(p0));
          // Orient from geometry rather than face ordinal; radial and rectangular roofs agree.
          const flip = (normal.y < 0) !== underside;
          indices.push(...(flip ? [triple[0], triple[2], triple[1]] : triple));
          if (!underside && normal.lengthSq() > 1e-10) b.roofTriangles.push([p0, p1, p2]);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    b.add(underside ? 'darkWood' : 'roof', geometry); geometry.dispose();
  }
  for (let face = 0; face < faces; face++) {
    const span = roof.sides === 6 ? Math.min(roof.width, roof.depth) / 2 : face % 2 === 0 ? roof.width : roof.depth;
    const count = Math.max(7, Math.round(span / .48));
    for (let i = 0; i <= count; i++) {
      const u = i / count * 2 - 1;
      const points = Array.from({ length: 9 }, (_, j) => roofPoint(roof, face, u, .08 + j / 8 * .92).add(new THREE.Vector3(0, .039, 0)));
      b.tileRoll(points, i % 4 === 0 ? 0x91b6a7 : 0xc1d4ca);
      const end = points.at(-1)!;
      // Ceramic circular end caps remain visible on close, level views of the eaves.
      const radial = new THREE.Vector3(end.x, 0, end.z).normalize();
      b.tileCap([end.x + radial.x * .027, end.y, end.z + radial.z * .027], Math.atan2(radial.x, radial.z));
    }
    const edge = Array.from({ length: 17 }, (_, j) => roofPoint(roof, face, j / 16 * 2 - 1, 1));
    b.tube('wood', edge.map(p => p.clone().add(new THREE.Vector3(0, -.115, 0))), .079, 14, 4);
    b.tube('roof', edge, .083, 14, 4, 0xc1d4ca);
    const hip = Array.from({ length: 10 }, (_, j) => roofPoint(roof, face, 1, j / 9).add(new THREE.Vector3(0, .058, 0)));
    b.tube('roof', hip, .095, 12, 4, 0xc1d4ca);
    const tip = hip.at(-1)!, direction = new THREE.Vector3(tip.x, 0, tip.z).normalize();
    b.tube('gold', [hip.at(-3)!, tip, tip.clone().addScaledVector(direction, .24).add(new THREE.Vector3(0, .19, 0))], .043, 5, 4);
    // Exposed rafters bridge the dark underside and real post-and-beam support.
    const rafterCount = Math.max(3, Math.round(span / 1.4));
    for (let i = 0; i <= rafterCount; i++) {
      const u = i / rafterCount * 2 - 1;
      const points = Array.from({ length: 6 }, (_, j) => roofPoint(roof, face, u, .48 + j / 5 * .5).add(new THREE.Vector3(0, -.19, 0)));
      b.tube('wood', points, .045, 5, 4, 0xb9ab93);
    }
  }
  if (roof.sides !== 6 && roof.ridge > .3 && !roof.innerDepth) {
    b.box('roof', [0, roof.y + roof.rise + .08, 0], [roof.ridge * 2 + .16, .14, .19], undefined, 0xc1d4ca);
    for (const side of [-1, 1]) b.tube('gold', [new THREE.Vector3(side * roof.ridge, roof.y + roof.rise + .10, 0),
      new THREE.Vector3(side * (roof.ridge + .12), roof.y + roof.rise + .39, 0)], .052, 4, 4);
  }
  const bounds=new THREE.Box3();
  for(const triangle of b.roofTriangles.slice(firstTriangle))for(const point of triangle)bounds.expandByPoint(point);
  bounds.min.y-=.20;bounds.max.y+=.035;b.roofBounds.push(bounds);
}

function lattice(b: Builder, x: number, y: number, z: number, width: number, height: number, yaw = 0, backing = true) {
  const add = (material: Surface, dx: number, dy: number, w: number, h: number, depth = .042, offset = 0) =>
    b.box(material, [x + dx * Math.cos(yaw) + offset * Math.sin(yaw), y + dy, z - dx * Math.sin(yaw) + offset * Math.cos(yaw)], [w, h, depth], [0, yaw, 0]);
  if (backing) add('ivory', 0, 0, width, height, .045, -.025);
  for (const dx of [-width / 2, width / 2]) add('wood', dx, 0, .09, height + .12, .09);
  for (const dy of [-height / 2, height / 2]) add('wood', 0, dy, width, .085, .09);
  const bars = Math.max(3, Math.round(width / .18));
  for (let i = 1; i < bars; i++) add('darkWood', -width / 2 + width * i / bars, 0, .031, height);
  for (const dy of [-height * .35, -height * .12, height * .19, height * .36]) add('darkWood', 0, dy, width, .04);
  // A central diamond distinguishes authored relief from a flat grid texture.
  for (const side of [-1, 1]) b.box('darkWood', [x + side * width * .09 * Math.cos(yaw), y + height * .12, z - side * width * .09 * Math.sin(yaw)],
    [width * .27, .028, .045], [0, yaw, side * Math.PI / 4]);
}

function bracket(b: Builder, x: number, y: number, z: number, yaw: number, scale = 1) {
  const box = (material: Surface, dx: number, dy: number, dz: number, w: number, h: number, d: number) =>
    b.box(material, [x + (dx * Math.cos(yaw) + dz * Math.sin(yaw)) * scale, y + dy * scale, z + (-dx * Math.sin(yaw) + dz * Math.cos(yaw)) * scale], [w * scale, h * scale, d * scale], [0, yaw, 0]);
  box('wood', 0, -.04, 0, .36, .21, .4);
  box('roof', 0, .13, .11, .72, .12, .5);
  box('wood', 0, .28, .22, .24, .21, .8);
  for (const side of [-1, 1]) box('wood', side * .25, .27, .18, .16, .24, .31);
  box('roof', 0, .44, .32, 1.02, .12, .81);
  box('gold', 0, .45, .69, .17, .06, .12);
}

function foundation(b: Builder, p: SectBuildingPlacement) {
  const { width: w, depth: d, floor } = p, spec = getSectBuildingDimensions(p);
  if (p.kind === 'pavilion') {
    const radius = Math.min(w, d) / 2;
    b.hex('stone', [0, floor * .42, 0], [radius, floor * .84, radius], [0, Math.PI / 2, 0]);
    b.hex('stone', [0, floor - .075, 0], [radius + .07, .15, radius + .07], [0, Math.PI / 2, 0]);
  } else {
    b.box('stone', [0, floor / 2, 0], [w, floor, d]);
    if (floor > .15) {
      b.box('stone', [0, floor - .055, 0], [w + .08, .11, d + .08]);
      const courses = Math.max(1, Math.round(floor / .3));
      for (let row = 0; row < courses; row++) for (const side of [-1, 1]) {
        const y = floor * (row + .5) / courses, count = Math.ceil(w / 1.7);
        b.box('stone', [0, floor * row / courses + .02, side * (d / 2 + .009)], [w, .02, .012], undefined, 0x7d8780);
        for (let i = 1; i < count; i++) b.box('stone', [-w / 2 + i * w / count + (row % 2 ? .55 : 0), y, side * (d / 2 + .01)], [.014, floor / courses - .035, .016], undefined, 0x7d8780);
      }
    }
  }
  for (let i = 0; i < spec.stairCount; i++) {
    const top = floor * (i + 1) / spec.stairCount, stepDepth = spec.stairDepth / spec.stairCount;
    b.box('stone', [0, top / 2, spec.stairStart + spec.stairDepth - (i + .5) * stepDepth], [spec.stairWidth, top, stepDepth + .035]);
  }
}

function post(b: Builder, x: number, z: number, floor: number, top: number, radius = .17) {
  b.column('wood', [x, (floor + top) / 2, z], [radius, top - floor, radius]);
  b.column('stone', [x, floor + .13, z], [radius * 1.5, .26, radius * 1.5]);
  b.column('darkWood', [x, top - .055, z], [radius * 1.2, .13, radius * 1.2]);
}

function stoneRail(b: Builder, x: number, z: number, width: number, floor: number, yaw = 0) {
  const at = (dx: number, y: number): Vec => [x + dx * Math.cos(yaw), y, z - dx * Math.sin(yaw)];
  const count = Math.max(1, Math.ceil(width / 2.1));
  for (let i = 0; i <= count; i++) {
    const dx = -width / 2 + i * width / count;
    b.box('stone', at(dx, floor + .4), [.16, .8, .16]);
    b.box('stone', at(dx, floor + .81), [.24, .12, .24]);
  }
  for (const y of [floor + .22, floor + .65]) b.box('stone', at(0, y), [width, .08, .10], [0, yaw, 0]);
  for (let i = 0; i < count * 3; i++) b.box('stone', at(-width / 2 + (i + .5) * width / (count * 3), floor + .43), [.045, .35, .045]);
}

function hallStory(b: Builder, width: number, depth: number, floor: number, height: number, entryWidth: number, small: boolean, upper = false) {
  const halfW = width / 2, halfD = depth / 2, top = floor + height;
  // The central entry is genuinely empty; walls and lattice flank it.
  for (const side of [-1, 1]) {
    b.box('ivory', [side * halfW, floor + height / 2, 0], [.16, height, depth]);
    b.box('darkWood', [side * halfW, floor + .15, 0], [.2, .24, depth + .04]);
    b.box('wood', [side * halfW, top - .15, 0], [.25, .24, depth + .2]);
    if (entryWidth > 0) b.box('ivory', [side * (halfW + entryWidth / 2) / 2, floor + height / 2, halfD], [halfW - entryWidth / 2, height, .15]);
    else b.box('ivory', [side * halfW / 2, floor + height / 2, halfD], [halfW, height, .15]);
  }
  b.box('ivory', [0, floor + height / 2, -halfD], [width, height, .16]);
  b.box('darkWood', [0, floor + .15, -halfD - .025], [width, .24, .2]);
  for (const z of [-halfD, halfD]) {
    b.box('wood', [0, top - .12, z], [width + .2, .3, .33]);
    b.box('roof', [0, top - .17, z + Math.sign(z) * .18], [width, .19, .038], undefined, 0x7dac94);
  }
  const bays = small ? 3 : 5, bayWidth = width / bays;
  for (let i = 0; i <= bays; i++) {
    const x = -halfW + i * bayWidth;
    for (const side of [-1, 1]) { post(b, x, side * halfD, floor, top, small ? .13 : .18); bracket(b, x, top - .05, side * halfD, side < 0 ? Math.PI : 0, small ? .53 : .72); }
  }
  for (const side of [-1, 1]) for (const z of [-depth * .25, depth * .25]) {
    post(b, side * halfW, z, floor, top, small ? .13 : .18);
    bracket(b, side * halfW, top - .05, z, side * Math.PI / 2, small ? .53 : .72);
    lattice(b, side * (halfW + .1), floor + height * .57, z, small ? 1.1 : 1.6, height * .51, side * Math.PI / 2);
  }
  const frontWindowHeight = height * (upper ? .62 : .6);
  for (let i = 0; i < bays; i++) {
    const x = -halfW + (i + .5) * bayWidth;
    if (Math.abs(x) > entryWidth / 2 + bayWidth * .22 || entryWidth === 0) {
      const windowWidth = Math.min(bayWidth - .32, small ? 1.6 : 2.0);
      lattice(b, x, floor + height * .56, halfD + .10, windowWidth, frontWindowHeight);
      b.box('wood', [x, floor + .52, halfD + .105], [windowWidth, .48, .07]);
      b.box('darkWood', [x, floor + .52, halfD + .15], [windowWidth - .17, .31, .028]);
    }
    if (i % 2 === 0) lattice(b, x, floor + height * .57, -halfD - .1, Math.min(bayWidth - .42, small ? 1.5 : 1.8), height * .50, Math.PI);
  }
  if (entryWidth > 0) {
    for (const side of [-1, 1]) b.box('wood', [side * (entryWidth / 2 + .045), floor + height * .47, halfD + .07], [.11, height * .94, .19]);
    b.box('wood', [0, top - .4, halfD + .08], [entryWidth + .2, .3, .16]);
    // Small brass door leaves sit against the jambs, keeping the walkable opening clear.
    for (const side of [-1, 1]) b.box('gold', [side * (entryWidth / 2 + .1), floor + 1.18, halfD + .19], [.04, .16, .035]);
  }
}

function plaque(b: Builder, text: string, y: number, z: number, width: number) {
  b.box('roof', [0, y, z], [width + .16, width / 4 + .11, .16]);
  const geometry = new THREE.PlaneGeometry(width, width / 4);
  b.add(plaqueMaterial(text), geometry, [0, y, z + .083]); geometry.dispose();
}

function enclosedHall(b: Builder, p: SectBuildingPlacement) {
  const spec = getSectBuildingDimensions(p), wallW = spec.wallWidth, wallD = spec.wallDepth;
  const entry = p.entryWidth;
  hallStory(b, wallW, wallD, p.floor, spec.wallHeight, entry, p.kind === 'residence');
  if (p.kind === 'library') {
    addRoof(b, { width: p.width + 2.6, depth: p.depth + 2.6, y: 4.94, rise: 1.46, ridge: wallW * .385, innerDepth: wallD * .355, curl: .61 });
    const upperW = wallW * .77, upperD = wallD * .71;
    b.box('darkWood', [0, 6.33, 0], [upperW + .3, .2, upperD + .3]);
    hallStory(b, upperW, upperD, 6.38, 2.8, 0, true, true);
    addRoof(b, { width: upperW + 2.65, depth: upperD + 2.65, y: 9.34, rise: 2.25, ridge: .06, curl: .66 });
    b.column('gold', [0, 11.72, 0], [.12, .29, .12]); b.sphere('gold', [0, 11.95, 0], [.16, .19, .16]);
    plaque(b, '藏 经 阁', p.floor + spec.wallHeight - .59, wallD / 2 + .27, 2.15);
    for (const side of [-1, 1]) {
      stoneRail(b, side * (p.width / 4 + .7), p.depth / 2 - .10, p.width / 2 - 2, p.floor);
      stoneRail(b, side * (p.width / 2 - .09), 0, p.depth - .2, p.floor, Math.PI / 2);
    }
  } else {
    addRoof(b, { width: p.width + 2.3, depth: p.depth + 2.3, y: spec.eaveHeight, rise: p.kind === 'alchemy' ? 2.15 : 1.45,
      ridge: wallW * .29, curl: p.kind === 'alchemy' ? .58 : .43 });
    if (p.kind === 'alchemy') {
      plaque(b, '炼 丹 堂', p.floor + spec.wallHeight - .48, wallD / 2 + .27, 2.15);
      for (const side of [-1, 1]) stoneRail(b, side * (p.width / 4 + 1), p.depth / 2 - .11, p.width / 2 - 2.6, p.floor);
      // Two shallow bronze incense urns distinguish the hall at its entrance.
      for (const x of [-3, 3]) {
        b.column('stone', [x, p.floor + .09, p.depth / 2 - .36], [.35, .18, .35]);
        b.column('gold', [x, p.floor + .4, p.depth / 2 - .36], [.24, .36, .24]);
        b.column('darkWood', [x, p.floor + .61, p.depth / 2 - .36], [.29, .055, .29]);
      }
    }
  }
}

function pavilion(b: Builder, p: SectBuildingPlacement) {
  const radius = Math.min(p.width, p.depth) * .36, top = p.floor + 3;
  const positions = Array.from({ length: 6 }, (_, i) => new THREE.Vector3(Math.cos(i * Math.PI / 3) * radius, 0, Math.sin(i * Math.PI / 3) * radius));
  for (let i = 0; i < 6; i++) {
    const a = positions[i], next = positions[(i + 1) % 6], center = a.clone().add(next).multiplyScalar(.5);
    post(b, a.x, a.z, p.floor, top, .17);
    bracket(b, a.x, top - .05, a.z, Math.atan2(a.x, a.z), .63);
    const length = a.distanceTo(next), yaw = Math.atan2(-(next.z - a.z), next.x - a.x);
    b.box('wood', [center.x, top - .1, center.z], [length + .22, .28, .3], [0, yaw, 0]);
    b.box('roof', [center.x, top - .16, center.z], [length, .13, .34], [0, yaw, 0]);
    if (i === 1) continue; // Open front bay lines up with the stairs.
    for (const y of [p.floor + .22, p.floor + .78]) b.box('wood', [center.x, y, center.z], [length, .085, .085], [0, yaw, 0]);
    for (let j = 0; j < 7; j++) {
      const point = a.clone().lerp(next, (j + .5) / 7);
      b.box('wood', [point.x, p.floor + .49, point.z], [.047, .48, .047]);
    }
  }
  addRoof(b, { width: p.width + 1.6, depth: p.depth + 1.6, y: top + .3, rise: 2.1, ridge: 0, curl: .55, sides: 6 });
  b.column('gold', [0, top + 2.57, 0], [.12, .35, .12]); b.sphere('gold', [0, top + 2.79, 0], [.17, .19, .17]);
}

function gate(b: Builder, p: SectBuildingPlacement) {
  const top = p.floor + 3.8, halfSpan = p.width * .37;
  for (const side of [-1, 1]) {
    post(b, side * halfSpan, 0, p.floor, top, .25);
    b.column('stone', [side * halfSpan, p.floor + .18, 0], [.42, .35, .42]);
    for (const z of [-.2, .2]) bracket(b, side * halfSpan, top - .03, z, z < 0 ? Math.PI : 0, .8);
  }
  b.box('wood', [0, top - .45, 0], [halfSpan * 2 + .55, .45, .42]);
  b.box('roof', [0, top - .46, .24], [halfSpan * 2 + .45, .18, .04]);
  b.box('wood', [0, top + .02, 0], [p.width - .45, .28, .48]);
  addRoof(b, { width: p.width + 1.4, depth: p.depth + 1.2, y: top + .24, rise: 1.27, ridge: p.width * .32, curl: .48 });
  plaque(b, '云 岚 宗', top - .39, .32, 2.45);
}

/** Procedural kit grounded at Y=0; the world owns positioning, rotation and collision. */
export function createSectBuilding(placement: SectBuildingPlacement): THREE.Group {
  const b = new Builder(); b.root.name = `Sect_${placement.kind}_${placement.id}`;
  foundation(b, placement);
  if (placement.kind === 'pavilion') pavilion(b, placement);
  else if (placement.kind === 'gate') gate(b, placement);
  else enclosedHall(b, placement);
  b.root.userData.architectureProfile = getSectBuildingDimensions(placement);
  return b.finish();
}

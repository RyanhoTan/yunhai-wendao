import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Metres, Y up, front +Z. Dimensions retain the summit's existing foundation. */
export const MAIN_HALL = {
  floor: 1.3,
  halfWidth: 10.2,
  halfDepth: 6.3,
  frontWall: 5.92,
  entryHalfWidth: 1.4,
  stairs: { count: 8, startZ: 13.5, spacing: .69, depth: .84, width: 7.6, rise: .1625 },
  lowerRoof: { width: 25.8, depth: 18.8, y: 6.72, rise: 3.0, ridge: 5.65, innerDepth: 3.7, curl: .88 },
  upperRoof: { width: 16.4, depth: 11.6, y: 11.65, rise: 2.95, ridge: .12, curl: .86 },
} as const;
type Roof = { width: number; depth: number; y: number; rise: number; ridge: number; innerDepth?: number; curl: number };
type Vec = [number, number, number];
type Kit = ReturnType<typeof createMaterials>;
type Surface = keyof Kit;

function createMaterials() {
  const standard = (name: string, color: number, roughness: number, metalness = 0) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    material.name = `MainHall_${name}`; return material;
  };
  return {
    stone: standard('limestone', 0xaaa9a0, .94), stoneLight: standard('stone_caps', 0xc0beb3, .91),
    mortar: standard('stone_joints', 0x757b75, 1), wood: standard('vermilion_lacquer', 0x853d2d, .6),
    darkWood: standard('lattice_wood', 0x57392a, .75), ivory: standard('lime_plaster', 0xe5d7b9, .9),
    roof: standard('celadon_tiles', 0x275e5b, .4), tileLight: standard('tile_rolls', 0x397975, .43),
    underside: standard('roof_underside', 0x5d5140, .88), teal: standard('painted_beams', 0x20594b, .65),
    gold: standard('gilt_details', 0xc4a15c, .34, .72), paper: standard('window_paper', 0xcabc9f, .96),
  };
}

/** Four hips share the same endpoints and concave radial profile, including corner lift. */
export function hallRoofPoint(roof: Roof, face: number, u: number, t: number) {
  const x = roof.ridge + (roof.width / 2 - roof.ridge) * t;
  const innerDepth = roof.innerDepth ?? 0;
  const z = innerDepth + (roof.depth / 2 - innerDepth) * t;
  const y = roof.y + roof.rise * Math.pow(1 - t, 1.7) + .16 * Math.pow(t, 7)
    + roof.curl * Math.pow(Math.abs(u), 7) * Math.pow(t, 6);
  return face % 2 === 0
    ? new THREE.Vector3(u * x, y, (face === 0 ? 1 : -1) * z)
    : new THREE.Vector3((face === 1 ? 1 : -1) * x, y, u * z);
}

function roofSurface(roof: Roof, underside = false) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const cols = 24, rows = 10;
  for (let face = 0; face < 4; face++) {
    const start = positions.length / 3;
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      const p = hallRoofPoint(roof, face, c / cols * 2 - 1, r / rows);
      positions.push(p.x, p.y - (underside ? .18 : 0), p.z); uvs.push(p.x / 2, p.z / 2);
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const a = start + r * (cols + 1) + c, b = a + cols + 1;
      const forward = (face === 1 || face === 2) !== underside;
      indices.push(...(forward ? [a, a + 1, b, a + 1, b + 1, b] : [a, b, a + 1, a + 1, b, b + 1]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

/** Each semantic assembly batches its own static detail, retaining useful part boundaries. */
class HallBuilder {
  readonly root = new THREE.Group();
  readonly kit = createMaterials();
  readonly parts = new Map<string, THREE.Group>();
  private boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  private cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
  private sphereGeometry = new THREE.SphereGeometry(1, 8, 6);
  private capGeometry = new THREE.CylinderGeometry(1, 1, 1, 6);
  constructor() { this.root.name = 'MainHall'; }
  part(id: string) {
    let part = this.parts.get(id);
    if (!part) { part = new THREE.Group(); part.name = id; this.parts.set(id, part); this.root.add(part); }
    return part;
  }
  add(part: string, geometry: THREE.BufferGeometry, material: Surface, position: Vec = [0, 0, 0], scale: Vec = [1, 1, 1], rotation: Vec = [0, 0, 0]) {
    const mesh = new THREE.Mesh(geometry, this.kit[material]);
    mesh.name = `${part}_${this.part(part).children.length}`; mesh.userData.explodeWithParent = true;
    mesh.position.set(...position); mesh.scale.set(...scale); mesh.rotation.set(...rotation);
    mesh.castShadow = mesh.receiveShadow = true; this.part(part).add(mesh); return mesh;
  }
  box(part: string, material: Surface, position: Vec, scale: Vec, rotation?: Vec) { return this.add(part, this.boxGeometry, material, position, scale, rotation); }
  cylinder(part: string, material: Surface, position: Vec, scale: Vec, rotation?: Vec) { return this.add(part, this.cylinderGeometry, material, position, scale, rotation); }
  sphere(part: string, material: Surface, position: Vec, scale: Vec) { return this.add(part, this.sphereGeometry, material, position, scale); }
  tube(part: string, material: Surface, points: THREE.Vector3[], radius: number, segments = 18, sides = 5) {
    return this.add(part, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, sides, false), material);
  }
  cap(part: string, position: Vec, rotation: Vec) { return this.add(part, this.capGeometry, 'tileLight', position, [.081, .045, .081], rotation); }
  finish(batch: boolean) {
    const originals = new Set<THREE.BufferGeometry>([this.boxGeometry, this.cylinderGeometry, this.sphereGeometry, this.capGeometry]);
    for (const part of this.parts.values()) {
      if (!batch) continue;
      part.updateMatrixWorld(true);
      const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
      for (const child of part.children) {
        if (!(child instanceof THREE.Mesh)) continue;
        const geometry = child.geometry.clone().applyMatrix4(child.matrix);
        const material = child.material as THREE.Material;
        const list = byMaterial.get(material) ?? []; list.push(geometry); byMaterial.set(material, list);
        originals.add(child.geometry);
      }
      part.clear();
      for (const [material, geometries] of byMaterial) {
        const geometry = mergeGeometries(geometries);
        geometries.forEach(g => g.dispose());
        if (!geometry) throw new Error(`Cannot batch main hall part ${part.name}`);
        const mesh = new THREE.Mesh(geometry, material); mesh.name = `${part.name}_${material.name}`;
        mesh.userData.explodeWithParent = true; mesh.castShadow = mesh.receiveShadow = true; part.add(mesh);
      }
    }
    if (batch) originals.forEach(g => g.dispose());
    // Give each assembly a stable local pivot while preserving its assembled world position.
    for (const part of this.parts.values()) {
      const center = new THREE.Box3().setFromObject(part).getCenter(new THREE.Vector3());
      part.position.copy(center); part.children.forEach(child => child.position.sub(center));
    }
    return this.root;
  }
}

function lattice(b: HallBuilder, part: string, x: number, y: number, z: number, width: number, height: number, yaw = 0) {
  // The lattice is real relief. Transform the bars into side/rear wall planes when needed.
  const add = (surface: Surface, dx: number, dy: number, w: number, h: number, depth = .045) =>
    b.box(part, surface, [x + dx * Math.cos(yaw), y + dy, z - dx * Math.sin(yaw)], [w, h, depth], [0, yaw, 0]);
  for (const side of [-1, 1]) add('wood', side * width / 2, 0, .095, height + .18, .09);
  for (const dy of [-height / 2, height / 2]) add('wood', 0, dy, width, .1, .09);
  const bars = Math.floor(width / .17);
  for (let i = 1; i < bars; i++) add('darkWood', -width / 2 + width * i / bars, 0, .026, height);
  for (const dy of [-height * .36, -height * .16, height * .18, height * .37]) add('darkWood', 0, dy, width, .035);
}

function roofDetail(b: HallBuilder, roof: Roof, prefix: 'lower' | 'upper') {
  for (let face = 0; face < 4; face++) {
    const span = face % 2 === 0 ? roof.width : roof.depth, count = Math.round(span / .26);
    for (let i = 0; i <= count; i++) {
      const u = i / count * 2 - 1;
      const points = Array.from({ length: 13 }, (_, j) => hallRoofPoint(roof, face, u, .055 + j / 12 * .945).add(new THREE.Vector3(0, .04, 0)));
      b.tube(`${prefix}-tiles`, i % 4 === 0 ? 'roof' : 'tileLight', points, .052, 10, 3);
      const end = points.at(-1)!;
      b.cap(`${prefix}-tiles`, [end.x, end.y - .012, end.z], face % 2 === 0 ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2]);
    }
    const edge = Array.from({ length: 33 }, (_, i) => hallRoofPoint(roof, face, i / 32 * 2 - 1, 1));
    b.tube(prefix === 'lower' ? 'lower-eaves' : 'upper-roof', 'wood', edge.map(p => p.clone().add(new THREE.Vector3(0, -.09, 0))), .075, 24, 3);
    b.tube(prefix === 'lower' ? 'lower-eaves' : 'upper-roof', 'gold', edge.map(p => p.clone().add(new THREE.Vector3(0, -.025, 0))), .023, 24, 3);
    // The curved ceramic rim joins upper and lower roof surfaces into a visible thickness.
    b.tube(prefix === 'lower' ? 'lower-eaves' : 'upper-roof', 'roof', edge, .105, 24, 4);
    const hip = Array.from({ length: 17 }, (_, i) => hallRoofPoint(roof, face, 1, i / 16).add(new THREE.Vector3(0, .075, 0)));
    b.tube(prefix === 'lower' ? 'lower-eaves' : 'upper-roof', 'tileLight', hip, .10, 20, 4);
    const cap = hip.at(-1)!;
    b.tube('ornaments', 'gold', [hip.at(-3)!, cap, cap.clone().add(new THREE.Vector3(Math.sign(cap.x) * .26, .22, Math.sign(cap.z) * .26))], .055, 10);
    b.sphere('ornaments', 'gold', [cap.x + Math.sign(cap.x) * .26, cap.y + .22, cap.z + Math.sign(cap.z) * .26], [.095, .09, .095]);
  }
}

function addSurfaceMaterials(b: HallBuilder) {
  if (typeof document === 'undefined') return;
  // Independent height and albedo fields: lighting is never painted into the surface maps.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#dad6cb'; ctx.fillRect(0, 0, 512, 512);
  let seed = 7219;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 9500; i++) {
    ctx.fillStyle = random() > .5 ? 'rgba(88,94,81,.045)' : 'rgba(255,255,245,.11)';
    ctx.fillRect(random() * 512, random() * 512, 1.2, 1.2);
  }
  const albedo = new THREE.CanvasTexture(canvas); albedo.name = 'MainHall_LimestoneAlbedo';
  albedo.colorSpace = THREE.SRGBColorSpace; albedo.wrapS = albedo.wrapT = THREE.RepeatWrapping; albedo.repeat.set(4, 4); albedo.anisotropy = 4;
  const heightCanvas = document.createElement('canvas'); heightCanvas.width = heightCanvas.height = 128;
  const heightCtx = heightCanvas.getContext('2d')!; heightCtx.fillStyle = '#808080'; heightCtx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1200; i++) { const shade = Math.floor(112 + random() * 32); heightCtx.fillStyle = `rgb(${shade},${shade},${shade})`; heightCtx.fillRect(random() * 128, random() * 128, 1, 1); }
  const bump = new THREE.CanvasTexture(heightCanvas); bump.name = 'MainHall_LimestoneHeight';
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.repeat.set(8, 8);
  for (const material of [b.kit.stone, b.kit.stoneLight]) { material.map = albedo; material.bumpMap = bump; material.bumpScale = .015; }
  const sign = document.createElement('canvas'); sign.width = 1024; sign.height = 240;
  const signCtx = sign.getContext('2d')!;
  signCtx.fillStyle = '#144e42'; signCtx.fillRect(0, 0, 1024, 240);
  signCtx.strokeStyle = '#c5a254'; signCtx.lineWidth = 3; signCtx.strokeRect(16, 16, 992, 208);
  signCtx.fillStyle = '#e0bd6f'; signCtx.font = '126px "Noto Serif CJK SC", serif'; signCtx.textAlign = 'center'; signCtx.textBaseline = 'middle';
  signCtx.fillText('云 岚 宗', 512, 126);
  for (const sx of [-1, 1]) {
    signCtx.save(); signCtx.translate(512 + sx * 465, 120); signCtx.lineWidth = 4;
    for (let i = 0; i < 4; i++) { signCtx.beginPath(); signCtx.ellipse(0, 0, 13, 32, i * Math.PI / 4, 0, Math.PI * 2); signCtx.stroke(); } signCtx.restore();
  }
  const map = new THREE.CanvasTexture(sign); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; map.name = 'MainHall_YunlanInscription';
  const face = new THREE.Mesh(new THREE.PlaneGeometry(4.56, .94), new THREE.MeshStandardMaterial({ map, roughness: .69 }));
  face.name = 'plaque_inscription'; face.userData.explodeWithParent = true; face.position.set(0, 5.75, 6.99); b.part('plaque').add(face);
}

function bracket(b: HallBuilder, x: number, y: number, z: number, yaw: number, small = false) {
  const s = small ? .65 : 1;
  const add = (surface: Surface, dx: number, dy: number, dz: number, w: number, h: number, d: number) =>
    b.box('brackets', surface, [x + (dx * Math.cos(yaw) + dz * Math.sin(yaw)) * s, y + dy * s, z + (-dx * Math.sin(yaw) + dz * Math.cos(yaw)) * s], [w * s, h * s, d * s], [0, yaw, 0]);
  add('wood', 0, -.07, 0, .43, .22, .44);
  add('teal', 0, .12, .14, .85, .13, .57);
  add('wood', 0, .29, .30, .24, .2, .92);
  for (const side of [-1, 1]) {
    add('wood', side * .31, .27, .18, .18, .25, .35);
    add('gold', side * .31, .43, .32, .22, .07, .28);
  }
  add('teal', 0, .48, .4, 1.2, .14, .98);
  add('gold', 0, .56, .85, .28, .045, .16);
}

function railing(b: HallBuilder, x: number, z: number, length: number, yaw: number) {
  const p = (dx: number, y: number, dz = 0): Vec => [x + dx * Math.cos(yaw) + dz * Math.sin(yaw), y, z - dx * Math.sin(yaw) + dz * Math.cos(yaw)];
  const count = Math.ceil(length / 2.4);
  for (let i = 0; i <= count; i++) {
    const dx = -length / 2 + i / count * length;
    b.box('railings', 'stoneLight', p(dx, 1.88), [.21, 1.15, .21]);
    b.box('railings', 'stoneLight', p(dx, 2.42), [.29, .13, .29]);
    b.sphere('railings', 'gold', p(dx, 2.55), [.095, .12, .095]);
  }
  for (const y of [1.72, 2.27]) b.box('railings', 'wood', p(0, y), [length, .1, .12], [0, yaw, 0]);
  for (let i = 0; i < count * 5; i++) b.box('railings', 'wood', p(-length / 2 + (i + .5) / (count * 5) * length, 2.0), [.055, .52, .055], [0, yaw, 0]);
}

function formDetails(b: HallBuilder) {
  roofDetail(b, MAIN_HALL.lowerRoof, 'lower'); roofDetail(b, MAIN_HALL.upperRoof, 'upper');
  for (const side of [-1, 1]) {
    for (const x of [-10.2, -6.8, -3.4, 0, 3.4, 6.8, 10.2]) bracket(b, x, 6.0, side * 6.3, side < 0 ? Math.PI : 0);
    for (const z of [-4.2, 0, 4.2]) bracket(b, side * 10.2, 6.0, z, side * Math.PI / 2);
    for (const x of [-5.65, -3.75, -1.9, 0, 1.9, 3.75, 5.65]) bracket(b, x, 11.27, side * 3.7, side < 0 ? Math.PI : 0, true);
    // Frieze behind the brackets, with narrow gilded borders and repeated teal panels.
    b.box('beams', 'teal', [0, 5.96, side * 6.31], [20.5, .32, .48]);
    for (const y of [5.82, 6.11]) b.box('beams', 'gold', [0, y, side * 6.57], [20.5, .033, .027]);
    for (const x of [-8.5, -5.1, 0, 5.1, 8.5]) {
      b.box('beams', 'wood', [x, 5.96, side * 6.58], [2.6, .26, .03]);
      b.box('beams', 'gold', [x, 5.96, side * 6.61], [.28, .14, .025], [0, 0, Math.PI / 4]);
    }
    for (let i = 0; i < 7; i++) {
      const width = 8.5 / 7, x = side * (1.4 + (i + .5) * width);
      lattice(b, 'front-doors', x, 3.7, 6.05, width - .12, 3.1);
      b.box('front-doors', 'wood', [x, 1.8, 6.01], [width - .045, .7, .075]);
      b.box('front-doors', 'darkWood', [x, 1.8, 6.06], [width - .23, .43, .035]);
      b.box('front-doors', 'gold', [x + side * .36, 3.3, 6.12], [.033, .16, .026]);
      // Small transom panels carry a repeated geometric fret above each door.
      for (const sx of [-1, 1]) b.box('front-doors', 'wood', [x + sx * .25, 5.38, 6.07], [.065, .29, .06]);
      for (const dy of [-.13, .13]) b.box('front-doors', 'wood', [x, 5.38 + dy, 6.07], [.56, .055, .06]);
    }
    for (const z of [-3.7, 0, 3.7]) {
      b.box('rear-windows', 'paper', [side * 9.95, 3.7, z], [.05, 2.4, 1.8]);
      lattice(b, 'rear-windows', side * 10.02, 3.7, z, 1.8, 2.4, side * Math.PI / 2);
    }
    for (const x of [-6.8, 0, 6.8]) {
      b.box('rear-windows', 'paper', [x, 3.7, -6.06], [2.2, 2.4, .045]);
      lattice(b, 'rear-windows', x, 3.7, -6.10, 2.2, 2.4, Math.PI);
    }
    for (const x of [-3.8, -1.9, 0, 1.9, 3.8]) lattice(b, 'upper-walls', x, 10.44, side * 3.78, 1.67, 1.88, side < 0 ? Math.PI : 0);
    railing(b, side * 12.05, 0, 17.7, Math.PI / 2);
    railing(b, side * 8.15, 8.6, 7.6, 0);
  }
  railing(b, 0, -8.6, 24.1, 0);
  // Masonry joints are relief on the foundation, not independent walls or random noise.
  for (let course = 0; course < 3; course++) for (const side of [-1, 1]) {
    const y=.2+course*.4, halfDepth=10-course*.4, halfWidth=13.5-course*.6;
    b.box('foundation', 'mortar', [0, y, side * (halfDepth + .012)], [halfWidth*2, .016, .02]);
    b.box('foundation', 'mortar', [side*(halfWidth+.012), y, 0], [.02, .016, halfDepth*2]);
    for (let i = -6; i <= 6; i++) {
      const x=i*1.95+(course%2? .975:0);
      if(Math.abs(x)<halfWidth)b.box('foundation', 'mortar', [x, y, side*(halfDepth+.012)], [.017, .36, .023]);
    }
    for(let i=-4;i<=4;i++)b.box('foundation','mortar',[side*(halfWidth+.012),y,i*1.95+(course%2?.975:0)],[.023,.36,.017]);
  }
  for (const side of [-1, 1]) {
    b.box('stairs', 'stone', [side * 4.03, .29, 11.15], [.36, .8, 5.2], [.20, 0, 0]);
    b.box('stairs', 'stoneLight', [side * 4.03, .79, 11.15], [.4, .16, 5.5], [.20, 0, 0]);
    b.box('foundation', 'stoneLight', [side * 8.55, .74, 9.42], [.88, .88, .08]);
    b.box('foundation', 'stone', [side * 8.55, .74, 9.47], [.63, .63, .035]);
    b.box('foundation', 'stoneLight', [side * 8.55, .74, 9.5], [.32, .32, .03], [0, 0, Math.PI / 4]);
  }
  b.box('plaque', 'teal', [0, 5.75, 6.84], [4.8, 1.12, .19]);
  for (const x of [-2.36, 2.36]) b.box('plaque', 'gold', [x, 5.75, 6.96], [.065, 1.05, .045]);
  for (const dy of [-.52, .52]) b.box('plaque', 'gold', [0, 5.75 + dy, 6.96], [4.75, .055, .045]);
}

/** Stage is used only by the reconstruction preview; gameplay always uses the finished model. */
export function createMainHallModel(options: { stage?: number; batch?: boolean } = {}) {
  const b = new HallBuilder(), floor = MAIN_HALL.floor, stage = options.stage ?? 7;
  for (let i = 0; i < 3; i++) b.box('foundation', i === 2 ? 'stoneLight' : 'stone', [0, .25 + i * .4, 0], [27 - i * 1.2, .5, 20 - i * .8]);
  // Blockout shell is replaced by the post-and-beam assembly in the next pass.
  if (stage === 0) b.box('facades', 'ivory', [0, floor + 2.5, 0], [20.4, 5, 11.8]);
  else {
    for (const x of [-10.2, -6.8, -3.4, 3.4, 6.8, 10.2]) for (const z of [-6.3, 6.3]) {
      b.cylinder('columns', 'wood', [x, 3.98, z], [.23, 5.3, .23]);
      b.cylinder('columns', 'stoneLight', [x, 1.48, z], [.34, .35, .34]);
      b.cylinder('columns', 'darkWood', [x, 6.52, z], [.29, .18, .29]);
    }
    for (const x of [-10.2, 10.2]) for (const z of [-2.1, 2.1]) {
      b.cylinder('columns', 'wood', [x, 3.98, z], [.23, 5.3, .23]);
      b.cylinder('columns', 'stoneLight', [x, 1.48, z], [.34, .35, .34]);
    }
    for (const side of [-1, 1]) {
      b.box('beams', 'wood', [0, 6.3, side * 6.3], [21, .42, .45]);
      b.box('beams', 'wood', [side * 10.2, 6.3, 0], [.45, .42, 13]);
      b.box('facades', 'ivory', [side * 9.78, 3.65, 0], [.24, 4.7, 11.8]);
      b.box('facades', 'darkWood', [side * 9.9, 1.5, 0], [.32, .36, 11.9]);
    }
    b.box('facades', 'ivory', [0, 3.65, -5.92], [19.6, 4.7, .24]);
    // Project the skirting beyond the plaster; a .32m depth put both inner faces at z=-5.8.
    b.box('facades', 'darkWood', [0, 1.5, -5.96], [19.6, .36, .4]);
    // Entry stays open while the flanking door panels occupy the original hall frontage.
    b.box('front-doors', 'paper', [-5.65, 3.4, 5.92], [8.5, 4.2, .18]);
    b.box('front-doors', 'paper', [5.65, 3.4, 5.92], [8.5, 4.2, .18]);
    b.box('front-doors', 'darkWood', [0, 5.7, 5.94], [20, .35, .3]);
    const stairs = MAIN_HALL.stairs;
    for (let i = 0; i < stairs.count; i++) b.box('stairs', 'stoneLight', [0, (i + 1) * stairs.rise - .13, stairs.startZ - i * stairs.spacing], [stairs.width, .26, stairs.depth]);
    for (const side of [-1, 1]) {
      b.box('upper-walls', 'darkWood', [0, 9.28, side * 3.7], [11.5, .25, .28]);
      b.box('upper-walls', 'wood', [0, 11.45, side * 3.7], [11.5, .3, .3]);
      for (const x of [-5.65, -3.75, -1.9, 1.9, 3.75, 5.65]) b.box('upper-columns', 'wood', [x, 10.45, side * 3.75], [.2, 2.5, .23]);
      for (const z of [-3.7, 0, 3.7]) b.box('upper-columns', 'wood', [side * 5.65, 10.45, z], [.23, 2.5, .2]);
    }
  }
  b.box('upper-walls', 'ivory', [0, 10.4, 0], [11.3, 2.45, 7.4]);
  // Lower roof is a four-sided skirt rooted at the loft footprint, hiding the wall's bottom seam.
  for (const [id, roof] of [['lower-roof', MAIN_HALL.lowerRoof], ['upper-roof', MAIN_HALL.upperRoof]] as const) {
    b.add(id, roofSurface(roof), 'roof'); b.add(id, roofSurface(roof, true), 'underside');
  }
  b.cylinder('ornaments', 'gold', [0, 14.88, 0], [.14, .56, .14]);
  b.sphere('ornaments', 'gold', [0, 15.22, 0], [.22, .26, .22]);
  b.cylinder('ornaments', 'gold', [0, 15.51, 0], [.05, .2, .05]);
  if (stage >= 2) formDetails(b);
  if (stage >= 3) addSurfaceMaterials(b);
  const root = b.finish(options.batch ?? true);
  if (stage >= 6) {
    const socket = new THREE.Object3D(); socket.name = 'main-hall-entry'; socket.position.set(0, floor, MAIN_HALL.frontWall); root.add(socket);
    root.userData.sculptRuntime = {
      parts: b.parts,
      sockets: new Map([[socket.name, socket]]),
      colliders: mainHallCollision(0, 0),
      destructionGroups: [...b.parts.keys()].map(id => ({ id, componentIds: [id], breakable: false })),
      assembly: 'surface relief follows its named semantic parent',
    };
  }
  return root;
}

export type HallCollision = { colliders: { x: number; z: number; r: number }[]; walls: THREE.Box3[]; cameraOccluders: THREE.Box3[] };

/** Highest visible tread at this coordinate; foundation terraces take precedence where overlapping. */
export function mainHallStairHeight(x: number, z: number): number | null {
  const stairs = MAIN_HALL.stairs;
  if (Math.abs(x) > stairs.width / 2) return null;
  let height: number | null = null;
  for (let i = 0; i < stairs.count; i++) {
    if (Math.abs(z - (stairs.startZ - i * stairs.spacing)) <= stairs.depth / 2) height = (i + 1) * stairs.rise;
  }
  return height;
}

/** Gameplay proxies share the visible model's measurements and preserve the central passage. */
export function mainHallCollision(floorY: number, centerZ: number): HallCollision {
  const colliders: HallCollision['colliders'] = [], walls: THREE.Box3[] = [], cameraOccluders: THREE.Box3[] = [];
  const box = (x: number, y: number, z: number, w: number, h: number, d: number) =>
    new THREE.Box3(new THREE.Vector3(x - w / 2, floorY + y - h / 2, centerZ + z - d / 2), new THREE.Vector3(x + w / 2, floorY + y + h / 2, centerZ + z + d / 2));
  const solid = (x: number, y: number, z: number, w: number, h: number, d: number) => { const bound = box(x, y, z, w, h, d); walls.push(bound); cameraOccluders.push(bound); };
  for (const x of [-10.2, -6.8, -3.4, 3.4, 6.8, 10.2]) for (const z of [-6.3, 6.3]) {
    colliders.push({ x, z: centerZ + z, r: .34 }); cameraOccluders.push(box(x, 3.98, z, .6, 5.3, .6));
  }
  for (const side of [-1, 1]) {
    for (const z of [-2.1, 2.1]) { colliders.push({ x: side * 10.2, z: centerZ + z, r: .34 }); cameraOccluders.push(box(side * 10.2, 3.98, z, .6, 5.3, .6)); }
    solid(side * 9.78, 3.65, 0, .26, 4.7, 11.8);
    solid(side * 5.65, 3.4, 5.92, 8.5, 4.2, .27);
    solid(side * 12.05, 1.92, 0, .26, 1.25, 17.7);
    solid(side * 8.15, 1.92, 8.6, 7.6, 1.25, .26);
    solid(side * 4.03, .85, 11.0, .4, 1.7, 5.5);
  }
  solid(0, 3.65, -5.92, 19.6, 4.7, .27);
  solid(0, 1.92, -8.6, 24.1, 1.25, .26);
  cameraOccluders.push(box(0, 7.9, 0, 25.8, 2.4, 18.8), box(0, 10.4, 0, 11.3, 2.45, 7.4), box(0, 13.18, 0, 16.4, 3.1, 11.6));
  return { colliders, walls, cameraOccluders };
}

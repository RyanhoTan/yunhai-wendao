import * as THREE from 'three';
import { artGeometry as g, artMaterials as m, bake, mesh, seededRandom, tube } from '../assets/ArtKit';

type Point = { x: number; z: number };
const shrines: Point[] = [{ x: -110, z: -70 }, { x: 105, z: -135 }, { x: 0, z: -245 }];
const safeAreas = [{ x: 0, z: 14, r: 38 }, { x: 0, z: 50, r: 12 }, { x: -15, z: 12, r: 6 }, { x: 18, z: -20, r: 10 }, ...shrines.map((p) => ({ ...p, r: 12 })), { x: 0, z: -280, r: 30 }];
const routes: Point[][] = [
  [{ x: 0, z: 65 }, { x: 0, z: 34 }, { x: -19, z: 18 }, { x: -24, z: -16 }, { x: -58, z: -43 }, { x: -110, z: -70 }],
  [{ x: -24, z: -16 }, { x: 25, z: -29 }, { x: 52, z: -61 }, { x: 84, z: -102 }, { x: 105, z: -135 }],
  [{ x: 25, z: -29 }, { x: -10, z: -75 }, { x: -15, z: -135 }, { x: 0, z: -190 }, { x: 0, z: -245 }, { x: 0, z: -280 }],
];
const smooth = (a: number, b: number, t: number) => { const n = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1); return n * n * (3 - 2 * n); };

function segmentDistance(x: number, z: number, a: Point, b: Point) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}

function roadDistance(x: number, z: number) {
  let distance = Infinity;
  for (const route of routes) for (let i = 1; i < route.length; i++) distance = Math.min(distance, segmentDistance(x, z, route[i - 1], route[i]));
  return distance;
}

/** Continuous authored landscape: flat sanctuaries linked by soft traversable valleys. */
function landscapeHeight(x: number, z: number): number {
  let h = 2.4 + Math.sin(x * 0.019 + 0.2) * 4 + Math.sin(z * 0.027) * 2.5 + Math.sin((x + z) * 0.043) * 1.8;
  h += Math.exp(-((x + 158) ** 2 + (z + 157) ** 2) / 6400) * 38;
  h += Math.exp(-((x - 165) ** 2 + (z + 48) ** 2) / 7500) * 29;
  h += Math.exp(-((x + 80) ** 2 + (z - 172) ** 2) / 6000) * 17;
  h += Math.exp(-((x - 75) ** 2 + (z + 221) ** 2) / 3200) * 24;
  const road = roadDistance(x, z);
  h = THREE.MathUtils.lerp(1.8 + Math.sin(z * 0.017) * 1.1, h, smooth(4, 21, road));
  for (const area of safeAreas) {
    const d = Math.hypot(x - area.x, z - area.z);
    const level = area.z < -200 ? 1.8 + Math.sin(area.z * 0.017) * 1.1 : area.z === 14 ? 1.8 : 1.8 + Math.sin(area.z * 0.017) * 1.1;
    h = THREE.MathUtils.lerp(level, h, smooth(area.r, area.r + 15, d));
  }
  // The quiet southern lake is entirely outside the quest routes.
  const lake = Math.hypot((x + 160) / 1.25, z - 110);
  h = THREE.MathUtils.lerp(-2.2, h, smooth(22, 37, lake));
  return h;
}

export function terrainHeight(x: number, z: number): number {
  let h = landscapeHeight(x, z);
  const stair = (1 - smooth(3.7, 4.2, Math.abs(x))) * (1 - smooth(16, 21, z)) * smooth(13.9, 15.5, z);
  h += stair * 1.3;
  // Match the three visible stone plinths exactly, including their rear edges.
  // A broad terrain ramp previously buried the feet along the rear terrace.
  if(Math.abs(x)<=13.5&&Math.abs(z-7)<=10)h=2.3;
  if(Math.abs(x)<=12.9&&Math.abs(z-7)<=9.6)h=2.7;
  if(Math.abs(x)<=12.3&&Math.abs(z-7)<=9.2)h=3.1;
  const dx = x + 55, dz = z - 80, angle = -0.65;
  const lx = Math.cos(angle) * dx - Math.sin(angle) * dz, lz = Math.sin(angle) * dx + Math.cos(angle) * dz;
  if (Math.abs(lx) < 2.2 && Math.abs(lz) < 6) {
    const arch = Math.cos(THREE.MathUtils.clamp(lz / 5.8, -1, 1) * Math.PI / 2) * 1.5;
    const bridge = landscapeHeight(-55, 80) + arch + 0.22;
    const blend = (1 - smooth(1.9, 2.2, Math.abs(lx))) * (1 - smooth(5.5, 6, Math.abs(lz)));
    h = THREE.MathUtils.lerp(h, bridge, blend);
  }
  return h;
}

function protectedPoint(x: number, z: number, extra = 0) {
  return roadDistance(x, z) < 6 + extra || safeAreas.some((a) => Math.hypot(a.x - x, a.z - z) < a.r + extra) || Math.hypot((x + 160) / 1.25, z - 110) < 40;
}

function roofGeometry(width: number, depth: number, rise: number) {
  const pos: number[] = [], uv: number[] = [], index: number[] = [];
  const segments = 16, rings = 8;
  for (let face = 0; face < 4; face++) {
    const start = pos.length / 3;
    for (let row = 0; row <= rings; row++) {
      const t = row / rings;
      const radius = 0.1 + t * 0.9;
      for (let col = 0; col <= segments; col++) {
        const u = col / segments * 2 - 1;
        const px = face === 0 || face === 2 ? u * width * 0.5 * radius : (face === 1 ? 1 : -1) * width * 0.5 * radius;
        const pz = face === 1 || face === 3 ? u * depth * 0.5 * radius : (face === 0 ? 1 : -1) * depth * 0.5 * radius;
        const curl = Math.pow(Math.abs(u), 5) * Math.pow(t, 4) * rise * 0.42;
        const y = rise * (Math.pow(1 - t, 1.5) + Math.pow(t, 6) * 0.2) + curl;
        pos.push(px, y, pz); uv.push(col / segments, t);
        if (row < rings && col < segments) {
          const a = start + row * (segments + 1) + col, b = a + segments + 1;
          if (face === 0 || face === 3) index.push(a, b, a + 1, a + 1, b, b + 1);
          else index.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index); geometry.computeVertexNormals();
  return geometry;
}

function addRoof(group: THREE.Group, x: number, y: number, z: number, width: number, depth: number, rise: number) {
  const geometry = roofGeometry(width, depth, rise);
  mesh(group, geometry, 'roof', [x, y, z]);
  // Tile rolls follow the authored upturned roof; static repetition is merged.
  const count = Math.floor(width / 0.7);
  for (const side of [-1, 1]) for (let i = 0; i <= count; i++) {
    const px = (i / count * 2 - 1) * width / 2;
    const points: THREE.Vector3[] = [];
    for (let j = 0; j <= 6; j++) {
      const t = j / 6;
      const ratio = 0.1 + t * 0.9;
      points.push(new THREE.Vector3(px * ratio, rise * (Math.pow(1 - t, 1.5) + Math.pow(t, 6) * 0.2) + Math.pow(Math.abs(px / (width / 2)), 5) * Math.pow(t, 4) * rise * 0.42 + 0.035, side * depth / 2 * ratio));
    }
    mesh(group, tube(points, 0.045, 12), 'jade', [x, y, z]);
  }
  // Gold corner eave spars and a central ridge ornament emphasize architecture at distance.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const points = [new THREE.Vector3(0, rise, 0), new THREE.Vector3(sx * width * 0.35, rise * 0.22, sz * depth * 0.35), new THREE.Vector3(sx * width * 0.5, rise * 0.62, sz * depth * 0.5)];
    mesh(group, tube(points, 0.07, 14), 'gold', [x, y, z]);
    mesh(group, g.sphere, 'gold', [x + sx * width / 2, y + rise * 0.62, z + sz * depth / 2], [0.14, 0.12, 0.14]);
  }
  mesh(group, g.cylinder, 'gold', [x, y + rise + 0.25, z], [0.11, 0.6, 0.11]);
  mesh(group, g.sphere, 'gold', [x, y + rise + 0.6, z], [0.24, 0.13, 0.24]);
}

function railing(group: THREE.Group, x: number, y: number, z: number, length: number, axis: 'x' | 'z') {
  const horizontal = axis === 'x';
  for (let i = 0; i <= Math.ceil(length / 1.4); i++) {
    const offset = i / Math.ceil(length / 1.4) * length - length / 2;
    mesh(group, g.box, 'wood', [x + (horizontal ? offset : 0), y + 0.62, z + (horizontal ? 0 : offset)], [0.16, 1.24, 0.16]);
    mesh(group, g.sphere, 'gold', [x + (horizontal ? offset : 0), y + 1.28, z + (horizontal ? 0 : offset)], [0.13, 0.13, 0.13]);
  }
  for (const height of [0.46, 1.0]) mesh(group, g.box, 'wood', [x, y + height, z], horizontal ? [length, 0.09, 0.13] : [0.13, 0.09, length]);
}

function lantern(group: THREE.Group, x: number, y: number, z: number) {
  mesh(group, g.cylinder, 'wood', [x, y + 1.0, z], [0.12, 2, 0.12]);
  mesh(group, g.cylinder, 'lantern', [x, y + 2.12, z], [0.31, 0.6, 0.31]);
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    mesh(group, g.box, 'gold', [x + Math.sin(angle) * 0.3, y + 2.12, z + Math.cos(angle) * 0.3], [0.028, 0.64, 0.028]);
  }
  for (const h of [1.8, 2.44]) mesh(group, g.cylinder, 'roof', [x, y + h, z], [0.39, 0.1, 0.39]);
  mesh(group, g.cone, 'roof', [x, y + 2.57, z], [0.48, 0.22, 0.48]);
}

function temple(group: THREE.Group, colliders: { x: number; z: number; r: number }[], walls: THREE.Box3[], cameraOccluders: THREE.Box3[]) {
  const floor = 1.8, cz = 7;
  const box = (x: number, y: number, z: number, w: number, h: number, d: number) => new THREE.Box3(new THREE.Vector3(x-w/2,y-h/2,z-d/2),new THREE.Vector3(x+w/2,y+h/2,z+d/2));
  for (let i = 0; i < 3; i++) mesh(group, g.box, i === 2 ? 'paleStone' : 'stone', [0, floor + 0.25 + i * 0.4, cz], [27 - i * 1.2, 0.5, 20 - i * 0.8]);
  // Central stairs open toward the player; landings remain walkable height-wise.
  for (let i = 0; i < 6; i++) mesh(group, g.box, 'paleStone', [0, floor + i * 0.18, 20.5 - i * 0.75], [7.6, 0.24, 1]);
  const baseY = floor + 1.5;
  for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) {
    const px = sx * 8.5, pz = cz + sz * 6.3;
    mesh(group, g.cylinder, 'wood', [px, baseY + 2.75, pz], [0.33, 5.5, 0.33]);
    for (const y of [baseY + 0.2, baseY + 5.4]) mesh(group, g.cylinder, 'gold', [px, y, pz], [0.4, 0.15, 0.4]);
    colliders.push({ x: px, z: pz, r: 0.55 });
    cameraOccluders.push(box(px,baseY+2.75,pz,0.8,5.5,0.8));
  }
  for (const pz of [cz - 6.3, cz + 6.3]) mesh(group, g.box, 'wood', [0, baseY + 5.2, pz], [18, 0.4, 0.5]);
  mesh(group, g.box, 'wood', [0, baseY + 5.4, cz], [0.4, 0.35, 13]);
  // Ornamental perforated rear panels; separate color zones imply carved lattice and depth.
  mesh(group, g.box, 'ivory', [0, baseY + 2.2, cz - 5.9], [16, 4.4, 0.2]);
  const rearWall = box(0,baseY+2.2,cz-5.9,16,4.4,0.5);
  walls.push(rearWall); cameraOccluders.push(rearWall);
  for (let i = -7; i <= 7; i++) {
    mesh(group, g.box, 'wood', [i, baseY + 2.2, cz - 5.72], [0.1, 4.5, 0.1]);
    mesh(group, g.box, 'wood', [i, baseY + 2.2, cz - 5.65], [0.075, 4.5, 0.075], [0, 0, 0.32]);
  }
  for (const y of [baseY + 0.6, baseY + 2.8, baseY + 4]) mesh(group, g.box, 'wood', [0, y, cz - 5.65], [16, 0.12, 0.12]);
  addRoof(group, 0, baseY + 5.7, cz, 25, 19, 3.7);
  cameraOccluders.push(box(0,baseY+7.3,cz,23,3.2,17));
  const plaque = sectPlaque(); plaque.position.set(0, baseY + 4.5, cz + 6.6); group.add(plaque);
  // Upper pavilion with four windows and its own smaller crown.
  mesh(group, g.box, 'ivory', [0, baseY + 9.4, cz], [7.6, 1.8, 5.7]);
  cameraOccluders.push(box(0,baseY+9.4,cz,7.6,1.8,5.7));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(group, g.box, 'wood', [sx * 3.8, baseY + 9.4, cz + sz * 2.8], [0.27, 2.2, 0.27]);
  for (const side of [-1, 1]) for (let i = -3; i <= 3; i++) mesh(group, g.box, 'wood', [i, baseY + 9.45, cz + side * 2.9], [0.08, 1.6, 0.06]);
  addRoof(group, 0, baseY + 10.5, cz, 12.5, 9.5, 2.6);
  railing(group, -12.2, baseY - 0.1, cz, 17, 'z'); railing(group, 12.2, baseY - 0.1, cz, 17, 'z');
  railing(group, -8, baseY - 0.1, cz + 8.4, 8, 'x'); railing(group, 8, baseY - 0.1, cz + 8.4, 8, 'x');
  for (const sx of [-1, 1]) lantern(group, sx * 5.7, floor, 22.3);
  // Entrance torii-like paifang offset to the left of the main travel corridor.
  const gx = -25, gz = 38, gy = terrainHeight(gx, gz);
  for (const sx of [-1, 1]) {
    mesh(group, g.cylinder, 'wood', [gx + sx * 4.5, gy + 3, gz], [0.35, 6, 0.35]);
    mesh(group, g.box, 'stone', [gx + sx * 4.5, gy + 0.4, gz], [1, 0.8, 1]);
    colliders.push({ x: gx + sx * 4.5, z: gz, r: 0.6 });
  }
  mesh(group, g.box, 'wood', [gx, gy + 4.6, gz], [10, 0.55, 0.5]);
  mesh(group, g.box, 'jade', [gx, gy + 5.15, gz + 0.01], [3.8, 0.95, 0.24]);
  for (let i = -1; i <= 1; i++) {
    mesh(group, g.box, 'gold', [gx + i * 0.72, gy + 5.2, gz + 0.15], [0.36, 0.06, 0.035]);
    mesh(group, g.box, 'gold', [gx + i * 0.72, gy + 5.13, gz + 0.15], [0.065, 0.45, 0.035]);
  }
  addRoof(group, gx, gy + 5.7, gz, 12.8, 3.5, 1.65);
}

function archBridge(group: THREE.Group, x: number, z: number, angle: number) {
  const local = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const pz = i * 0.72 - 5.4, arch = Math.cos(pz / 5.8 * Math.PI / 2) * 1.5;
    mesh(local, g.box, 'paleStone', [0, arch, pz], [4.2, 0.38, 0.72], [-Math.sin(pz / 5.8 * Math.PI / 2) * 0.19, 0, 0]);
    for (const side of [-1, 1]) {
      mesh(local, g.box, 'stone', [side * 2.05, arch + 0.65, pz], [0.16, 1.3, 0.16]);
      if (i < 15) mesh(local, g.box, 'stone', [side * 2.05, arch + 1.18, pz + 0.36], [0.12, 0.1, 0.75]);
    }
  }
  local.position.set(x, landscapeHeight(x, z) + 0.03, z); local.rotation.y = angle;
  group.add(local);
}

function makeTerrain() {
  const geometry = new THREE.PlaneGeometry(640, 640, 160, 160); geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position'); const colors: number[] = [];
  const grassA = new THREE.Color(0x5f7860), grassB = new THREE.Color(0x879777), stone = new THREE.Color(0x717f72), path = new THREE.Color(0x999e7e);
  const random = seededRandom(5241);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i), y = terrainHeight(x, z);
    const underTemple = Math.abs(x) < 14 && Math.abs(z - 7) < 13;
    const bridgeDx = x + 55, bridgeDz = z - 80;
    const underBridge = Math.abs(Math.cos(-0.65) * bridgeDx - Math.sin(-0.65) * bridgeDz) < 2.3 && Math.abs(Math.sin(-0.65) * bridgeDx + Math.cos(-0.65) * bridgeDz) < 6;
    positions.setY(i, underBridge ? landscapeHeight(x, z) : y - (underTemple ? 0.16 : 0));
    const c = grassA.clone().lerp(grassB, (Math.sin(x * 0.071) * Math.cos(z * 0.077) + 1) * 0.28 + random() * 0.1);
    c.lerp(stone, smooth(16, 34, y));
    c.lerp(path, 1 - smooth(3.5, 7, roadDistance(x, z)));
    if (Math.hypot(x, z - 14) < 35) c.lerp(path, 0.45);
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
  const texture = groundTexture();
  if (texture) texture.repeat.set(80, 80);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, map: texture, roughness: 0.98, flatShading: false });
  const terrain = new THREE.Mesh(geometry, material); terrain.receiveShadow = true; terrain.name = 'ContinuousMountainValley';
  return terrain;
}

/** Seeded mineral flecks, short blades and soft soil patches; every pixel is authored here. */
function groundTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'); if (!ctx) return null;
  const random = seededRandom(74231);
  ctx.fillStyle = '#ecefe5'; ctx.fillRect(0, 0, 256, 256);
  // Nine translated copies make the wide marks continuous across tiled edges.
  for (let i = 0; i < 28; i++) {
    const x = random() * 256, y = random() * 256, radius = 12 + random() * 33;
    for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) {
      const gradient = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius);
      gradient.addColorStop(0, 'rgba(76,91,66,0.15)'); gradient.addColorStop(1, 'rgba(76,91,66,0)');
      ctx.fillStyle = gradient; ctx.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2);
    }
  }
  for (let i = 0; i < 1900; i++) {
    const x = random() * 256, y = random() * 256, value = 115 + Math.floor(random() * 80);
    ctx.fillStyle = `rgba(${value},${value + 5},${value - 5},0.35)`;
    ctx.fillRect(x, y, 0.6 + random() * 1.4, 0.5 + random() * 1.1);
    if (i % 7 === 0) {
      ctx.strokeStyle = 'rgba(79,104,74,0.19)'; ctx.lineWidth = 0.7; ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + 1.5 + random() * 2, y - 3 - random() * 4); ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  texture.name = 'OriginalValleyGritAndGrass'; return texture;
}

/** Flat inlaid paving follows the existing height field, so it adds no collision or step. */
function createGroundInlays(root: THREE.Group) {
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [];
  const tones = [0x647b72, 0x72877b, 0x87988a, 0x819285, 0x6e8479].map((hex) => new THREE.Color(hex));
  const addQuad = (points: Point[], color: THREE.Color) => {
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const p = points[index]; positions.push(p.x, terrainHeight(p.x, p.z) + 0.025, p.z);
      colors.push(color.r, color.g, color.b); uvs.push(p.x / 6, p.z / 6);
    }
  };
  const areas = [{ x: 0, z: 29, radius: 10.5, rings: 4 }, ...shrines.map((p) => ({ ...p, radius: 8, rings: 4 })), { x: 0, z: -280, radius: 22.2, rings: 9 }];
  for (const [areaIndex, area] of areas.entries()) {
    for (let ring = 0; ring < area.rings; ring++) {
      const inner = ring / area.rings * area.radius + 0.028, outer = (ring + 1) / area.rings * area.radius - 0.028;
      const segments = Math.max(12, (ring + 1) * 8), phase = ring % 2 * Math.PI / segments;
      for (let segment = 0; segment < segments; segment++) {
        const a = segment / segments * Math.PI * 2 + phase + 0.002, b = (segment + 1) / segments * Math.PI * 2 + phase - 0.002;
        const point = (angle: number, radius: number): Point => ({ x: area.x + Math.sin(angle) * radius, z: area.z + Math.cos(angle) * radius });
        addQuad([point(a, inner), point(a, outer), point(b, outer), point(b, inner)], tones[(segment * 3 + ring + areaIndex) % tones.length]);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.computeVertexNormals();
  const grit = groundTexture();
  const paving = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, map: grit, roughness: 0.94 }));
  paving.name = 'OriginalMeridianRadialPaving'; paving.receiveShadow = true; root.add(paving);

  // One shared painted lotus seal is used for both the school and its meridian plazas.
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.translate(256, 256); ctx.strokeStyle = '#b6ab78'; ctx.lineWidth = 3;
  for (const radius of [66, 201, 214, 232]) { ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke(); }
  for (let petal = 0; petal < 12; petal++) {
    ctx.save(); ctx.rotate(petal / 12 * Math.PI * 2); ctx.beginPath(); ctx.moveTo(0, -190);
    ctx.bezierCurveTo(60, -117, 32, -55, 0, -31); ctx.bezierCurveTo(-32, -55, -60, -117, 0, -190); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -211); ctx.lineTo(0, -230); ctx.stroke(); ctx.restore();
  }
  for (let i = 0; i < 8; i++) {
    ctx.save(); ctx.rotate(i * Math.PI / 4); ctx.lineWidth = 5;
    for (let line = 0; line < 3; line++) {
      ctx.beginPath(); ctx.moveTo(-19, -241 + line * 8); ctx.lineTo(line === 1 ? -4 : 19, -241 + line * 8); ctx.stroke();
      if (line === 1) { ctx.beginPath(); ctx.moveTo(4, -241 + line * 8); ctx.lineTo(19, -241 + line * 8); ctx.stroke(); }
    }
    ctx.restore();
  }
  const sealTexture = new THREE.CanvasTexture(canvas); sealTexture.colorSpace = THREE.SRGBColorSpace; sealTexture.anisotropy = 8;
  sealTexture.name = 'OriginalTwelvePetalMeridianSeal';
  const sealMaterial = new THREE.MeshStandardMaterial({ map: sealTexture, transparent: true, opacity: 0.71, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  sealMaterial.name = 'original_lotus_inlay';
  const seals = new THREE.Group(); seals.name = 'OriginalLotusGroundInlays';
  for (const area of areas) {
    const radius = area.z === -280 ? 11 : area.radius * 0.65;
    const sealGeometry = new THREE.PlaneGeometry(radius * 2, radius * 2, 8, 8); sealGeometry.rotateX(-Math.PI / 2);
    const vertices = sealGeometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) vertices.setY(i, terrainHeight(area.x + vertices.getX(i), area.z + vertices.getZ(i)) + 0.034);
    sealGeometry.computeVertexNormals();
    const seal = new THREE.Mesh(sealGeometry, sealMaterial); seal.position.set(area.x, 0, area.z); seals.add(seal);
  }
  const mergedSeals = bake(seals); mergedSeals.traverse((part) => { if (part instanceof THREE.Mesh) { part.castShadow = false; part.receiveShadow = true; } }); root.add(mergedSeals);
}

function windMaterial(material: THREE.MeshStandardMaterial) {
  const result = material.clone();
  result.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 }; result.userData.shader = shader;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      float phase = instanceMatrix[3].x + instanceMatrix[3].z;
      #else
      float phase = 0.0;
      #endif
      float tip = max(position.y, 0.0); transformed.x += sin(uTime * 1.4 + phase) * tip * 0.032;`);
  };
  result.customProgramCacheKey = () => 'yunhai-ambient-wind';
  return result;
}

function createForest(root: THREE.Group, colliders: { x: number; z: number; r: number }[]) {
  const random = seededRandom(90321), dummy = new THREE.Object3D();
  const positions: { x: number; z: number; h: number; scale: number; yaw: number; type: number }[] = [];
  for (let i = 0; i < 650; i++) {
    const x = (random() * 2 - 1) * 295, z = (random() * 2 - 1) * 295;
    if (protectedPoint(x, z, 3) || Math.hypot(x, z + 280) < 35) continue;
    const h = terrainHeight(x, z), scale = 0.65 + random() * 1.2;
    positions.push({ x, z, h, scale, yaw: random() * Math.PI * 2, type: random() });
    colliders.push({ x, z, r: 0.7 * scale });
  }
  const trunkGeometry = new THREE.CylinderGeometry(0.16, 0.28, 4.9, 7); trunkGeometry.translate(0, 2.45, 0);
  const trunks = new THREE.InstancedMesh(trunkGeometry, m.bark, positions.length); trunks.castShadow = true; trunks.receiveShadow = true; root.add(trunks);
  positions.forEach((p, i) => { dummy.position.set(p.x, p.h, p.z); dummy.scale.set(p.scale, p.scale, p.scale); dummy.rotation.set(0, p.yaw, 0.08); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix); });
  const needlesGeometry = new THREE.LatheGeometry([
    new THREE.Vector2(0, -0.47), new THREE.Vector2(1, -0.46), new THREE.Vector2(0.87, -0.31),
    new THREE.Vector2(0.76, -0.28), new THREE.Vector2(0.51, 0.03), new THREE.Vector2(0.42, 0.05),
    new THREE.Vector2(0.16, 0.36), new THREE.Vector2(0, 0.52),
  ], 10);
  // The gently lobed profile replaces stacked cone primitives with tiered pine boughs.
  const needles = needlesGeometry.getAttribute('position');
  for (let i = 0; i < needles.count; i++) {
    const x = needles.getX(i), y = needles.getY(i), z = needles.getZ(i), theta = Math.atan2(x, z);
    const lobe = 1 + Math.sin(theta * 5 + y * 2.5) * 0.06;
    needles.setXYZ(i, x * lobe, y - Math.pow(Math.abs(Math.sin(theta * 5)), 6) * 0.027 * (0.52 - y), z * lobe);
  }
  needlesGeometry.computeVertexNormals();
  const canopyGeometry = new THREE.IcosahedronGeometry(1, 1);
  const wind = [windMaterial(m.leaf), windMaterial(m.leafLight), windMaterial(m.blossom)];
  const pinePositions = positions.filter((p) => p.type < 0.65), broadPositions = positions.filter((p) => p.type >= 0.65);
  for (let layer = 0; layer < 3; layer++) {
    const canopy = new THREE.InstancedMesh(needlesGeometry, wind[layer % 2], pinePositions.length); canopy.castShadow = false; root.add(canopy);
    pinePositions.forEach((p, i) => {
      const radius = (2.2 - layer * 0.46) * p.scale;
      dummy.position.set(p.x + Math.sin(p.yaw) * layer * 0.12, p.h + (3.4 + layer * 1.6) * p.scale, p.z + Math.cos(p.yaw) * layer * 0.12);
      dummy.scale.set(radius, (2.8 - layer * 0.23) * p.scale, radius); dummy.rotation.set(0, p.yaw, 0.025); dummy.updateMatrix(); canopy.setMatrixAt(i, dummy.matrix);
      canopy.setColorAt(i, new THREE.Color().setScalar(0.82 + p.type * 0.3 + layer * 0.025));
    });
  }
  for (let layer = 0; layer < 4; layer++) {
    const canopy = new THREE.InstancedMesh(canopyGeometry, layer === 3 ? wind[2] : wind[layer % 2], broadPositions.length); root.add(canopy);
    broadPositions.forEach((p, i) => {
      const angle = p.yaw + layer / 4 * Math.PI * 2;
      dummy.position.set(p.x + Math.sin(angle) * p.scale * 1.1, p.h + (4 + layer % 2 * 1.2) * p.scale, p.z + Math.cos(angle) * p.scale * 1.1);
      dummy.scale.set(2.2 * p.scale, 1.35 * p.scale, 1.8 * p.scale); dummy.rotation.set(0, angle, 0); dummy.updateMatrix(); canopy.setMatrixAt(i, dummy.matrix);
      canopy.setColorAt(i, new THREE.Color().setScalar(0.86 + (p.type - 0.65) * 0.4));
    });
  }
  // Curving bamboo fans are a separate silhouette family around the sect.
  const bambooPoints: Point[] = [];
  for (let i = 0; i < 260; i++) {
    const x = (random() * 2 - 1) * 150, z = (random() * 2 - 1) * 170;
    if (!protectedPoint(x, z, 1) && random() > 0.4) bambooPoints.push({ x, z });
  }
  const bambooGeometry = new THREE.CylinderGeometry(0.07, 0.08, 5, 6); bambooGeometry.translate(0, 2.5, 0);
  const bamboo = new THREE.InstancedMesh(bambooGeometry, m.jade, bambooPoints.length); root.add(bamboo);
  bambooPoints.forEach((p, i) => { dummy.position.set(p.x, terrainHeight(p.x, p.z), p.z); dummy.scale.setScalar(0.8 + random() * 0.6); dummy.rotation.set(0.1 * random(), random() * 6, 0.13); dummy.updateMatrix(); bamboo.setMatrixAt(i, dummy.matrix); });
  const leafGeometry = new THREE.SphereGeometry(1, 5, 4); leafGeometry.translate(0, 0.9, 0);
  const bambooLeaves = new THREE.InstancedMesh(leafGeometry, wind[0], bambooPoints.length * 7); root.add(bambooLeaves);
  bambooPoints.forEach((p, i) => { for (let j = 0; j < 7; j++) { const angle = j * 2.4; dummy.position.set(p.x + Math.sin(angle) * 0.5, terrainHeight(p.x, p.z) + 3.2 + j * 0.25, p.z + Math.cos(angle) * 0.5); dummy.scale.set(0.85, 0.12, 0.18); dummy.rotation.set(0, -angle, 0.25); dummy.updateMatrix(); bambooLeaves.setMatrixAt(i * 7 + j, dummy.matrix); } });
  // Sparse rock clusters and ground cover use single shared low-poly geometries.
  const stones = new THREE.InstancedMesh(g.ico, m.stone, 270); root.add(stones); stones.receiveShadow = true;
  for (let i = 0; i < 270; i++) {
    let x = 0, z = 0;
    do { x = (random() * 2 - 1) * 300; z = (random() * 2 - 1) * 300; } while (protectedPoint(x, z, 2));
    const scale = 0.5 + random() * 2.6;
    dummy.position.set(x, terrainHeight(x, z) + scale * 0.25, z); dummy.scale.set(scale, scale * 0.65, scale * 0.8); dummy.rotation.set(random() * 0.6, random() * 6, random() * 0.5); dummy.updateMatrix(); stones.setMatrixAt(i, dummy.matrix);
    if (scale > 1.7) colliders.push({ x, z, r: scale * 0.6 });
  }
  const grassGeometry = new THREE.ConeGeometry(0.18, 0.9, 3); grassGeometry.translate(0, 0.45, 0);
  const grass = new THREE.InstancedMesh(grassGeometry, wind[1], 2600); root.add(grass);
  for (let i = 0; i < 2600; i++) {
    let x = 0, z = 0;
    do { x = (random() * 2 - 1) * 290; z = (random() * 2 - 1) * 290; } while (protectedPoint(x, z, 0));
    dummy.position.set(x, terrainHeight(x, z), z); dummy.scale.set(1 + random() * 1.5, 0.45 + random() * 0.8, 1 + random() * 1.5); dummy.rotation.set(0, random() * 6, 0); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix);
  }
  return wind;
}

function mountainGeometry(seed: number, height: number, radius: number) {
  const geometry = new THREE.CylinderGeometry(radius * 0.11, radius, height, 32, 28, false);
  const position = geometry.getAttribute('position'); const colors: number[] = [];
  const rock = new THREE.Color(0x455e5c), light = new THREE.Color(0x91a296), moss = new THREE.Color(0x3c6357), fissure = new THREE.Color(0x3c5352);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i), t = (y / height + 0.5);
    const angle = Math.atan2(z, x), rib = Math.sin(angle * 5 + seed) * 0.18 + Math.sin(angle * 11 - t * 3 + seed) * 0.055;
    const shelf = Math.sin(t * 8 * Math.PI + seed * 0.4) * 0.075 + Math.sin(t * 21 + angle * 2) * 0.05;
    // Narrow crowns, bulging limestone shoulders and horizontal ledges create authored depth.
    const ridge = 1 + rib + shelf + Math.sin(t * Math.PI) * 0.18;
    const bend = Math.sin(t * Math.PI) * radius * (0.13 + Math.sin(seed) * 0.09);
    const displacement = Math.sin(angle * 7 + seed) * (1 - t) * 2 + Math.sin(t * 20 + angle * 3) * 1.2;
    position.setXYZ(i, x * ridge + bend, y + displacement, z * ridge + bend * Math.sin(seed));
    const strata = Math.sin(t * 60 + Math.sin(angle * 4 + seed) * 1.8);
    const color = rock.clone().lerp(light, smooth(0.35, 1, t) * 0.65 + (Math.sin(angle * 3 + seed) + 1) * 0.07);
    color.lerp(fissure, Math.pow(Math.max(0, -strata), 7) * 0.29);
    color.lerp(moss, smooth(0.1, 0.5, Math.sin(angle * 4 + t * 13 + seed)) * (1 - smooth(0.48, 0.85, t)) * 0.42);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.translate(0, height / 2 - 12, 0); geometry.computeVertexNormals();
  return geometry;
}

function createKarstShoulders(root: THREE.Group) {
  // These low cliffs sit beyond the walkable boundary, framing the stone-spirit arena.
  const stoneGeometry = mountainGeometry(19, 35, 12);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 });
  const shoulders = new THREE.InstancedMesh(stoneGeometry, material, 18); shoulders.name = 'OriginalNorthernKarstShoulders';
  const dummy = new THREE.Object3D(), random = seededRandom(33124);
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? -1 : 1, height = 0.8 + random() * 1.1;
    dummy.position.set(side * (38 + Math.floor(i / 2) * 8 + random() * 12), height * 12 - 5, -338 - Math.floor(i / 4) * 13);
    // mountainGeometry's base is -12; offset it explicitly after nonuniform scaling.
    dummy.scale.set(0.7 + random() * 0.6, height, 0.9 + random() * 0.8); dummy.rotation.set(0, random() * Math.PI * 2, 0); dummy.updateMatrix(); shoulders.setMatrixAt(i, dummy.matrix);
  }
  root.add(shoulders);
}

function makeSky() {
  const material = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: {
    uTop: { value: new THREE.Color(0x589b9b) }, uHorizon: { value: new THREE.Color(0xe1ddba) }, uSunColor: { value: new THREE.Color(0xffe7ab) }, uSunDir: { value: new THREE.Vector3(-0.6, 0.44, -0.35).normalize() },
  }, vertexShader: 'varying vec3 vDir; void main(){vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: `varying vec3 vDir; uniform vec3 uTop,uHorizon,uSunColor,uSunDir;
    void main(){float h=clamp(vDir.y*0.5+0.5,0.0,1.0); vec3 col=mix(uHorizon,uTop,pow(h,1.3)); float d=clamp(dot(normalize(vDir),uSunDir),0.0,1.0); col+=uSunColor*(pow(d,700.0)*0.65+pow(d,12.0)*0.16); gl_FragColor=vec4(col,1.0);}` });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1900, 32, 16), material); sky.frustumCulled = false; sky.name = 'OriginalPaintedSky'; return sky;
}

function sectPlaque() {
  if (typeof document === 'undefined') return new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.4), m.jade);
  const canvas = document.createElement('canvas'); canvas.width = 704; canvas.height = 224;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#224f49'; ctx.fillRect(0, 0, 704, 224);
    ctx.strokeStyle = '#c8a858'; ctx.lineWidth = 6; ctx.strokeRect(10, 10, 684, 204);
    ctx.lineWidth = 2; ctx.strokeRect(21, 21, 662, 182);
    ctx.fillStyle = '#e7d39b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '112px "Noto Serif CJK SC", serif'; ctx.fillText('云 岚 宗', 352, 119);
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(352 + side * 302, 112, 19, 0, Math.PI * 2); ctx.stroke(); }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.4), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.75 }));
}

function surfaceTexture() {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const random = seededRandom(231);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2400; i++) { const shade = 175 + Math.floor(random() * 65); ctx.fillStyle = `rgb(${shade},${shade},${shade})`; ctx.fillRect(random() * 128, random() * 128, 1 + random() * 2, 1 + random() * 2); }
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(2, 2); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  m.stone.map = texture; m.paleStone.map = texture;
  return texture;
}

export function createWorld(scene: THREE.Scene) {
  const root = new THREE.Group(); root.name = 'YunhaiOriginalWorld'; scene.add(root);
  scene.fog = new THREE.FogExp2(0xc2d1bc, 0.0017);
  root.add(makeTerrain(), makeSky());
  createGroundInlays(root);
  const texture = surfaceTexture();
  const colliders: { x: number; z: number; r: number }[] = [];
  const walls: THREE.Box3[] = [], cameraOccluders: THREE.Box3[] = [];
  const architecture = new THREE.Group(); temple(architecture, colliders, walls, cameraOccluders);
  archBridge(architecture, -55, 80, -0.65);
  // Meridian plazas feature low perimeter stones and gateway pillars, leaving centers free.
  for (const [i, shrine] of shrines.entries()) {
    const h = terrainHeight(shrine.x, shrine.z);
    for (let j = 0; j < 12; j++) {
      const angle = j / 12 * Math.PI * 2;
      mesh(architecture, g.box, 'paleStone', [shrine.x + Math.sin(angle) * 8.5, h + 0.14, shrine.z + Math.cos(angle) * 8.5], [1.7, 0.28, 0.7], [0, angle, 0]);
    }
    for (const side of [-1, 1]) {
      const px = shrine.x + side * 7.3, pz = shrine.z - 5;
      mesh(architecture, g.box, 'stone', [px, h + 1.4, pz], [1.0, 2.8 + i * 0.5, 1.0]);
      mesh(architecture, g.ico, 'jade', [px, h + 3.1 + i * 0.5, pz], [0.7, 0.7, 0.7]);
      lantern(architecture, shrine.x + side * 5.5, h, shrine.z + 5);
      colliders.push({ x: px, z: pz, r: 0.7 });
    }
  }
  const arenaHeight = terrainHeight(0, -280);
  for (let i = 0; i < 32; i++) {
    const angle = i / 32 * Math.PI * 2;
    mesh(architecture, g.box, 'paleStone', [Math.sin(angle) * 23, arenaHeight + 0.05, -280 + Math.cos(angle) * 23], [1.8, 0.17, 0.62], [0, angle, 0]);
    if (i % 8 === 0) {
      mesh(architecture, g.box, 'stone', [Math.sin(angle) * 25.2, arenaHeight + 2, -280 + Math.cos(angle) * 25.2], [1.4, 4, 1.4]);
      mesh(architecture, g.ico, 'spirit', [Math.sin(angle) * 25.2, arenaHeight + 4.4, -280 + Math.cos(angle) * 25.2], [0.4, 0.75, 0.4]);
    }
  }
  // Path paving and practical lanterns subtly orient navigation without obstructing travel.
  for (const route of routes) for (let segment = 1; segment < route.length; segment++) {
    const a = route[segment - 1], b = route[segment], count = Math.floor(Math.hypot(b.x - a.x, b.z - a.z) / 4);
    for (let i = 0; i <= count; i++) {
      const t = i / Math.max(1, count), x = THREE.MathUtils.lerp(a.x, b.x, t), z = THREE.MathUtils.lerp(a.z, b.z, t);
      if (Math.hypot(x, z - 14) < 20 || safeAreas.some((area) => area.z < -50 && Math.hypot(x - area.x, z - area.z) < 8)) continue;
      mesh(architecture, g.box, 'paleStone', [x + Math.sin(i * 2.8) * 0.17, terrainHeight(x, z) + 0.018, z], [1.5, 0.045, 0.95], [0, -Math.atan2(b.x - a.x, b.z - a.z) + Math.sin(i) * 0.08, 0]);
      if (i % 7 === 2) {
        const angle = Math.atan2(b.x - a.x, b.z - a.z), px = x + Math.cos(angle) * 4.7, pz = z - Math.sin(angle) * 4.7;
        lantern(architecture, px, terrainHeight(px, pz), pz);
      }
    }
  }
  root.add(bake(architecture));
  const wind = createForest(root, colliders);
  const peaks = [{ x: -390, z: -290, h: 200, r: 80 }, { x: -360, z: 100, h: 145, r: 75 }, { x: 410, z: -235, h: 270, r: 80 }, { x: 230, z: -445, h: 190, r: 65 }, { x: 70, z: -490, h: 315, r: 90 }, { x: -150, z: -480, h: 215, r: 70 }, { x: 410, z: 120, h: 165, r: 100 }, { x: -370, z: -490, h: 145, r: 65 }, { x: 350, z: -475, h: 125, r: 50 }];
  const mountainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  peaks.forEach((peak, i) => { const mountain = new THREE.Mesh(mountainGeometry(i + 1, peak.h, peak.r), mountainMaterial); mountain.position.set(peak.x, 0, peak.z); root.add(mountain); });
  createKarstShoulders(root);
  // Slow clouds are lit translucent volumes well above all walking routes.
  const cloudMaterial = new THREE.MeshBasicMaterial({ color: 0xe1e6d2, transparent: true, opacity: 0.13, depthWrite: false });
  const cloudGeometry = new THREE.SphereGeometry(1, 12, 6), clouds = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, 42), dummy = new THREE.Object3D(), random = seededRandom(518);
  const cloudPoints: { x: number; y: number; z: number; scale: number }[] = [];
  for (let i = 0; i < 42; i++) cloudPoints.push({ x: (random() * 2 - 1) * 800, y: 84 + random() * 75, z: (random() * 2 - 1) * 800, scale: 45 + random() * 45 });
  root.add(clouds);
  const waterMaterial = new THREE.ShaderMaterial({ transparent: true, uniforms: { uTime: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: 'varying vec2 vUv; uniform float uTime; void main(){float rip=sin(vUv.x*80.0+uTime*0.6)*sin(vUv.y*65.0-uTime*0.45)*0.035;vec3 col=vec3(0.22,0.5,0.48)+rip;gl_FragColor=vec4(col,0.88);}' });
  const lake = new THREE.Mesh(new THREE.CircleGeometry(25, 56), waterMaterial); lake.rotation.x = -Math.PI / 2; lake.scale.x = 1.25; lake.position.set(-160, -0.6, 110); root.add(lake);
  const ripple = new THREE.Mesh(new THREE.RingGeometry(20, 20.05, 80), new THREE.MeshBasicMaterial({ color: 0xb7d1be, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })); ripple.rotation.x = -Math.PI / 2; ripple.position.copy(lake.position).y += 0.02; ripple.scale.x = 1.25; root.add(ripple);
  let disposed = false;
  return {
    colliders,
    walls,
    cameraOccluders,
    update(_dt: number, time: number) {
      for (const material of wind) if (material.userData.shader) material.userData.shader.uniforms.uTime.value = time;
      waterMaterial.uniforms.uTime.value = time;
      cloudPoints.forEach((cloud, i) => {
        dummy.position.set(((cloud.x + time * (0.45 + i % 3 * 0.1) + 900) % 1800) - 900, cloud.y, cloud.z);
        dummy.scale.set(cloud.scale, cloud.scale * 0.11, cloud.scale * 0.65); dummy.rotation.set(0, i * 0.2, 0); dummy.updateMatrix(); clouds.setMatrixAt(i, dummy.matrix);
      }); clouds.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      if (disposed) return; disposed = true;
      const sharedGeometry = new Set<THREE.BufferGeometry>(Object.values(g)), sharedMaterial = new Set<THREE.Material>(Object.values(m));
      const disposedGeometry = new Set<THREE.BufferGeometry>(), disposedMaterial = new Set<THREE.Material>();
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        if (!sharedGeometry.has(object.geometry) && !disposedGeometry.has(object.geometry)) { object.geometry.dispose(); disposedGeometry.add(object.geometry); }
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) if (!sharedMaterial.has(material) && !disposedMaterial.has(material)) {
          const map = (material as THREE.MeshStandardMaterial).map; map?.dispose(); material.dispose(); disposedMaterial.add(material);
        }
      });
      texture?.dispose(); m.stone.map = null; m.paleStone.map = null;
      root.removeFromParent();
    },
  };
}

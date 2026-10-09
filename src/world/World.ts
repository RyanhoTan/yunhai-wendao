import {FOREST_CLEARINGS,TERRAIN_BOUNDS,MERIDIAN_SITES,MOUNTAIN_CIRCUIT,VALLEY_ROUTES,SHANHAI_RIDGES,SECT_SUMMIT,SECT_ASCENT} from './WorldLayout';
import {summitLandscape,ascentDistance} from './MountainLayout';
import {gorgeHeight,inWaterCorridor} from './WaterLayout';
import {createMountainWater} from './MountainWater';
import * as THREE from 'three';
import { artGeometry as g, artMaterials as m, bake, mesh, seededRandom, tube } from '../assets/ArtKit';
import { coastBlend, coastalHeight, shorelineAt } from './CoastMath';
import { createCoastalEnvironment } from './CoastalEnvironment';
import { createCoastalRocks } from './CoastalRocks';
import { naturalRelief, mountainRelief, createNaturalTerrain } from './NaturalTerrain';
import { createNaturalForest } from './NaturalForest';
import { TOWN, townBlend, townDistance } from './TownLayout';
import { createTown } from './Town';

type Point = { x: number; z: number };
const shrines: readonly Point[] = MERIDIAN_SITES;
const safeAreas = [{ x: 0, z: 14, r: 38 }, { x: 0, z: 50, r: 12 }, { x: -15, z: 12, r: 6 }, { x: 18, z: -20, r: 10 }, ...FOREST_CLEARINGS, ...shrines.map((p) => ({ ...p, r: 12 })), { x: 0, z: -280, r: 30 }];
const routes = VALLEY_ROUTES;
const smooth = (a: number, b: number, t: number) => { const n = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1); return n * n * (3 - 2 * n); };

function segmentDistance(x: number, z: number, a: Point, b: Point) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}

function roadDistance(x: number, z: number, legacyOnly=false) {
  if(legacyOnly&&z>=120){
    // The protected coastal transition keeps its original graded foundation.
    const coastRoutes=[[{x:0,z:65},{x:52,z:72},{x:87,z:127},{x:125,z:137}],[{x:125,z:38},{x:125,z:137}],[{x:0,z:145},{x:0,z:65}]];
    let closest=Infinity;for(const route of coastRoutes)for(let i=1;i<route.length;i++)closest=Math.min(closest,segmentDistance(x,z,route[i-1],route[i]));return closest;
  }
  let distance = Infinity;
  for(let r=legacyOnly?1:0;r<(legacyOnly?routes.length-1:routes.length);r++)for (let i = 1; i < routes[r].length; i++) distance = Math.min(distance, segmentDistance(x, z, routes[r][i - 1], routes[r][i]));
  if(legacyOnly){const lakeRadius=Math.hypot((x+160)/1.25,z-110);distance=Math.max(distance,21*(1-smooth(60,110,lakeRadius)));}
  return distance;
}

function westernForestHeight(x:number,z:number){
  return 9+mountainRelief(x*.8,z*.8)*.65
    +Math.exp(-((x+442)**2/3800+(z+85)**2/4900))*13
    +Math.exp(-((x+430)**2/5200+(z+190)**2/3100))*9;
}

/** Continuous authored landscape: flat sanctuaries linked by soft traversable valleys. */
function authoredLandscapeHeight(x: number, z: number): number {
  let h = 4.8 + naturalRelief(x,z);
  h += Math.exp(-((x + 158) ** 2 + (z + 157) ** 2) / 6200) * 54;
  h += Math.exp(-((x - 165) ** 2 + (z + 48) ** 2) / 6500) * 46;
  h += Math.exp(-((x + 80) ** 2 + (z - 172) ** 2) / 6000) * 17;
  h += Math.exp(-((x - 75) ** 2 + (z + 221) ** 2) / 4200) * 38;
  let hillside=5.3+mountainRelief(x,z);
  for(const ridge of SHANHAI_RIDGES){
    const dx=(x-ridge.x+(z-ridge.z)*ridge.lean)/ridge.rx,dz=(z-ridge.z)/ridge.rz;
    hillside+=Math.exp(-(dx*dx+dz*dz))*ridge.height;
  }
  // Preserve every coastal elevation and the lake basin/banks while shaping northern hills.
  const lakeMargin=Math.hypot((x+160)/1.25,z-110);
  h=THREE.MathUtils.lerp(h,hillside,(1-smooth(90,110,z))*smooth(45,60,lakeMargin));
  const westHeight=westernForestHeight(x,z);
  h=THREE.MathUtils.lerp(h,westHeight,(1-smooth(-330,-288,x))*(1-smooth(40,100,z)));
  // The new forest trail follows rolling ground; only legacy valley roads
  // keep their existing low, level profile.
  const road = roadDistance(x, z,true);
  h = THREE.MathUtils.lerp(1.8 + Math.sin(z * 0.017) * 1.1, h, smooth(4, 21, road));
  // Grade only the new trail. Existing roads win at crossings, avoiding terrace steps.
  let trailDistance=Infinity,trailHeight=0;
  for(let i=1;i<MOUNTAIN_CIRCUIT.length;i++){
    const a=MOUNTAIN_CIRCUIT[i-1],b=MOUNTAIN_CIRCUIT[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1);
    const distance=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
    if(distance<trailDistance){trailDistance=distance;trailHeight=THREE.MathUtils.lerp(a.y,b.y,t);}
  }
  const trailBlend=(1-smooth(4.5,17,trailDistance))*smooth(4,17,road);
  h=THREE.MathUtils.lerp(h,trailHeight,trailBlend);
  for (const area of safeAreas) {
    const d = Math.hypot(x - area.x, z - area.z);
    const forestClearing=FOREST_CLEARINGS.some(c=>c.x===area.x&&c.z===area.z);
    const level = forestClearing?westernForestHeight(area.x,area.z):area.z < -200 ? 1.8 + Math.sin(area.z * 0.017) * 1.1 : area.z === 14 ? 1.8 : 1.8 + Math.sin(area.z * 0.017) * 1.1;
    h = THREE.MathUtils.lerp(level, h, smooth(area.r, area.r + 15, d));
  }
  // The sect's entire playable foundation rises with its mountain and road.
  if(x>-90&&x<90&&z>-85&&z<140){
    const envelope=smooth(-90,-75,x)*(1-smooth(75,90,x))*smooth(-85,-65,z);
    h=THREE.MathUtils.lerp(h,summitLandscape(x,z,h),envelope);
  }
  // The quiet southern lake is entirely outside the quest routes.
  const lake = Math.hypot((x + 160) / 1.25, z - 110);
  h = THREE.MathUtils.lerp(-2.2, h, smooth(22, 37, lake));
  h=THREE.MathUtils.lerp(h, coastalHeight(x,z), coastBlend(z));
  return gorgeHeight(x,z,THREE.MathUtils.lerp(h,TOWN.groundY,townBlend(x,z)));
}

// The character walks the same triangular heightfield as the near 1m land meshes.
const elevationMinX=TERRAIN_BOUNDS.minX-2,elevationMinZ=TERRAIN_BOUNDS.minZ-2;
const elevationWidth=TERRAIN_BOUNDS.maxX-elevationMinX+3,elevationRows=TERRAIN_BOUNDS.maxZ-elevationMinZ+3;
// A dense grid needs 3.4MB; string-keyed entries consumed far more memory.
const elevationCache=new Float64Array(elevationWidth*elevationRows).fill(NaN);
function landscapeHeight(x:number,z:number):number {
  if(z>=146)return authoredLandscapeHeight(x,z);
  const x0=Math.floor(x),z0=Math.floor(z),tx=x-x0,tz=z-z0;
  const at=(px:number,pz:number)=>{
    const column=px-elevationMinX,row=pz-elevationMinZ;
    if(column<0||column>=elevationWidth||row<0||row>=elevationRows)return authoredLandscapeHeight(px,pz);
    const index=row*elevationWidth+column,cached=elevationCache[index];
    if(!Number.isNaN(cached))return cached;
    return elevationCache[index]=authoredLandscapeHeight(px,pz);
  };
  if(tx===0&&tz===0)return at(x0,z0);
  if(tx+tz<=1)return at(x0,z0)*(1-tx-tz)+at(x0+1,z0)*tx+at(x0,z0+1)*tz;
  return at(x0+1,z0+1)*(tx+tz-1)+at(x0+1,z0)*(1-tz)+at(x0,z0+1)*(1-tx);
}

export function terrainHeight(x: number, z: number): number {
  let h = landscapeHeight(x, z);
  const stair = (1 - smooth(3.7, 4.2, Math.abs(x))) * (1 - smooth(16, 21, z)) * smooth(13.9, 15.5, z);
  h += stair * 1.3;
  // Match the three visible stone plinths exactly, including their rear edges.
  // A broad terrain ramp previously buried the feet along the rear terrace.
  const offset=SECT_SUMMIT.height-1.8;
  if(Math.abs(x)<=13.5&&Math.abs(z-7)<=10)h=2.3+offset;
  if(Math.abs(x)<=12.9&&Math.abs(z-7)<=9.6)h=2.7+offset;
  if(Math.abs(x)<=12.3&&Math.abs(z-7)<=9.2)h=3.1+offset;
  return h;
}

export function protectedPoint(x: number, z: number, extra = 0) {
  return inWaterCorridor(x,z,extra) || townDistance(x,z)<5+extra || z > 126 || roadDistance(x, z) < 6 + extra || ascentDistance(x,z)<6+extra || safeAreas.some((a) => Math.hypot(a.x - x, a.z - z) < a.r + extra) || Math.hypot((x + 160) / 1.25, z - 110) < 40;
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
  const floor = SECT_SUMMIT.height, cz = SECT_SUMMIT.z;
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

export function createWorld(scene: THREE.Scene,moonTexture:THREE.Texture) {
  const root = new THREE.Group(); root.name = 'YunhaiOriginalWorld'; scene.add(root);
  scene.fog = new THREE.FogExp2(0xb4cbd6, 0.00075);
  createNaturalTerrain(root,terrainHeight,(x,z)=>Math.min(roadDistance(x,z),ascentDistance(x,z)));
  const coastal = createCoastalEnvironment(root,terrainHeight,moonTexture);
  const mountainWater=createMountainWater(root,terrainHeight,coastal.waterUniforms);
  createGroundInlays(root);
  const texture = surfaceTexture();
  const colliders: { x: number; z: number; r: number }[] = [];
  const walls: THREE.Box3[] = [], cameraOccluders: THREE.Box3[] = [];
  const town=createTown(root);walls.push(...town.walls);cameraOccluders.push(...town.cameraOccluders);
  const rocks=createCoastalRocks(root,terrainHeight,shorelineAt);
  colliders.push(...rocks.colliders); cameraOccluders.push(...rocks.cameraOccluders);
  // Solid rock bounds also constrain low sword flight; above the actual crown is free.
  walls.push(...rocks.cameraOccluders);
  const architecture = new THREE.Group(); temple(architecture, colliders, walls, cameraOccluders);
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
  for (const route of [...routes,SECT_ASCENT]) for (let segment = 1; segment < route.length; segment++) {
    const a = route[segment - 1], b = route[segment], count = Math.floor(Math.hypot(b.x - a.x, b.z - a.z) / 4);
    for (let i = 0; i <= count; i++) {
      const t = i / Math.max(1, count), x = THREE.MathUtils.lerp(a.x, b.x, t), z = THREE.MathUtils.lerp(a.z, b.z, t);
      if(townDistance(x,z)===0)continue;
      if (Math.hypot(x, z - 14) < 20 || safeAreas.some((area) => area.z < -50 && Math.hypot(x - area.x, z - area.z) < 8)) continue;
      const stoneX=x+Math.sin(i*2.8)*.17;
      const stone=mesh(architecture,g.box,'paleStone',[stoneX,terrainHeight(stoneX,z)+.025,z],[1.5,.045,.95],[0,-Math.atan2(b.x-a.x,b.z-a.z)+Math.sin(i)*.08,0]);
      const normal=new THREE.Vector3(terrainHeight(stoneX-.4,z)-terrainHeight(stoneX+.4,z),.8,terrainHeight(stoneX,z-.4)-terrainHeight(stoneX,z+.4)).normalize();
      stone.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),normal));
      if (i % 7 === 2) {
        const angle = Math.atan2(b.x - a.x, b.z - a.z), px = x + Math.cos(angle) * 4.7, pz = z - Math.sin(angle) * 4.7;
        lantern(architecture, px, terrainHeight(px, pz), pz);
      }
    }
  }
  root.add(bake(architecture));
  const forest = createNaturalForest(root,terrainHeight,protectedPoint);
  colliders.push(...forest.colliders);
  const waterMaterial = new THREE.ShaderMaterial({ transparent: true, uniforms: { uTime: { value: 0 },uDay:{value:1} }, vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: 'varying vec2 vUv; uniform float uTime,uDay; void main(){float rip=sin(vUv.x*80.0+uTime*0.6)*sin(vUv.y*65.0-uTime*0.45)*0.035;vec3 col=vec3(0.22,0.5,0.48)+rip;gl_FragColor=vec4(col*(.12+uDay*.88),0.88);}' });
  const lake = new THREE.Mesh(new THREE.CircleGeometry(25, 56), waterMaterial); lake.rotation.x = -Math.PI / 2; lake.scale.x = 1.25; lake.position.set(-160, -0.6, 110); root.add(lake);
  const ripple = new THREE.Mesh(new THREE.RingGeometry(20, 20.05, 80), new THREE.MeshBasicMaterial({ color: 0xb7d1be, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })); ripple.rotation.x = -Math.PI / 2; ripple.position.copy(lake.position).y += 0.02; ripple.scale.x = 1.25; root.add(ripple);
  let disposed = false;
  return {
    sky: coastal.sky,
    setWeather(a:Parameters<typeof coastal.setWeather>[0],time:number){coastal.setWeather(a,time);waterMaterial.uniforms.uDay.value=a.day;},
    colliders,
    walls,
    cameraOccluders,
    update(_dt: number, time: number) {
      forest.update(time);
      waterMaterial.uniforms.uTime.value = time;
      mountainWater.update(time);
      coastal.update(time);
    },
    dispose() {
      if (disposed) return; disposed = true;
      coastal.dispose();
      const sharedGeometry = new Set<THREE.BufferGeometry>(Object.values(g)), sharedMaterial = new Set<THREE.Material>(Object.values(m));
      const disposedGeometry = new Set<THREE.BufferGeometry>(), disposedMaterial = new Set<THREE.Material>();
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        if(object instanceof THREE.InstancedMesh)object.dispose();
        if(object.customDepthMaterial&&!disposedMaterial.has(object.customDepthMaterial)){object.customDepthMaterial.dispose();disposedMaterial.add(object.customDepthMaterial);}
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

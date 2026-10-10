import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSeededRandom } from '../utils/random';
import { createSectMountainMaterials } from './SectMountainMaterials';

/** Authored from the source GLB's silhouette and road landmarks, in preview units.
 * No source vertices, textures, height map or GLB loader are used by this model.
 * This study is deliberately independent of the game's terrain/collision system.
 */
export const MOUNTAIN_REFERENCE = {
  file: 'artifacts/terrain-pipeline/concepts/sect-mountain-v1/mountain-body/meshy-models/glb.glb',
  sha256: 'ef20950c8e9631fe32ad89f224104d53b51def3a412266e5e80579ba17074570',
};

const ROAD_WIDTH = 9.2;
const ROAD_POINTS: [number, number, number][] = [
  [-81, 5, 23], [-64, 9, 17], [-50, 14, 22], [-37, 18, 35],
  [-26, 22, 26], [-19, 26, 2], [-12, 29, -8], [-6, 32, -2],
  [-4, 35, 13], [1, 37, 23], [10, 40, 22], [20, 44, 2],
  [29, 47, -8], [35, 50, -3], [36, 52, 12], [41, 54, 18],
  [52, 57, 4], [61, 59, 1], [66, 60, 9], [65, 60, 20], [56, 60, 27],
];
const clamp = THREE.MathUtils.clamp;
const smooth = (a: number, b: number, value: number) => THREE.MathUtils.smoothstep(value, a, b);

// Continuous, deterministic value noise; the vertical crags use a separate mesh.
function hash(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}
function noise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), u = smooth(0, 1, x - ix), v = smooth(0, 1, z - iz);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), u),
    THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v,
  );
}
function relief(x: number, z: number): number {
  return (noise(x * .065, z * .065) - .5) * 4.8
    + (noise(x * .21, z * .21) - .5) * 2.3
    + (noise(x * .7, z * .7) - .5) * .6;
}
function outline(theta: number): number {
  return 1 + .035 * Math.sin(theta * 5 + .8) + .025 * Math.sin(theta * 11) + .015 * Math.cos(theta * 19);
}
function radiusAt(x: number, z: number): number {
  const theta = Math.atan2(z / 77, x / 94);
  return Math.hypot(x / 94, z / 77) / outline(theta);
}

type RoadSample = { distance: number; height: number };
function createSurface(curve: THREE.CatmullRomCurve3) {
  const points = curve.getPoints(360);
  const roadAt = (x: number, z: number): RoadSample => {
    let squared = Infinity, height = 0, weightedHeight = 0, weights = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1], dx = b.x - a.x, dz = b.z - a.z;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
      const d = (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2;
      // Blend nearby parts of each hairpin so its inner shoulder does not jump
      // between two different elevations when the closest segment changes.
      if (d < 100) {
        const weight = Math.exp(-d / 18) * Math.hypot(dx, dz);
        weightedHeight += THREE.MathUtils.lerp(a.y, b.y, t) * weight; weights += weight;
      }
      if (d >= squared) continue;
      squared = d; height = THREE.MathUtils.lerp(a.y, b.y, t);
    }
    return { distance: Math.sqrt(squared), height: weights > 1e-5 ? weightedHeight / weights : height };
  };
  const heightAt = (x: number, z: number, road = roadAt(x, z)): number => {
    // Four asymmetric shelves with narrow escarpments rather than a cone.
    let h = 5 + 12 * smooth(-71, -51, x) + 14 * smooth(-31, -17, x)
      + 13 * smooth(5, 20, x) + 16 * smooth(40, 53, x);
    h += relief(x, z) + 4 * noise(x * .09, z * .025);
    const radius = radiusAt(x, z);
    h *= 1 - smooth(.68, 1.01, radius);
    // A grassy apron surrounds the bedrock; the eastern cliff remains steep.
    h += (1 - smooth(.75, 1.02, radius)) * 2.2;
    h = Math.max(.4, h);
    // Broad, flat summit reserve adjoining the last hairpin.
    const summit = 1 - smooth(13, 23, Math.hypot((x - 57) * .9, z - 20));
    h = THREE.MathUtils.lerp(h, 60 + relief(x, z) * .05, summit);
    const roadBlend = 1 - smooth(ROAD_WIDTH * .5 + .8, ROAD_WIDTH * .5 + 4.5, road.distance);
    h = THREE.MathUtils.lerp(h, road.height + relief(x, z) * .035, roadBlend);
    return h;
  };
  return { points, roadAt, heightAt };
}

function geometry(positions: number[], colors: number[], uvs: number[], indices: number[]): THREE.BufferGeometry {
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  result.setIndex(indices); result.computeVertexNormals(); result.computeBoundingSphere();
  return result;
}

export function createSectMountainModel() {
  const root = new THREE.Group(); root.name = 'sect-mountain-study';
  const rng = createSeededRandom(20261010);
  const curve = new THREE.CatmullRomCurve3(ROAD_POINTS.map(p => new THREE.Vector3(...p)), false, 'centripetal');
  const surface = createSurface(curve);
  const materials = createSectMountainMaterials();
  const { stone, earth, path: pathMaterial } = materials;
  const palette = {
    stone: new THREE.Color('#68747c'), lightStone: new THREE.Color('#a5aaa7'),
    moss: new THREE.Color('#737c56'), grass: new THREE.Color('#838965'),
    road: new THREE.Color('#c9c5b0'), edge: new THREE.Color('#96957d'),
  };
  const colors: number[] = [], positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const pavingDistances: number[] = [];
  const segmentsX = 192, segmentsZ = 160, row = segmentsX + 1;
  const pointColor = new THREE.Color();
  for (let iz = 0; iz <= segmentsZ; iz++) for (let ix = 0; ix <= segmentsX; ix++) {
    const u = ix / segmentsX * 2 - 1, v = iz / segmentsZ * 2 - 1;
    // A square-to-disc map retains a regular mesh and a single closed perimeter.
    let x = 94 * u * Math.sqrt(1 - v * v / 2), z = 77 * v * Math.sqrt(1 - u * u / 2);
    const shape = outline(Math.atan2(z / 77, x / 94)); x *= shape; z *= shape;
    const road = surface.roadAt(x, z), y = surface.heightAt(x, z, road);
    const epsilon = .6;
    const slope = Math.hypot(surface.heightAt(x + epsilon, z) - surface.heightAt(x - epsilon, z),
      surface.heightAt(x, z + epsilon) - surface.heightAt(x, z - epsilon)) / (2 * epsilon);
    const moss = (1 - smooth(.6, 2.4, slope)) * (.35 + noise(x * .16, z * .16) * .65);
    pointColor.copy(palette.stone).lerp(palette.grass, moss).multiplyScalar(.88 + noise(x * .42, z * .42) * .25);
    positions.push(x, y, z); colors.push(pointColor.r, pointColor.g, pointColor.b); uvs.push(x / 9, z / 9);
    pavingDistances.push(Math.min(road.distance - ROAD_WIDTH / 2, Math.hypot(x - 56, z - 27) - 8.5));
  }
  for (let z = 0; z < segmentsZ; z++) for (let x = 0; x < segmentsX; x++) {
    const a = z * row + x, b = a + 1, c = a + row, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const land = new THREE.Mesh(geometry(positions, colors, uvs, indices), earth); land.name = 'continuous-terraced-body'; root.add(land);

  // Seal the actual surface perimeter with a shallow, irregular stone underside.
  const perimeter: number[] = [];
  for (let x = 0; x <= segmentsX; x++) perimeter.push(x);
  for (let z = 1; z <= segmentsZ; z++) perimeter.push(z * row + segmentsX);
  for (let x = segmentsX - 1; x >= 0; x--) perimeter.push(segmentsZ * row + x);
  for (let z = segmentsZ - 1; z > 0; z--) perimeter.push(z * row);
  const skirtP: number[] = [], skirtC: number[] = [], skirtUv: number[] = [], skirtI: number[] = [];
  for (const index of perimeter) {
    const x = positions[index * 3], y = positions[index * 3 + 1], z = positions[index * 3 + 2];
    skirtP.push(x, y, z, x, -2, z); skirtC.push(...palette.stone.toArray(), ...palette.stone.clone().multiplyScalar(.8).toArray());
    skirtUv.push(x / 9, y / 9, x / 9, -2 / 9);
  }
  const center = skirtP.length / 3; skirtP.push(0, -2, 0); skirtC.push(...palette.stone.toArray()); skirtUv.push(0, 0);
  for (let i = 0; i < perimeter.length; i++) {
    const a = i * 2, b = (i + 1) % perimeter.length * 2;
    skirtI.push(a, b, a + 1, b, b + 1, a + 1, a + 1, b + 1, center);
  }
  const base = new THREE.Mesh(geometry(skirtP, skirtC, skirtUv, skirtI), stone); base.name = 'sealed-rock-underside'; root.add(base);

  const roadP: number[] = [], roadC: number[] = [], roadUv: number[] = [], roadI: number[] = [];
  const roadN: number[] = [], bodyNormals = land.geometry.attributes.normal;
  const roadBlend: number[] = [];
  type PavingVertex = { point: THREE.Vector3; normal: THREE.Vector3; distance: number };
  // Clip the body's triangles to the road corridor. Both surfaces then share
  // exactly the same planes, avoiding holes and z-fighting at the hairpins.
  for (let i = 0; i < indices.length; i += 3) {
    const input: PavingVertex[] = indices.slice(i, i + 3).map(index => ({
      point: new THREE.Vector3().fromArray(positions, index * 3),
      normal: new THREE.Vector3().fromBufferAttribute(bodyNormals, index), distance: pavingDistances[index],
    }));
    if (input.every(vertex => vertex.distance > 0)) continue;
    const clipped: PavingVertex[] = [];
    for (let j = 0; j < 3; j++) {
      const a = input[j], b = input[(j + 1) % 3], insideA = a.distance <= 0, insideB = b.distance <= 0;
      if (insideA) clipped.push(a);
      if (insideA !== insideB) {
        const t = a.distance / (a.distance - b.distance);
        clipped.push({ point: a.point.clone().lerp(b.point, t), normal: a.normal.clone().lerp(b.normal, t).normalize(), distance: 0 });
      }
    }
    const start = roadP.length / 3;
    for (const vertex of clipped) {
      const { x, y, z } = vertex.point, edgeBlend = 1 - smooth(-1.2, 0, vertex.distance);
      pointColor.copy(palette.edge).lerp(palette.road, edgeBlend).multiplyScalar(.94 + noise(x * .36, z * .36) * .13);
      roadP.push(x, y + .09, z); roadC.push(...pointColor.toArray()); roadUv.push(x / 9, z / 9); roadN.push(...vertex.normal.toArray());
      roadBlend.push(edgeBlend);
    }
    for (let j = 1; j < clipped.length - 1; j++) roadI.push(start, start + j, start + j + 1);
  }
  const roadGeometry = geometry(roadP, roadC, roadUv, roadI);
  roadGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(roadN, 3));
  roadGeometry.setAttribute('pavingBlend', new THREE.Float32BufferAttribute(roadBlend, 1));
  const road = new THREE.Mesh(roadGeometry, pathMaterial); road.name = 'continuous-switchback-road'; root.add(road);

  const cragParts: THREE.BufferGeometry[] = [], screeParts: THREE.BufferGeometry[] = [];
  function crag(x: number, z: number, width: number, depth: number, height: number, into: THREE.BufferGeometry[]) {
    const y = surface.heightAt(x, z), p: number[] = [], c: number[] = [], uv: number[] = [], idx: number[] = [];
    const facets = 9, rings = 7, seed = rng() * 90, yaw = rng() * Math.PI * 2;
    const profile = [1.06, 1.04, .98, 1.02, .91, .94, .72];
    const leanX = (rng() - .5) * width * .5, leanZ = (rng() - .5) * depth * .5;
    for (let r = 0; r < rings; r++) for (let a = 0; a <= facets; a++) {
      const angle = a % facets / facets * Math.PI * 2 + yaw, f = r / (rings - 1);
      const jagged = (.82 + hash(a % facets + seed, seed) * .32) * (.94 + hash(a % facets + seed, r + seed) * .12);
      const rx = Math.cos(angle) * width * profile[r] * jagged, rz = Math.sin(angle) * depth * profile[r] * jagged;
      const ry = y - height * .5 + height * f + (noise(a % facets + seed, r + seed) - .5) * height * .045;
      p.push(x + rx + leanX * f, ry, z + rz + leanZ * f);
      const moss = smooth(.9, 1, f) * (.2 + noise(x + a, z + r) * .45);
      pointColor.copy(palette.stone).lerp(palette.lightStone, hash(a % facets + seed, seed) * .45)
        .lerp(palette.moss, moss).multiplyScalar(.8 + hash(a % facets + seed, r + seed) * .35);
      c.push(...pointColor.toArray()); uv.push(a / facets * width * 1.4, f * height / 8);
      if (r < rings - 1 && a < facets) {
        const v = r * (facets + 1) + a, next = v + facets + 1;
        idx.push(v, next, v + 1, v + 1, next, next + 1);
      }
    }
    // A broad, broken crown avoids turning the cliff columns into repeated cones.
    const top = p.length / 3;
    p.push(x + leanX, y + height * .49, z + leanZ); c.push(...palette.moss.toArray()); uv.push(.5, 1);
    const bottom = p.length / 3; p.push(x, y - height * .5, z); c.push(...palette.stone.toArray()); uv.push(.5, 0);
    for (let a = 0; a < facets; a++) {
      const v = (rings - 1) * (facets + 1) + a;
      idx.push(v, top, v + 1, a + 1, bottom, a);
    }
    into.push(geometry(p, c, uv, idx));
  }

  // Tall fissured buttresses skirt the shelves. Their foot is embedded in the body.
  for (let i = 0; i < 230; i++) {
    const x = (rng() * 2 - 1) * 86, z = (rng() * 2 - 1) * 69, radius = radiusAt(x, z);
    if (radius > .92 || radius < .22) continue;
    const roadDistance = surface.roadAt(x, z).distance, width = 1.7 + rng() * 3;
    if (roadDistance < ROAD_WIDTH / 2 + width * 1.7 + 2) continue;
    if (Math.hypot(x - 57, z - 20) < 15) continue;
    const ridge = Math.abs(Math.sin((x + 12) * .073)), height = 4 + rng() * 8 + ridge * 7;
    crag(x, z, width, 1.5 + rng() * 2.8, height, cragParts);
  }
  // Contiguous buttress groups define the exposed cliff faces below each shelf.
  for (const shelfX of [-52, -19, 19, 51]) for (let i = 0; i < 34; i++) {
    const x = shelfX + (rng() - .5) * 9, z = -58 + i * 3.5 + (rng() - .5) * 3;
    const width = 2.1 + rng() * 2.2;
    if (radiusAt(x, z) > .88 || surface.roadAt(x, z).distance < ROAD_WIDTH / 2 + width * 1.7 + 2) continue;
    if (Math.hypot(x - 57, z - 20) < 15) continue;
    crag(x, z, width, 2.5 + rng() * 2, 12 + rng() * 11, cragParts);
  }
  // Small talus is a separate merged layer, keeping the outline and route readable.
  for (let i = 0; i < 760; i++) {
    const x = (rng() * 2 - 1) * 94, z = (rng() * 2 - 1) * 77;
    if (radiusAt(x, z) > .99) continue;
    const width = .3 + rng() * 1.25;
    if (surface.roadAt(x, z).distance < ROAD_WIDTH / 2 + width * 1.8 + .8) continue;
    if (Math.hypot(x - 57, z - 20) < 12) continue;
    crag(x, z, width, width * (.6 + rng() * .6), 1 + rng() * 3.5, screeParts);
  }
  function mergedLayer(parts: THREE.BufferGeometry[], name: string) {
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, stone); mesh.name = name; root.add(mesh);
    for (const part of parts) part.dispose();
    return mesh;
  }
  const cliffs = mergedLayer(cragParts, 'vertical-weathered-crags'), scree = mergedLayer(screeParts, 'foothill-and-shelf-talus');
  root.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const layers = { body: land, underside: base, road, cliffs, scree };
  const stats = {
    triangles: Object.values(layers).reduce((n, m) => n + m.geometry.index!.count / 3, 0),
    meshes: Object.keys(layers).length, crags: cragParts.length, talus: screeParts.length,
    roadWidth: ROAD_WIDTH, size: bounds.getSize(new THREE.Vector3()).toArray(),
  };
  let disposed = false;
  return {
    root, bounds, layers, stats, curve,
    setWireframe(value: boolean) { for (const material of [stone, earth, pathMaterial]) material.wireframe = value; },
    dispose() {
      if (disposed) return; disposed = true;
      for (const mesh of Object.values(layers)) mesh.geometry.dispose();
      materials.dispose(); root.removeFromParent();
    },
  };
}

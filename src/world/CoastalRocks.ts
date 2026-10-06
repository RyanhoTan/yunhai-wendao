import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

type Collider = { x: number; z: number; r: number };
type RockPlacement = { x: number; z: number; sx: number; sy: number; sz: number; yaw: number; kind: number; wet: number };

function randomFrom(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

/** Original eroded granite forms. The three families have different mass and fracture planes. */
function graniteGeometry(kind: number, detail: number) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  geometry.deleteAttribute('uv');
  const positions = geometry.getAttribute('position'), colors: number[] = [], wet: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const ox = positions.getX(i), oy = positions.getY(i), oz = positions.getZ(i);
    const ripple = Math.sin(ox * 7.1 + oz * 3.8 + kind * 2) * Math.cos(oy * 5.3 - oz * 2.4) * 0.062;
    let x: number, y: number, z: number;
    if (kind === 0) {
      // Tidal abrasion rounds the shoulders but leaves an asymmetric flattened crown.
      x = ox * (1 + ripple) + oy * 0.08;
      y = 1 + oy * (0.84 + ripple) - Math.max(0, ox) * 0.14;
      z = oz * (0.92 + ripple) + ox * oy * 0.11;
    } else if (kind === 1) {
      // A broad split slab: softened corners meet two tilted planar fracture faces.
      x = Math.sign(ox) * Math.pow(Math.abs(ox), 0.64) + oy * 0.13;
      z = Math.sign(oz) * Math.pow(Math.abs(oz), 0.71) * (0.94 + ripple);
      y = Math.min(1 + Math.sign(oy) * Math.pow(Math.abs(oy), 0.76), 1.72 - x * 0.22 + z * 0.10);
      x = Math.min(x, 0.89 + y * 0.05 - z * 0.11);
      x += ripple * 0.35; z += ripple * 0.45;
    } else {
      // A leaning wedge with a steep seaward face and a lower wind-eroded heel.
      x = Math.sign(ox) * Math.pow(Math.abs(ox), 0.73) * (1 + ripple);
      z = Math.sign(oz) * Math.pow(Math.abs(oz), 0.86) * (0.81 + ripple) + oy * 0.25;
      y = Math.min(1 + oy, 1.66 - x * 0.41 - z * 0.20);
      x += y * 0.19; z = Math.max(z, -0.68 - y * 0.04);
    }
    y = Math.max(0.015, y);
    positions.setXYZ(i, x, y, z);
    const shade = 0.88 + Math.sin(x * 3.1 + z * 1.4 + kind) * 0.075 + y * 0.025;
    colors.push(shade, shade * 0.98, shade * 0.94);
    wet.push((1 - THREE.MathUtils.smoothstep(y, 0.08, 0.68)) * 0.7);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('coastWet', new THREE.Float32BufferAttribute(wet, 1));
  geometry.deleteAttribute('normal');
  const smoothGeometry=mergeVertices(geometry);geometry.dispose();
  smoothGeometry.computeVertexNormals();smoothGeometry.computeBoundingBox();smoothGeometry.computeBoundingSphere();
  return smoothGeometry;
}

/** UV-independent granite grain, thin quartz veins and fissures share one stock PBR material. */
function graniteMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: 0x8d877b, vertexColors: true, roughness: 0.9, metalness: 0.015 });
  material.name = 'OriginalCoastalGraniteMineralAndWetBase';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute float coastWet; varying float vCoastWet; varying vec3 vCoastWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
      #include <project_vertex>
      vec4 coastWorldVertex = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        coastWorldVertex = instanceMatrix * coastWorldVertex;
      #endif
      vCoastWorld = (modelMatrix * coastWorldVertex).xyz;
      vCoastWet = coastWet;
    `);
    shader.fragmentShader = `
      varying float vCoastWet;
      varying vec3 vCoastWorld;
      float coastHash(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1073, 0.0973));
        p += dot(p, p.yzx + 31.37);
        return fract((p.x + p.y) * p.z);
      }
      float coastNoise(vec3 p) {
        vec3 a = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(coastHash(a), coastHash(a + vec3(1,0,0)), f.x),
                       mix(coastHash(a + vec3(0,1,0)), coastHash(a + vec3(1,1,0)), f.x), f.y),
                   mix(mix(coastHash(a + vec3(0,0,1)), coastHash(a + vec3(1,0,1)), f.x),
                       mix(coastHash(a + vec3(0,1,1)), coastHash(a + vec3(1,1,1)), f.x), f.y), f.z);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec3 coastP = vCoastWorld;
      float coastMottle = coastNoise(coastP * 0.74 + vec3(7.3, 2.1, 9.7));
      float coastMeso = coastNoise(coastP * 4.8);
      float coastGrain = coastHash(floor(coastP * 96.0));
      // Veins vary in width and wander through the rock rather than repeating horizontal stripes.
      float coastVeinPhase = coastP.x * 0.67 + coastP.y * 0.89 + coastP.z * 0.32 + coastMottle * 1.5;
      float coastVeinDistance = abs(fract(coastVeinPhase) - 0.5);
      float coastQuartz = 1.0 - smoothstep(0.004, 0.017, coastVeinDistance);
      float coastFracture = 1.0 - smoothstep(0.002, 0.012, abs(fract(coastP.x * 0.17 - coastP.z * 0.53 + coastMeso * 0.17) - 0.5));
      float coastWetAmount = max(vCoastWet, (1.0 - smoothstep(0.10, 0.48, coastP.y)) * 0.8);
      diffuseColor.rgb *= (0.78 + coastMottle * 0.31) * (0.90 + coastMeso * 0.15) * (0.88 + coastGrain * 0.19);
      diffuseColor.rgb *= 1.0 - coastFracture * 0.20;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.67, 0.65, 0.58), coastQuartz * 0.37);
      diffuseColor.rgb *= 1.0 - coastWetAmount * 0.37;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.51, coastWetAmount);
    `);
  };
  material.customProgramCacheKey = () => 'yunhai-original-coastal-granite-v1';
  return material;
}

function placementMatrix(rock: RockPlacement, heightAt: (x: number, z: number) => number) {
  const matrix = new THREE.Matrix4();
  const y = heightAt(rock.x, rock.z) - Math.min(0.30, rock.sy * 0.21);
  matrix.compose(new THREE.Vector3(rock.x, y, rock.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rock.yaw), new THREE.Vector3(rock.sx, rock.sy, rock.sz));
  return matrix;
}

/** Fit a short chain of ground circles to the rock's measured, rotated horizontal footprint. */
function rockColliders(geometry: THREE.BufferGeometry, rock: RockPlacement): Collider[] {
  const box = geometry.boundingBox!, center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const halfX = size.x * rock.sx / 2, halfZ = size.z * rock.sz / 2, alongX = halfX >= halfZ;
  const long = Math.max(halfX, halfZ), short = Math.min(halfX, halfZ);
  const count = long / short > 1.25 ? 3 : 1, reach = count === 1 ? 0 : long * 0.57;
  const cos = Math.cos(rock.yaw), sin = Math.sin(rock.yaw), result: Collider[] = [];
  const local: { x: number; z: number; r: number }[] = [];
  for (let i = 0; i < count; i++) {
    const offset = count === 1 ? 0 : (i / (count - 1) * 2 - 1) * reach;
    const x = center.x * rock.sx + (alongX ? offset : 0), z = center.z * rock.sz + (alongX ? 0 : offset);
    local.push({ x, z, r: 0 });
  }
  // Assign the measured footprint vertices to their nearest circle; no visible corner leaks out.
  const positions = geometry.getAttribute('position');
  for (let vertex = 0; vertex < positions.count; vertex++) {
    const x = positions.getX(vertex) * rock.sx, z = positions.getZ(vertex) * rock.sz;
    let chosen = local[0], distance = Infinity;
    for (const circle of local) {
      const d = Math.hypot(x - circle.x, z - circle.z);
      if (d < distance) { distance = d; chosen = circle; }
    }
    chosen.r = Math.max(chosen.r, distance);
  }
  for (const circle of local) result.push({ x: rock.x + cos * circle.x + sin * circle.z, z: rock.z - sin * circle.x + cos * circle.z, r: circle.r + 0.015 });
  return result;
}

function duneGrassGeometry() {
  const vertices: number[] = [], colors: number[] = [];
  for (let blade = 0; blade < 5; blade++) {
    const yaw = blade * 2.39996, height = 0.32 + (blade % 3) * 0.11, bend = 0.18;
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const outward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const points = [new THREE.Vector3(), outward.clone().multiplyScalar(bend * 0.28).setY(height * 0.57), outward.clone().multiplyScalar(bend).setY(height)];
    for (let segment = 0; segment < 2; segment++) {
      const widths = [0.020, 0.013, 0.001];
      const a = points[segment].clone().addScaledVector(right, -widths[segment]), b = points[segment].clone().addScaledVector(right, widths[segment]);
      const c = points[segment + 1].clone().addScaledVector(right, widths[segment + 1]), d = points[segment + 1].clone().addScaledVector(right, -widths[segment + 1]);
      for (const p of [a, b, c, a, c, d]) { vertices.push(p.x, p.y, p.z); colors.push(0.83 + segment * 0.14, 0.88 + segment * 0.1, 0.62); }
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals(); return geometry;
}

/** Original rock asset kit for the southern coast; the center beach remains a clear exploration route. */
export function createCoastalRocks(root: THREE.Group, heightAt: (x: number, z: number) => number, shorelineAt: (x: number) => number) {
  const group = new THREE.Group(); group.name = 'OriginalExplorableCoastalGranite'; root.add(group);
  const random = randomFrom(270231), prototypes = [0, 1, 2].map((kind) => graniteGeometry(kind, 6));
  const material = graniteMaterial(), colliders: Collider[] = [], cameraOccluders: THREE.Box3[] = [], parts: THREE.BufferGeometry[] = [];
  const placements: RockPlacement[] = [];
  const centers = [-228, -151, -78, 91, 175, 250];
  for (const [cluster, x] of centers.entries()) {
    const z = shorelineAt(x) - (cluster % 2 === 0 ? 6 : 19);
    const amount = cluster % 2 === 0 ? 4 : 3;
    for (let i = 0; i < amount; i++) {
      const theta = i * 2.48 + cluster * 0.71, radial = i === 0 ? 0 : 7 + random() * 4.7;
      const px = x + Math.cos(theta) * radial, pz = z + Math.sin(theta) * radial;
      const width = i === 0 ? 4.1 + random() * 2.4 : 1.8 + random() * 1.4;
      placements.push({ x: px, z: pz, sx: width, sy: i === 0 ? 2.1 + random() * 1.9 : 0.9 + random() * 1.2, sz: width * (0.59 + random() * 0.32), yaw: random() * Math.PI * 2, kind: (cluster + i) % 3, wet: pz > shorelineAt(px) - 8 ? 1 : 0.37 });
    }
  }
  // Two isolated intertidal rocks draw the eye toward the water without making a barrier.
  for (const x of [-190, 209]) placements.push({ x, z: shorelineAt(x) + 8, sx: 2.4, sy: 1.2, sz: 1.8, yaw: x * 0.037, kind: 0, wet: 1 });
  for (const rock of placements) {
    const prototype = prototypes[rock.kind], geometry = prototype.clone(), matrix = placementMatrix(rock, heightAt);
    const wet = geometry.getAttribute('coastWet'); for (let i = 0; i < wet.count; i++) wet.setX(i, wet.getX(i) * rock.wet);
    geometry.applyMatrix4(matrix); geometry.computeBoundingBox();
    cameraOccluders.push(geometry.boundingBox!.clone());
    colliders.push(...rockColliders(prototype, rock)); parts.push(geometry);
  }
  const merged = mergeGeometries(parts, false); parts.forEach((part) => part.dispose()); prototypes.forEach((part) => part.dispose());
  if (merged) {
    const rocks = new THREE.Mesh(merged, material); rocks.name = 'GraniteHeadlandsAndIntertidalOutcrops'; rocks.castShadow = true; rocks.receiveShadow = true; group.add(rocks);
  }

  const scatterGeometry = graniteGeometry(0, 2), pebblesGeometry = graniteGeometry(1, 0), dummy = new THREE.Object3D();
  const fragments = new THREE.InstancedMesh(scatterGeometry, material, 42); fragments.name = 'OriginalCoastalBrokenRockFragments'; fragments.receiveShadow = true; group.add(fragments);
  for (let i = 0; i < fragments.count; i++) {
    const center = centers[i % centers.length], angle = random() * Math.PI * 2, distance = 11 + random() * 12;
    const x = THREE.MathUtils.clamp(center + Math.sin(angle) * distance, -282, 282), z = shorelineAt(x) - 12 + Math.cos(angle) * distance;
    const scale = 0.23 + random() * 0.48;
    dummy.position.set(x, heightAt(x, z) - 0.035, z); dummy.scale.set(scale * 1.18, scale * 0.4, scale); dummy.rotation.set(0, random() * Math.PI * 2, 0); dummy.updateMatrix(); fragments.setMatrixAt(i, dummy.matrix);
    fragments.setColorAt(i, new THREE.Color().setScalar(0.79 + random() * 0.22));
  }
  const pebbles = new THREE.InstancedMesh(pebblesGeometry, material, 205); pebbles.name = 'OriginalTidalGravelAndGraniteChips'; pebbles.receiveShadow = true; group.add(pebbles);
  for (let i = 0; i < pebbles.count; i++) {
    const center = centers[i % centers.length], angle = random() * Math.PI * 2, distance = 8 + random() * 22;
    const x = THREE.MathUtils.clamp(center + Math.cos(angle) * distance, -286, 286), z = shorelineAt(x) - 13 + Math.sin(angle) * distance;
    const scale = 0.045 + Math.pow(random(), 2) * 0.17;
    dummy.position.set(x, heightAt(x, z) - 0.018, z); dummy.scale.set(scale * 1.25, scale * (0.23 + random() * 0.22), scale * 0.85); dummy.rotation.set(0, random() * Math.PI * 2, 0); dummy.updateMatrix(); pebbles.setMatrixAt(i, dummy.matrix);
    pebbles.setColorAt(i, new THREE.Color().setScalar(0.69 + random() * 0.4));
  }
  fragments.instanceMatrix.needsUpdate = true; pebbles.instanceMatrix.needsUpdate = true;
  fragments.computeBoundingBox(); fragments.computeBoundingSphere(); pebbles.computeBoundingBox(); pebbles.computeBoundingSphere();

  const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x9c9b66, vertexColors: true, roughness: 1, side: THREE.DoubleSide }); grassMaterial.name = 'OriginalDryDuneGrass';
  const grass = new THREE.InstancedMesh(duneGrassGeometry(), grassMaterial, 120); grass.name = 'DryDuneMarramTufts'; group.add(grass);
  for (let i = 0; i < grass.count; i++) {
    const x = (random() * 2 - 1) * 275, z = shorelineAt(x) - 38 - random() * 16;
    const scale = 0.73 + random() * 0.75;
    dummy.position.set(x, heightAt(x, z) + 0.018, z); dummy.scale.setScalar(scale); dummy.rotation.set(0, random() * Math.PI * 2, 0); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix);
  }
  grass.instanceMatrix.needsUpdate = true; grass.computeBoundingBox(); grass.computeBoundingSphere();
  group.userData.assetSource = 'Original TypeScript vertex authoring and mineral shaders; no downloaded geometry or texture.';
  group.userData.triangles = placements.length * 980 + fragments.count * 180 + pebbles.count * 20 + grass.count * 20;
  group.userData.drawCalls = 4;
  return { colliders, cameraOccluders };
}

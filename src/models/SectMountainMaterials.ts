import * as THREE from 'three';

/** Original WebGL implementation of the LAAS reference's material principles:
 * world-space detail at several scales, slope-dependent ground cover, subdued
 * sediment/lichen, and separate roughness for stone, vegetation and worn dirt.
 * Reference: Braffolk/fable5-world-demo, fd75fdb718996908aad3d22b59dfa297dc94298d.
 * Geometry and the game's material system are deliberately independent.
 */
const ATLAS_SIZE = 512, NOISE_PERIOD = 64;

function lattice(x: number, y: number): number {
  const px = ((x % NOISE_PERIOD) + NOISE_PERIOD) % NOISE_PERIOD;
  const py = ((y % NOISE_PERIOD) + NOISE_PERIOD) % NOISE_PERIOD;
  let value = Math.imul(px + 53, 374761393) ^ Math.imul(py + 97, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}
function field(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(lattice(ix, iy), lattice(ix + 1, iy), u),
    THREE.MathUtils.lerp(lattice(ix, iy + 1), lattice(ix + 1, iy + 1), u), v);
}
function detailAtlas(): THREE.DataTexture {
  const pixels = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
  for (let y = 0; y < ATLAS_SIZE; y++) for (let x = 0; x < ATLAS_SIZE; x++) {
    const u = x / ATLAS_SIZE * NOISE_PERIOD, v = y / ATLAS_SIZE * NOISE_PERIOD;
    const coarse = field(u, v), medium = field(u * 2 + 17, v * 2 + 31), fine = field(u * 4 + 43, v * 4 + 7);
    const index = (y * ATLAS_SIZE + x) * 4;
    pixels[index] = Math.round((coarse * .57 + medium * .28 + fine * .15) * 255);
    pixels[index + 1] = Math.round((1 - Math.abs(coarse * 2 - 1)) * 255);
    pixels[index + 2] = Math.round(fine * 255);
    pixels[index + 3] = 255;
  }
  const atlas = new THREE.DataTexture(pixels, ATLAS_SIZE, ATLAS_SIZE);
  atlas.name = 'mountain-periodic-multiscale-detail';
  atlas.wrapS = atlas.wrapT = THREE.RepeatWrapping;
  atlas.minFilter = THREE.LinearMipmapLinearFilter; atlas.magFilter = THREE.LinearFilter;
  atlas.generateMipmaps = true; atlas.colorSpace = THREE.NoColorSpace; atlas.needsUpdate = true;
  return atlas;
}

const shaderFunctions = /* glsl */`
uniform sampler2D uMountainDetail;
varying vec3 vMountainPosition;
varying vec3 vMountainNormal;
#if MOUNTAIN_ROLE == 2
varying float vPavingBlend;
#endif

vec4 mountainNoise(vec3 p, float size, vec3 weights) {
  vec3 q = p / (size * 64.0);
  return texture2D(uMountainDetail, q.yz) * weights.x
       + texture2D(uMountainDetail, q.xz) * weights.y
       + texture2D(uMountainDetail, q.xy) * weights.z;
}

// Surface gradient perturbation uses world-scale heights and view-space
// derivatives; it avoids tangent/UV seams and also supports flat-shaded crags.
vec3 mountainNormal(vec3 viewPoint, vec3 baseNormal, float height) {
  vec3 dx = dFdx(viewPoint), dy = dFdy(viewPoint);
  vec3 sx = cross(dy, baseNormal), sy = cross(baseNormal, dx);
  float determinant = dot(dx, sx);
  vec3 gradient = sx * dFdx(height) + sy * dFdy(height);
  return normalize(abs(determinant) * baseNormal - sign(determinant) * gradient);
}
`;

const surfaceShader = /* glsl */`
vec3 mountainN = normalize(vMountainNormal);
vec3 projectionWeight = pow(abs(mountainN), vec3(4.0));
projectionWeight /= max(dot(projectionWeight, vec3(1.0)), 0.0001);
float upness = max(mountainN.y, 0.0);
vec3 p = vMountainPosition;
vec4 macroNoise = mountainNoise(p, 18.0, projectionWeight);
vec4 patchNoise = mountainNoise(p + vec3(21.3, 4.7, -13.8), 3.6, projectionWeight);
vec4 mesoNoise = mountainNoise(p, 0.95, projectionWeight);
vec4 microNoise = mountainNoise(p + vec3(7.1, 3.4, -2.6), 0.14, projectionWeight);
float detailFade = 1.0 - smoothstep(160.0, 440.0, distance(cameraPosition, p));
float microFade = 1.0 - smoothstep(65.0, 210.0, distance(cameraPosition, p));

// Broken, low-contrast strata: no regular sine bands and no UV stretching.
float strata = texture2D(uMountainDetail,
  vec2(p.y / 290.0 + macroNoise.r * 0.09 + patchNoise.r * 0.025,
       p.x / 2400.0 + p.z / 3500.0 + 0.31)).r;
vec3 rockColor = mix(vec3(0.22, 0.215, 0.195), vec3(0.36, 0.345, 0.31), strata);
float fissures = smoothstep(0.74, 0.92, mesoNoise.g) * smoothstep(0.32, 0.7, microNoise.r)
  * (1.0 - smoothstep(0.35, 0.84, upness));
rockColor *= 1.0 - fissures * 0.2;
rockColor = mix(rockColor, vec3(0.24, 0.185, 0.13), smoothstep(0.63, 0.83, patchNoise.r) * 0.19);
float lichen = smoothstep(0.58, 0.77, patchNoise.g) * smoothstep(0.51, 0.72, mesoNoise.r);
rockColor = mix(rockColor, vec3(0.31, 0.335, 0.235), lichen * 0.34);
rockColor *= 0.87 + mesoNoise.r * 0.23;

float dryness = smoothstep(0.47, 0.75, patchNoise.r * 0.7 + macroNoise.r * 0.3);
vec3 grassColor = mix(vec3(0.055, 0.105, 0.028), vec3(0.17, 0.165, 0.065), dryness);
grassColor *= (0.76 + mesoNoise.g * 0.43) * (0.93 + microNoise.r * 0.14);
vec3 mossColor = mix(vec3(0.075, 0.125, 0.038), vec3(0.15, 0.20, 0.07), mesoNoise.r);
vec3 soilColor = mix(vec3(0.145, 0.11, 0.075), vec3(0.255, 0.21, 0.145), mesoNoise.r);
float vegetation = smoothstep(0.38, 0.79, upness)
  * (0.62 + 0.38 * smoothstep(0.16, 0.58, patchNoise.r + macroNoise.r * 0.23));
float moss = smoothstep(0.62, 0.94, upness) * smoothstep(0.43, 0.7, patchNoise.r);
vec3 surfaceColor;
float surfaceRoughness;
float surfaceHeight;

#if MOUNTAIN_ROLE == 0
  // Ground cover opens naturally into soil patches and exposed bedrock.
  vec3 meadow = mix(soilColor, grassColor, smoothstep(0.29, 0.57, patchNoise.g));
  surfaceColor = mix(rockColor, meadow, vegetation);
  surfaceColor = mix(surfaceColor, mossColor, moss * 0.18);
  surfaceRoughness = mix(0.82, 0.97, vegetation);
  surfaceHeight = mix(0.15, 0.045, vegetation) * (mesoNoise.r + (1.0 - mesoNoise.g) * 0.1);
#elif MOUNTAIN_ROLE == 1
  // Pale warm-gray rock; moss settles on crowns, lichen also marks side faces.
  surfaceColor = mix(rockColor, mossColor, moss * 0.55);
  surfaceRoughness = mix(0.83, 0.98, moss);
  surfaceHeight = (mesoNoise.r * 0.17 + (1.0 - mesoNoise.g) * 0.025);
#else
  // Worn earth and mixed gravel replace the uniformly pale ribbon.
  vec3 gravelColor = mix(vec3(0.23, 0.185, 0.13), vec3(0.36, 0.30, 0.225), mesoNoise.r);
  float pebbles = smoothstep(0.72, 0.88, microNoise.b);
  surfaceColor = mix(soilColor * 1.2, gravelColor, 0.68);
  surfaceColor = mix(surfaceColor, vec3(0.43, 0.405, 0.345), pebbles * 0.23 * microFade);
  surfaceColor = mix(mix(grassColor, soilColor, 0.4), surfaceColor, smoothstep(0.0, 0.95, vPavingBlend));
  surfaceRoughness = 0.94;
  surfaceHeight = mesoNoise.r * 0.045;
#endif
surfaceColor *= 0.91 + macroNoise.r * 0.17;
// Damp pockets are subdued, with a modest roughness change, never metallic.
float damp = smoothstep(0.64, 0.81, patchNoise.r) * (1.0 - upness) * 0.18;
surfaceColor *= 1.0 - damp;
surfaceRoughness -= damp * 0.25;
surfaceHeight = surfaceHeight * detailFade + microNoise.r * 0.014 * microFade;
diffuseColor.rgb = surfaceColor;
`;

export function createSectMountainMaterials() {
  const atlas = detailAtlas();
  function material(role: 0 | 1 | 2, name: string, flatShading: boolean) {
    const result = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .93, metalness: 0, flatShading });
    result.name = name;
    result.onBeforeCompile = shader => {
      shader.uniforms.uMountainDetail = { value: atlas };
      const pathVertex = role === 2 ? 'attribute float pavingBlend;\nvarying float vPavingBlend;\n' : '';
      shader.vertexShader = `varying vec3 vMountainPosition;\nvarying vec3 vMountainNormal;\n${pathVertex}` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <defaultnormal_vertex>',
        '#include <defaultnormal_vertex>\nvMountainNormal = inverseTransformDirection(transformedNormal, viewMatrix);');
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>',
        `#include <project_vertex>\nvMountainPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;${role === 2 ? '\nvPavingBlend = pavingBlend;' : ''}`);
      shader.fragmentShader = `#define MOUNTAIN_ROLE ${role}\n${shaderFunctions}\n` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${surfaceShader}`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = clamp(surfaceRoughness, 0.6, 1.0);');
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\nnormal = mountainNormal(-vViewPosition, normal, surfaceHeight);');
    };
    result.customProgramCacheKey = () => `sect-mountain-laas-v1-role-${role}`;
    return result;
  }
  const stone = material(1, 'laas-weathered-stone', true), earth = material(0, 'laas-meadow-soil-bedrock', false);
  const path = material(2, 'laas-worn-earth-and-gravel', false);
  return {
    stone, earth, path,
    dispose() { stone.dispose(); earth.dispose(); path.dispose(); atlas.dispose(); },
  };
}

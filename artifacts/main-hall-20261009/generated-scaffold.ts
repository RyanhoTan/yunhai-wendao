import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ProceduralModelOptions = {
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  textureSize?: number;
  textureAnisotropy?: number;
  qualityPriority?: 'reference-fidelity' | 'balanced';
};

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, unknown>;
  destructionGroups: Record<string, THREE.Object3D[]>;
};

type SculptMaterialSpec = Record<string, any>;

// bevelEnabled defaults to true on THREE.ExtrudeGeometry and rounds every
// corner — sharp/pointed profiles (blades, fork tines, spikes) need
// bevelEnabled: false plus lineTo()-only path segments near the tip, since a
// curve command cannot produce a true converging point.
function buildExtrudeShape(points: [number, number][], holes?: [number, number][][]): THREE.Shape {
  const shape = new THREE.Shape();
  if (points.length > 0) {
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) {
      shape.lineTo(points[i][0], points[i][1]);
    }
  }
  // Cutouts (e.g. an oval wire-cutter hole) as THREE.Path added to shape.holes —
  // dep-free boolean subtraction via the tessellator, no CSG library needed.
  for (const loop of holes ?? []) {
    if (loop.length < 3) continue;
    const path = new THREE.Path();
    path.moveTo(loop[0][0], loop[0][1]);
    for (let i = 1; i < loop.length; i += 1) path.lineTo(loop[i][0], loop[i][1]);
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}

// Build an N-gon oval loop (for hole authoring from a compact {cx,cy,rx,ry} descriptor).
function ovalLoop(cx: number, cy: number, rx: number, ry: number, seg = 24): [number, number][] {
  const loop: [number, number][] = [];
  for (let i = 0; i < seg; i += 1) {
    const a = (i / seg) * Math.PI * 2;
    loop.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return loop;
}

function buildExtrudeGeometry(profile: { points: [number, number][]; depth: number; holes?: [number, number][][]; ovalHoles?: { cx: number; cy: number; rx: number; ry: number }[] }): THREE.ExtrudeGeometry {
  const holes = [...(profile.holes ?? []), ...((profile.ovalHoles ?? []).map((o) => ovalLoop(o.cx, o.cy, o.rx, o.ry)))];
  const shape = buildExtrudeShape(profile.points, holes);
  return new THREE.ExtrudeGeometry(shape, {
    depth: profile.depth,
    bevelEnabled: false,
    steps: 1,
  });
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readLayerNumber(value: unknown, keys: string[], fallback: number): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (typeof record[key] === 'number') return record[key] as number;
    }
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{3}$/i.test(hex)
    ? '#' + hex.slice(1).split('').map((part) => part + part).join('')
    : hex;
  const value = /^#[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized.slice(1), 16) : 0x8a7a5f;
  return [clampAlbedoChannel((value >> 16) & 255), clampAlbedoChannel((value >> 8) & 255), clampAlbedoChannel(value & 255)];
}

function materialPalette(spec: SculptMaterialSpec): string[] {
  const palette = spec.colorVariation?.palette;
  if (Array.isArray(palette) && palette.length > 0) return palette.filter((value) => typeof value === 'string');
  const secondary = spec.albedo?.secondary;
  const colors = [spec.baseColor ?? spec.color ?? spec.albedo?.dominant, ...(Array.isArray(secondary) ? secondary : [])];
  return colors.filter((value): value is string => typeof value === 'string' && value.startsWith('#'));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampAlbedoChannel(value: number): number {
  return Math.max(30, Math.min(240, Math.round(value)));
}

function clampPbrF0(value: number): number {
  return Math.max(0.02, Math.min(1, value));
}

function clampPbrIor(value: number): number {
  return Math.max(1, Math.min(2.5, value));
}

function clampPbrMetalness(value: number): number {
  return value >= 0.5 ? 1 : 0;
}

function clampedAlbedoColor(spec: SculptMaterialSpec): THREE.Color {
  const source = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  // setStyle with an explicit SRGBColorSpace, NOT the numeric constructor.
  //
  // `new THREE.Color(r, g, b)` treats its arguments as LINEAR working-space components,
  // while an authored `baseColor` hex is sRGB. Feeding one to the other skipped the
  // transfer function and lifted every dark albedo: #2e2a28, authored as a near-black
  // vinyl, rendered at roughly sRGB 0.46 — a mid grey. The error is largest exactly where
  // it matters most, because the transfer curve is steepest near black.
  return new THREE.Color().setStyle(source, THREE.SRGBColorSpace);
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function periodicHash(x: number, y: number, seed: number, periodX: number, periodY: number): number {
  const wrappedX = ((x % periodX) + periodX) % periodX;
  const wrappedY = ((y % periodY) + periodY) % periodY;
  let value = Math.imul(wrappedX + seed * 17, 374761393) ^ Math.imul(wrappedY + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function periodicValueNoise(u: number, v: number, seed: number, periodX: number, periodY: number): number {
  const x = u * periodX;
  const y = v * periodY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothCurve(x - x0);
  const ty = smoothCurve(y - y0);
  const a = periodicHash(x0, y0, seed, periodX, periodY);
  const b = periodicHash(x0 + 1, y0, seed, periodX, periodY);
  const c = periodicHash(x0, y0 + 1, seed, periodX, periodY);
  const d = periodicHash(x0 + 1, y0 + 1, seed, periodX, periodY);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

type SurfaceBand = {
  frequency: number;
  amplitude: number;
  stretchX: number;
  stretchY: number;
  ridge: boolean;
};

function surfaceBands(spec: SculptMaterialSpec): SurfaceBand[] {
  const source = Array.isArray(spec.surfaceFrequencyBands) ? spec.surfaceFrequencyBands : [];
  const parsed = source.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const band = item as Record<string, unknown>;
    const frequency = typeof band.frequency === 'number' ? band.frequency : 0;
    const amplitude = typeof band.amplitude === 'number' ? band.amplitude : 0;
    if (frequency <= 0 || amplitude <= 0) return [];
    const stretch = Array.isArray(band.stretch) ? band.stretch : [1, 1];
    const description = `${String(band.pattern ?? '')} ${String(band.role ?? '')}`.toLowerCase();
    return [{
      frequency,
      amplitude,
      stretchX: typeof stretch[0] === 'number' ? Math.max(0.1, stretch[0]) : 1,
      stretchY: typeof stretch[1] === 'number' ? Math.max(0.1, stretch[1]) : 1,
      ridge: /(ridge|groove|grain|fiber|striated|crack)/.test(description),
    }];
  });
  return parsed.length > 0 ? parsed : [
    { frequency: 2, amplitude: 0.42, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 12, amplitude: 0.22, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 56, amplitude: 0.08, stretchX: 1, stretchY: 1, ridge: false },
  ];
}

function sampleSurface(u: number, v: number, bands: SurfaceBand[], seed: number): number {
  let value = 0;
  let weight = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const periodX = Math.max(1, Math.round(band.frequency * band.stretchX));
    const periodY = Math.max(1, Math.round(band.frequency * band.stretchY));
    let sample = periodicValueNoise(u, v, seed + index * 1013, periodX, periodY);
    if (band.ridge) sample = 1 - Math.abs(sample * 2 - 1);
    value += sample * band.amplitude;
    weight += band.amplitude;
  }
  return weight > 0 ? clamp01(value / weight) : 0.5;
}

function mixPalette(colors: [number, number, number][], value: number): [number, number, number] {
  if (colors.length === 1) return colors[0];
  const scaled = clamp01(value) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const a = colors[index];
  const b = colors[index + 1];
  return [
    Math.round(THREE.MathUtils.lerp(a[0], b[0], mix)),
    Math.round(THREE.MathUtils.lerp(a[1], b[1], mix)),
    Math.round(THREE.MathUtils.lerp(a[2], b[2], mix)),
  ];
}

type ColorGradientStop = { offset: number; color: string };
type ColorGradientSpec = {
  type: 'linear' | 'radial';
  axis: [number, number];
  stops: ColorGradientStop[];
};

function parseRgba(value: string): [number, number, number] {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (!match) return [138, 122, 95];
  return [clampAlbedoChannel(Number(match[1])), clampAlbedoChannel(Number(match[2])), clampAlbedoChannel(Number(match[3]))];
}

// Analytical per-pixel gradient sample. The extraction schema's colorGradient carries
// exact rgba(...) stop colors (see extract_part_color_recipe.py), so this samples the
// same trend directly in JS math rather than round-tripping through a Canvas 2D
// createLinearGradient/createRadialGradient object — same visual result, and it composes
// directly with the existing noise/height-correlated colorVariation blend below.
function sampleColorGradient(gradient: ColorGradientSpec, u: number, v: number): [number, number, number] {
  const stops = gradient.stops.length >= 2 ? gradient.stops : [{ offset: 0, color: 'rgba(138,122,95,1)' }, { offset: 1, color: 'rgba(138,122,95,1)' }];
  let t: number;
  if (gradient.type === 'radial') {
    const [cx, cy] = gradient.axis;
    const dx = u - cx;
    const dy = v - cy;
    const maxRadius = Math.max(0.001, Math.hypot(Math.max(cx, 1 - cx), Math.max(cy, 1 - cy)));
    t = clamp01(Math.hypot(dx, dy) / maxRadius);
  } else {
    const [ax, ay] = gradient.axis;
    const projection = (u - 0.5) * ax + (v - 0.5) * ay;
    const maxProjection = 0.5 * (Math.abs(ax) + Math.abs(ay)) || 0.5;
    t = clamp01(projection / maxProjection + 0.5);
  }
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.max(0, Math.floor(scaled)));
  const mix = scaled - index;
  const a = parseRgba(stops[index].color);
  const b = parseRgba(stops[index + 1].color);
  return [
    THREE.MathUtils.lerp(a[0], b[0], mix),
    THREE.MathUtils.lerp(a[1], b[1], mix),
    THREE.MathUtils.lerp(a[2], b[2], mix),
  ];
}

function writePixel(data: Uint8ClampedArray, offset: number, red: number, green: number, blue: number): void {
  data[offset] = Math.max(0, Math.min(255, Math.round(red)));
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)));
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)));
  data[offset + 3] = 255;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function createMapTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [2, 2];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 2,
    typeof repeat[1] === 'number' ? repeat[1] : 2,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

type ProceduralTextureSet = {
  albedo: THREE.Texture;
  roughness: THREE.Texture;
  height: THREE.Texture;
  normal: THREE.Texture;
  ao: THREE.Texture;
  source: 'reference-pixel-extraction' | 'procedural';
};

function referenceMapUrl(spec: SculptMaterialSpec, channel: string): string | null {
  const reference = spec.referencePbr;
  if (!reference || typeof reference !== 'object') return null;
  if (reference.usable === false) return null;
  const confidence = typeof reference.confidence === 'number'
    ? reference.confidence
    : (typeof reference.estimatedFidelity === 'number' ? reference.estimatedFidelity : 0);
  const threshold = typeof reference.targetThreshold === 'number' ? reference.targetThreshold : 0.7;
  if (confidence < threshold) return null;
  const maps = reference.maps;
  if (!maps || typeof maps !== 'object') return null;
  const map = (maps as Record<string, unknown>)[channel];
  if (!map || typeof map !== 'object') return null;
  const record = map as Record<string, unknown>;
  const url = typeof record.url === 'string' && record.url.trim() ? record.url : record.path;
  return typeof url === 'string' && url.trim() ? url : null;
}

function createLoadedMapTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [1, 1];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 1,
    typeof repeat[1] === 'number' ? repeat[1] : 1,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

function makeReferenceTextureSet(spec: SculptMaterialSpec, options: ProceduralModelOptions): ProceduralTextureSet | null {
  const albedo = referenceMapUrl(spec, 'albedo');
  const roughness = referenceMapUrl(spec, 'roughness');
  const height = referenceMapUrl(spec, 'height');
  const normal = referenceMapUrl(spec, 'normal');
  const ao = referenceMapUrl(spec, 'ao');
  if (!albedo || !roughness || !height || !normal || !ao) return null;
  return {
    albedo: createLoadedMapTexture(albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createLoadedMapTexture(roughness, THREE.NoColorSpace, spec, options),
    height: createLoadedMapTexture(height, THREE.NoColorSpace, spec, options),
    normal: createLoadedMapTexture(normal, THREE.NoColorSpace, spec, options),
    ao: createLoadedMapTexture(ao, THREE.NoColorSpace, spec, options),
    source: 'reference-pixel-extraction',
  };
}

function makeProceduralTextureSet(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  if (typeof document === 'undefined') return null;
  const qualityFirst = (options.qualityPriority ?? 'reference-fidelity') === 'reference-fidelity';
  const requested = options.textureSize ?? spec.textureResolution;
  const requestedSize = typeof requested === 'number' && Number.isFinite(requested)
    ? requested
    : (qualityFirst ? 1024 : 512);
  const size = Math.max(256, Math.min(2048, 2 ** Math.round(Math.log2(requestedSize))));
  const canvases = {
    albedo: makeCanvas(size),
    roughness: makeCanvas(size),
    height: makeCanvas(size),
    normal: makeCanvas(size),
    ao: makeCanvas(size),
  };
  const contexts = {
    albedo: canvases.albedo.getContext('2d'),
    roughness: canvases.roughness.getContext('2d'),
    height: canvases.height.getContext('2d'),
    normal: canvases.normal.getContext('2d'),
    ao: canvases.ao.getContext('2d'),
  };
  if (!contexts.albedo || !contexts.roughness || !contexts.height || !contexts.normal || !contexts.ao) return null;
  const images = {
    albedo: contexts.albedo.createImageData(size, size),
    roughness: contexts.roughness.createImageData(size, size),
    height: contexts.height.createImageData(size, size),
    normal: contexts.normal.createImageData(size, size),
    ao: contexts.ao.createImageData(size, size),
  };
  const seed = hashString(id);
  const bands = surfaceBands(spec);
  const heightField = new Float32Array(size * size);
  const roughnessField = new Float32Array(size * size);
  const palette = materialPalette(spec);
  const fallback = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  const colors = (palette.length >= 2 ? palette : [fallback, '#6E614B', '#A08F70']).map(hexToRgb);
  const baseRoughness = clamp01(readLayerNumber(spec.roughness, ['base'], 0.76));
  const roughnessVariation = clamp01(readLayerNumber(spec.roughness, ['variation'], 0.18));
  const colorAmplitude = clamp01(readLayerNumber(spec.colorVariation, ['amplitude', 'variation'], 0.18));
  const heightCorrelation = clamp01(readLayerNumber(spec.colorVariation, ['heightCorrelation'], 0.3));
  const colorGradient: ColorGradientSpec | undefined = spec.colorGradient;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const index = y * size + x;
      const height = sampleSurface(u, v, bands, seed + 101);
      const roughNoise = sampleSurface(u, v, bands, seed + 7001);
      const colorNoise = sampleSurface(u, v, bands, seed + 15013);
      heightField[index] = height;
      roughnessField[index] = clamp01(baseRoughness + (roughNoise - 0.5) * roughnessVariation * 2);
      let color: [number, number, number];
      if (colorGradient) {
        // Evidence-derived spatial gradient (Plan 1.3 Workstream C) takes priority
        // over the noise-based palette blend below — it is a measured trend, not a guess.
        color = sampleColorGradient(colorGradient, u, v);
      } else {
        const paletteValue = clamp01(
          0.5 + (colorNoise - 0.5) * colorAmplitude * 2 + (height - 0.5) * heightCorrelation
        );
        color = mixPalette(colors, paletteValue);
      }
      writePixel(images.albedo.data, index * 4, color[0], color[1], color[2]);
    }
  }
  const normalStrength = Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35));
  const aoStrength = clamp01(readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35));
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const index = y * size + x;
      const center = heightField[index];
      const dx = (heightField[y * size + right] - heightField[y * size + left]) * normalStrength * 6;
      const dy = (heightField[down + x] - heightField[up + x]) * normalStrength * 6;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const normalX = -dx * inverseLength;
      const normalY = -dy * inverseLength;
      const normalZ = inverseLength;
      const neighborAverage = (
        heightField[y * size + left] + heightField[y * size + right]
        + heightField[up + x] + heightField[down + x]
      ) * 0.25;
      const cavity = Math.max(0, neighborAverage - center);
      const ao = clamp01(1 - aoStrength * (cavity * 12 + (1 - center) * 0.16));
      const offset = index * 4;
      const heightByte = center * 255;
      const roughnessByte = roughnessField[index] * 255;
      writePixel(images.height.data, offset, heightByte, heightByte, heightByte);
      writePixel(images.roughness.data, offset, roughnessByte, roughnessByte, roughnessByte);
      writePixel(
        images.normal.data, offset,
        (normalX * 0.5 + 0.5) * 255,
        (normalY * 0.5 + 0.5) * 255,
        (normalZ * 0.5 + 0.5) * 255,
      );
      writePixel(images.ao.data, offset, ao * 255, ao * 255, ao * 255);
    }
  }
  contexts.albedo.putImageData(images.albedo, 0, 0);
  contexts.roughness.putImageData(images.roughness, 0, 0);
  contexts.height.putImageData(images.height, 0, 0);
  contexts.normal.putImageData(images.normal, 0, 0);
  contexts.ao.putImageData(images.ao, 0, 0);
  return {
    albedo: createMapTexture(canvases.albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createMapTexture(canvases.roughness, THREE.NoColorSpace, spec, options),
    height: createMapTexture(canvases.height, THREE.NoColorSpace, spec, options),
    normal: createMapTexture(canvases.normal, THREE.NoColorSpace, spec, options),
    ao: createMapTexture(canvases.ao, THREE.NoColorSpace, spec, options),
    source: 'procedural',
  };
}

function createSculptMaterial(id: string, spec: SculptMaterialSpec, options: ProceduralModelOptions, denseComponent = false): THREE.MeshPhysicalMaterial {
  // A material that declares -- with evidence -- that its subject carries no texture
  // detail gets NO texture set. Synthesising one anyway is not a harmless default: the
  // branch below then forces color to white and roughness to 1 and reads both from the
  // generated maps, so the authored albedo and the reference-derived roughness are both
  // discarded, and the model gains mottling the reference does not have. Measured on the
  // tuxedo cat, whose black fur rendered as speckled grey-and-white from a palette that
  // only ever described two flat regions.
  const textureless = (spec.textureless as { declared?: boolean } | undefined)?.declared === true;
  const textures = textureless
    ? null
    : makeReferenceTextureSet(spec, options) ?? makeProceduralTextureSet(id, spec, options);
  const material = new THREE.MeshPhysicalMaterial({
    color: textures ? 0xffffff : clampedAlbedoColor(spec),
    roughness: textures ? 1 : clamp01(readLayerNumber(spec.roughness, ['base'], 0.76)),
    metalness: clampPbrMetalness(readLayerNumber(spec.metalness, ['base'], 0.0)),
    clearcoat: clamp01(readLayerNumber(spec.clearcoat, ['base', 'amount'], 0)),
    clearcoatRoughness: clamp01(readLayerNumber(spec.clearcoatRoughness, ['base'], 0.25)),
    transmission: clamp01(readLayerNumber(spec.transmission, ['base', 'amount'], 0)),
    ior: clampPbrIor(readLayerNumber(spec.ior, ['base', 'value'], 1.5)),
    thickness: Math.max(0, readLayerNumber(spec.thickness, ['base', 'amount'], 0)),
    attenuationDistance: Math.max(0.001, readLayerNumber(spec.attenuationDistance, ['base', 'value'], Infinity)),
    attenuationColor: new THREE.Color(typeof spec.attenuationColor === 'string' ? spec.attenuationColor : '#ffffff'),
    sheen: clamp01(readLayerNumber(spec.sheen, ['base', 'amount'], 0)),
    sheenColor: new THREE.Color(typeof spec.sheenColor === 'string' ? spec.sheenColor : '#ffffff'),
    sheenRoughness: clamp01(readLayerNumber(spec.sheenRoughness, ['base'], 1.0)),
    iridescence: clamp01(readLayerNumber(spec.iridescence, ['base', 'amount'], 0)),
    iridescenceIOR: clampPbrIor(readLayerNumber(spec.iridescenceIOR, ['base', 'value'], 1.3)),
    anisotropy: clamp01(readLayerNumber(spec.anisotropy, ['base', 'amount'], 0)),
    anisotropyRotation: readLayerNumber(spec.anisotropy, ['rotation'], 0),
    specularIntensity: clampPbrF0(readLayerNumber(spec.specularF0 ?? spec.f0 ?? spec.specularIntensity, ['base', 'value'], 1.0)),
    specularColor: new THREE.Color(typeof spec.specularColor === 'string' ? spec.specularColor : '#ffffff'),
    emissive: new THREE.Color(typeof spec.emissive === 'string' ? spec.emissive : '#000000'),
    emissiveIntensity: Math.max(0, readLayerNumber(spec.emissiveIntensity, ['base'], 1.0)),
    opacity: clamp01(readLayerNumber(spec.opacity, ['base'], 1)),
    transparent: readLayerNumber(spec.transmission, ['base', 'amount'], 0) > 0 || readLayerNumber(spec.opacity, ['base'], 1) < 1,
    alphaTest: Math.max(0, readLayerNumber(spec.alpha, ['cutoff', 'alphaTest'], 0)),
    wireframe: options.wireframe ?? false,
    side: spec.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide,
    flatShading: spec.flatShading === true,
  });
  if (textures) {
    material.map = textures.albedo;
    material.roughnessMap = textures.roughness;
    material.normalMap = textures.normal;
    material.normalScale.setScalar(Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35)));
    material.aoMap = textures.ao;
    material.aoMap.channel = 0;
    material.aoMapIntensity = readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35);
    const denseMesh = denseComponent || spec.denseMesh === true || spec.geometryDensity === 'dense' || spec.topologyClass === 'dense';
    const bumpScale = Math.max(0, readLayerNumber(spec.bump, ['amplitude', 'strength'], 0));
    const effectiveBumpScale = denseMesh ? Math.max(0.05, bumpScale) : bumpScale;
    if (effectiveBumpScale > 0) {
      material.bumpMap = textures.height;
      material.bumpScale = effectiveBumpScale;
    }
    const displacementScale = Math.max(0, readLayerNumber(spec.displacement, ['amplitude', 'strength'], 0));
    const effectiveDisplacementScale = denseMesh ? Math.max(0.005, displacementScale) : displacementScale;
    if (effectiveDisplacementScale > 0) {
      material.displacementMap = textures.height;
      material.displacementScale = effectiveDisplacementScale;
      material.displacementBias = -effectiveDisplacementScale * 0.5;
    }
  }
  material.envMapIntensity = readLayerNumber(spec, ['envMapIntensity'], 0.8);
  material.userData.sculptMaterial = spec;
  material.userData.proceduralMapsIndependent = true;
  material.userData.pbrConstraints = { albedoRange: [30, 240], binaryMetalness: true, f0Range: [0.02, 1], iorRange: [1, 2.5] };
  material.userData.pbrTextureSource = textures?.source ?? 'flat-fallback';
  material.userData.referencePbr = spec.referencePbr ?? null;
  material.userData.referenceMaterialId = spec.referenceMaterialId ?? spec.materialReference?.profileId ?? null;
  material.userData.materialEvidence = spec.materialEvidence ?? null;
  material.userData.validationViews = spec.materialReference?.validationViews ?? [];
  material.needsUpdate = true;
  return material;
}

type AttachmentEndpoint = {
  start: THREE.Vector3;
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  baseRadius: number;
  endRadius: number;
};

function readVector3(value: unknown, fallback: [number, number, number]): THREE.Vector3 {
  if (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number')) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeAttachmentEndpoint(attachment: unknown): AttachmentEndpoint | null {
  if (!attachment || typeof attachment !== 'object') return null;
  const record = attachment as Record<string, unknown>;
  const start = readVector3(record.localStart, [0, 0, 0]);
  const end = readVector3(record.localEnd, [0, 1, 0]);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length <= 0.0001) return null;
  const direction = delta.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const baseRadius = Math.max(0.005, readNumber(record.baseRadius, 0.06));
  const endRadius = Math.max(0.003, readNumber(record.endRadius, baseRadius * 0.55));
  return {
    start,
    midpoint: delta.multiplyScalar(0.5),
    quaternion,
    length,
    baseRadius,
    endRadius,
  };
}

// Generated from ObjectSculptSpec target: Yunlan Main Hall
// Sculpt build pass: blockout
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createYunlanMainHallModel(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = "Yunlan Main Hall";
  root.userData.reconstructionEvidence = {"itemFamily": null, "subtype": null, "componentAdapter": null, "route": null, "exactnessTier": null, "referenceCamera": {"solved": true, "fovDegrees": 40.0, "aspect": 1.6929637526652452, "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}, "positionHint": [0, 8, 55], "note": "Near-orthographic elevations; camera target y=8. Use supplied front crop."}, "approximationNotes": []};
  root.userData.materialPipeline = {};
  root.userData.materialReferenceRegistry = null;

  const materialMap: Record<string, THREE.Material> = {};
  materialMap["stone"] = createSculptMaterial(
    "stone",
    {"id": "stone", "name": "stone", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#aaa9a0", "color": "#aaa9a0", "albedo": {"dominant": "#aaa9a0", "secondary": ["#aaa9a0"], "samplingNotes": "Palette inferred from the illustrated elevations, not inverse-rendered PBR."}, "colorVariation": {"palette": ["#aaa9a0"], "pattern": "subtle-grain", "amplitude": 0.03, "heightCorrelation": 0}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.42, "role": "broad color and height breakup"}, {"id": "meso", "frequency": 12.0, "amplitude": 0.22, "role": "ridges, pores, grain, dents, or equivalent visible relief"}, {"id": "micro", "frequency": 56.0, "amplitude": 0.08, "role": "highlight breakup visible under grazing light"}], "roughness": {"base": 0.94, "variation": 0.04}, "metalness": {"base": 0, "variation": 0}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.35, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "stone-cavity", "pattern": "joint-relief", "roughnessOffset": 0.04, "evidenceRefs": ["full-object"]}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Illustrated source has no recoverable physical PBR channels; scalars are explicit approximation, structural relief is geometry."},
    options
  );
  materialMap["wood"] = createSculptMaterial(
    "wood",
    {"id": "wood", "name": "wood", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#853d2d", "color": "#853d2d", "albedo": {"dominant": "#853d2d", "secondary": ["#853d2d"], "samplingNotes": "Palette inferred from the illustrated elevations, not inverse-rendered PBR."}, "colorVariation": {"palette": ["#853d2d"], "pattern": "subtle-grain", "amplitude": 0.03, "heightCorrelation": 0}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.42, "role": "broad color and height breakup"}, {"id": "meso", "frequency": 12.0, "amplitude": 0.22, "role": "ridges, pores, grain, dents, or equivalent visible relief"}, {"id": "micro", "frequency": 56.0, "amplitude": 0.08, "role": "highlight breakup visible under grazing light"}], "roughness": {"base": 0.6, "variation": 0.04}, "metalness": {"base": 0, "variation": 0}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.35, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "wood-cavity", "pattern": "joint-relief", "roughnessOffset": 0.04, "evidenceRefs": ["full-object"]}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Illustrated source has no recoverable physical PBR channels; scalars are explicit approximation, structural relief is geometry."},
    options
  );
  materialMap["roof"] = createSculptMaterial(
    "roof",
    {"id": "roof", "name": "roof", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#275e5b", "color": "#275e5b", "albedo": {"dominant": "#275e5b", "secondary": ["#275e5b"], "samplingNotes": "Palette inferred from the illustrated elevations, not inverse-rendered PBR."}, "colorVariation": {"palette": ["#275e5b"], "pattern": "subtle-grain", "amplitude": 0.03, "heightCorrelation": 0}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.42, "role": "broad color and height breakup"}, {"id": "meso", "frequency": 12.0, "amplitude": 0.22, "role": "ridges, pores, grain, dents, or equivalent visible relief"}, {"id": "micro", "frequency": 56.0, "amplitude": 0.08, "role": "highlight breakup visible under grazing light"}], "roughness": {"base": 0.4, "variation": 0.04}, "metalness": {"base": 0, "variation": 0}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.35, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "roof-cavity", "pattern": "joint-relief", "roughnessOffset": 0.04, "evidenceRefs": ["full-object"]}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Illustrated source has no recoverable physical PBR channels; scalars are explicit approximation, structural relief is geometry."},
    options
  );
  materialMap["ivory"] = createSculptMaterial(
    "ivory",
    {"id": "ivory", "name": "ivory", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#e5d7b9", "color": "#e5d7b9", "albedo": {"dominant": "#e5d7b9", "secondary": ["#e5d7b9"], "samplingNotes": "Palette inferred from the illustrated elevations, not inverse-rendered PBR."}, "colorVariation": {"palette": ["#e5d7b9"], "pattern": "subtle-grain", "amplitude": 0.03, "heightCorrelation": 0}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.42, "role": "broad color and height breakup"}, {"id": "meso", "frequency": 12.0, "amplitude": 0.22, "role": "ridges, pores, grain, dents, or equivalent visible relief"}, {"id": "micro", "frequency": 56.0, "amplitude": 0.08, "role": "highlight breakup visible under grazing light"}], "roughness": {"base": 0.9, "variation": 0.04}, "metalness": {"base": 0, "variation": 0}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.35, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "ivory-cavity", "pattern": "joint-relief", "roughnessOffset": 0.04, "evidenceRefs": ["full-object"]}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Illustrated source has no recoverable physical PBR channels; scalars are explicit approximation, structural relief is geometry."},
    options
  );
  materialMap["gold"] = createSculptMaterial(
    "gold",
    {"id": "gold", "name": "gold", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#c4a15c", "color": "#c4a15c", "albedo": {"dominant": "#c4a15c", "secondary": ["#c4a15c"], "samplingNotes": "Palette inferred from the illustrated elevations, not inverse-rendered PBR."}, "colorVariation": {"palette": ["#c4a15c"], "pattern": "subtle-grain", "amplitude": 0.03, "heightCorrelation": 0}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.42, "role": "broad color and height breakup"}, {"id": "meso", "frequency": 12.0, "amplitude": 0.22, "role": "ridges, pores, grain, dents, or equivalent visible relief"}, {"id": "micro", "frequency": 56.0, "amplitude": 0.08, "role": "highlight breakup visible under grazing light"}], "roughness": {"base": 0.34, "variation": 0.04}, "metalness": {"base": 0.72, "variation": 0}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.35, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "gold-cavity", "pattern": "joint-relief", "roughnessOffset": 0.04, "evidenceRefs": ["full-object"]}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Illustrated source has no recoverable physical PBR channels; scalars are explicit approximation, structural relief is geometry."},
    options
  );

  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = {};

  const endpoint_root_0 = makeAttachmentEndpoint(null);
  const node_root_0 = new THREE.Group();
  node_root_0.name = "MainHall__pivot";
  node_root_0.scale.set(1, 1, 1);
  if (endpoint_root_0) {
    node_root_0.position.copy(endpoint_root_0.start);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_root_0.position.set(0.0, 0.0, 0.0);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  }
  node_root_0.userData.sculptComponent = {"id": "root", "name": "MainHall", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.5, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Placeholder root blockout; reclassify per Workstream A's decision tree (grimoire/intake/surface_topology.md) once real geometry is authored.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": null, "attachment": null, "dimensions": {"width": 27, "height": 16, "depth": 25, "units": "metres", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "stone", "materialLayers": ["stone"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(170, 169, 160, 1)", "secondaryAlbedo": "rgba(170, 169, 160, 1)", "materialClass": "stone", "materialClassConfidence": 0.85}};
  node_root_0.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_root_0);
  nodes["root"] = node_root_0;
  const mesh_root_0Geometry = endpoint_root_0
    ? new THREE.CylinderGeometry(endpoint_root_0.endRadius, endpoint_root_0.baseRadius, endpoint_root_0.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_root_0) {
    mesh_root_0Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_root_0 = new THREE.Mesh(
    mesh_root_0Geometry,
    materialMap["stone"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_root_0.name = "MainHall";
  if (endpoint_root_0) {
    mesh_root_0.position.copy(endpoint_root_0.midpoint);
    mesh_root_0.quaternion.copy(endpoint_root_0.quaternion);
  }
  mesh_root_0.castShadow = options.castShadow ?? true;
  mesh_root_0.receiveShadow = options.receiveShadow ?? true;
  mesh_root_0.userData.sculptComponent = {"id": "root", "name": "MainHall", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.5, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Placeholder root blockout; reclassify per Workstream A's decision tree (grimoire/intake/surface_topology.md) once real geometry is authored.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": null, "attachment": null, "dimensions": {"width": 27, "height": 16, "depth": 25, "units": "metres", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "stone", "materialLayers": ["stone"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(170, 169, 160, 1)", "secondaryAlbedo": "rgba(170, 169, 160, 1)", "materialClass": "stone", "materialClassConfidence": 0.85}};
  node_root_0.add(mesh_root_0);
  meshes["root"] = mesh_root_0;
  colliders["root"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_root_0);
  const socket_root_foundation_anchor_0 = new THREE.Object3D();
  socket_root_foundation_anchor_0.name = "foundation-anchor";
  socket_root_foundation_anchor_0.position.set(0.0, 0.65, 0.0);
  socket_root_foundation_anchor_0.rotation.set(0.0, 0.0, 0.0);
  socket_root_foundation_anchor_0.userData.socket = {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_foundation_anchor_0);
  sockets["root:foundation-anchor"] = socket_root_foundation_anchor_0;
  const socket_root_stairs_anchor_1 = new THREE.Object3D();
  socket_root_stairs_anchor_1.name = "stairs-anchor";
  socket_root_stairs_anchor_1.position.set(0.0, 0.6, 11.5);
  socket_root_stairs_anchor_1.rotation.set(0.0, 0.0, 0.0);
  socket_root_stairs_anchor_1.userData.socket = {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_stairs_anchor_1);
  sockets["root:stairs-anchor"] = socket_root_stairs_anchor_1;
  const socket_root_railings_anchor_2 = new THREE.Object3D();
  socket_root_railings_anchor_2.name = "railings-anchor";
  socket_root_railings_anchor_2.position.set(0.0, 1.3, 0.0);
  socket_root_railings_anchor_2.rotation.set(0.0, 0.0, 0.0);
  socket_root_railings_anchor_2.userData.socket = {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_railings_anchor_2);
  sockets["root:railings-anchor"] = socket_root_railings_anchor_2;
  const socket_root_columns_anchor_3 = new THREE.Object3D();
  socket_root_columns_anchor_3.name = "columns-anchor";
  socket_root_columns_anchor_3.position.set(0.0, 3.95, 0.0);
  socket_root_columns_anchor_3.rotation.set(0.0, 0.0, 0.0);
  socket_root_columns_anchor_3.userData.socket = {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_columns_anchor_3);
  sockets["root:columns-anchor"] = socket_root_columns_anchor_3;
  const socket_root_beams_anchor_4 = new THREE.Object3D();
  socket_root_beams_anchor_4.name = "beams-anchor";
  socket_root_beams_anchor_4.position.set(0.0, 6.15, 0.0);
  socket_root_beams_anchor_4.rotation.set(0.0, 0.0, 0.0);
  socket_root_beams_anchor_4.userData.socket = {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_beams_anchor_4);
  sockets["root:beams-anchor"] = socket_root_beams_anchor_4;
  const socket_root_lower_roof_anchor_5 = new THREE.Object3D();
  socket_root_lower_roof_anchor_5.name = "lower-roof-anchor";
  socket_root_lower_roof_anchor_5.position.set(0.0, 6.8, 0.0);
  socket_root_lower_roof_anchor_5.rotation.set(0.0, 0.0, 0.0);
  socket_root_lower_roof_anchor_5.userData.socket = {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_lower_roof_anchor_5);
  sockets["root:lower-roof-anchor"] = socket_root_lower_roof_anchor_5;
  const socket_root_lower_tiles_anchor_6 = new THREE.Object3D();
  socket_root_lower_tiles_anchor_6.name = "lower-tiles-anchor";
  socket_root_lower_tiles_anchor_6.position.set(0.0, 6.9, 0.0);
  socket_root_lower_tiles_anchor_6.rotation.set(0.0, 0.0, 0.0);
  socket_root_lower_tiles_anchor_6.userData.socket = {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_lower_tiles_anchor_6);
  sockets["root:lower-tiles-anchor"] = socket_root_lower_tiles_anchor_6;
  const socket_root_lower_eaves_anchor_7 = new THREE.Object3D();
  socket_root_lower_eaves_anchor_7.name = "lower-eaves-anchor";
  socket_root_lower_eaves_anchor_7.position.set(0.0, 6.8, 0.0);
  socket_root_lower_eaves_anchor_7.rotation.set(0.0, 0.0, 0.0);
  socket_root_lower_eaves_anchor_7.userData.socket = {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_lower_eaves_anchor_7);
  sockets["root:lower-eaves-anchor"] = socket_root_lower_eaves_anchor_7;
  const socket_root_brackets_anchor_8 = new THREE.Object3D();
  socket_root_brackets_anchor_8.name = "brackets-anchor";
  socket_root_brackets_anchor_8.position.set(0.0, 6.4, 0.0);
  socket_root_brackets_anchor_8.rotation.set(0.0, 0.0, 0.0);
  socket_root_brackets_anchor_8.userData.socket = {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_brackets_anchor_8);
  sockets["root:brackets-anchor"] = socket_root_brackets_anchor_8;
  const socket_root_facades_anchor_9 = new THREE.Object3D();
  socket_root_facades_anchor_9.name = "facades-anchor";
  socket_root_facades_anchor_9.position.set(0.0, 3.9, 0.0);
  socket_root_facades_anchor_9.rotation.set(0.0, 0.0, 0.0);
  socket_root_facades_anchor_9.userData.socket = {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_facades_anchor_9);
  sockets["root:facades-anchor"] = socket_root_facades_anchor_9;
  const socket_root_front_doors_anchor_10 = new THREE.Object3D();
  socket_root_front_doors_anchor_10.name = "front-doors-anchor";
  socket_root_front_doors_anchor_10.position.set(0.0, 3.6, 5.92);
  socket_root_front_doors_anchor_10.rotation.set(0.0, 0.0, 0.0);
  socket_root_front_doors_anchor_10.userData.socket = {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_front_doors_anchor_10);
  sockets["root:front-doors-anchor"] = socket_root_front_doors_anchor_10;
  const socket_root_rear_windows_anchor_11 = new THREE.Object3D();
  socket_root_rear_windows_anchor_11.name = "rear-windows-anchor";
  socket_root_rear_windows_anchor_11.position.set(0.0, 3.8, -5.92);
  socket_root_rear_windows_anchor_11.rotation.set(0.0, 0.0, 0.0);
  socket_root_rear_windows_anchor_11.userData.socket = {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_rear_windows_anchor_11);
  sockets["root:rear-windows-anchor"] = socket_root_rear_windows_anchor_11;
  const socket_root_upper_walls_anchor_12 = new THREE.Object3D();
  socket_root_upper_walls_anchor_12.name = "upper-walls-anchor";
  socket_root_upper_walls_anchor_12.position.set(0.0, 10.45, 0.0);
  socket_root_upper_walls_anchor_12.rotation.set(0.0, 0.0, 0.0);
  socket_root_upper_walls_anchor_12.userData.socket = {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_upper_walls_anchor_12);
  sockets["root:upper-walls-anchor"] = socket_root_upper_walls_anchor_12;
  const socket_root_upper_columns_anchor_13 = new THREE.Object3D();
  socket_root_upper_columns_anchor_13.name = "upper-columns-anchor";
  socket_root_upper_columns_anchor_13.position.set(0.0, 10.5, 0.0);
  socket_root_upper_columns_anchor_13.rotation.set(0.0, 0.0, 0.0);
  socket_root_upper_columns_anchor_13.userData.socket = {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_upper_columns_anchor_13);
  sockets["root:upper-columns-anchor"] = socket_root_upper_columns_anchor_13;
  const socket_root_upper_roof_anchor_14 = new THREE.Object3D();
  socket_root_upper_roof_anchor_14.name = "upper-roof-anchor";
  socket_root_upper_roof_anchor_14.position.set(0.0, 11.65, 0.0);
  socket_root_upper_roof_anchor_14.rotation.set(0.0, 0.0, 0.0);
  socket_root_upper_roof_anchor_14.userData.socket = {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_upper_roof_anchor_14);
  sockets["root:upper-roof-anchor"] = socket_root_upper_roof_anchor_14;
  const socket_root_upper_tiles_anchor_15 = new THREE.Object3D();
  socket_root_upper_tiles_anchor_15.name = "upper-tiles-anchor";
  socket_root_upper_tiles_anchor_15.position.set(0.0, 11.75, 0.0);
  socket_root_upper_tiles_anchor_15.rotation.set(0.0, 0.0, 0.0);
  socket_root_upper_tiles_anchor_15.userData.socket = {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_upper_tiles_anchor_15);
  sockets["root:upper-tiles-anchor"] = socket_root_upper_tiles_anchor_15;
  const socket_root_ornaments_anchor_16 = new THREE.Object3D();
  socket_root_ornaments_anchor_16.name = "ornaments-anchor";
  socket_root_ornaments_anchor_16.position.set(0.0, 10.6, 0.0);
  socket_root_ornaments_anchor_16.rotation.set(0.0, 0.0, 0.0);
  socket_root_ornaments_anchor_16.userData.socket = {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_ornaments_anchor_16);
  sockets["root:ornaments-anchor"] = socket_root_ornaments_anchor_16;
  const socket_root_plaque_anchor_17 = new THREE.Object3D();
  socket_root_plaque_anchor_17.name = "plaque-anchor";
  socket_root_plaque_anchor_17.position.set(0.0, 5.85, 6.7);
  socket_root_plaque_anchor_17.rotation.set(0.0, 0.0, 0.0);
  socket_root_plaque_anchor_17.userData.socket = {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_plaque_anchor_17);
  sockets["root:plaque-anchor"] = socket_root_plaque_anchor_17;
  const socket_root_foundation_anchor_18 = new THREE.Object3D();
  socket_root_foundation_anchor_18.name = "foundation-anchor";
  socket_root_foundation_anchor_18.position.set(0.0, 0.65, 0.0);
  socket_root_foundation_anchor_18.rotation.set(0.0, 0.0, 0.0);
  socket_root_foundation_anchor_18.userData.socket = {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_foundation_anchor_18);
  sockets["root:foundation-anchor"] = socket_root_foundation_anchor_18;
  const socket_root_stairs_anchor_19 = new THREE.Object3D();
  socket_root_stairs_anchor_19.name = "stairs-anchor";
  socket_root_stairs_anchor_19.position.set(0.0, 0.6, 11.5);
  socket_root_stairs_anchor_19.rotation.set(0.0, 0.0, 0.0);
  socket_root_stairs_anchor_19.userData.socket = {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_stairs_anchor_19);
  sockets["root:stairs-anchor"] = socket_root_stairs_anchor_19;
  const socket_root_railings_anchor_20 = new THREE.Object3D();
  socket_root_railings_anchor_20.name = "railings-anchor";
  socket_root_railings_anchor_20.position.set(0.0, 1.3, 0.0);
  socket_root_railings_anchor_20.rotation.set(0.0, 0.0, 0.0);
  socket_root_railings_anchor_20.userData.socket = {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_railings_anchor_20);
  sockets["root:railings-anchor"] = socket_root_railings_anchor_20;
  const socket_root_columns_anchor_21 = new THREE.Object3D();
  socket_root_columns_anchor_21.name = "columns-anchor";
  socket_root_columns_anchor_21.position.set(0.0, 3.95, 0.0);
  socket_root_columns_anchor_21.rotation.set(0.0, 0.0, 0.0);
  socket_root_columns_anchor_21.userData.socket = {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_columns_anchor_21);
  sockets["root:columns-anchor"] = socket_root_columns_anchor_21;
  const socket_root_beams_anchor_22 = new THREE.Object3D();
  socket_root_beams_anchor_22.name = "beams-anchor";
  socket_root_beams_anchor_22.position.set(0.0, 6.15, 0.0);
  socket_root_beams_anchor_22.rotation.set(0.0, 0.0, 0.0);
  socket_root_beams_anchor_22.userData.socket = {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_beams_anchor_22);
  sockets["root:beams-anchor"] = socket_root_beams_anchor_22;
  const socket_root_lower_roof_anchor_23 = new THREE.Object3D();
  socket_root_lower_roof_anchor_23.name = "lower-roof-anchor";
  socket_root_lower_roof_anchor_23.position.set(0.0, 6.8, 0.0);
  socket_root_lower_roof_anchor_23.rotation.set(0.0, 0.0, 0.0);
  socket_root_lower_roof_anchor_23.userData.socket = {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_lower_roof_anchor_23);
  sockets["root:lower-roof-anchor"] = socket_root_lower_roof_anchor_23;
  const socket_root_lower_tiles_anchor_24 = new THREE.Object3D();
  socket_root_lower_tiles_anchor_24.name = "lower-tiles-anchor";
  socket_root_lower_tiles_anchor_24.position.set(0.0, 6.9, 0.0);
  socket_root_lower_tiles_anchor_24.rotation.set(0.0, 0.0, 0.0);
  socket_root_lower_tiles_anchor_24.userData.socket = {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_lower_tiles_anchor_24);
  sockets["root:lower-tiles-anchor"] = socket_root_lower_tiles_anchor_24;
  const socket_root_lower_eaves_anchor_25 = new THREE.Object3D();
  socket_root_lower_eaves_anchor_25.name = "lower-eaves-anchor";
  socket_root_lower_eaves_anchor_25.position.set(0.0, 6.8, 0.0);
  socket_root_lower_eaves_anchor_25.rotation.set(0.0, 0.0, 0.0);
  socket_root_lower_eaves_anchor_25.userData.socket = {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_lower_eaves_anchor_25);
  sockets["root:lower-eaves-anchor"] = socket_root_lower_eaves_anchor_25;
  const socket_root_brackets_anchor_26 = new THREE.Object3D();
  socket_root_brackets_anchor_26.name = "brackets-anchor";
  socket_root_brackets_anchor_26.position.set(0.0, 6.4, 0.0);
  socket_root_brackets_anchor_26.rotation.set(0.0, 0.0, 0.0);
  socket_root_brackets_anchor_26.userData.socket = {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_brackets_anchor_26);
  sockets["root:brackets-anchor"] = socket_root_brackets_anchor_26;
  const socket_root_facades_anchor_27 = new THREE.Object3D();
  socket_root_facades_anchor_27.name = "facades-anchor";
  socket_root_facades_anchor_27.position.set(0.0, 3.9, 0.0);
  socket_root_facades_anchor_27.rotation.set(0.0, 0.0, 0.0);
  socket_root_facades_anchor_27.userData.socket = {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_facades_anchor_27);
  sockets["root:facades-anchor"] = socket_root_facades_anchor_27;
  const socket_root_front_doors_anchor_28 = new THREE.Object3D();
  socket_root_front_doors_anchor_28.name = "front-doors-anchor";
  socket_root_front_doors_anchor_28.position.set(0.0, 3.6, 5.92);
  socket_root_front_doors_anchor_28.rotation.set(0.0, 0.0, 0.0);
  socket_root_front_doors_anchor_28.userData.socket = {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_front_doors_anchor_28);
  sockets["root:front-doors-anchor"] = socket_root_front_doors_anchor_28;
  const socket_root_rear_windows_anchor_29 = new THREE.Object3D();
  socket_root_rear_windows_anchor_29.name = "rear-windows-anchor";
  socket_root_rear_windows_anchor_29.position.set(0.0, 3.8, -5.92);
  socket_root_rear_windows_anchor_29.rotation.set(0.0, 0.0, 0.0);
  socket_root_rear_windows_anchor_29.userData.socket = {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_rear_windows_anchor_29);
  sockets["root:rear-windows-anchor"] = socket_root_rear_windows_anchor_29;
  const socket_root_upper_walls_anchor_30 = new THREE.Object3D();
  socket_root_upper_walls_anchor_30.name = "upper-walls-anchor";
  socket_root_upper_walls_anchor_30.position.set(0.0, 10.45, 0.0);
  socket_root_upper_walls_anchor_30.rotation.set(0.0, 0.0, 0.0);
  socket_root_upper_walls_anchor_30.userData.socket = {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_upper_walls_anchor_30);
  sockets["root:upper-walls-anchor"] = socket_root_upper_walls_anchor_30;
  const socket_root_upper_columns_anchor_31 = new THREE.Object3D();
  socket_root_upper_columns_anchor_31.name = "upper-columns-anchor";
  socket_root_upper_columns_anchor_31.position.set(0.0, 10.5, 0.0);
  socket_root_upper_columns_anchor_31.rotation.set(0.0, 0.0, 0.0);
  socket_root_upper_columns_anchor_31.userData.socket = {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_upper_columns_anchor_31);
  sockets["root:upper-columns-anchor"] = socket_root_upper_columns_anchor_31;
  const socket_root_upper_roof_anchor_32 = new THREE.Object3D();
  socket_root_upper_roof_anchor_32.name = "upper-roof-anchor";
  socket_root_upper_roof_anchor_32.position.set(0.0, 11.65, 0.0);
  socket_root_upper_roof_anchor_32.rotation.set(0.0, 0.0, 0.0);
  socket_root_upper_roof_anchor_32.userData.socket = {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_upper_roof_anchor_32);
  sockets["root:upper-roof-anchor"] = socket_root_upper_roof_anchor_32;
  const socket_root_upper_tiles_anchor_33 = new THREE.Object3D();
  socket_root_upper_tiles_anchor_33.name = "upper-tiles-anchor";
  socket_root_upper_tiles_anchor_33.position.set(0.0, 11.75, 0.0);
  socket_root_upper_tiles_anchor_33.rotation.set(0.0, 0.0, 0.0);
  socket_root_upper_tiles_anchor_33.userData.socket = {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_upper_tiles_anchor_33);
  sockets["root:upper-tiles-anchor"] = socket_root_upper_tiles_anchor_33;
  const socket_root_ornaments_anchor_34 = new THREE.Object3D();
  socket_root_ornaments_anchor_34.name = "ornaments-anchor";
  socket_root_ornaments_anchor_34.position.set(0.0, 10.6, 0.0);
  socket_root_ornaments_anchor_34.rotation.set(0.0, 0.0, 0.0);
  socket_root_ornaments_anchor_34.userData.socket = {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_ornaments_anchor_34);
  sockets["root:ornaments-anchor"] = socket_root_ornaments_anchor_34;
  const socket_root_plaque_anchor_35 = new THREE.Object3D();
  socket_root_plaque_anchor_35.name = "plaque-anchor";
  socket_root_plaque_anchor_35.position.set(0.0, 5.85, 6.7);
  socket_root_plaque_anchor_35.rotation.set(0.0, 0.0, 0.0);
  socket_root_plaque_anchor_35.userData.socket = {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_root_0.add(socket_root_plaque_anchor_35);
  sockets["root:plaque-anchor"] = socket_root_plaque_anchor_35;

  const endpoint_foundation_1 = makeAttachmentEndpoint(null);
  const node_foundation_1 = new THREE.Group();
  node_foundation_1.name = "foundation__pivot";
  node_foundation_1.scale.set(1, 1, 1);
  if (endpoint_foundation_1) {
    node_foundation_1.position.copy(endpoint_foundation_1.start);
    node_foundation_1.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_foundation_1.position.set(0.0, 0.65, 0.0);
    node_foundation_1.rotation.set(0.0, 0.0, 0.0);
  }
  node_foundation_1.userData.sculptComponent = {"id": "foundation", "name": "foundation", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "foundation-anchor", "localStart": [0, 0.65, 0], "localEnd": [0, 0.75, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 27, "height": 1.3, "depth": 20, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 0.65, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "foundation", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "stone", "materialLayers": ["stone"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "staggered-stone-joints", "type": "geometry", "evidenceRefs": ["full-object"], "description": "staggered stone joints"}, {"id": "carved-stone-insets", "type": "geometry", "evidenceRefs": ["full-object"], "description": "carved stone insets"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(170, 169, 160, 1)", "secondaryAlbedo": "rgba(170, 169, 160, 1)", "materialClass": "stone", "materialClassConfidence": 0.85}};
  node_foundation_1.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "foundation", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_foundation_1);
  nodes["foundation"] = node_foundation_1;
  const mesh_foundation_1Geometry = endpoint_foundation_1
    ? new THREE.CylinderGeometry(endpoint_foundation_1.endRadius, endpoint_foundation_1.baseRadius, endpoint_foundation_1.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_foundation_1) {
    mesh_foundation_1Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_foundation_1 = new THREE.Mesh(
    mesh_foundation_1Geometry,
    materialMap["stone"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_foundation_1.name = "foundation";
  if (endpoint_foundation_1) {
    mesh_foundation_1.position.copy(endpoint_foundation_1.midpoint);
    mesh_foundation_1.quaternion.copy(endpoint_foundation_1.quaternion);
  }
  mesh_foundation_1.castShadow = options.castShadow ?? true;
  mesh_foundation_1.receiveShadow = options.receiveShadow ?? true;
  mesh_foundation_1.userData.sculptComponent = {"id": "foundation", "name": "foundation", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "foundation-anchor", "localStart": [0, 0.65, 0], "localEnd": [0, 0.75, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 27, "height": 1.3, "depth": 20, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 0.65, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "foundation", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "stone", "materialLayers": ["stone"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "staggered-stone-joints", "type": "geometry", "evidenceRefs": ["full-object"], "description": "staggered stone joints"}, {"id": "carved-stone-insets", "type": "geometry", "evidenceRefs": ["full-object"], "description": "carved stone insets"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(170, 169, 160, 1)", "secondaryAlbedo": "rgba(170, 169, 160, 1)", "materialClass": "stone", "materialClassConfidence": 0.85}};
  node_foundation_1.add(mesh_foundation_1);
  meshes["foundation"] = mesh_foundation_1;
  colliders["foundation"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."};
  destructionGroups["foundation"] ??= [];
  destructionGroups["foundation"].push(node_foundation_1);
  const socket_foundation_foundation_anchor_0 = new THREE.Object3D();
  socket_foundation_foundation_anchor_0.name = "foundation-anchor";
  socket_foundation_foundation_anchor_0.position.set(0.0, 0.65, 0.0);
  socket_foundation_foundation_anchor_0.rotation.set(0.0, 0.0, 0.0);
  socket_foundation_foundation_anchor_0.userData.socket = {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_foundation_1.add(socket_foundation_foundation_anchor_0);
  sockets["foundation:foundation-anchor"] = socket_foundation_foundation_anchor_0;
  const socket_foundation_stairs_anchor_1 = new THREE.Object3D();
  socket_foundation_stairs_anchor_1.name = "stairs-anchor";
  socket_foundation_stairs_anchor_1.position.set(0.0, 0.6, 11.5);
  socket_foundation_stairs_anchor_1.rotation.set(0.0, 0.0, 0.0);
  socket_foundation_stairs_anchor_1.userData.socket = {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_foundation_1.add(socket_foundation_stairs_anchor_1);
  sockets["foundation:stairs-anchor"] = socket_foundation_stairs_anchor_1;
  const socket_foundation_railings_anchor_2 = new THREE.Object3D();
  socket_foundation_railings_anchor_2.name = "railings-anchor";
  socket_foundation_railings_anchor_2.position.set(0.0, 1.3, 0.0);
  socket_foundation_railings_anchor_2.rotation.set(0.0, 0.0, 0.0);
  socket_foundation_railings_anchor_2.userData.socket = {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_foundation_1.add(socket_foundation_railings_anchor_2);
  sockets["foundation:railings-anchor"] = socket_foundation_railings_anchor_2;
  const socket_foundation_columns_anchor_3 = new THREE.Object3D();
  socket_foundation_columns_anchor_3.name = "columns-anchor";
  socket_foundation_columns_anchor_3.position.set(0.0, 3.95, 0.0);
  socket_foundation_columns_anchor_3.rotation.set(0.0, 0.0, 0.0);
  socket_foundation_columns_anchor_3.userData.socket = {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_foundation_1.add(socket_foundation_columns_anchor_3);
  sockets["foundation:columns-anchor"] = socket_foundation_columns_anchor_3;
  const socket_foundation_beams_anchor_4 = new THREE.Object3D();
  socket_foundation_beams_anchor_4.name = "beams-anchor";
  socket_foundation_beams_anchor_4.position.set(0.0, 6.15, 0.0);
  socket_foundation_beams_anchor_4.rotation.set(0.0, 0.0, 0.0);
  socket_foundation_beams_anchor_4.userData.socket = {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_foundation_1.add(socket_foundation_beams_anchor_4);
  sockets["foundation:beams-anchor"] = socket_foundation_beams_anchor_4;
  const socket_foundation_lower_roof_anchor_5 = new THREE.Object3D();
  socket_foundation_lower_roof_anchor_5.name = "lower-roof-anchor";
  socket_foundation_lower_roof_anchor_5.position.set(0.0, 6.8, 0.0);
  socket_foundation_lower_roof_anchor_5.rotation.set(0.0, 0.0, 0.0);
  socket_foundation_lower_roof_anchor_5.userData.socket = {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_foundation_1.add(socket_foundation_lower_roof_anchor_5);
  sockets["foundation:lower-roof-anchor"] = socket_foundation_lower_roof_anchor_5;
  const socket_foundation_lower_tiles_anchor_6 = new THREE.Object3D();
  socket_foundation_lower_tiles_anchor_6.name = "lower-tiles-anchor";
  socket_foundation_lower_tiles_anchor_6.position.set(0.0, 6.9, 0.0);
  socket_foundation_lower_tiles_anchor_6.rotation.set(0.0, 0.0, 0.0);
  socket_foundation_lower_tiles_anchor_6.userData.socket = {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_foundation_1.add(socket_foundation_lower_tiles_anchor_6);
  sockets["foundation:lower-tiles-anchor"] = socket_foundation_lower_tiles_anchor_6;
  const socket_foundation_lower_eaves_anchor_7 = new THREE.Object3D();
  socket_foundation_lower_eaves_anchor_7.name = "lower-eaves-anchor";
  socket_foundation_lower_eaves_anchor_7.position.set(0.0, 6.8, 0.0);
  socket_foundation_lower_eaves_anchor_7.rotation.set(0.0, 0.0, 0.0);
  socket_foundation_lower_eaves_anchor_7.userData.socket = {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_foundation_1.add(socket_foundation_lower_eaves_anchor_7);
  sockets["foundation:lower-eaves-anchor"] = socket_foundation_lower_eaves_anchor_7;
  const socket_foundation_brackets_anchor_8 = new THREE.Object3D();
  socket_foundation_brackets_anchor_8.name = "brackets-anchor";
  socket_foundation_brackets_anchor_8.position.set(0.0, 6.4, 0.0);
  socket_foundation_brackets_anchor_8.rotation.set(0.0, 0.0, 0.0);
  socket_foundation_brackets_anchor_8.userData.socket = {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_foundation_1.add(socket_foundation_brackets_anchor_8);
  sockets["foundation:brackets-anchor"] = socket_foundation_brackets_anchor_8;
  const socket_foundation_facades_anchor_9 = new THREE.Object3D();
  socket_foundation_facades_anchor_9.name = "facades-anchor";
  socket_foundation_facades_anchor_9.position.set(0.0, 3.9, 0.0);
  socket_foundation_facades_anchor_9.rotation.set(0.0, 0.0, 0.0);
  socket_foundation_facades_anchor_9.userData.socket = {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_foundation_1.add(socket_foundation_facades_anchor_9);
  sockets["foundation:facades-anchor"] = socket_foundation_facades_anchor_9;
  const socket_foundation_front_doors_anchor_10 = new THREE.Object3D();
  socket_foundation_front_doors_anchor_10.name = "front-doors-anchor";
  socket_foundation_front_doors_anchor_10.position.set(0.0, 3.6, 5.92);
  socket_foundation_front_doors_anchor_10.rotation.set(0.0, 0.0, 0.0);
  socket_foundation_front_doors_anchor_10.userData.socket = {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_foundation_1.add(socket_foundation_front_doors_anchor_10);
  sockets["foundation:front-doors-anchor"] = socket_foundation_front_doors_anchor_10;
  const socket_foundation_rear_windows_anchor_11 = new THREE.Object3D();
  socket_foundation_rear_windows_anchor_11.name = "rear-windows-anchor";
  socket_foundation_rear_windows_anchor_11.position.set(0.0, 3.8, -5.92);
  socket_foundation_rear_windows_anchor_11.rotation.set(0.0, 0.0, 0.0);
  socket_foundation_rear_windows_anchor_11.userData.socket = {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_foundation_1.add(socket_foundation_rear_windows_anchor_11);
  sockets["foundation:rear-windows-anchor"] = socket_foundation_rear_windows_anchor_11;
  const socket_foundation_upper_walls_anchor_12 = new THREE.Object3D();
  socket_foundation_upper_walls_anchor_12.name = "upper-walls-anchor";
  socket_foundation_upper_walls_anchor_12.position.set(0.0, 10.45, 0.0);
  socket_foundation_upper_walls_anchor_12.rotation.set(0.0, 0.0, 0.0);
  socket_foundation_upper_walls_anchor_12.userData.socket = {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_foundation_1.add(socket_foundation_upper_walls_anchor_12);
  sockets["foundation:upper-walls-anchor"] = socket_foundation_upper_walls_anchor_12;
  const socket_foundation_upper_columns_anchor_13 = new THREE.Object3D();
  socket_foundation_upper_columns_anchor_13.name = "upper-columns-anchor";
  socket_foundation_upper_columns_anchor_13.position.set(0.0, 10.5, 0.0);
  socket_foundation_upper_columns_anchor_13.rotation.set(0.0, 0.0, 0.0);
  socket_foundation_upper_columns_anchor_13.userData.socket = {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_foundation_1.add(socket_foundation_upper_columns_anchor_13);
  sockets["foundation:upper-columns-anchor"] = socket_foundation_upper_columns_anchor_13;
  const socket_foundation_upper_roof_anchor_14 = new THREE.Object3D();
  socket_foundation_upper_roof_anchor_14.name = "upper-roof-anchor";
  socket_foundation_upper_roof_anchor_14.position.set(0.0, 11.65, 0.0);
  socket_foundation_upper_roof_anchor_14.rotation.set(0.0, 0.0, 0.0);
  socket_foundation_upper_roof_anchor_14.userData.socket = {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_foundation_1.add(socket_foundation_upper_roof_anchor_14);
  sockets["foundation:upper-roof-anchor"] = socket_foundation_upper_roof_anchor_14;
  const socket_foundation_upper_tiles_anchor_15 = new THREE.Object3D();
  socket_foundation_upper_tiles_anchor_15.name = "upper-tiles-anchor";
  socket_foundation_upper_tiles_anchor_15.position.set(0.0, 11.75, 0.0);
  socket_foundation_upper_tiles_anchor_15.rotation.set(0.0, 0.0, 0.0);
  socket_foundation_upper_tiles_anchor_15.userData.socket = {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_foundation_1.add(socket_foundation_upper_tiles_anchor_15);
  sockets["foundation:upper-tiles-anchor"] = socket_foundation_upper_tiles_anchor_15;
  const socket_foundation_ornaments_anchor_16 = new THREE.Object3D();
  socket_foundation_ornaments_anchor_16.name = "ornaments-anchor";
  socket_foundation_ornaments_anchor_16.position.set(0.0, 10.6, 0.0);
  socket_foundation_ornaments_anchor_16.rotation.set(0.0, 0.0, 0.0);
  socket_foundation_ornaments_anchor_16.userData.socket = {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_foundation_1.add(socket_foundation_ornaments_anchor_16);
  sockets["foundation:ornaments-anchor"] = socket_foundation_ornaments_anchor_16;
  const socket_foundation_plaque_anchor_17 = new THREE.Object3D();
  socket_foundation_plaque_anchor_17.name = "plaque-anchor";
  socket_foundation_plaque_anchor_17.position.set(0.0, 5.85, 6.7);
  socket_foundation_plaque_anchor_17.rotation.set(0.0, 0.0, 0.0);
  socket_foundation_plaque_anchor_17.userData.socket = {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_foundation_1.add(socket_foundation_plaque_anchor_17);
  sockets["foundation:plaque-anchor"] = socket_foundation_plaque_anchor_17;

  const endpoint_stairs_2 = makeAttachmentEndpoint(null);
  const node_stairs_2 = new THREE.Group();
  node_stairs_2.name = "stairs__pivot";
  node_stairs_2.scale.set(1, 1, 1);
  if (endpoint_stairs_2) {
    node_stairs_2.position.copy(endpoint_stairs_2.start);
    node_stairs_2.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_stairs_2.position.set(0.0, 0.6, 11.5);
    node_stairs_2.rotation.set(0.0, 0.0, 0.0);
  }
  node_stairs_2.userData.sculptComponent = {"id": "stairs", "name": "stairs", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "stairs-anchor", "localStart": [0, 0.6, 11.5], "localEnd": [0, 0.7, 11.5], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 7.6, "height": 1.3, "depth": 5, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "stairs", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "stone", "materialLayers": ["stone"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "wide-shallow-treads", "type": "geometry", "evidenceRefs": ["full-object"], "description": "wide shallow treads"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(170, 169, 160, 1)", "secondaryAlbedo": "rgba(170, 169, 160, 1)", "materialClass": "stone", "materialClassConfidence": 0.85}};
  node_stairs_2.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "stairs", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_stairs_2);
  nodes["stairs"] = node_stairs_2;
  const mesh_stairs_2Geometry = endpoint_stairs_2
    ? new THREE.CylinderGeometry(endpoint_stairs_2.endRadius, endpoint_stairs_2.baseRadius, endpoint_stairs_2.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_stairs_2) {
    mesh_stairs_2Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_stairs_2 = new THREE.Mesh(
    mesh_stairs_2Geometry,
    materialMap["stone"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_stairs_2.name = "stairs";
  if (endpoint_stairs_2) {
    mesh_stairs_2.position.copy(endpoint_stairs_2.midpoint);
    mesh_stairs_2.quaternion.copy(endpoint_stairs_2.quaternion);
  }
  mesh_stairs_2.castShadow = options.castShadow ?? true;
  mesh_stairs_2.receiveShadow = options.receiveShadow ?? true;
  mesh_stairs_2.userData.sculptComponent = {"id": "stairs", "name": "stairs", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "stairs-anchor", "localStart": [0, 0.6, 11.5], "localEnd": [0, 0.7, 11.5], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 7.6, "height": 1.3, "depth": 5, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "stairs", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "stone", "materialLayers": ["stone"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "wide-shallow-treads", "type": "geometry", "evidenceRefs": ["full-object"], "description": "wide shallow treads"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(170, 169, 160, 1)", "secondaryAlbedo": "rgba(170, 169, 160, 1)", "materialClass": "stone", "materialClassConfidence": 0.85}};
  node_stairs_2.add(mesh_stairs_2);
  meshes["stairs"] = mesh_stairs_2;
  colliders["stairs"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."};
  destructionGroups["stairs"] ??= [];
  destructionGroups["stairs"].push(node_stairs_2);
  const socket_stairs_foundation_anchor_0 = new THREE.Object3D();
  socket_stairs_foundation_anchor_0.name = "foundation-anchor";
  socket_stairs_foundation_anchor_0.position.set(0.0, 0.65, 0.0);
  socket_stairs_foundation_anchor_0.rotation.set(0.0, 0.0, 0.0);
  socket_stairs_foundation_anchor_0.userData.socket = {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_stairs_2.add(socket_stairs_foundation_anchor_0);
  sockets["stairs:foundation-anchor"] = socket_stairs_foundation_anchor_0;
  const socket_stairs_stairs_anchor_1 = new THREE.Object3D();
  socket_stairs_stairs_anchor_1.name = "stairs-anchor";
  socket_stairs_stairs_anchor_1.position.set(0.0, 0.6, 11.5);
  socket_stairs_stairs_anchor_1.rotation.set(0.0, 0.0, 0.0);
  socket_stairs_stairs_anchor_1.userData.socket = {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_stairs_2.add(socket_stairs_stairs_anchor_1);
  sockets["stairs:stairs-anchor"] = socket_stairs_stairs_anchor_1;
  const socket_stairs_railings_anchor_2 = new THREE.Object3D();
  socket_stairs_railings_anchor_2.name = "railings-anchor";
  socket_stairs_railings_anchor_2.position.set(0.0, 1.3, 0.0);
  socket_stairs_railings_anchor_2.rotation.set(0.0, 0.0, 0.0);
  socket_stairs_railings_anchor_2.userData.socket = {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_stairs_2.add(socket_stairs_railings_anchor_2);
  sockets["stairs:railings-anchor"] = socket_stairs_railings_anchor_2;
  const socket_stairs_columns_anchor_3 = new THREE.Object3D();
  socket_stairs_columns_anchor_3.name = "columns-anchor";
  socket_stairs_columns_anchor_3.position.set(0.0, 3.95, 0.0);
  socket_stairs_columns_anchor_3.rotation.set(0.0, 0.0, 0.0);
  socket_stairs_columns_anchor_3.userData.socket = {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_stairs_2.add(socket_stairs_columns_anchor_3);
  sockets["stairs:columns-anchor"] = socket_stairs_columns_anchor_3;
  const socket_stairs_beams_anchor_4 = new THREE.Object3D();
  socket_stairs_beams_anchor_4.name = "beams-anchor";
  socket_stairs_beams_anchor_4.position.set(0.0, 6.15, 0.0);
  socket_stairs_beams_anchor_4.rotation.set(0.0, 0.0, 0.0);
  socket_stairs_beams_anchor_4.userData.socket = {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_stairs_2.add(socket_stairs_beams_anchor_4);
  sockets["stairs:beams-anchor"] = socket_stairs_beams_anchor_4;
  const socket_stairs_lower_roof_anchor_5 = new THREE.Object3D();
  socket_stairs_lower_roof_anchor_5.name = "lower-roof-anchor";
  socket_stairs_lower_roof_anchor_5.position.set(0.0, 6.8, 0.0);
  socket_stairs_lower_roof_anchor_5.rotation.set(0.0, 0.0, 0.0);
  socket_stairs_lower_roof_anchor_5.userData.socket = {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_stairs_2.add(socket_stairs_lower_roof_anchor_5);
  sockets["stairs:lower-roof-anchor"] = socket_stairs_lower_roof_anchor_5;
  const socket_stairs_lower_tiles_anchor_6 = new THREE.Object3D();
  socket_stairs_lower_tiles_anchor_6.name = "lower-tiles-anchor";
  socket_stairs_lower_tiles_anchor_6.position.set(0.0, 6.9, 0.0);
  socket_stairs_lower_tiles_anchor_6.rotation.set(0.0, 0.0, 0.0);
  socket_stairs_lower_tiles_anchor_6.userData.socket = {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_stairs_2.add(socket_stairs_lower_tiles_anchor_6);
  sockets["stairs:lower-tiles-anchor"] = socket_stairs_lower_tiles_anchor_6;
  const socket_stairs_lower_eaves_anchor_7 = new THREE.Object3D();
  socket_stairs_lower_eaves_anchor_7.name = "lower-eaves-anchor";
  socket_stairs_lower_eaves_anchor_7.position.set(0.0, 6.8, 0.0);
  socket_stairs_lower_eaves_anchor_7.rotation.set(0.0, 0.0, 0.0);
  socket_stairs_lower_eaves_anchor_7.userData.socket = {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_stairs_2.add(socket_stairs_lower_eaves_anchor_7);
  sockets["stairs:lower-eaves-anchor"] = socket_stairs_lower_eaves_anchor_7;
  const socket_stairs_brackets_anchor_8 = new THREE.Object3D();
  socket_stairs_brackets_anchor_8.name = "brackets-anchor";
  socket_stairs_brackets_anchor_8.position.set(0.0, 6.4, 0.0);
  socket_stairs_brackets_anchor_8.rotation.set(0.0, 0.0, 0.0);
  socket_stairs_brackets_anchor_8.userData.socket = {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_stairs_2.add(socket_stairs_brackets_anchor_8);
  sockets["stairs:brackets-anchor"] = socket_stairs_brackets_anchor_8;
  const socket_stairs_facades_anchor_9 = new THREE.Object3D();
  socket_stairs_facades_anchor_9.name = "facades-anchor";
  socket_stairs_facades_anchor_9.position.set(0.0, 3.9, 0.0);
  socket_stairs_facades_anchor_9.rotation.set(0.0, 0.0, 0.0);
  socket_stairs_facades_anchor_9.userData.socket = {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_stairs_2.add(socket_stairs_facades_anchor_9);
  sockets["stairs:facades-anchor"] = socket_stairs_facades_anchor_9;
  const socket_stairs_front_doors_anchor_10 = new THREE.Object3D();
  socket_stairs_front_doors_anchor_10.name = "front-doors-anchor";
  socket_stairs_front_doors_anchor_10.position.set(0.0, 3.6, 5.92);
  socket_stairs_front_doors_anchor_10.rotation.set(0.0, 0.0, 0.0);
  socket_stairs_front_doors_anchor_10.userData.socket = {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_stairs_2.add(socket_stairs_front_doors_anchor_10);
  sockets["stairs:front-doors-anchor"] = socket_stairs_front_doors_anchor_10;
  const socket_stairs_rear_windows_anchor_11 = new THREE.Object3D();
  socket_stairs_rear_windows_anchor_11.name = "rear-windows-anchor";
  socket_stairs_rear_windows_anchor_11.position.set(0.0, 3.8, -5.92);
  socket_stairs_rear_windows_anchor_11.rotation.set(0.0, 0.0, 0.0);
  socket_stairs_rear_windows_anchor_11.userData.socket = {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_stairs_2.add(socket_stairs_rear_windows_anchor_11);
  sockets["stairs:rear-windows-anchor"] = socket_stairs_rear_windows_anchor_11;
  const socket_stairs_upper_walls_anchor_12 = new THREE.Object3D();
  socket_stairs_upper_walls_anchor_12.name = "upper-walls-anchor";
  socket_stairs_upper_walls_anchor_12.position.set(0.0, 10.45, 0.0);
  socket_stairs_upper_walls_anchor_12.rotation.set(0.0, 0.0, 0.0);
  socket_stairs_upper_walls_anchor_12.userData.socket = {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_stairs_2.add(socket_stairs_upper_walls_anchor_12);
  sockets["stairs:upper-walls-anchor"] = socket_stairs_upper_walls_anchor_12;
  const socket_stairs_upper_columns_anchor_13 = new THREE.Object3D();
  socket_stairs_upper_columns_anchor_13.name = "upper-columns-anchor";
  socket_stairs_upper_columns_anchor_13.position.set(0.0, 10.5, 0.0);
  socket_stairs_upper_columns_anchor_13.rotation.set(0.0, 0.0, 0.0);
  socket_stairs_upper_columns_anchor_13.userData.socket = {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_stairs_2.add(socket_stairs_upper_columns_anchor_13);
  sockets["stairs:upper-columns-anchor"] = socket_stairs_upper_columns_anchor_13;
  const socket_stairs_upper_roof_anchor_14 = new THREE.Object3D();
  socket_stairs_upper_roof_anchor_14.name = "upper-roof-anchor";
  socket_stairs_upper_roof_anchor_14.position.set(0.0, 11.65, 0.0);
  socket_stairs_upper_roof_anchor_14.rotation.set(0.0, 0.0, 0.0);
  socket_stairs_upper_roof_anchor_14.userData.socket = {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_stairs_2.add(socket_stairs_upper_roof_anchor_14);
  sockets["stairs:upper-roof-anchor"] = socket_stairs_upper_roof_anchor_14;
  const socket_stairs_upper_tiles_anchor_15 = new THREE.Object3D();
  socket_stairs_upper_tiles_anchor_15.name = "upper-tiles-anchor";
  socket_stairs_upper_tiles_anchor_15.position.set(0.0, 11.75, 0.0);
  socket_stairs_upper_tiles_anchor_15.rotation.set(0.0, 0.0, 0.0);
  socket_stairs_upper_tiles_anchor_15.userData.socket = {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_stairs_2.add(socket_stairs_upper_tiles_anchor_15);
  sockets["stairs:upper-tiles-anchor"] = socket_stairs_upper_tiles_anchor_15;
  const socket_stairs_ornaments_anchor_16 = new THREE.Object3D();
  socket_stairs_ornaments_anchor_16.name = "ornaments-anchor";
  socket_stairs_ornaments_anchor_16.position.set(0.0, 10.6, 0.0);
  socket_stairs_ornaments_anchor_16.rotation.set(0.0, 0.0, 0.0);
  socket_stairs_ornaments_anchor_16.userData.socket = {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_stairs_2.add(socket_stairs_ornaments_anchor_16);
  sockets["stairs:ornaments-anchor"] = socket_stairs_ornaments_anchor_16;
  const socket_stairs_plaque_anchor_17 = new THREE.Object3D();
  socket_stairs_plaque_anchor_17.name = "plaque-anchor";
  socket_stairs_plaque_anchor_17.position.set(0.0, 5.85, 6.7);
  socket_stairs_plaque_anchor_17.rotation.set(0.0, 0.0, 0.0);
  socket_stairs_plaque_anchor_17.userData.socket = {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_stairs_2.add(socket_stairs_plaque_anchor_17);
  sockets["stairs:plaque-anchor"] = socket_stairs_plaque_anchor_17;

  const endpoint_railings_3 = makeAttachmentEndpoint(null);
  const node_railings_3 = new THREE.Group();
  node_railings_3.name = "railings__pivot";
  node_railings_3.scale.set(1, 1, 1);
  if (endpoint_railings_3) {
    node_railings_3.position.copy(endpoint_railings_3.start);
    node_railings_3.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_railings_3.position.set(0.0, 1.3, 0.0);
    node_railings_3.rotation.set(0.0, 0.0, 0.0);
  }
  node_railings_3.userData.sculptComponent = {"id": "railings", "name": "railings", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "railings-anchor", "localStart": [0, 1.3, 0], "localEnd": [0, 1.4000000000000001, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 25, "height": 1.2, "depth": 18, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 1.3, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "railings", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "stone", "materialLayers": ["stone"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "stone-balusters", "type": "geometry", "evidenceRefs": ["full-object"], "description": "stone balusters"}, {"id": "vermilion-top-rails", "type": "geometry", "evidenceRefs": ["full-object"], "description": "vermilion top rails"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(170, 169, 160, 1)", "secondaryAlbedo": "rgba(170, 169, 160, 1)", "materialClass": "stone", "materialClassConfidence": 0.85}};
  node_railings_3.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "railings", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_railings_3);
  nodes["railings"] = node_railings_3;
  const mesh_railings_3Geometry = endpoint_railings_3
    ? new THREE.CylinderGeometry(endpoint_railings_3.endRadius, endpoint_railings_3.baseRadius, endpoint_railings_3.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_railings_3) {
    mesh_railings_3Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_railings_3 = new THREE.Mesh(
    mesh_railings_3Geometry,
    materialMap["stone"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_railings_3.name = "railings";
  if (endpoint_railings_3) {
    mesh_railings_3.position.copy(endpoint_railings_3.midpoint);
    mesh_railings_3.quaternion.copy(endpoint_railings_3.quaternion);
  }
  mesh_railings_3.castShadow = options.castShadow ?? true;
  mesh_railings_3.receiveShadow = options.receiveShadow ?? true;
  mesh_railings_3.userData.sculptComponent = {"id": "railings", "name": "railings", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "railings-anchor", "localStart": [0, 1.3, 0], "localEnd": [0, 1.4000000000000001, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 25, "height": 1.2, "depth": 18, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 1.3, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "railings", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "stone", "materialLayers": ["stone"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "stone-balusters", "type": "geometry", "evidenceRefs": ["full-object"], "description": "stone balusters"}, {"id": "vermilion-top-rails", "type": "geometry", "evidenceRefs": ["full-object"], "description": "vermilion top rails"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(170, 169, 160, 1)", "secondaryAlbedo": "rgba(170, 169, 160, 1)", "materialClass": "stone", "materialClassConfidence": 0.85}};
  node_railings_3.add(mesh_railings_3);
  meshes["railings"] = mesh_railings_3;
  colliders["railings"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."};
  destructionGroups["railings"] ??= [];
  destructionGroups["railings"].push(node_railings_3);
  const socket_railings_foundation_anchor_0 = new THREE.Object3D();
  socket_railings_foundation_anchor_0.name = "foundation-anchor";
  socket_railings_foundation_anchor_0.position.set(0.0, 0.65, 0.0);
  socket_railings_foundation_anchor_0.rotation.set(0.0, 0.0, 0.0);
  socket_railings_foundation_anchor_0.userData.socket = {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_railings_3.add(socket_railings_foundation_anchor_0);
  sockets["railings:foundation-anchor"] = socket_railings_foundation_anchor_0;
  const socket_railings_stairs_anchor_1 = new THREE.Object3D();
  socket_railings_stairs_anchor_1.name = "stairs-anchor";
  socket_railings_stairs_anchor_1.position.set(0.0, 0.6, 11.5);
  socket_railings_stairs_anchor_1.rotation.set(0.0, 0.0, 0.0);
  socket_railings_stairs_anchor_1.userData.socket = {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_railings_3.add(socket_railings_stairs_anchor_1);
  sockets["railings:stairs-anchor"] = socket_railings_stairs_anchor_1;
  const socket_railings_railings_anchor_2 = new THREE.Object3D();
  socket_railings_railings_anchor_2.name = "railings-anchor";
  socket_railings_railings_anchor_2.position.set(0.0, 1.3, 0.0);
  socket_railings_railings_anchor_2.rotation.set(0.0, 0.0, 0.0);
  socket_railings_railings_anchor_2.userData.socket = {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_railings_3.add(socket_railings_railings_anchor_2);
  sockets["railings:railings-anchor"] = socket_railings_railings_anchor_2;
  const socket_railings_columns_anchor_3 = new THREE.Object3D();
  socket_railings_columns_anchor_3.name = "columns-anchor";
  socket_railings_columns_anchor_3.position.set(0.0, 3.95, 0.0);
  socket_railings_columns_anchor_3.rotation.set(0.0, 0.0, 0.0);
  socket_railings_columns_anchor_3.userData.socket = {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_railings_3.add(socket_railings_columns_anchor_3);
  sockets["railings:columns-anchor"] = socket_railings_columns_anchor_3;
  const socket_railings_beams_anchor_4 = new THREE.Object3D();
  socket_railings_beams_anchor_4.name = "beams-anchor";
  socket_railings_beams_anchor_4.position.set(0.0, 6.15, 0.0);
  socket_railings_beams_anchor_4.rotation.set(0.0, 0.0, 0.0);
  socket_railings_beams_anchor_4.userData.socket = {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_railings_3.add(socket_railings_beams_anchor_4);
  sockets["railings:beams-anchor"] = socket_railings_beams_anchor_4;
  const socket_railings_lower_roof_anchor_5 = new THREE.Object3D();
  socket_railings_lower_roof_anchor_5.name = "lower-roof-anchor";
  socket_railings_lower_roof_anchor_5.position.set(0.0, 6.8, 0.0);
  socket_railings_lower_roof_anchor_5.rotation.set(0.0, 0.0, 0.0);
  socket_railings_lower_roof_anchor_5.userData.socket = {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_railings_3.add(socket_railings_lower_roof_anchor_5);
  sockets["railings:lower-roof-anchor"] = socket_railings_lower_roof_anchor_5;
  const socket_railings_lower_tiles_anchor_6 = new THREE.Object3D();
  socket_railings_lower_tiles_anchor_6.name = "lower-tiles-anchor";
  socket_railings_lower_tiles_anchor_6.position.set(0.0, 6.9, 0.0);
  socket_railings_lower_tiles_anchor_6.rotation.set(0.0, 0.0, 0.0);
  socket_railings_lower_tiles_anchor_6.userData.socket = {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_railings_3.add(socket_railings_lower_tiles_anchor_6);
  sockets["railings:lower-tiles-anchor"] = socket_railings_lower_tiles_anchor_6;
  const socket_railings_lower_eaves_anchor_7 = new THREE.Object3D();
  socket_railings_lower_eaves_anchor_7.name = "lower-eaves-anchor";
  socket_railings_lower_eaves_anchor_7.position.set(0.0, 6.8, 0.0);
  socket_railings_lower_eaves_anchor_7.rotation.set(0.0, 0.0, 0.0);
  socket_railings_lower_eaves_anchor_7.userData.socket = {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_railings_3.add(socket_railings_lower_eaves_anchor_7);
  sockets["railings:lower-eaves-anchor"] = socket_railings_lower_eaves_anchor_7;
  const socket_railings_brackets_anchor_8 = new THREE.Object3D();
  socket_railings_brackets_anchor_8.name = "brackets-anchor";
  socket_railings_brackets_anchor_8.position.set(0.0, 6.4, 0.0);
  socket_railings_brackets_anchor_8.rotation.set(0.0, 0.0, 0.0);
  socket_railings_brackets_anchor_8.userData.socket = {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_railings_3.add(socket_railings_brackets_anchor_8);
  sockets["railings:brackets-anchor"] = socket_railings_brackets_anchor_8;
  const socket_railings_facades_anchor_9 = new THREE.Object3D();
  socket_railings_facades_anchor_9.name = "facades-anchor";
  socket_railings_facades_anchor_9.position.set(0.0, 3.9, 0.0);
  socket_railings_facades_anchor_9.rotation.set(0.0, 0.0, 0.0);
  socket_railings_facades_anchor_9.userData.socket = {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_railings_3.add(socket_railings_facades_anchor_9);
  sockets["railings:facades-anchor"] = socket_railings_facades_anchor_9;
  const socket_railings_front_doors_anchor_10 = new THREE.Object3D();
  socket_railings_front_doors_anchor_10.name = "front-doors-anchor";
  socket_railings_front_doors_anchor_10.position.set(0.0, 3.6, 5.92);
  socket_railings_front_doors_anchor_10.rotation.set(0.0, 0.0, 0.0);
  socket_railings_front_doors_anchor_10.userData.socket = {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_railings_3.add(socket_railings_front_doors_anchor_10);
  sockets["railings:front-doors-anchor"] = socket_railings_front_doors_anchor_10;
  const socket_railings_rear_windows_anchor_11 = new THREE.Object3D();
  socket_railings_rear_windows_anchor_11.name = "rear-windows-anchor";
  socket_railings_rear_windows_anchor_11.position.set(0.0, 3.8, -5.92);
  socket_railings_rear_windows_anchor_11.rotation.set(0.0, 0.0, 0.0);
  socket_railings_rear_windows_anchor_11.userData.socket = {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_railings_3.add(socket_railings_rear_windows_anchor_11);
  sockets["railings:rear-windows-anchor"] = socket_railings_rear_windows_anchor_11;
  const socket_railings_upper_walls_anchor_12 = new THREE.Object3D();
  socket_railings_upper_walls_anchor_12.name = "upper-walls-anchor";
  socket_railings_upper_walls_anchor_12.position.set(0.0, 10.45, 0.0);
  socket_railings_upper_walls_anchor_12.rotation.set(0.0, 0.0, 0.0);
  socket_railings_upper_walls_anchor_12.userData.socket = {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_railings_3.add(socket_railings_upper_walls_anchor_12);
  sockets["railings:upper-walls-anchor"] = socket_railings_upper_walls_anchor_12;
  const socket_railings_upper_columns_anchor_13 = new THREE.Object3D();
  socket_railings_upper_columns_anchor_13.name = "upper-columns-anchor";
  socket_railings_upper_columns_anchor_13.position.set(0.0, 10.5, 0.0);
  socket_railings_upper_columns_anchor_13.rotation.set(0.0, 0.0, 0.0);
  socket_railings_upper_columns_anchor_13.userData.socket = {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_railings_3.add(socket_railings_upper_columns_anchor_13);
  sockets["railings:upper-columns-anchor"] = socket_railings_upper_columns_anchor_13;
  const socket_railings_upper_roof_anchor_14 = new THREE.Object3D();
  socket_railings_upper_roof_anchor_14.name = "upper-roof-anchor";
  socket_railings_upper_roof_anchor_14.position.set(0.0, 11.65, 0.0);
  socket_railings_upper_roof_anchor_14.rotation.set(0.0, 0.0, 0.0);
  socket_railings_upper_roof_anchor_14.userData.socket = {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_railings_3.add(socket_railings_upper_roof_anchor_14);
  sockets["railings:upper-roof-anchor"] = socket_railings_upper_roof_anchor_14;
  const socket_railings_upper_tiles_anchor_15 = new THREE.Object3D();
  socket_railings_upper_tiles_anchor_15.name = "upper-tiles-anchor";
  socket_railings_upper_tiles_anchor_15.position.set(0.0, 11.75, 0.0);
  socket_railings_upper_tiles_anchor_15.rotation.set(0.0, 0.0, 0.0);
  socket_railings_upper_tiles_anchor_15.userData.socket = {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_railings_3.add(socket_railings_upper_tiles_anchor_15);
  sockets["railings:upper-tiles-anchor"] = socket_railings_upper_tiles_anchor_15;
  const socket_railings_ornaments_anchor_16 = new THREE.Object3D();
  socket_railings_ornaments_anchor_16.name = "ornaments-anchor";
  socket_railings_ornaments_anchor_16.position.set(0.0, 10.6, 0.0);
  socket_railings_ornaments_anchor_16.rotation.set(0.0, 0.0, 0.0);
  socket_railings_ornaments_anchor_16.userData.socket = {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_railings_3.add(socket_railings_ornaments_anchor_16);
  sockets["railings:ornaments-anchor"] = socket_railings_ornaments_anchor_16;
  const socket_railings_plaque_anchor_17 = new THREE.Object3D();
  socket_railings_plaque_anchor_17.name = "plaque-anchor";
  socket_railings_plaque_anchor_17.position.set(0.0, 5.85, 6.7);
  socket_railings_plaque_anchor_17.rotation.set(0.0, 0.0, 0.0);
  socket_railings_plaque_anchor_17.userData.socket = {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_railings_3.add(socket_railings_plaque_anchor_17);
  sockets["railings:plaque-anchor"] = socket_railings_plaque_anchor_17;

  const endpoint_columns_4 = makeAttachmentEndpoint(null);
  const node_columns_4 = new THREE.Group();
  node_columns_4.name = "columns__pivot";
  node_columns_4.scale.set(1, 1, 1);
  if (endpoint_columns_4) {
    node_columns_4.position.copy(endpoint_columns_4.start);
    node_columns_4.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_columns_4.position.set(0.0, 3.95, 0.0);
    node_columns_4.rotation.set(0.0, 0.0, 0.0);
  }
  node_columns_4.userData.sculptComponent = {"id": "columns", "name": "columns", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "columns-anchor", "localStart": [0, 3.95, 0], "localEnd": [0, 4.05, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 20.4, "height": 5.3, "depth": 12.6, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 3.95, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "columns", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "wood", "materialLayers": ["wood"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "round-red-shafts", "type": "geometry", "evidenceRefs": ["full-object"], "description": "round red shafts"}, {"id": "stone-column-bases", "type": "geometry", "evidenceRefs": ["full-object"], "description": "stone column bases"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(133, 61, 45, 1)", "secondaryAlbedo": "rgba(133, 61, 45, 1)", "materialClass": "wood", "materialClassConfidence": 0.85}};
  node_columns_4.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "columns", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_columns_4);
  nodes["columns"] = node_columns_4;
  const mesh_columns_4Geometry = endpoint_columns_4
    ? new THREE.CylinderGeometry(endpoint_columns_4.endRadius, endpoint_columns_4.baseRadius, endpoint_columns_4.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_columns_4) {
    mesh_columns_4Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_columns_4 = new THREE.Mesh(
    mesh_columns_4Geometry,
    materialMap["wood"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_columns_4.name = "columns";
  if (endpoint_columns_4) {
    mesh_columns_4.position.copy(endpoint_columns_4.midpoint);
    mesh_columns_4.quaternion.copy(endpoint_columns_4.quaternion);
  }
  mesh_columns_4.castShadow = options.castShadow ?? true;
  mesh_columns_4.receiveShadow = options.receiveShadow ?? true;
  mesh_columns_4.userData.sculptComponent = {"id": "columns", "name": "columns", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "columns-anchor", "localStart": [0, 3.95, 0], "localEnd": [0, 4.05, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 20.4, "height": 5.3, "depth": 12.6, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 3.95, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "columns", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "wood", "materialLayers": ["wood"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "round-red-shafts", "type": "geometry", "evidenceRefs": ["full-object"], "description": "round red shafts"}, {"id": "stone-column-bases", "type": "geometry", "evidenceRefs": ["full-object"], "description": "stone column bases"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(133, 61, 45, 1)", "secondaryAlbedo": "rgba(133, 61, 45, 1)", "materialClass": "wood", "materialClassConfidence": 0.85}};
  node_columns_4.add(mesh_columns_4);
  meshes["columns"] = mesh_columns_4;
  colliders["columns"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."};
  destructionGroups["columns"] ??= [];
  destructionGroups["columns"].push(node_columns_4);
  const socket_columns_foundation_anchor_0 = new THREE.Object3D();
  socket_columns_foundation_anchor_0.name = "foundation-anchor";
  socket_columns_foundation_anchor_0.position.set(0.0, 0.65, 0.0);
  socket_columns_foundation_anchor_0.rotation.set(0.0, 0.0, 0.0);
  socket_columns_foundation_anchor_0.userData.socket = {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_columns_4.add(socket_columns_foundation_anchor_0);
  sockets["columns:foundation-anchor"] = socket_columns_foundation_anchor_0;
  const socket_columns_stairs_anchor_1 = new THREE.Object3D();
  socket_columns_stairs_anchor_1.name = "stairs-anchor";
  socket_columns_stairs_anchor_1.position.set(0.0, 0.6, 11.5);
  socket_columns_stairs_anchor_1.rotation.set(0.0, 0.0, 0.0);
  socket_columns_stairs_anchor_1.userData.socket = {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_columns_4.add(socket_columns_stairs_anchor_1);
  sockets["columns:stairs-anchor"] = socket_columns_stairs_anchor_1;
  const socket_columns_railings_anchor_2 = new THREE.Object3D();
  socket_columns_railings_anchor_2.name = "railings-anchor";
  socket_columns_railings_anchor_2.position.set(0.0, 1.3, 0.0);
  socket_columns_railings_anchor_2.rotation.set(0.0, 0.0, 0.0);
  socket_columns_railings_anchor_2.userData.socket = {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_columns_4.add(socket_columns_railings_anchor_2);
  sockets["columns:railings-anchor"] = socket_columns_railings_anchor_2;
  const socket_columns_columns_anchor_3 = new THREE.Object3D();
  socket_columns_columns_anchor_3.name = "columns-anchor";
  socket_columns_columns_anchor_3.position.set(0.0, 3.95, 0.0);
  socket_columns_columns_anchor_3.rotation.set(0.0, 0.0, 0.0);
  socket_columns_columns_anchor_3.userData.socket = {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_columns_4.add(socket_columns_columns_anchor_3);
  sockets["columns:columns-anchor"] = socket_columns_columns_anchor_3;
  const socket_columns_beams_anchor_4 = new THREE.Object3D();
  socket_columns_beams_anchor_4.name = "beams-anchor";
  socket_columns_beams_anchor_4.position.set(0.0, 6.15, 0.0);
  socket_columns_beams_anchor_4.rotation.set(0.0, 0.0, 0.0);
  socket_columns_beams_anchor_4.userData.socket = {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_columns_4.add(socket_columns_beams_anchor_4);
  sockets["columns:beams-anchor"] = socket_columns_beams_anchor_4;
  const socket_columns_lower_roof_anchor_5 = new THREE.Object3D();
  socket_columns_lower_roof_anchor_5.name = "lower-roof-anchor";
  socket_columns_lower_roof_anchor_5.position.set(0.0, 6.8, 0.0);
  socket_columns_lower_roof_anchor_5.rotation.set(0.0, 0.0, 0.0);
  socket_columns_lower_roof_anchor_5.userData.socket = {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_columns_4.add(socket_columns_lower_roof_anchor_5);
  sockets["columns:lower-roof-anchor"] = socket_columns_lower_roof_anchor_5;
  const socket_columns_lower_tiles_anchor_6 = new THREE.Object3D();
  socket_columns_lower_tiles_anchor_6.name = "lower-tiles-anchor";
  socket_columns_lower_tiles_anchor_6.position.set(0.0, 6.9, 0.0);
  socket_columns_lower_tiles_anchor_6.rotation.set(0.0, 0.0, 0.0);
  socket_columns_lower_tiles_anchor_6.userData.socket = {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_columns_4.add(socket_columns_lower_tiles_anchor_6);
  sockets["columns:lower-tiles-anchor"] = socket_columns_lower_tiles_anchor_6;
  const socket_columns_lower_eaves_anchor_7 = new THREE.Object3D();
  socket_columns_lower_eaves_anchor_7.name = "lower-eaves-anchor";
  socket_columns_lower_eaves_anchor_7.position.set(0.0, 6.8, 0.0);
  socket_columns_lower_eaves_anchor_7.rotation.set(0.0, 0.0, 0.0);
  socket_columns_lower_eaves_anchor_7.userData.socket = {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_columns_4.add(socket_columns_lower_eaves_anchor_7);
  sockets["columns:lower-eaves-anchor"] = socket_columns_lower_eaves_anchor_7;
  const socket_columns_brackets_anchor_8 = new THREE.Object3D();
  socket_columns_brackets_anchor_8.name = "brackets-anchor";
  socket_columns_brackets_anchor_8.position.set(0.0, 6.4, 0.0);
  socket_columns_brackets_anchor_8.rotation.set(0.0, 0.0, 0.0);
  socket_columns_brackets_anchor_8.userData.socket = {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_columns_4.add(socket_columns_brackets_anchor_8);
  sockets["columns:brackets-anchor"] = socket_columns_brackets_anchor_8;
  const socket_columns_facades_anchor_9 = new THREE.Object3D();
  socket_columns_facades_anchor_9.name = "facades-anchor";
  socket_columns_facades_anchor_9.position.set(0.0, 3.9, 0.0);
  socket_columns_facades_anchor_9.rotation.set(0.0, 0.0, 0.0);
  socket_columns_facades_anchor_9.userData.socket = {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_columns_4.add(socket_columns_facades_anchor_9);
  sockets["columns:facades-anchor"] = socket_columns_facades_anchor_9;
  const socket_columns_front_doors_anchor_10 = new THREE.Object3D();
  socket_columns_front_doors_anchor_10.name = "front-doors-anchor";
  socket_columns_front_doors_anchor_10.position.set(0.0, 3.6, 5.92);
  socket_columns_front_doors_anchor_10.rotation.set(0.0, 0.0, 0.0);
  socket_columns_front_doors_anchor_10.userData.socket = {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_columns_4.add(socket_columns_front_doors_anchor_10);
  sockets["columns:front-doors-anchor"] = socket_columns_front_doors_anchor_10;
  const socket_columns_rear_windows_anchor_11 = new THREE.Object3D();
  socket_columns_rear_windows_anchor_11.name = "rear-windows-anchor";
  socket_columns_rear_windows_anchor_11.position.set(0.0, 3.8, -5.92);
  socket_columns_rear_windows_anchor_11.rotation.set(0.0, 0.0, 0.0);
  socket_columns_rear_windows_anchor_11.userData.socket = {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_columns_4.add(socket_columns_rear_windows_anchor_11);
  sockets["columns:rear-windows-anchor"] = socket_columns_rear_windows_anchor_11;
  const socket_columns_upper_walls_anchor_12 = new THREE.Object3D();
  socket_columns_upper_walls_anchor_12.name = "upper-walls-anchor";
  socket_columns_upper_walls_anchor_12.position.set(0.0, 10.45, 0.0);
  socket_columns_upper_walls_anchor_12.rotation.set(0.0, 0.0, 0.0);
  socket_columns_upper_walls_anchor_12.userData.socket = {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_columns_4.add(socket_columns_upper_walls_anchor_12);
  sockets["columns:upper-walls-anchor"] = socket_columns_upper_walls_anchor_12;
  const socket_columns_upper_columns_anchor_13 = new THREE.Object3D();
  socket_columns_upper_columns_anchor_13.name = "upper-columns-anchor";
  socket_columns_upper_columns_anchor_13.position.set(0.0, 10.5, 0.0);
  socket_columns_upper_columns_anchor_13.rotation.set(0.0, 0.0, 0.0);
  socket_columns_upper_columns_anchor_13.userData.socket = {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_columns_4.add(socket_columns_upper_columns_anchor_13);
  sockets["columns:upper-columns-anchor"] = socket_columns_upper_columns_anchor_13;
  const socket_columns_upper_roof_anchor_14 = new THREE.Object3D();
  socket_columns_upper_roof_anchor_14.name = "upper-roof-anchor";
  socket_columns_upper_roof_anchor_14.position.set(0.0, 11.65, 0.0);
  socket_columns_upper_roof_anchor_14.rotation.set(0.0, 0.0, 0.0);
  socket_columns_upper_roof_anchor_14.userData.socket = {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_columns_4.add(socket_columns_upper_roof_anchor_14);
  sockets["columns:upper-roof-anchor"] = socket_columns_upper_roof_anchor_14;
  const socket_columns_upper_tiles_anchor_15 = new THREE.Object3D();
  socket_columns_upper_tiles_anchor_15.name = "upper-tiles-anchor";
  socket_columns_upper_tiles_anchor_15.position.set(0.0, 11.75, 0.0);
  socket_columns_upper_tiles_anchor_15.rotation.set(0.0, 0.0, 0.0);
  socket_columns_upper_tiles_anchor_15.userData.socket = {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_columns_4.add(socket_columns_upper_tiles_anchor_15);
  sockets["columns:upper-tiles-anchor"] = socket_columns_upper_tiles_anchor_15;
  const socket_columns_ornaments_anchor_16 = new THREE.Object3D();
  socket_columns_ornaments_anchor_16.name = "ornaments-anchor";
  socket_columns_ornaments_anchor_16.position.set(0.0, 10.6, 0.0);
  socket_columns_ornaments_anchor_16.rotation.set(0.0, 0.0, 0.0);
  socket_columns_ornaments_anchor_16.userData.socket = {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_columns_4.add(socket_columns_ornaments_anchor_16);
  sockets["columns:ornaments-anchor"] = socket_columns_ornaments_anchor_16;
  const socket_columns_plaque_anchor_17 = new THREE.Object3D();
  socket_columns_plaque_anchor_17.name = "plaque-anchor";
  socket_columns_plaque_anchor_17.position.set(0.0, 5.85, 6.7);
  socket_columns_plaque_anchor_17.rotation.set(0.0, 0.0, 0.0);
  socket_columns_plaque_anchor_17.userData.socket = {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_columns_4.add(socket_columns_plaque_anchor_17);
  sockets["columns:plaque-anchor"] = socket_columns_plaque_anchor_17;

  const endpoint_beams_5 = makeAttachmentEndpoint(null);
  const node_beams_5 = new THREE.Group();
  node_beams_5.name = "beams__pivot";
  node_beams_5.scale.set(1, 1, 1);
  if (endpoint_beams_5) {
    node_beams_5.position.copy(endpoint_beams_5.start);
    node_beams_5.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_beams_5.position.set(0.0, 6.15, 0.0);
    node_beams_5.rotation.set(0.0, 0.0, 0.0);
  }
  node_beams_5.userData.sculptComponent = {"id": "beams", "name": "beams", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "beams-anchor", "localStart": [0, 6.15, 0], "localEnd": [0, 6.25, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 21.5, "height": 0.8, "depth": 13.2, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 6.15, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "beams", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "wood", "materialLayers": ["wood"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "teal-beam-inlays", "type": "geometry", "evidenceRefs": ["full-object"], "description": "teal beam inlays"}, {"id": "gold-beam-lines", "type": "geometry", "evidenceRefs": ["full-object"], "description": "gold beam lines"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(133, 61, 45, 1)", "secondaryAlbedo": "rgba(133, 61, 45, 1)", "materialClass": "wood", "materialClassConfidence": 0.85}};
  node_beams_5.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "beams", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_beams_5);
  nodes["beams"] = node_beams_5;
  const mesh_beams_5Geometry = endpoint_beams_5
    ? new THREE.CylinderGeometry(endpoint_beams_5.endRadius, endpoint_beams_5.baseRadius, endpoint_beams_5.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_beams_5) {
    mesh_beams_5Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_beams_5 = new THREE.Mesh(
    mesh_beams_5Geometry,
    materialMap["wood"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_beams_5.name = "beams";
  if (endpoint_beams_5) {
    mesh_beams_5.position.copy(endpoint_beams_5.midpoint);
    mesh_beams_5.quaternion.copy(endpoint_beams_5.quaternion);
  }
  mesh_beams_5.castShadow = options.castShadow ?? true;
  mesh_beams_5.receiveShadow = options.receiveShadow ?? true;
  mesh_beams_5.userData.sculptComponent = {"id": "beams", "name": "beams", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "beams-anchor", "localStart": [0, 6.15, 0], "localEnd": [0, 6.25, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 21.5, "height": 0.8, "depth": 13.2, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 6.15, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "beams", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "wood", "materialLayers": ["wood"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "teal-beam-inlays", "type": "geometry", "evidenceRefs": ["full-object"], "description": "teal beam inlays"}, {"id": "gold-beam-lines", "type": "geometry", "evidenceRefs": ["full-object"], "description": "gold beam lines"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(133, 61, 45, 1)", "secondaryAlbedo": "rgba(133, 61, 45, 1)", "materialClass": "wood", "materialClassConfidence": 0.85}};
  node_beams_5.add(mesh_beams_5);
  meshes["beams"] = mesh_beams_5;
  colliders["beams"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."};
  destructionGroups["beams"] ??= [];
  destructionGroups["beams"].push(node_beams_5);
  const socket_beams_foundation_anchor_0 = new THREE.Object3D();
  socket_beams_foundation_anchor_0.name = "foundation-anchor";
  socket_beams_foundation_anchor_0.position.set(0.0, 0.65, 0.0);
  socket_beams_foundation_anchor_0.rotation.set(0.0, 0.0, 0.0);
  socket_beams_foundation_anchor_0.userData.socket = {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_beams_5.add(socket_beams_foundation_anchor_0);
  sockets["beams:foundation-anchor"] = socket_beams_foundation_anchor_0;
  const socket_beams_stairs_anchor_1 = new THREE.Object3D();
  socket_beams_stairs_anchor_1.name = "stairs-anchor";
  socket_beams_stairs_anchor_1.position.set(0.0, 0.6, 11.5);
  socket_beams_stairs_anchor_1.rotation.set(0.0, 0.0, 0.0);
  socket_beams_stairs_anchor_1.userData.socket = {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_beams_5.add(socket_beams_stairs_anchor_1);
  sockets["beams:stairs-anchor"] = socket_beams_stairs_anchor_1;
  const socket_beams_railings_anchor_2 = new THREE.Object3D();
  socket_beams_railings_anchor_2.name = "railings-anchor";
  socket_beams_railings_anchor_2.position.set(0.0, 1.3, 0.0);
  socket_beams_railings_anchor_2.rotation.set(0.0, 0.0, 0.0);
  socket_beams_railings_anchor_2.userData.socket = {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_beams_5.add(socket_beams_railings_anchor_2);
  sockets["beams:railings-anchor"] = socket_beams_railings_anchor_2;
  const socket_beams_columns_anchor_3 = new THREE.Object3D();
  socket_beams_columns_anchor_3.name = "columns-anchor";
  socket_beams_columns_anchor_3.position.set(0.0, 3.95, 0.0);
  socket_beams_columns_anchor_3.rotation.set(0.0, 0.0, 0.0);
  socket_beams_columns_anchor_3.userData.socket = {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_beams_5.add(socket_beams_columns_anchor_3);
  sockets["beams:columns-anchor"] = socket_beams_columns_anchor_3;
  const socket_beams_beams_anchor_4 = new THREE.Object3D();
  socket_beams_beams_anchor_4.name = "beams-anchor";
  socket_beams_beams_anchor_4.position.set(0.0, 6.15, 0.0);
  socket_beams_beams_anchor_4.rotation.set(0.0, 0.0, 0.0);
  socket_beams_beams_anchor_4.userData.socket = {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_beams_5.add(socket_beams_beams_anchor_4);
  sockets["beams:beams-anchor"] = socket_beams_beams_anchor_4;
  const socket_beams_lower_roof_anchor_5 = new THREE.Object3D();
  socket_beams_lower_roof_anchor_5.name = "lower-roof-anchor";
  socket_beams_lower_roof_anchor_5.position.set(0.0, 6.8, 0.0);
  socket_beams_lower_roof_anchor_5.rotation.set(0.0, 0.0, 0.0);
  socket_beams_lower_roof_anchor_5.userData.socket = {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_beams_5.add(socket_beams_lower_roof_anchor_5);
  sockets["beams:lower-roof-anchor"] = socket_beams_lower_roof_anchor_5;
  const socket_beams_lower_tiles_anchor_6 = new THREE.Object3D();
  socket_beams_lower_tiles_anchor_6.name = "lower-tiles-anchor";
  socket_beams_lower_tiles_anchor_6.position.set(0.0, 6.9, 0.0);
  socket_beams_lower_tiles_anchor_6.rotation.set(0.0, 0.0, 0.0);
  socket_beams_lower_tiles_anchor_6.userData.socket = {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_beams_5.add(socket_beams_lower_tiles_anchor_6);
  sockets["beams:lower-tiles-anchor"] = socket_beams_lower_tiles_anchor_6;
  const socket_beams_lower_eaves_anchor_7 = new THREE.Object3D();
  socket_beams_lower_eaves_anchor_7.name = "lower-eaves-anchor";
  socket_beams_lower_eaves_anchor_7.position.set(0.0, 6.8, 0.0);
  socket_beams_lower_eaves_anchor_7.rotation.set(0.0, 0.0, 0.0);
  socket_beams_lower_eaves_anchor_7.userData.socket = {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_beams_5.add(socket_beams_lower_eaves_anchor_7);
  sockets["beams:lower-eaves-anchor"] = socket_beams_lower_eaves_anchor_7;
  const socket_beams_brackets_anchor_8 = new THREE.Object3D();
  socket_beams_brackets_anchor_8.name = "brackets-anchor";
  socket_beams_brackets_anchor_8.position.set(0.0, 6.4, 0.0);
  socket_beams_brackets_anchor_8.rotation.set(0.0, 0.0, 0.0);
  socket_beams_brackets_anchor_8.userData.socket = {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_beams_5.add(socket_beams_brackets_anchor_8);
  sockets["beams:brackets-anchor"] = socket_beams_brackets_anchor_8;
  const socket_beams_facades_anchor_9 = new THREE.Object3D();
  socket_beams_facades_anchor_9.name = "facades-anchor";
  socket_beams_facades_anchor_9.position.set(0.0, 3.9, 0.0);
  socket_beams_facades_anchor_9.rotation.set(0.0, 0.0, 0.0);
  socket_beams_facades_anchor_9.userData.socket = {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_beams_5.add(socket_beams_facades_anchor_9);
  sockets["beams:facades-anchor"] = socket_beams_facades_anchor_9;
  const socket_beams_front_doors_anchor_10 = new THREE.Object3D();
  socket_beams_front_doors_anchor_10.name = "front-doors-anchor";
  socket_beams_front_doors_anchor_10.position.set(0.0, 3.6, 5.92);
  socket_beams_front_doors_anchor_10.rotation.set(0.0, 0.0, 0.0);
  socket_beams_front_doors_anchor_10.userData.socket = {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_beams_5.add(socket_beams_front_doors_anchor_10);
  sockets["beams:front-doors-anchor"] = socket_beams_front_doors_anchor_10;
  const socket_beams_rear_windows_anchor_11 = new THREE.Object3D();
  socket_beams_rear_windows_anchor_11.name = "rear-windows-anchor";
  socket_beams_rear_windows_anchor_11.position.set(0.0, 3.8, -5.92);
  socket_beams_rear_windows_anchor_11.rotation.set(0.0, 0.0, 0.0);
  socket_beams_rear_windows_anchor_11.userData.socket = {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_beams_5.add(socket_beams_rear_windows_anchor_11);
  sockets["beams:rear-windows-anchor"] = socket_beams_rear_windows_anchor_11;
  const socket_beams_upper_walls_anchor_12 = new THREE.Object3D();
  socket_beams_upper_walls_anchor_12.name = "upper-walls-anchor";
  socket_beams_upper_walls_anchor_12.position.set(0.0, 10.45, 0.0);
  socket_beams_upper_walls_anchor_12.rotation.set(0.0, 0.0, 0.0);
  socket_beams_upper_walls_anchor_12.userData.socket = {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_beams_5.add(socket_beams_upper_walls_anchor_12);
  sockets["beams:upper-walls-anchor"] = socket_beams_upper_walls_anchor_12;
  const socket_beams_upper_columns_anchor_13 = new THREE.Object3D();
  socket_beams_upper_columns_anchor_13.name = "upper-columns-anchor";
  socket_beams_upper_columns_anchor_13.position.set(0.0, 10.5, 0.0);
  socket_beams_upper_columns_anchor_13.rotation.set(0.0, 0.0, 0.0);
  socket_beams_upper_columns_anchor_13.userData.socket = {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_beams_5.add(socket_beams_upper_columns_anchor_13);
  sockets["beams:upper-columns-anchor"] = socket_beams_upper_columns_anchor_13;
  const socket_beams_upper_roof_anchor_14 = new THREE.Object3D();
  socket_beams_upper_roof_anchor_14.name = "upper-roof-anchor";
  socket_beams_upper_roof_anchor_14.position.set(0.0, 11.65, 0.0);
  socket_beams_upper_roof_anchor_14.rotation.set(0.0, 0.0, 0.0);
  socket_beams_upper_roof_anchor_14.userData.socket = {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_beams_5.add(socket_beams_upper_roof_anchor_14);
  sockets["beams:upper-roof-anchor"] = socket_beams_upper_roof_anchor_14;
  const socket_beams_upper_tiles_anchor_15 = new THREE.Object3D();
  socket_beams_upper_tiles_anchor_15.name = "upper-tiles-anchor";
  socket_beams_upper_tiles_anchor_15.position.set(0.0, 11.75, 0.0);
  socket_beams_upper_tiles_anchor_15.rotation.set(0.0, 0.0, 0.0);
  socket_beams_upper_tiles_anchor_15.userData.socket = {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_beams_5.add(socket_beams_upper_tiles_anchor_15);
  sockets["beams:upper-tiles-anchor"] = socket_beams_upper_tiles_anchor_15;
  const socket_beams_ornaments_anchor_16 = new THREE.Object3D();
  socket_beams_ornaments_anchor_16.name = "ornaments-anchor";
  socket_beams_ornaments_anchor_16.position.set(0.0, 10.6, 0.0);
  socket_beams_ornaments_anchor_16.rotation.set(0.0, 0.0, 0.0);
  socket_beams_ornaments_anchor_16.userData.socket = {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_beams_5.add(socket_beams_ornaments_anchor_16);
  sockets["beams:ornaments-anchor"] = socket_beams_ornaments_anchor_16;
  const socket_beams_plaque_anchor_17 = new THREE.Object3D();
  socket_beams_plaque_anchor_17.name = "plaque-anchor";
  socket_beams_plaque_anchor_17.position.set(0.0, 5.85, 6.7);
  socket_beams_plaque_anchor_17.rotation.set(0.0, 0.0, 0.0);
  socket_beams_plaque_anchor_17.userData.socket = {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_beams_5.add(socket_beams_plaque_anchor_17);
  sockets["beams:plaque-anchor"] = socket_beams_plaque_anchor_17;

  const endpoint_lower_roof_6 = makeAttachmentEndpoint(null);
  const node_lower_roof_6 = new THREE.Group();
  node_lower_roof_6.name = "lower-roof__pivot";
  node_lower_roof_6.scale.set(1, 1, 1);
  if (endpoint_lower_roof_6) {
    node_lower_roof_6.position.copy(endpoint_lower_roof_6.start);
    node_lower_roof_6.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_lower_roof_6.position.set(0.0, 6.8, 0.0);
    node_lower_roof_6.rotation.set(0.0, 0.0, 0.0);
  }
  node_lower_roof_6.userData.sculptComponent = {"id": "lower-roof", "name": "lower-roof", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Thin curved four-slope roof with a connected underside and fascia.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "profile": {"points": [[-0.5, 0], [0, 0.2], [0.5, 0]], "depth": 1}, "architecturalRoof": {"halfWidth": 12.9, "halfDepth": 9.4, "rise": 3.1, "radialRows": 20, "slopePower": 1.75, "cornerLift": 0.9, "ridgeHalfLength": 3.9}}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "lower-roof-anchor", "localStart": [0, 6.8, 0], "localEnd": [0, 6.8999999999999995, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 25.8, "height": 3.1, "depth": 18.8, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 6.8, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "lower-roof", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "roof", "materialLayers": ["roof"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "curved-four-slope-skirt", "type": "geometry", "evidenceRefs": ["full-object"], "description": "curved four slope skirt"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(39, 94, 91, 1)", "secondaryAlbedo": "rgba(39, 94, 91, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.85}};
  node_lower_roof_6.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "lower-roof", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_lower_roof_6);
  nodes["lower-roof"] = node_lower_roof_6;
  const mesh_lower_roof_6Geometry = endpoint_lower_roof_6
    ? new THREE.CylinderGeometry(endpoint_lower_roof_6.endRadius, endpoint_lower_roof_6.baseRadius, endpoint_lower_roof_6.length, 32, 12)
    : buildExtrudeGeometry({"points": [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]], "depth": 0.1});
  if (!endpoint_lower_roof_6) {
    mesh_lower_roof_6Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_lower_roof_6 = new THREE.Mesh(
    mesh_lower_roof_6Geometry,
    materialMap["roof"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_lower_roof_6.name = "lower-roof";
  if (endpoint_lower_roof_6) {
    mesh_lower_roof_6.position.copy(endpoint_lower_roof_6.midpoint);
    mesh_lower_roof_6.quaternion.copy(endpoint_lower_roof_6.quaternion);
  }
  mesh_lower_roof_6.castShadow = options.castShadow ?? true;
  mesh_lower_roof_6.receiveShadow = options.receiveShadow ?? true;
  mesh_lower_roof_6.userData.sculptComponent = {"id": "lower-roof", "name": "lower-roof", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Thin curved four-slope roof with a connected underside and fascia.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "profile": {"points": [[-0.5, 0], [0, 0.2], [0.5, 0]], "depth": 1}, "architecturalRoof": {"halfWidth": 12.9, "halfDepth": 9.4, "rise": 3.1, "radialRows": 20, "slopePower": 1.75, "cornerLift": 0.9, "ridgeHalfLength": 3.9}}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "lower-roof-anchor", "localStart": [0, 6.8, 0], "localEnd": [0, 6.8999999999999995, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 25.8, "height": 3.1, "depth": 18.8, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 6.8, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "lower-roof", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "roof", "materialLayers": ["roof"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "curved-four-slope-skirt", "type": "geometry", "evidenceRefs": ["full-object"], "description": "curved four slope skirt"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(39, 94, 91, 1)", "secondaryAlbedo": "rgba(39, 94, 91, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.85}};
  node_lower_roof_6.add(mesh_lower_roof_6);
  meshes["lower-roof"] = mesh_lower_roof_6;
  colliders["lower-roof"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."};
  destructionGroups["lower-roof"] ??= [];
  destructionGroups["lower-roof"].push(node_lower_roof_6);
  const socket_lower_roof_foundation_anchor_0 = new THREE.Object3D();
  socket_lower_roof_foundation_anchor_0.name = "foundation-anchor";
  socket_lower_roof_foundation_anchor_0.position.set(0.0, 0.65, 0.0);
  socket_lower_roof_foundation_anchor_0.rotation.set(0.0, 0.0, 0.0);
  socket_lower_roof_foundation_anchor_0.userData.socket = {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_roof_6.add(socket_lower_roof_foundation_anchor_0);
  sockets["lower-roof:foundation-anchor"] = socket_lower_roof_foundation_anchor_0;
  const socket_lower_roof_stairs_anchor_1 = new THREE.Object3D();
  socket_lower_roof_stairs_anchor_1.name = "stairs-anchor";
  socket_lower_roof_stairs_anchor_1.position.set(0.0, 0.6, 11.5);
  socket_lower_roof_stairs_anchor_1.rotation.set(0.0, 0.0, 0.0);
  socket_lower_roof_stairs_anchor_1.userData.socket = {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_roof_6.add(socket_lower_roof_stairs_anchor_1);
  sockets["lower-roof:stairs-anchor"] = socket_lower_roof_stairs_anchor_1;
  const socket_lower_roof_railings_anchor_2 = new THREE.Object3D();
  socket_lower_roof_railings_anchor_2.name = "railings-anchor";
  socket_lower_roof_railings_anchor_2.position.set(0.0, 1.3, 0.0);
  socket_lower_roof_railings_anchor_2.rotation.set(0.0, 0.0, 0.0);
  socket_lower_roof_railings_anchor_2.userData.socket = {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_roof_6.add(socket_lower_roof_railings_anchor_2);
  sockets["lower-roof:railings-anchor"] = socket_lower_roof_railings_anchor_2;
  const socket_lower_roof_columns_anchor_3 = new THREE.Object3D();
  socket_lower_roof_columns_anchor_3.name = "columns-anchor";
  socket_lower_roof_columns_anchor_3.position.set(0.0, 3.95, 0.0);
  socket_lower_roof_columns_anchor_3.rotation.set(0.0, 0.0, 0.0);
  socket_lower_roof_columns_anchor_3.userData.socket = {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_roof_6.add(socket_lower_roof_columns_anchor_3);
  sockets["lower-roof:columns-anchor"] = socket_lower_roof_columns_anchor_3;
  const socket_lower_roof_beams_anchor_4 = new THREE.Object3D();
  socket_lower_roof_beams_anchor_4.name = "beams-anchor";
  socket_lower_roof_beams_anchor_4.position.set(0.0, 6.15, 0.0);
  socket_lower_roof_beams_anchor_4.rotation.set(0.0, 0.0, 0.0);
  socket_lower_roof_beams_anchor_4.userData.socket = {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_roof_6.add(socket_lower_roof_beams_anchor_4);
  sockets["lower-roof:beams-anchor"] = socket_lower_roof_beams_anchor_4;
  const socket_lower_roof_lower_roof_anchor_5 = new THREE.Object3D();
  socket_lower_roof_lower_roof_anchor_5.name = "lower-roof-anchor";
  socket_lower_roof_lower_roof_anchor_5.position.set(0.0, 6.8, 0.0);
  socket_lower_roof_lower_roof_anchor_5.rotation.set(0.0, 0.0, 0.0);
  socket_lower_roof_lower_roof_anchor_5.userData.socket = {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_roof_6.add(socket_lower_roof_lower_roof_anchor_5);
  sockets["lower-roof:lower-roof-anchor"] = socket_lower_roof_lower_roof_anchor_5;
  const socket_lower_roof_lower_tiles_anchor_6 = new THREE.Object3D();
  socket_lower_roof_lower_tiles_anchor_6.name = "lower-tiles-anchor";
  socket_lower_roof_lower_tiles_anchor_6.position.set(0.0, 6.9, 0.0);
  socket_lower_roof_lower_tiles_anchor_6.rotation.set(0.0, 0.0, 0.0);
  socket_lower_roof_lower_tiles_anchor_6.userData.socket = {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_roof_6.add(socket_lower_roof_lower_tiles_anchor_6);
  sockets["lower-roof:lower-tiles-anchor"] = socket_lower_roof_lower_tiles_anchor_6;
  const socket_lower_roof_lower_eaves_anchor_7 = new THREE.Object3D();
  socket_lower_roof_lower_eaves_anchor_7.name = "lower-eaves-anchor";
  socket_lower_roof_lower_eaves_anchor_7.position.set(0.0, 6.8, 0.0);
  socket_lower_roof_lower_eaves_anchor_7.rotation.set(0.0, 0.0, 0.0);
  socket_lower_roof_lower_eaves_anchor_7.userData.socket = {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_roof_6.add(socket_lower_roof_lower_eaves_anchor_7);
  sockets["lower-roof:lower-eaves-anchor"] = socket_lower_roof_lower_eaves_anchor_7;
  const socket_lower_roof_brackets_anchor_8 = new THREE.Object3D();
  socket_lower_roof_brackets_anchor_8.name = "brackets-anchor";
  socket_lower_roof_brackets_anchor_8.position.set(0.0, 6.4, 0.0);
  socket_lower_roof_brackets_anchor_8.rotation.set(0.0, 0.0, 0.0);
  socket_lower_roof_brackets_anchor_8.userData.socket = {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_roof_6.add(socket_lower_roof_brackets_anchor_8);
  sockets["lower-roof:brackets-anchor"] = socket_lower_roof_brackets_anchor_8;
  const socket_lower_roof_facades_anchor_9 = new THREE.Object3D();
  socket_lower_roof_facades_anchor_9.name = "facades-anchor";
  socket_lower_roof_facades_anchor_9.position.set(0.0, 3.9, 0.0);
  socket_lower_roof_facades_anchor_9.rotation.set(0.0, 0.0, 0.0);
  socket_lower_roof_facades_anchor_9.userData.socket = {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_roof_6.add(socket_lower_roof_facades_anchor_9);
  sockets["lower-roof:facades-anchor"] = socket_lower_roof_facades_anchor_9;
  const socket_lower_roof_front_doors_anchor_10 = new THREE.Object3D();
  socket_lower_roof_front_doors_anchor_10.name = "front-doors-anchor";
  socket_lower_roof_front_doors_anchor_10.position.set(0.0, 3.6, 5.92);
  socket_lower_roof_front_doors_anchor_10.rotation.set(0.0, 0.0, 0.0);
  socket_lower_roof_front_doors_anchor_10.userData.socket = {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_roof_6.add(socket_lower_roof_front_doors_anchor_10);
  sockets["lower-roof:front-doors-anchor"] = socket_lower_roof_front_doors_anchor_10;
  const socket_lower_roof_rear_windows_anchor_11 = new THREE.Object3D();
  socket_lower_roof_rear_windows_anchor_11.name = "rear-windows-anchor";
  socket_lower_roof_rear_windows_anchor_11.position.set(0.0, 3.8, -5.92);
  socket_lower_roof_rear_windows_anchor_11.rotation.set(0.0, 0.0, 0.0);
  socket_lower_roof_rear_windows_anchor_11.userData.socket = {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_roof_6.add(socket_lower_roof_rear_windows_anchor_11);
  sockets["lower-roof:rear-windows-anchor"] = socket_lower_roof_rear_windows_anchor_11;
  const socket_lower_roof_upper_walls_anchor_12 = new THREE.Object3D();
  socket_lower_roof_upper_walls_anchor_12.name = "upper-walls-anchor";
  socket_lower_roof_upper_walls_anchor_12.position.set(0.0, 10.45, 0.0);
  socket_lower_roof_upper_walls_anchor_12.rotation.set(0.0, 0.0, 0.0);
  socket_lower_roof_upper_walls_anchor_12.userData.socket = {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_roof_6.add(socket_lower_roof_upper_walls_anchor_12);
  sockets["lower-roof:upper-walls-anchor"] = socket_lower_roof_upper_walls_anchor_12;
  const socket_lower_roof_upper_columns_anchor_13 = new THREE.Object3D();
  socket_lower_roof_upper_columns_anchor_13.name = "upper-columns-anchor";
  socket_lower_roof_upper_columns_anchor_13.position.set(0.0, 10.5, 0.0);
  socket_lower_roof_upper_columns_anchor_13.rotation.set(0.0, 0.0, 0.0);
  socket_lower_roof_upper_columns_anchor_13.userData.socket = {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_roof_6.add(socket_lower_roof_upper_columns_anchor_13);
  sockets["lower-roof:upper-columns-anchor"] = socket_lower_roof_upper_columns_anchor_13;
  const socket_lower_roof_upper_roof_anchor_14 = new THREE.Object3D();
  socket_lower_roof_upper_roof_anchor_14.name = "upper-roof-anchor";
  socket_lower_roof_upper_roof_anchor_14.position.set(0.0, 11.65, 0.0);
  socket_lower_roof_upper_roof_anchor_14.rotation.set(0.0, 0.0, 0.0);
  socket_lower_roof_upper_roof_anchor_14.userData.socket = {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_roof_6.add(socket_lower_roof_upper_roof_anchor_14);
  sockets["lower-roof:upper-roof-anchor"] = socket_lower_roof_upper_roof_anchor_14;
  const socket_lower_roof_upper_tiles_anchor_15 = new THREE.Object3D();
  socket_lower_roof_upper_tiles_anchor_15.name = "upper-tiles-anchor";
  socket_lower_roof_upper_tiles_anchor_15.position.set(0.0, 11.75, 0.0);
  socket_lower_roof_upper_tiles_anchor_15.rotation.set(0.0, 0.0, 0.0);
  socket_lower_roof_upper_tiles_anchor_15.userData.socket = {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_roof_6.add(socket_lower_roof_upper_tiles_anchor_15);
  sockets["lower-roof:upper-tiles-anchor"] = socket_lower_roof_upper_tiles_anchor_15;
  const socket_lower_roof_ornaments_anchor_16 = new THREE.Object3D();
  socket_lower_roof_ornaments_anchor_16.name = "ornaments-anchor";
  socket_lower_roof_ornaments_anchor_16.position.set(0.0, 10.6, 0.0);
  socket_lower_roof_ornaments_anchor_16.rotation.set(0.0, 0.0, 0.0);
  socket_lower_roof_ornaments_anchor_16.userData.socket = {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_roof_6.add(socket_lower_roof_ornaments_anchor_16);
  sockets["lower-roof:ornaments-anchor"] = socket_lower_roof_ornaments_anchor_16;
  const socket_lower_roof_plaque_anchor_17 = new THREE.Object3D();
  socket_lower_roof_plaque_anchor_17.name = "plaque-anchor";
  socket_lower_roof_plaque_anchor_17.position.set(0.0, 5.85, 6.7);
  socket_lower_roof_plaque_anchor_17.rotation.set(0.0, 0.0, 0.0);
  socket_lower_roof_plaque_anchor_17.userData.socket = {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_roof_6.add(socket_lower_roof_plaque_anchor_17);
  sockets["lower-roof:plaque-anchor"] = socket_lower_roof_plaque_anchor_17;

  const endpoint_lower_tiles_7 = makeAttachmentEndpoint(null);
  const node_lower_tiles_7 = new THREE.Group();
  node_lower_tiles_7.name = "lower-tiles__pivot";
  node_lower_tiles_7.scale.set(1, 1, 1);
  if (endpoint_lower_tiles_7) {
    node_lower_tiles_7.position.copy(endpoint_lower_tiles_7.start);
    node_lower_tiles_7.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_lower_tiles_7.position.set(0.0, 6.9, 0.0);
    node_lower_tiles_7.rotation.set(0.0, 0.0, 0.0);
  }
  node_lower_tiles_7.userData.sculptComponent = {"id": "lower-tiles", "name": "lower-tiles", "level": "micro", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "lower-tiles-anchor", "localStart": [0, 6.9, 0], "localEnd": [0, 7.0, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 25.8, "height": 3.1, "depth": 18.8, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 6.9, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "lower-tiles", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "roof", "materialLayers": ["roof"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dense-roof-rolls", "type": "geometry", "evidenceRefs": ["full-object"], "description": "dense roof rolls"}, {"id": "circular-tile-endcaps", "type": "geometry", "evidenceRefs": ["full-object"], "description": "circular tile endcaps"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(39, 94, 91, 1)", "secondaryAlbedo": "rgba(39, 94, 91, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.85}};
  node_lower_tiles_7.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "lower-tiles", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_lower_tiles_7);
  nodes["lower-tiles"] = node_lower_tiles_7;
  const mesh_lower_tiles_7Geometry = endpoint_lower_tiles_7
    ? new THREE.CylinderGeometry(endpoint_lower_tiles_7.endRadius, endpoint_lower_tiles_7.baseRadius, endpoint_lower_tiles_7.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_lower_tiles_7) {
    mesh_lower_tiles_7Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_lower_tiles_7 = new THREE.Mesh(
    mesh_lower_tiles_7Geometry,
    materialMap["roof"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_lower_tiles_7.name = "lower-tiles";
  if (endpoint_lower_tiles_7) {
    mesh_lower_tiles_7.position.copy(endpoint_lower_tiles_7.midpoint);
    mesh_lower_tiles_7.quaternion.copy(endpoint_lower_tiles_7.quaternion);
  }
  mesh_lower_tiles_7.castShadow = options.castShadow ?? true;
  mesh_lower_tiles_7.receiveShadow = options.receiveShadow ?? true;
  mesh_lower_tiles_7.userData.sculptComponent = {"id": "lower-tiles", "name": "lower-tiles", "level": "micro", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "lower-tiles-anchor", "localStart": [0, 6.9, 0], "localEnd": [0, 7.0, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 25.8, "height": 3.1, "depth": 18.8, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 6.9, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "lower-tiles", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "roof", "materialLayers": ["roof"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dense-roof-rolls", "type": "geometry", "evidenceRefs": ["full-object"], "description": "dense roof rolls"}, {"id": "circular-tile-endcaps", "type": "geometry", "evidenceRefs": ["full-object"], "description": "circular tile endcaps"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(39, 94, 91, 1)", "secondaryAlbedo": "rgba(39, 94, 91, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.85}};
  node_lower_tiles_7.add(mesh_lower_tiles_7);
  meshes["lower-tiles"] = mesh_lower_tiles_7;
  colliders["lower-tiles"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."};
  destructionGroups["lower-tiles"] ??= [];
  destructionGroups["lower-tiles"].push(node_lower_tiles_7);
  const socket_lower_tiles_foundation_anchor_0 = new THREE.Object3D();
  socket_lower_tiles_foundation_anchor_0.name = "foundation-anchor";
  socket_lower_tiles_foundation_anchor_0.position.set(0.0, 0.65, 0.0);
  socket_lower_tiles_foundation_anchor_0.rotation.set(0.0, 0.0, 0.0);
  socket_lower_tiles_foundation_anchor_0.userData.socket = {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_tiles_7.add(socket_lower_tiles_foundation_anchor_0);
  sockets["lower-tiles:foundation-anchor"] = socket_lower_tiles_foundation_anchor_0;
  const socket_lower_tiles_stairs_anchor_1 = new THREE.Object3D();
  socket_lower_tiles_stairs_anchor_1.name = "stairs-anchor";
  socket_lower_tiles_stairs_anchor_1.position.set(0.0, 0.6, 11.5);
  socket_lower_tiles_stairs_anchor_1.rotation.set(0.0, 0.0, 0.0);
  socket_lower_tiles_stairs_anchor_1.userData.socket = {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_tiles_7.add(socket_lower_tiles_stairs_anchor_1);
  sockets["lower-tiles:stairs-anchor"] = socket_lower_tiles_stairs_anchor_1;
  const socket_lower_tiles_railings_anchor_2 = new THREE.Object3D();
  socket_lower_tiles_railings_anchor_2.name = "railings-anchor";
  socket_lower_tiles_railings_anchor_2.position.set(0.0, 1.3, 0.0);
  socket_lower_tiles_railings_anchor_2.rotation.set(0.0, 0.0, 0.0);
  socket_lower_tiles_railings_anchor_2.userData.socket = {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_tiles_7.add(socket_lower_tiles_railings_anchor_2);
  sockets["lower-tiles:railings-anchor"] = socket_lower_tiles_railings_anchor_2;
  const socket_lower_tiles_columns_anchor_3 = new THREE.Object3D();
  socket_lower_tiles_columns_anchor_3.name = "columns-anchor";
  socket_lower_tiles_columns_anchor_3.position.set(0.0, 3.95, 0.0);
  socket_lower_tiles_columns_anchor_3.rotation.set(0.0, 0.0, 0.0);
  socket_lower_tiles_columns_anchor_3.userData.socket = {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_tiles_7.add(socket_lower_tiles_columns_anchor_3);
  sockets["lower-tiles:columns-anchor"] = socket_lower_tiles_columns_anchor_3;
  const socket_lower_tiles_beams_anchor_4 = new THREE.Object3D();
  socket_lower_tiles_beams_anchor_4.name = "beams-anchor";
  socket_lower_tiles_beams_anchor_4.position.set(0.0, 6.15, 0.0);
  socket_lower_tiles_beams_anchor_4.rotation.set(0.0, 0.0, 0.0);
  socket_lower_tiles_beams_anchor_4.userData.socket = {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_tiles_7.add(socket_lower_tiles_beams_anchor_4);
  sockets["lower-tiles:beams-anchor"] = socket_lower_tiles_beams_anchor_4;
  const socket_lower_tiles_lower_roof_anchor_5 = new THREE.Object3D();
  socket_lower_tiles_lower_roof_anchor_5.name = "lower-roof-anchor";
  socket_lower_tiles_lower_roof_anchor_5.position.set(0.0, 6.8, 0.0);
  socket_lower_tiles_lower_roof_anchor_5.rotation.set(0.0, 0.0, 0.0);
  socket_lower_tiles_lower_roof_anchor_5.userData.socket = {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_tiles_7.add(socket_lower_tiles_lower_roof_anchor_5);
  sockets["lower-tiles:lower-roof-anchor"] = socket_lower_tiles_lower_roof_anchor_5;
  const socket_lower_tiles_lower_tiles_anchor_6 = new THREE.Object3D();
  socket_lower_tiles_lower_tiles_anchor_6.name = "lower-tiles-anchor";
  socket_lower_tiles_lower_tiles_anchor_6.position.set(0.0, 6.9, 0.0);
  socket_lower_tiles_lower_tiles_anchor_6.rotation.set(0.0, 0.0, 0.0);
  socket_lower_tiles_lower_tiles_anchor_6.userData.socket = {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_tiles_7.add(socket_lower_tiles_lower_tiles_anchor_6);
  sockets["lower-tiles:lower-tiles-anchor"] = socket_lower_tiles_lower_tiles_anchor_6;
  const socket_lower_tiles_lower_eaves_anchor_7 = new THREE.Object3D();
  socket_lower_tiles_lower_eaves_anchor_7.name = "lower-eaves-anchor";
  socket_lower_tiles_lower_eaves_anchor_7.position.set(0.0, 6.8, 0.0);
  socket_lower_tiles_lower_eaves_anchor_7.rotation.set(0.0, 0.0, 0.0);
  socket_lower_tiles_lower_eaves_anchor_7.userData.socket = {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_tiles_7.add(socket_lower_tiles_lower_eaves_anchor_7);
  sockets["lower-tiles:lower-eaves-anchor"] = socket_lower_tiles_lower_eaves_anchor_7;
  const socket_lower_tiles_brackets_anchor_8 = new THREE.Object3D();
  socket_lower_tiles_brackets_anchor_8.name = "brackets-anchor";
  socket_lower_tiles_brackets_anchor_8.position.set(0.0, 6.4, 0.0);
  socket_lower_tiles_brackets_anchor_8.rotation.set(0.0, 0.0, 0.0);
  socket_lower_tiles_brackets_anchor_8.userData.socket = {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_tiles_7.add(socket_lower_tiles_brackets_anchor_8);
  sockets["lower-tiles:brackets-anchor"] = socket_lower_tiles_brackets_anchor_8;
  const socket_lower_tiles_facades_anchor_9 = new THREE.Object3D();
  socket_lower_tiles_facades_anchor_9.name = "facades-anchor";
  socket_lower_tiles_facades_anchor_9.position.set(0.0, 3.9, 0.0);
  socket_lower_tiles_facades_anchor_9.rotation.set(0.0, 0.0, 0.0);
  socket_lower_tiles_facades_anchor_9.userData.socket = {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_tiles_7.add(socket_lower_tiles_facades_anchor_9);
  sockets["lower-tiles:facades-anchor"] = socket_lower_tiles_facades_anchor_9;
  const socket_lower_tiles_front_doors_anchor_10 = new THREE.Object3D();
  socket_lower_tiles_front_doors_anchor_10.name = "front-doors-anchor";
  socket_lower_tiles_front_doors_anchor_10.position.set(0.0, 3.6, 5.92);
  socket_lower_tiles_front_doors_anchor_10.rotation.set(0.0, 0.0, 0.0);
  socket_lower_tiles_front_doors_anchor_10.userData.socket = {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_tiles_7.add(socket_lower_tiles_front_doors_anchor_10);
  sockets["lower-tiles:front-doors-anchor"] = socket_lower_tiles_front_doors_anchor_10;
  const socket_lower_tiles_rear_windows_anchor_11 = new THREE.Object3D();
  socket_lower_tiles_rear_windows_anchor_11.name = "rear-windows-anchor";
  socket_lower_tiles_rear_windows_anchor_11.position.set(0.0, 3.8, -5.92);
  socket_lower_tiles_rear_windows_anchor_11.rotation.set(0.0, 0.0, 0.0);
  socket_lower_tiles_rear_windows_anchor_11.userData.socket = {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_tiles_7.add(socket_lower_tiles_rear_windows_anchor_11);
  sockets["lower-tiles:rear-windows-anchor"] = socket_lower_tiles_rear_windows_anchor_11;
  const socket_lower_tiles_upper_walls_anchor_12 = new THREE.Object3D();
  socket_lower_tiles_upper_walls_anchor_12.name = "upper-walls-anchor";
  socket_lower_tiles_upper_walls_anchor_12.position.set(0.0, 10.45, 0.0);
  socket_lower_tiles_upper_walls_anchor_12.rotation.set(0.0, 0.0, 0.0);
  socket_lower_tiles_upper_walls_anchor_12.userData.socket = {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_tiles_7.add(socket_lower_tiles_upper_walls_anchor_12);
  sockets["lower-tiles:upper-walls-anchor"] = socket_lower_tiles_upper_walls_anchor_12;
  const socket_lower_tiles_upper_columns_anchor_13 = new THREE.Object3D();
  socket_lower_tiles_upper_columns_anchor_13.name = "upper-columns-anchor";
  socket_lower_tiles_upper_columns_anchor_13.position.set(0.0, 10.5, 0.0);
  socket_lower_tiles_upper_columns_anchor_13.rotation.set(0.0, 0.0, 0.0);
  socket_lower_tiles_upper_columns_anchor_13.userData.socket = {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_tiles_7.add(socket_lower_tiles_upper_columns_anchor_13);
  sockets["lower-tiles:upper-columns-anchor"] = socket_lower_tiles_upper_columns_anchor_13;
  const socket_lower_tiles_upper_roof_anchor_14 = new THREE.Object3D();
  socket_lower_tiles_upper_roof_anchor_14.name = "upper-roof-anchor";
  socket_lower_tiles_upper_roof_anchor_14.position.set(0.0, 11.65, 0.0);
  socket_lower_tiles_upper_roof_anchor_14.rotation.set(0.0, 0.0, 0.0);
  socket_lower_tiles_upper_roof_anchor_14.userData.socket = {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_tiles_7.add(socket_lower_tiles_upper_roof_anchor_14);
  sockets["lower-tiles:upper-roof-anchor"] = socket_lower_tiles_upper_roof_anchor_14;
  const socket_lower_tiles_upper_tiles_anchor_15 = new THREE.Object3D();
  socket_lower_tiles_upper_tiles_anchor_15.name = "upper-tiles-anchor";
  socket_lower_tiles_upper_tiles_anchor_15.position.set(0.0, 11.75, 0.0);
  socket_lower_tiles_upper_tiles_anchor_15.rotation.set(0.0, 0.0, 0.0);
  socket_lower_tiles_upper_tiles_anchor_15.userData.socket = {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_tiles_7.add(socket_lower_tiles_upper_tiles_anchor_15);
  sockets["lower-tiles:upper-tiles-anchor"] = socket_lower_tiles_upper_tiles_anchor_15;
  const socket_lower_tiles_ornaments_anchor_16 = new THREE.Object3D();
  socket_lower_tiles_ornaments_anchor_16.name = "ornaments-anchor";
  socket_lower_tiles_ornaments_anchor_16.position.set(0.0, 10.6, 0.0);
  socket_lower_tiles_ornaments_anchor_16.rotation.set(0.0, 0.0, 0.0);
  socket_lower_tiles_ornaments_anchor_16.userData.socket = {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_tiles_7.add(socket_lower_tiles_ornaments_anchor_16);
  sockets["lower-tiles:ornaments-anchor"] = socket_lower_tiles_ornaments_anchor_16;
  const socket_lower_tiles_plaque_anchor_17 = new THREE.Object3D();
  socket_lower_tiles_plaque_anchor_17.name = "plaque-anchor";
  socket_lower_tiles_plaque_anchor_17.position.set(0.0, 5.85, 6.7);
  socket_lower_tiles_plaque_anchor_17.rotation.set(0.0, 0.0, 0.0);
  socket_lower_tiles_plaque_anchor_17.userData.socket = {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_tiles_7.add(socket_lower_tiles_plaque_anchor_17);
  sockets["lower-tiles:plaque-anchor"] = socket_lower_tiles_plaque_anchor_17;

  const endpoint_lower_eaves_8 = makeAttachmentEndpoint(null);
  const node_lower_eaves_8 = new THREE.Group();
  node_lower_eaves_8.name = "lower-eaves__pivot";
  node_lower_eaves_8.scale.set(1, 1, 1);
  if (endpoint_lower_eaves_8) {
    node_lower_eaves_8.position.copy(endpoint_lower_eaves_8.start);
    node_lower_eaves_8.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_lower_eaves_8.position.set(0.0, 6.8, 0.0);
    node_lower_eaves_8.rotation.set(0.0, 0.0, 0.0);
  }
  node_lower_eaves_8.userData.sculptComponent = {"id": "lower-eaves", "name": "lower-eaves", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "lower-eaves-anchor", "localStart": [0, 6.8, 0], "localEnd": [0, 6.8999999999999995, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 25.8, "height": 1.2, "depth": 18.8, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 6.8, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "lower-eaves", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "roof", "materialLayers": ["roof"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "thick-eave-fascia", "type": "geometry", "evidenceRefs": ["full-object"], "description": "thick eave fascia"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(39, 94, 91, 1)", "secondaryAlbedo": "rgba(39, 94, 91, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.85}};
  node_lower_eaves_8.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "lower-eaves", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_lower_eaves_8);
  nodes["lower-eaves"] = node_lower_eaves_8;
  const mesh_lower_eaves_8Geometry = endpoint_lower_eaves_8
    ? new THREE.CylinderGeometry(endpoint_lower_eaves_8.endRadius, endpoint_lower_eaves_8.baseRadius, endpoint_lower_eaves_8.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_lower_eaves_8) {
    mesh_lower_eaves_8Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_lower_eaves_8 = new THREE.Mesh(
    mesh_lower_eaves_8Geometry,
    materialMap["roof"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_lower_eaves_8.name = "lower-eaves";
  if (endpoint_lower_eaves_8) {
    mesh_lower_eaves_8.position.copy(endpoint_lower_eaves_8.midpoint);
    mesh_lower_eaves_8.quaternion.copy(endpoint_lower_eaves_8.quaternion);
  }
  mesh_lower_eaves_8.castShadow = options.castShadow ?? true;
  mesh_lower_eaves_8.receiveShadow = options.receiveShadow ?? true;
  mesh_lower_eaves_8.userData.sculptComponent = {"id": "lower-eaves", "name": "lower-eaves", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "lower-eaves-anchor", "localStart": [0, 6.8, 0], "localEnd": [0, 6.8999999999999995, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 25.8, "height": 1.2, "depth": 18.8, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 6.8, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "lower-eaves", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "roof", "materialLayers": ["roof"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "thick-eave-fascia", "type": "geometry", "evidenceRefs": ["full-object"], "description": "thick eave fascia"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(39, 94, 91, 1)", "secondaryAlbedo": "rgba(39, 94, 91, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.85}};
  node_lower_eaves_8.add(mesh_lower_eaves_8);
  meshes["lower-eaves"] = mesh_lower_eaves_8;
  colliders["lower-eaves"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."};
  destructionGroups["lower-eaves"] ??= [];
  destructionGroups["lower-eaves"].push(node_lower_eaves_8);
  const socket_lower_eaves_foundation_anchor_0 = new THREE.Object3D();
  socket_lower_eaves_foundation_anchor_0.name = "foundation-anchor";
  socket_lower_eaves_foundation_anchor_0.position.set(0.0, 0.65, 0.0);
  socket_lower_eaves_foundation_anchor_0.rotation.set(0.0, 0.0, 0.0);
  socket_lower_eaves_foundation_anchor_0.userData.socket = {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_eaves_8.add(socket_lower_eaves_foundation_anchor_0);
  sockets["lower-eaves:foundation-anchor"] = socket_lower_eaves_foundation_anchor_0;
  const socket_lower_eaves_stairs_anchor_1 = new THREE.Object3D();
  socket_lower_eaves_stairs_anchor_1.name = "stairs-anchor";
  socket_lower_eaves_stairs_anchor_1.position.set(0.0, 0.6, 11.5);
  socket_lower_eaves_stairs_anchor_1.rotation.set(0.0, 0.0, 0.0);
  socket_lower_eaves_stairs_anchor_1.userData.socket = {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_eaves_8.add(socket_lower_eaves_stairs_anchor_1);
  sockets["lower-eaves:stairs-anchor"] = socket_lower_eaves_stairs_anchor_1;
  const socket_lower_eaves_railings_anchor_2 = new THREE.Object3D();
  socket_lower_eaves_railings_anchor_2.name = "railings-anchor";
  socket_lower_eaves_railings_anchor_2.position.set(0.0, 1.3, 0.0);
  socket_lower_eaves_railings_anchor_2.rotation.set(0.0, 0.0, 0.0);
  socket_lower_eaves_railings_anchor_2.userData.socket = {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_eaves_8.add(socket_lower_eaves_railings_anchor_2);
  sockets["lower-eaves:railings-anchor"] = socket_lower_eaves_railings_anchor_2;
  const socket_lower_eaves_columns_anchor_3 = new THREE.Object3D();
  socket_lower_eaves_columns_anchor_3.name = "columns-anchor";
  socket_lower_eaves_columns_anchor_3.position.set(0.0, 3.95, 0.0);
  socket_lower_eaves_columns_anchor_3.rotation.set(0.0, 0.0, 0.0);
  socket_lower_eaves_columns_anchor_3.userData.socket = {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_eaves_8.add(socket_lower_eaves_columns_anchor_3);
  sockets["lower-eaves:columns-anchor"] = socket_lower_eaves_columns_anchor_3;
  const socket_lower_eaves_beams_anchor_4 = new THREE.Object3D();
  socket_lower_eaves_beams_anchor_4.name = "beams-anchor";
  socket_lower_eaves_beams_anchor_4.position.set(0.0, 6.15, 0.0);
  socket_lower_eaves_beams_anchor_4.rotation.set(0.0, 0.0, 0.0);
  socket_lower_eaves_beams_anchor_4.userData.socket = {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_eaves_8.add(socket_lower_eaves_beams_anchor_4);
  sockets["lower-eaves:beams-anchor"] = socket_lower_eaves_beams_anchor_4;
  const socket_lower_eaves_lower_roof_anchor_5 = new THREE.Object3D();
  socket_lower_eaves_lower_roof_anchor_5.name = "lower-roof-anchor";
  socket_lower_eaves_lower_roof_anchor_5.position.set(0.0, 6.8, 0.0);
  socket_lower_eaves_lower_roof_anchor_5.rotation.set(0.0, 0.0, 0.0);
  socket_lower_eaves_lower_roof_anchor_5.userData.socket = {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_eaves_8.add(socket_lower_eaves_lower_roof_anchor_5);
  sockets["lower-eaves:lower-roof-anchor"] = socket_lower_eaves_lower_roof_anchor_5;
  const socket_lower_eaves_lower_tiles_anchor_6 = new THREE.Object3D();
  socket_lower_eaves_lower_tiles_anchor_6.name = "lower-tiles-anchor";
  socket_lower_eaves_lower_tiles_anchor_6.position.set(0.0, 6.9, 0.0);
  socket_lower_eaves_lower_tiles_anchor_6.rotation.set(0.0, 0.0, 0.0);
  socket_lower_eaves_lower_tiles_anchor_6.userData.socket = {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_eaves_8.add(socket_lower_eaves_lower_tiles_anchor_6);
  sockets["lower-eaves:lower-tiles-anchor"] = socket_lower_eaves_lower_tiles_anchor_6;
  const socket_lower_eaves_lower_eaves_anchor_7 = new THREE.Object3D();
  socket_lower_eaves_lower_eaves_anchor_7.name = "lower-eaves-anchor";
  socket_lower_eaves_lower_eaves_anchor_7.position.set(0.0, 6.8, 0.0);
  socket_lower_eaves_lower_eaves_anchor_7.rotation.set(0.0, 0.0, 0.0);
  socket_lower_eaves_lower_eaves_anchor_7.userData.socket = {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_eaves_8.add(socket_lower_eaves_lower_eaves_anchor_7);
  sockets["lower-eaves:lower-eaves-anchor"] = socket_lower_eaves_lower_eaves_anchor_7;
  const socket_lower_eaves_brackets_anchor_8 = new THREE.Object3D();
  socket_lower_eaves_brackets_anchor_8.name = "brackets-anchor";
  socket_lower_eaves_brackets_anchor_8.position.set(0.0, 6.4, 0.0);
  socket_lower_eaves_brackets_anchor_8.rotation.set(0.0, 0.0, 0.0);
  socket_lower_eaves_brackets_anchor_8.userData.socket = {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_eaves_8.add(socket_lower_eaves_brackets_anchor_8);
  sockets["lower-eaves:brackets-anchor"] = socket_lower_eaves_brackets_anchor_8;
  const socket_lower_eaves_facades_anchor_9 = new THREE.Object3D();
  socket_lower_eaves_facades_anchor_9.name = "facades-anchor";
  socket_lower_eaves_facades_anchor_9.position.set(0.0, 3.9, 0.0);
  socket_lower_eaves_facades_anchor_9.rotation.set(0.0, 0.0, 0.0);
  socket_lower_eaves_facades_anchor_9.userData.socket = {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_eaves_8.add(socket_lower_eaves_facades_anchor_9);
  sockets["lower-eaves:facades-anchor"] = socket_lower_eaves_facades_anchor_9;
  const socket_lower_eaves_front_doors_anchor_10 = new THREE.Object3D();
  socket_lower_eaves_front_doors_anchor_10.name = "front-doors-anchor";
  socket_lower_eaves_front_doors_anchor_10.position.set(0.0, 3.6, 5.92);
  socket_lower_eaves_front_doors_anchor_10.rotation.set(0.0, 0.0, 0.0);
  socket_lower_eaves_front_doors_anchor_10.userData.socket = {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_eaves_8.add(socket_lower_eaves_front_doors_anchor_10);
  sockets["lower-eaves:front-doors-anchor"] = socket_lower_eaves_front_doors_anchor_10;
  const socket_lower_eaves_rear_windows_anchor_11 = new THREE.Object3D();
  socket_lower_eaves_rear_windows_anchor_11.name = "rear-windows-anchor";
  socket_lower_eaves_rear_windows_anchor_11.position.set(0.0, 3.8, -5.92);
  socket_lower_eaves_rear_windows_anchor_11.rotation.set(0.0, 0.0, 0.0);
  socket_lower_eaves_rear_windows_anchor_11.userData.socket = {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_eaves_8.add(socket_lower_eaves_rear_windows_anchor_11);
  sockets["lower-eaves:rear-windows-anchor"] = socket_lower_eaves_rear_windows_anchor_11;
  const socket_lower_eaves_upper_walls_anchor_12 = new THREE.Object3D();
  socket_lower_eaves_upper_walls_anchor_12.name = "upper-walls-anchor";
  socket_lower_eaves_upper_walls_anchor_12.position.set(0.0, 10.45, 0.0);
  socket_lower_eaves_upper_walls_anchor_12.rotation.set(0.0, 0.0, 0.0);
  socket_lower_eaves_upper_walls_anchor_12.userData.socket = {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_eaves_8.add(socket_lower_eaves_upper_walls_anchor_12);
  sockets["lower-eaves:upper-walls-anchor"] = socket_lower_eaves_upper_walls_anchor_12;
  const socket_lower_eaves_upper_columns_anchor_13 = new THREE.Object3D();
  socket_lower_eaves_upper_columns_anchor_13.name = "upper-columns-anchor";
  socket_lower_eaves_upper_columns_anchor_13.position.set(0.0, 10.5, 0.0);
  socket_lower_eaves_upper_columns_anchor_13.rotation.set(0.0, 0.0, 0.0);
  socket_lower_eaves_upper_columns_anchor_13.userData.socket = {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_eaves_8.add(socket_lower_eaves_upper_columns_anchor_13);
  sockets["lower-eaves:upper-columns-anchor"] = socket_lower_eaves_upper_columns_anchor_13;
  const socket_lower_eaves_upper_roof_anchor_14 = new THREE.Object3D();
  socket_lower_eaves_upper_roof_anchor_14.name = "upper-roof-anchor";
  socket_lower_eaves_upper_roof_anchor_14.position.set(0.0, 11.65, 0.0);
  socket_lower_eaves_upper_roof_anchor_14.rotation.set(0.0, 0.0, 0.0);
  socket_lower_eaves_upper_roof_anchor_14.userData.socket = {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_eaves_8.add(socket_lower_eaves_upper_roof_anchor_14);
  sockets["lower-eaves:upper-roof-anchor"] = socket_lower_eaves_upper_roof_anchor_14;
  const socket_lower_eaves_upper_tiles_anchor_15 = new THREE.Object3D();
  socket_lower_eaves_upper_tiles_anchor_15.name = "upper-tiles-anchor";
  socket_lower_eaves_upper_tiles_anchor_15.position.set(0.0, 11.75, 0.0);
  socket_lower_eaves_upper_tiles_anchor_15.rotation.set(0.0, 0.0, 0.0);
  socket_lower_eaves_upper_tiles_anchor_15.userData.socket = {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_eaves_8.add(socket_lower_eaves_upper_tiles_anchor_15);
  sockets["lower-eaves:upper-tiles-anchor"] = socket_lower_eaves_upper_tiles_anchor_15;
  const socket_lower_eaves_ornaments_anchor_16 = new THREE.Object3D();
  socket_lower_eaves_ornaments_anchor_16.name = "ornaments-anchor";
  socket_lower_eaves_ornaments_anchor_16.position.set(0.0, 10.6, 0.0);
  socket_lower_eaves_ornaments_anchor_16.rotation.set(0.0, 0.0, 0.0);
  socket_lower_eaves_ornaments_anchor_16.userData.socket = {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_eaves_8.add(socket_lower_eaves_ornaments_anchor_16);
  sockets["lower-eaves:ornaments-anchor"] = socket_lower_eaves_ornaments_anchor_16;
  const socket_lower_eaves_plaque_anchor_17 = new THREE.Object3D();
  socket_lower_eaves_plaque_anchor_17.name = "plaque-anchor";
  socket_lower_eaves_plaque_anchor_17.position.set(0.0, 5.85, 6.7);
  socket_lower_eaves_plaque_anchor_17.rotation.set(0.0, 0.0, 0.0);
  socket_lower_eaves_plaque_anchor_17.userData.socket = {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_lower_eaves_8.add(socket_lower_eaves_plaque_anchor_17);
  sockets["lower-eaves:plaque-anchor"] = socket_lower_eaves_plaque_anchor_17;

  const endpoint_brackets_9 = makeAttachmentEndpoint(null);
  const node_brackets_9 = new THREE.Group();
  node_brackets_9.name = "brackets__pivot";
  node_brackets_9.scale.set(1, 1, 1);
  if (endpoint_brackets_9) {
    node_brackets_9.position.copy(endpoint_brackets_9.start);
    node_brackets_9.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_brackets_9.position.set(0.0, 6.4, 0.0);
    node_brackets_9.rotation.set(0.0, 0.0, 0.0);
  }
  node_brackets_9.userData.sculptComponent = {"id": "brackets", "name": "brackets", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "brackets-anchor", "localStart": [0, 6.4, 0], "localEnd": [0, 6.5, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 22, "height": 1.1, "depth": 14.2, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 6.4, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "brackets", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "wood", "materialLayers": ["wood"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "tiered-dougong-cantilevers", "type": "geometry", "evidenceRefs": ["full-object"], "description": "tiered dougong cantilevers"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(133, 61, 45, 1)", "secondaryAlbedo": "rgba(133, 61, 45, 1)", "materialClass": "wood", "materialClassConfidence": 0.85}};
  node_brackets_9.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "brackets", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_brackets_9);
  nodes["brackets"] = node_brackets_9;
  const mesh_brackets_9Geometry = endpoint_brackets_9
    ? new THREE.CylinderGeometry(endpoint_brackets_9.endRadius, endpoint_brackets_9.baseRadius, endpoint_brackets_9.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_brackets_9) {
    mesh_brackets_9Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_brackets_9 = new THREE.Mesh(
    mesh_brackets_9Geometry,
    materialMap["wood"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_brackets_9.name = "brackets";
  if (endpoint_brackets_9) {
    mesh_brackets_9.position.copy(endpoint_brackets_9.midpoint);
    mesh_brackets_9.quaternion.copy(endpoint_brackets_9.quaternion);
  }
  mesh_brackets_9.castShadow = options.castShadow ?? true;
  mesh_brackets_9.receiveShadow = options.receiveShadow ?? true;
  mesh_brackets_9.userData.sculptComponent = {"id": "brackets", "name": "brackets", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "brackets-anchor", "localStart": [0, 6.4, 0], "localEnd": [0, 6.5, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 22, "height": 1.1, "depth": 14.2, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 6.4, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "brackets", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "wood", "materialLayers": ["wood"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "tiered-dougong-cantilevers", "type": "geometry", "evidenceRefs": ["full-object"], "description": "tiered dougong cantilevers"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(133, 61, 45, 1)", "secondaryAlbedo": "rgba(133, 61, 45, 1)", "materialClass": "wood", "materialClassConfidence": 0.85}};
  node_brackets_9.add(mesh_brackets_9);
  meshes["brackets"] = mesh_brackets_9;
  colliders["brackets"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."};
  destructionGroups["brackets"] ??= [];
  destructionGroups["brackets"].push(node_brackets_9);
  const socket_brackets_foundation_anchor_0 = new THREE.Object3D();
  socket_brackets_foundation_anchor_0.name = "foundation-anchor";
  socket_brackets_foundation_anchor_0.position.set(0.0, 0.65, 0.0);
  socket_brackets_foundation_anchor_0.rotation.set(0.0, 0.0, 0.0);
  socket_brackets_foundation_anchor_0.userData.socket = {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_brackets_9.add(socket_brackets_foundation_anchor_0);
  sockets["brackets:foundation-anchor"] = socket_brackets_foundation_anchor_0;
  const socket_brackets_stairs_anchor_1 = new THREE.Object3D();
  socket_brackets_stairs_anchor_1.name = "stairs-anchor";
  socket_brackets_stairs_anchor_1.position.set(0.0, 0.6, 11.5);
  socket_brackets_stairs_anchor_1.rotation.set(0.0, 0.0, 0.0);
  socket_brackets_stairs_anchor_1.userData.socket = {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_brackets_9.add(socket_brackets_stairs_anchor_1);
  sockets["brackets:stairs-anchor"] = socket_brackets_stairs_anchor_1;
  const socket_brackets_railings_anchor_2 = new THREE.Object3D();
  socket_brackets_railings_anchor_2.name = "railings-anchor";
  socket_brackets_railings_anchor_2.position.set(0.0, 1.3, 0.0);
  socket_brackets_railings_anchor_2.rotation.set(0.0, 0.0, 0.0);
  socket_brackets_railings_anchor_2.userData.socket = {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_brackets_9.add(socket_brackets_railings_anchor_2);
  sockets["brackets:railings-anchor"] = socket_brackets_railings_anchor_2;
  const socket_brackets_columns_anchor_3 = new THREE.Object3D();
  socket_brackets_columns_anchor_3.name = "columns-anchor";
  socket_brackets_columns_anchor_3.position.set(0.0, 3.95, 0.0);
  socket_brackets_columns_anchor_3.rotation.set(0.0, 0.0, 0.0);
  socket_brackets_columns_anchor_3.userData.socket = {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_brackets_9.add(socket_brackets_columns_anchor_3);
  sockets["brackets:columns-anchor"] = socket_brackets_columns_anchor_3;
  const socket_brackets_beams_anchor_4 = new THREE.Object3D();
  socket_brackets_beams_anchor_4.name = "beams-anchor";
  socket_brackets_beams_anchor_4.position.set(0.0, 6.15, 0.0);
  socket_brackets_beams_anchor_4.rotation.set(0.0, 0.0, 0.0);
  socket_brackets_beams_anchor_4.userData.socket = {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_brackets_9.add(socket_brackets_beams_anchor_4);
  sockets["brackets:beams-anchor"] = socket_brackets_beams_anchor_4;
  const socket_brackets_lower_roof_anchor_5 = new THREE.Object3D();
  socket_brackets_lower_roof_anchor_5.name = "lower-roof-anchor";
  socket_brackets_lower_roof_anchor_5.position.set(0.0, 6.8, 0.0);
  socket_brackets_lower_roof_anchor_5.rotation.set(0.0, 0.0, 0.0);
  socket_brackets_lower_roof_anchor_5.userData.socket = {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_brackets_9.add(socket_brackets_lower_roof_anchor_5);
  sockets["brackets:lower-roof-anchor"] = socket_brackets_lower_roof_anchor_5;
  const socket_brackets_lower_tiles_anchor_6 = new THREE.Object3D();
  socket_brackets_lower_tiles_anchor_6.name = "lower-tiles-anchor";
  socket_brackets_lower_tiles_anchor_6.position.set(0.0, 6.9, 0.0);
  socket_brackets_lower_tiles_anchor_6.rotation.set(0.0, 0.0, 0.0);
  socket_brackets_lower_tiles_anchor_6.userData.socket = {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_brackets_9.add(socket_brackets_lower_tiles_anchor_6);
  sockets["brackets:lower-tiles-anchor"] = socket_brackets_lower_tiles_anchor_6;
  const socket_brackets_lower_eaves_anchor_7 = new THREE.Object3D();
  socket_brackets_lower_eaves_anchor_7.name = "lower-eaves-anchor";
  socket_brackets_lower_eaves_anchor_7.position.set(0.0, 6.8, 0.0);
  socket_brackets_lower_eaves_anchor_7.rotation.set(0.0, 0.0, 0.0);
  socket_brackets_lower_eaves_anchor_7.userData.socket = {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_brackets_9.add(socket_brackets_lower_eaves_anchor_7);
  sockets["brackets:lower-eaves-anchor"] = socket_brackets_lower_eaves_anchor_7;
  const socket_brackets_brackets_anchor_8 = new THREE.Object3D();
  socket_brackets_brackets_anchor_8.name = "brackets-anchor";
  socket_brackets_brackets_anchor_8.position.set(0.0, 6.4, 0.0);
  socket_brackets_brackets_anchor_8.rotation.set(0.0, 0.0, 0.0);
  socket_brackets_brackets_anchor_8.userData.socket = {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_brackets_9.add(socket_brackets_brackets_anchor_8);
  sockets["brackets:brackets-anchor"] = socket_brackets_brackets_anchor_8;
  const socket_brackets_facades_anchor_9 = new THREE.Object3D();
  socket_brackets_facades_anchor_9.name = "facades-anchor";
  socket_brackets_facades_anchor_9.position.set(0.0, 3.9, 0.0);
  socket_brackets_facades_anchor_9.rotation.set(0.0, 0.0, 0.0);
  socket_brackets_facades_anchor_9.userData.socket = {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_brackets_9.add(socket_brackets_facades_anchor_9);
  sockets["brackets:facades-anchor"] = socket_brackets_facades_anchor_9;
  const socket_brackets_front_doors_anchor_10 = new THREE.Object3D();
  socket_brackets_front_doors_anchor_10.name = "front-doors-anchor";
  socket_brackets_front_doors_anchor_10.position.set(0.0, 3.6, 5.92);
  socket_brackets_front_doors_anchor_10.rotation.set(0.0, 0.0, 0.0);
  socket_brackets_front_doors_anchor_10.userData.socket = {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_brackets_9.add(socket_brackets_front_doors_anchor_10);
  sockets["brackets:front-doors-anchor"] = socket_brackets_front_doors_anchor_10;
  const socket_brackets_rear_windows_anchor_11 = new THREE.Object3D();
  socket_brackets_rear_windows_anchor_11.name = "rear-windows-anchor";
  socket_brackets_rear_windows_anchor_11.position.set(0.0, 3.8, -5.92);
  socket_brackets_rear_windows_anchor_11.rotation.set(0.0, 0.0, 0.0);
  socket_brackets_rear_windows_anchor_11.userData.socket = {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_brackets_9.add(socket_brackets_rear_windows_anchor_11);
  sockets["brackets:rear-windows-anchor"] = socket_brackets_rear_windows_anchor_11;
  const socket_brackets_upper_walls_anchor_12 = new THREE.Object3D();
  socket_brackets_upper_walls_anchor_12.name = "upper-walls-anchor";
  socket_brackets_upper_walls_anchor_12.position.set(0.0, 10.45, 0.0);
  socket_brackets_upper_walls_anchor_12.rotation.set(0.0, 0.0, 0.0);
  socket_brackets_upper_walls_anchor_12.userData.socket = {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_brackets_9.add(socket_brackets_upper_walls_anchor_12);
  sockets["brackets:upper-walls-anchor"] = socket_brackets_upper_walls_anchor_12;
  const socket_brackets_upper_columns_anchor_13 = new THREE.Object3D();
  socket_brackets_upper_columns_anchor_13.name = "upper-columns-anchor";
  socket_brackets_upper_columns_anchor_13.position.set(0.0, 10.5, 0.0);
  socket_brackets_upper_columns_anchor_13.rotation.set(0.0, 0.0, 0.0);
  socket_brackets_upper_columns_anchor_13.userData.socket = {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_brackets_9.add(socket_brackets_upper_columns_anchor_13);
  sockets["brackets:upper-columns-anchor"] = socket_brackets_upper_columns_anchor_13;
  const socket_brackets_upper_roof_anchor_14 = new THREE.Object3D();
  socket_brackets_upper_roof_anchor_14.name = "upper-roof-anchor";
  socket_brackets_upper_roof_anchor_14.position.set(0.0, 11.65, 0.0);
  socket_brackets_upper_roof_anchor_14.rotation.set(0.0, 0.0, 0.0);
  socket_brackets_upper_roof_anchor_14.userData.socket = {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_brackets_9.add(socket_brackets_upper_roof_anchor_14);
  sockets["brackets:upper-roof-anchor"] = socket_brackets_upper_roof_anchor_14;
  const socket_brackets_upper_tiles_anchor_15 = new THREE.Object3D();
  socket_brackets_upper_tiles_anchor_15.name = "upper-tiles-anchor";
  socket_brackets_upper_tiles_anchor_15.position.set(0.0, 11.75, 0.0);
  socket_brackets_upper_tiles_anchor_15.rotation.set(0.0, 0.0, 0.0);
  socket_brackets_upper_tiles_anchor_15.userData.socket = {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_brackets_9.add(socket_brackets_upper_tiles_anchor_15);
  sockets["brackets:upper-tiles-anchor"] = socket_brackets_upper_tiles_anchor_15;
  const socket_brackets_ornaments_anchor_16 = new THREE.Object3D();
  socket_brackets_ornaments_anchor_16.name = "ornaments-anchor";
  socket_brackets_ornaments_anchor_16.position.set(0.0, 10.6, 0.0);
  socket_brackets_ornaments_anchor_16.rotation.set(0.0, 0.0, 0.0);
  socket_brackets_ornaments_anchor_16.userData.socket = {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_brackets_9.add(socket_brackets_ornaments_anchor_16);
  sockets["brackets:ornaments-anchor"] = socket_brackets_ornaments_anchor_16;
  const socket_brackets_plaque_anchor_17 = new THREE.Object3D();
  socket_brackets_plaque_anchor_17.name = "plaque-anchor";
  socket_brackets_plaque_anchor_17.position.set(0.0, 5.85, 6.7);
  socket_brackets_plaque_anchor_17.rotation.set(0.0, 0.0, 0.0);
  socket_brackets_plaque_anchor_17.userData.socket = {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_brackets_9.add(socket_brackets_plaque_anchor_17);
  sockets["brackets:plaque-anchor"] = socket_brackets_plaque_anchor_17;

  const endpoint_facades_10 = makeAttachmentEndpoint(null);
  const node_facades_10 = new THREE.Group();
  node_facades_10.name = "facades__pivot";
  node_facades_10.scale.set(1, 1, 1);
  if (endpoint_facades_10) {
    node_facades_10.position.copy(endpoint_facades_10.start);
    node_facades_10.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_facades_10.position.set(0.0, 3.9, 0.0);
    node_facades_10.rotation.set(0.0, 0.0, 0.0);
  }
  node_facades_10.userData.sculptComponent = {"id": "facades", "name": "facades", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "facades-anchor", "localStart": [0, 3.9, 0], "localEnd": [0, 4.0, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 20.4, "height": 4.6, "depth": 11.8, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 3.9, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "facades", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "ivory", "materialLayers": ["ivory"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(229, 215, 185, 1)", "secondaryAlbedo": "rgba(229, 215, 185, 1)", "materialClass": "stone", "materialClassConfidence": 0.85}};
  node_facades_10.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "facades", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_facades_10);
  nodes["facades"] = node_facades_10;
  const mesh_facades_10Geometry = endpoint_facades_10
    ? new THREE.CylinderGeometry(endpoint_facades_10.endRadius, endpoint_facades_10.baseRadius, endpoint_facades_10.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_facades_10) {
    mesh_facades_10Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_facades_10 = new THREE.Mesh(
    mesh_facades_10Geometry,
    materialMap["ivory"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_facades_10.name = "facades";
  if (endpoint_facades_10) {
    mesh_facades_10.position.copy(endpoint_facades_10.midpoint);
    mesh_facades_10.quaternion.copy(endpoint_facades_10.quaternion);
  }
  mesh_facades_10.castShadow = options.castShadow ?? true;
  mesh_facades_10.receiveShadow = options.receiveShadow ?? true;
  mesh_facades_10.userData.sculptComponent = {"id": "facades", "name": "facades", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "facades-anchor", "localStart": [0, 3.9, 0], "localEnd": [0, 4.0, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 20.4, "height": 4.6, "depth": 11.8, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 3.9, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "facades", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "ivory", "materialLayers": ["ivory"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(229, 215, 185, 1)", "secondaryAlbedo": "rgba(229, 215, 185, 1)", "materialClass": "stone", "materialClassConfidence": 0.85}};
  node_facades_10.add(mesh_facades_10);
  meshes["facades"] = mesh_facades_10;
  colliders["facades"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."};
  destructionGroups["facades"] ??= [];
  destructionGroups["facades"].push(node_facades_10);
  const socket_facades_foundation_anchor_0 = new THREE.Object3D();
  socket_facades_foundation_anchor_0.name = "foundation-anchor";
  socket_facades_foundation_anchor_0.position.set(0.0, 0.65, 0.0);
  socket_facades_foundation_anchor_0.rotation.set(0.0, 0.0, 0.0);
  socket_facades_foundation_anchor_0.userData.socket = {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_facades_10.add(socket_facades_foundation_anchor_0);
  sockets["facades:foundation-anchor"] = socket_facades_foundation_anchor_0;
  const socket_facades_stairs_anchor_1 = new THREE.Object3D();
  socket_facades_stairs_anchor_1.name = "stairs-anchor";
  socket_facades_stairs_anchor_1.position.set(0.0, 0.6, 11.5);
  socket_facades_stairs_anchor_1.rotation.set(0.0, 0.0, 0.0);
  socket_facades_stairs_anchor_1.userData.socket = {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_facades_10.add(socket_facades_stairs_anchor_1);
  sockets["facades:stairs-anchor"] = socket_facades_stairs_anchor_1;
  const socket_facades_railings_anchor_2 = new THREE.Object3D();
  socket_facades_railings_anchor_2.name = "railings-anchor";
  socket_facades_railings_anchor_2.position.set(0.0, 1.3, 0.0);
  socket_facades_railings_anchor_2.rotation.set(0.0, 0.0, 0.0);
  socket_facades_railings_anchor_2.userData.socket = {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_facades_10.add(socket_facades_railings_anchor_2);
  sockets["facades:railings-anchor"] = socket_facades_railings_anchor_2;
  const socket_facades_columns_anchor_3 = new THREE.Object3D();
  socket_facades_columns_anchor_3.name = "columns-anchor";
  socket_facades_columns_anchor_3.position.set(0.0, 3.95, 0.0);
  socket_facades_columns_anchor_3.rotation.set(0.0, 0.0, 0.0);
  socket_facades_columns_anchor_3.userData.socket = {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_facades_10.add(socket_facades_columns_anchor_3);
  sockets["facades:columns-anchor"] = socket_facades_columns_anchor_3;
  const socket_facades_beams_anchor_4 = new THREE.Object3D();
  socket_facades_beams_anchor_4.name = "beams-anchor";
  socket_facades_beams_anchor_4.position.set(0.0, 6.15, 0.0);
  socket_facades_beams_anchor_4.rotation.set(0.0, 0.0, 0.0);
  socket_facades_beams_anchor_4.userData.socket = {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_facades_10.add(socket_facades_beams_anchor_4);
  sockets["facades:beams-anchor"] = socket_facades_beams_anchor_4;
  const socket_facades_lower_roof_anchor_5 = new THREE.Object3D();
  socket_facades_lower_roof_anchor_5.name = "lower-roof-anchor";
  socket_facades_lower_roof_anchor_5.position.set(0.0, 6.8, 0.0);
  socket_facades_lower_roof_anchor_5.rotation.set(0.0, 0.0, 0.0);
  socket_facades_lower_roof_anchor_5.userData.socket = {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_facades_10.add(socket_facades_lower_roof_anchor_5);
  sockets["facades:lower-roof-anchor"] = socket_facades_lower_roof_anchor_5;
  const socket_facades_lower_tiles_anchor_6 = new THREE.Object3D();
  socket_facades_lower_tiles_anchor_6.name = "lower-tiles-anchor";
  socket_facades_lower_tiles_anchor_6.position.set(0.0, 6.9, 0.0);
  socket_facades_lower_tiles_anchor_6.rotation.set(0.0, 0.0, 0.0);
  socket_facades_lower_tiles_anchor_6.userData.socket = {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_facades_10.add(socket_facades_lower_tiles_anchor_6);
  sockets["facades:lower-tiles-anchor"] = socket_facades_lower_tiles_anchor_6;
  const socket_facades_lower_eaves_anchor_7 = new THREE.Object3D();
  socket_facades_lower_eaves_anchor_7.name = "lower-eaves-anchor";
  socket_facades_lower_eaves_anchor_7.position.set(0.0, 6.8, 0.0);
  socket_facades_lower_eaves_anchor_7.rotation.set(0.0, 0.0, 0.0);
  socket_facades_lower_eaves_anchor_7.userData.socket = {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_facades_10.add(socket_facades_lower_eaves_anchor_7);
  sockets["facades:lower-eaves-anchor"] = socket_facades_lower_eaves_anchor_7;
  const socket_facades_brackets_anchor_8 = new THREE.Object3D();
  socket_facades_brackets_anchor_8.name = "brackets-anchor";
  socket_facades_brackets_anchor_8.position.set(0.0, 6.4, 0.0);
  socket_facades_brackets_anchor_8.rotation.set(0.0, 0.0, 0.0);
  socket_facades_brackets_anchor_8.userData.socket = {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_facades_10.add(socket_facades_brackets_anchor_8);
  sockets["facades:brackets-anchor"] = socket_facades_brackets_anchor_8;
  const socket_facades_facades_anchor_9 = new THREE.Object3D();
  socket_facades_facades_anchor_9.name = "facades-anchor";
  socket_facades_facades_anchor_9.position.set(0.0, 3.9, 0.0);
  socket_facades_facades_anchor_9.rotation.set(0.0, 0.0, 0.0);
  socket_facades_facades_anchor_9.userData.socket = {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_facades_10.add(socket_facades_facades_anchor_9);
  sockets["facades:facades-anchor"] = socket_facades_facades_anchor_9;
  const socket_facades_front_doors_anchor_10 = new THREE.Object3D();
  socket_facades_front_doors_anchor_10.name = "front-doors-anchor";
  socket_facades_front_doors_anchor_10.position.set(0.0, 3.6, 5.92);
  socket_facades_front_doors_anchor_10.rotation.set(0.0, 0.0, 0.0);
  socket_facades_front_doors_anchor_10.userData.socket = {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_facades_10.add(socket_facades_front_doors_anchor_10);
  sockets["facades:front-doors-anchor"] = socket_facades_front_doors_anchor_10;
  const socket_facades_rear_windows_anchor_11 = new THREE.Object3D();
  socket_facades_rear_windows_anchor_11.name = "rear-windows-anchor";
  socket_facades_rear_windows_anchor_11.position.set(0.0, 3.8, -5.92);
  socket_facades_rear_windows_anchor_11.rotation.set(0.0, 0.0, 0.0);
  socket_facades_rear_windows_anchor_11.userData.socket = {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_facades_10.add(socket_facades_rear_windows_anchor_11);
  sockets["facades:rear-windows-anchor"] = socket_facades_rear_windows_anchor_11;
  const socket_facades_upper_walls_anchor_12 = new THREE.Object3D();
  socket_facades_upper_walls_anchor_12.name = "upper-walls-anchor";
  socket_facades_upper_walls_anchor_12.position.set(0.0, 10.45, 0.0);
  socket_facades_upper_walls_anchor_12.rotation.set(0.0, 0.0, 0.0);
  socket_facades_upper_walls_anchor_12.userData.socket = {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_facades_10.add(socket_facades_upper_walls_anchor_12);
  sockets["facades:upper-walls-anchor"] = socket_facades_upper_walls_anchor_12;
  const socket_facades_upper_columns_anchor_13 = new THREE.Object3D();
  socket_facades_upper_columns_anchor_13.name = "upper-columns-anchor";
  socket_facades_upper_columns_anchor_13.position.set(0.0, 10.5, 0.0);
  socket_facades_upper_columns_anchor_13.rotation.set(0.0, 0.0, 0.0);
  socket_facades_upper_columns_anchor_13.userData.socket = {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_facades_10.add(socket_facades_upper_columns_anchor_13);
  sockets["facades:upper-columns-anchor"] = socket_facades_upper_columns_anchor_13;
  const socket_facades_upper_roof_anchor_14 = new THREE.Object3D();
  socket_facades_upper_roof_anchor_14.name = "upper-roof-anchor";
  socket_facades_upper_roof_anchor_14.position.set(0.0, 11.65, 0.0);
  socket_facades_upper_roof_anchor_14.rotation.set(0.0, 0.0, 0.0);
  socket_facades_upper_roof_anchor_14.userData.socket = {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_facades_10.add(socket_facades_upper_roof_anchor_14);
  sockets["facades:upper-roof-anchor"] = socket_facades_upper_roof_anchor_14;
  const socket_facades_upper_tiles_anchor_15 = new THREE.Object3D();
  socket_facades_upper_tiles_anchor_15.name = "upper-tiles-anchor";
  socket_facades_upper_tiles_anchor_15.position.set(0.0, 11.75, 0.0);
  socket_facades_upper_tiles_anchor_15.rotation.set(0.0, 0.0, 0.0);
  socket_facades_upper_tiles_anchor_15.userData.socket = {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_facades_10.add(socket_facades_upper_tiles_anchor_15);
  sockets["facades:upper-tiles-anchor"] = socket_facades_upper_tiles_anchor_15;
  const socket_facades_ornaments_anchor_16 = new THREE.Object3D();
  socket_facades_ornaments_anchor_16.name = "ornaments-anchor";
  socket_facades_ornaments_anchor_16.position.set(0.0, 10.6, 0.0);
  socket_facades_ornaments_anchor_16.rotation.set(0.0, 0.0, 0.0);
  socket_facades_ornaments_anchor_16.userData.socket = {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_facades_10.add(socket_facades_ornaments_anchor_16);
  sockets["facades:ornaments-anchor"] = socket_facades_ornaments_anchor_16;
  const socket_facades_plaque_anchor_17 = new THREE.Object3D();
  socket_facades_plaque_anchor_17.name = "plaque-anchor";
  socket_facades_plaque_anchor_17.position.set(0.0, 5.85, 6.7);
  socket_facades_plaque_anchor_17.rotation.set(0.0, 0.0, 0.0);
  socket_facades_plaque_anchor_17.userData.socket = {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_facades_10.add(socket_facades_plaque_anchor_17);
  sockets["facades:plaque-anchor"] = socket_facades_plaque_anchor_17;

  const endpoint_front_doors_11 = makeAttachmentEndpoint(null);
  const node_front_doors_11 = new THREE.Group();
  node_front_doors_11.name = "front-doors__pivot";
  node_front_doors_11.scale.set(1, 1, 1);
  if (endpoint_front_doors_11) {
    node_front_doors_11.position.copy(endpoint_front_doors_11.start);
    node_front_doors_11.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_front_doors_11.position.set(0.0, 3.6, 5.92);
    node_front_doors_11.rotation.set(0.0, 0.0, 0.0);
  }
  node_front_doors_11.userData.sculptComponent = {"id": "front-doors", "name": "front-doors", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "front-doors-anchor", "localStart": [0, 3.6, 5.92], "localEnd": [0, 3.7, 5.92], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 18.8, "height": 4.4, "depth": 0.22, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "front-doors", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "wood", "materialLayers": ["wood"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "vertical-lattice", "type": "geometry", "evidenceRefs": ["full-object"], "description": "vertical lattice"}, {"id": "horizontal-lattice", "type": "geometry", "evidenceRefs": ["full-object"], "description": "horizontal lattice"}, {"id": "door-rail-panels", "type": "geometry", "evidenceRefs": ["full-object"], "description": "door rail panels"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(133, 61, 45, 1)", "secondaryAlbedo": "rgba(133, 61, 45, 1)", "materialClass": "wood", "materialClassConfidence": 0.85}};
  node_front_doors_11.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "front-doors", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_front_doors_11);
  nodes["front-doors"] = node_front_doors_11;
  const mesh_front_doors_11Geometry = endpoint_front_doors_11
    ? new THREE.CylinderGeometry(endpoint_front_doors_11.endRadius, endpoint_front_doors_11.baseRadius, endpoint_front_doors_11.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_front_doors_11) {
    mesh_front_doors_11Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_front_doors_11 = new THREE.Mesh(
    mesh_front_doors_11Geometry,
    materialMap["wood"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_front_doors_11.name = "front-doors";
  if (endpoint_front_doors_11) {
    mesh_front_doors_11.position.copy(endpoint_front_doors_11.midpoint);
    mesh_front_doors_11.quaternion.copy(endpoint_front_doors_11.quaternion);
  }
  mesh_front_doors_11.castShadow = options.castShadow ?? true;
  mesh_front_doors_11.receiveShadow = options.receiveShadow ?? true;
  mesh_front_doors_11.userData.sculptComponent = {"id": "front-doors", "name": "front-doors", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "front-doors-anchor", "localStart": [0, 3.6, 5.92], "localEnd": [0, 3.7, 5.92], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 18.8, "height": 4.4, "depth": 0.22, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "front-doors", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "wood", "materialLayers": ["wood"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "vertical-lattice", "type": "geometry", "evidenceRefs": ["full-object"], "description": "vertical lattice"}, {"id": "horizontal-lattice", "type": "geometry", "evidenceRefs": ["full-object"], "description": "horizontal lattice"}, {"id": "door-rail-panels", "type": "geometry", "evidenceRefs": ["full-object"], "description": "door rail panels"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(133, 61, 45, 1)", "secondaryAlbedo": "rgba(133, 61, 45, 1)", "materialClass": "wood", "materialClassConfidence": 0.85}};
  node_front_doors_11.add(mesh_front_doors_11);
  meshes["front-doors"] = mesh_front_doors_11;
  colliders["front-doors"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."};
  destructionGroups["front-doors"] ??= [];
  destructionGroups["front-doors"].push(node_front_doors_11);
  const socket_front_doors_foundation_anchor_0 = new THREE.Object3D();
  socket_front_doors_foundation_anchor_0.name = "foundation-anchor";
  socket_front_doors_foundation_anchor_0.position.set(0.0, 0.65, 0.0);
  socket_front_doors_foundation_anchor_0.rotation.set(0.0, 0.0, 0.0);
  socket_front_doors_foundation_anchor_0.userData.socket = {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_front_doors_11.add(socket_front_doors_foundation_anchor_0);
  sockets["front-doors:foundation-anchor"] = socket_front_doors_foundation_anchor_0;
  const socket_front_doors_stairs_anchor_1 = new THREE.Object3D();
  socket_front_doors_stairs_anchor_1.name = "stairs-anchor";
  socket_front_doors_stairs_anchor_1.position.set(0.0, 0.6, 11.5);
  socket_front_doors_stairs_anchor_1.rotation.set(0.0, 0.0, 0.0);
  socket_front_doors_stairs_anchor_1.userData.socket = {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_front_doors_11.add(socket_front_doors_stairs_anchor_1);
  sockets["front-doors:stairs-anchor"] = socket_front_doors_stairs_anchor_1;
  const socket_front_doors_railings_anchor_2 = new THREE.Object3D();
  socket_front_doors_railings_anchor_2.name = "railings-anchor";
  socket_front_doors_railings_anchor_2.position.set(0.0, 1.3, 0.0);
  socket_front_doors_railings_anchor_2.rotation.set(0.0, 0.0, 0.0);
  socket_front_doors_railings_anchor_2.userData.socket = {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_front_doors_11.add(socket_front_doors_railings_anchor_2);
  sockets["front-doors:railings-anchor"] = socket_front_doors_railings_anchor_2;
  const socket_front_doors_columns_anchor_3 = new THREE.Object3D();
  socket_front_doors_columns_anchor_3.name = "columns-anchor";
  socket_front_doors_columns_anchor_3.position.set(0.0, 3.95, 0.0);
  socket_front_doors_columns_anchor_3.rotation.set(0.0, 0.0, 0.0);
  socket_front_doors_columns_anchor_3.userData.socket = {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_front_doors_11.add(socket_front_doors_columns_anchor_3);
  sockets["front-doors:columns-anchor"] = socket_front_doors_columns_anchor_3;
  const socket_front_doors_beams_anchor_4 = new THREE.Object3D();
  socket_front_doors_beams_anchor_4.name = "beams-anchor";
  socket_front_doors_beams_anchor_4.position.set(0.0, 6.15, 0.0);
  socket_front_doors_beams_anchor_4.rotation.set(0.0, 0.0, 0.0);
  socket_front_doors_beams_anchor_4.userData.socket = {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_front_doors_11.add(socket_front_doors_beams_anchor_4);
  sockets["front-doors:beams-anchor"] = socket_front_doors_beams_anchor_4;
  const socket_front_doors_lower_roof_anchor_5 = new THREE.Object3D();
  socket_front_doors_lower_roof_anchor_5.name = "lower-roof-anchor";
  socket_front_doors_lower_roof_anchor_5.position.set(0.0, 6.8, 0.0);
  socket_front_doors_lower_roof_anchor_5.rotation.set(0.0, 0.0, 0.0);
  socket_front_doors_lower_roof_anchor_5.userData.socket = {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_front_doors_11.add(socket_front_doors_lower_roof_anchor_5);
  sockets["front-doors:lower-roof-anchor"] = socket_front_doors_lower_roof_anchor_5;
  const socket_front_doors_lower_tiles_anchor_6 = new THREE.Object3D();
  socket_front_doors_lower_tiles_anchor_6.name = "lower-tiles-anchor";
  socket_front_doors_lower_tiles_anchor_6.position.set(0.0, 6.9, 0.0);
  socket_front_doors_lower_tiles_anchor_6.rotation.set(0.0, 0.0, 0.0);
  socket_front_doors_lower_tiles_anchor_6.userData.socket = {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_front_doors_11.add(socket_front_doors_lower_tiles_anchor_6);
  sockets["front-doors:lower-tiles-anchor"] = socket_front_doors_lower_tiles_anchor_6;
  const socket_front_doors_lower_eaves_anchor_7 = new THREE.Object3D();
  socket_front_doors_lower_eaves_anchor_7.name = "lower-eaves-anchor";
  socket_front_doors_lower_eaves_anchor_7.position.set(0.0, 6.8, 0.0);
  socket_front_doors_lower_eaves_anchor_7.rotation.set(0.0, 0.0, 0.0);
  socket_front_doors_lower_eaves_anchor_7.userData.socket = {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_front_doors_11.add(socket_front_doors_lower_eaves_anchor_7);
  sockets["front-doors:lower-eaves-anchor"] = socket_front_doors_lower_eaves_anchor_7;
  const socket_front_doors_brackets_anchor_8 = new THREE.Object3D();
  socket_front_doors_brackets_anchor_8.name = "brackets-anchor";
  socket_front_doors_brackets_anchor_8.position.set(0.0, 6.4, 0.0);
  socket_front_doors_brackets_anchor_8.rotation.set(0.0, 0.0, 0.0);
  socket_front_doors_brackets_anchor_8.userData.socket = {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_front_doors_11.add(socket_front_doors_brackets_anchor_8);
  sockets["front-doors:brackets-anchor"] = socket_front_doors_brackets_anchor_8;
  const socket_front_doors_facades_anchor_9 = new THREE.Object3D();
  socket_front_doors_facades_anchor_9.name = "facades-anchor";
  socket_front_doors_facades_anchor_9.position.set(0.0, 3.9, 0.0);
  socket_front_doors_facades_anchor_9.rotation.set(0.0, 0.0, 0.0);
  socket_front_doors_facades_anchor_9.userData.socket = {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_front_doors_11.add(socket_front_doors_facades_anchor_9);
  sockets["front-doors:facades-anchor"] = socket_front_doors_facades_anchor_9;
  const socket_front_doors_front_doors_anchor_10 = new THREE.Object3D();
  socket_front_doors_front_doors_anchor_10.name = "front-doors-anchor";
  socket_front_doors_front_doors_anchor_10.position.set(0.0, 3.6, 5.92);
  socket_front_doors_front_doors_anchor_10.rotation.set(0.0, 0.0, 0.0);
  socket_front_doors_front_doors_anchor_10.userData.socket = {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_front_doors_11.add(socket_front_doors_front_doors_anchor_10);
  sockets["front-doors:front-doors-anchor"] = socket_front_doors_front_doors_anchor_10;
  const socket_front_doors_rear_windows_anchor_11 = new THREE.Object3D();
  socket_front_doors_rear_windows_anchor_11.name = "rear-windows-anchor";
  socket_front_doors_rear_windows_anchor_11.position.set(0.0, 3.8, -5.92);
  socket_front_doors_rear_windows_anchor_11.rotation.set(0.0, 0.0, 0.0);
  socket_front_doors_rear_windows_anchor_11.userData.socket = {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_front_doors_11.add(socket_front_doors_rear_windows_anchor_11);
  sockets["front-doors:rear-windows-anchor"] = socket_front_doors_rear_windows_anchor_11;
  const socket_front_doors_upper_walls_anchor_12 = new THREE.Object3D();
  socket_front_doors_upper_walls_anchor_12.name = "upper-walls-anchor";
  socket_front_doors_upper_walls_anchor_12.position.set(0.0, 10.45, 0.0);
  socket_front_doors_upper_walls_anchor_12.rotation.set(0.0, 0.0, 0.0);
  socket_front_doors_upper_walls_anchor_12.userData.socket = {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_front_doors_11.add(socket_front_doors_upper_walls_anchor_12);
  sockets["front-doors:upper-walls-anchor"] = socket_front_doors_upper_walls_anchor_12;
  const socket_front_doors_upper_columns_anchor_13 = new THREE.Object3D();
  socket_front_doors_upper_columns_anchor_13.name = "upper-columns-anchor";
  socket_front_doors_upper_columns_anchor_13.position.set(0.0, 10.5, 0.0);
  socket_front_doors_upper_columns_anchor_13.rotation.set(0.0, 0.0, 0.0);
  socket_front_doors_upper_columns_anchor_13.userData.socket = {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_front_doors_11.add(socket_front_doors_upper_columns_anchor_13);
  sockets["front-doors:upper-columns-anchor"] = socket_front_doors_upper_columns_anchor_13;
  const socket_front_doors_upper_roof_anchor_14 = new THREE.Object3D();
  socket_front_doors_upper_roof_anchor_14.name = "upper-roof-anchor";
  socket_front_doors_upper_roof_anchor_14.position.set(0.0, 11.65, 0.0);
  socket_front_doors_upper_roof_anchor_14.rotation.set(0.0, 0.0, 0.0);
  socket_front_doors_upper_roof_anchor_14.userData.socket = {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_front_doors_11.add(socket_front_doors_upper_roof_anchor_14);
  sockets["front-doors:upper-roof-anchor"] = socket_front_doors_upper_roof_anchor_14;
  const socket_front_doors_upper_tiles_anchor_15 = new THREE.Object3D();
  socket_front_doors_upper_tiles_anchor_15.name = "upper-tiles-anchor";
  socket_front_doors_upper_tiles_anchor_15.position.set(0.0, 11.75, 0.0);
  socket_front_doors_upper_tiles_anchor_15.rotation.set(0.0, 0.0, 0.0);
  socket_front_doors_upper_tiles_anchor_15.userData.socket = {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_front_doors_11.add(socket_front_doors_upper_tiles_anchor_15);
  sockets["front-doors:upper-tiles-anchor"] = socket_front_doors_upper_tiles_anchor_15;
  const socket_front_doors_ornaments_anchor_16 = new THREE.Object3D();
  socket_front_doors_ornaments_anchor_16.name = "ornaments-anchor";
  socket_front_doors_ornaments_anchor_16.position.set(0.0, 10.6, 0.0);
  socket_front_doors_ornaments_anchor_16.rotation.set(0.0, 0.0, 0.0);
  socket_front_doors_ornaments_anchor_16.userData.socket = {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_front_doors_11.add(socket_front_doors_ornaments_anchor_16);
  sockets["front-doors:ornaments-anchor"] = socket_front_doors_ornaments_anchor_16;
  const socket_front_doors_plaque_anchor_17 = new THREE.Object3D();
  socket_front_doors_plaque_anchor_17.name = "plaque-anchor";
  socket_front_doors_plaque_anchor_17.position.set(0.0, 5.85, 6.7);
  socket_front_doors_plaque_anchor_17.rotation.set(0.0, 0.0, 0.0);
  socket_front_doors_plaque_anchor_17.userData.socket = {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_front_doors_11.add(socket_front_doors_plaque_anchor_17);
  sockets["front-doors:plaque-anchor"] = socket_front_doors_plaque_anchor_17;

  const endpoint_rear_windows_12 = makeAttachmentEndpoint(null);
  const node_rear_windows_12 = new THREE.Group();
  node_rear_windows_12.name = "rear-windows__pivot";
  node_rear_windows_12.scale.set(1, 1, 1);
  if (endpoint_rear_windows_12) {
    node_rear_windows_12.position.copy(endpoint_rear_windows_12.start);
    node_rear_windows_12.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_rear_windows_12.position.set(0.0, 3.8, -5.92);
    node_rear_windows_12.rotation.set(0.0, 0.0, 0.0);
  }
  node_rear_windows_12.userData.sculptComponent = {"id": "rear-windows", "name": "rear-windows", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "rear-windows-anchor", "localStart": [0, 3.8, -5.92], "localEnd": [0, 3.9, -5.92], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 20, "height": 3.6, "depth": 0.22, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "rear-windows", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "wood", "materialLayers": ["wood"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "rear-wall-window-rhythm", "type": "geometry", "evidenceRefs": ["full-object"], "description": "rear wall window rhythm"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(133, 61, 45, 1)", "secondaryAlbedo": "rgba(133, 61, 45, 1)", "materialClass": "wood", "materialClassConfidence": 0.85}};
  node_rear_windows_12.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "rear-windows", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_rear_windows_12);
  nodes["rear-windows"] = node_rear_windows_12;
  const mesh_rear_windows_12Geometry = endpoint_rear_windows_12
    ? new THREE.CylinderGeometry(endpoint_rear_windows_12.endRadius, endpoint_rear_windows_12.baseRadius, endpoint_rear_windows_12.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_rear_windows_12) {
    mesh_rear_windows_12Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_rear_windows_12 = new THREE.Mesh(
    mesh_rear_windows_12Geometry,
    materialMap["wood"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_rear_windows_12.name = "rear-windows";
  if (endpoint_rear_windows_12) {
    mesh_rear_windows_12.position.copy(endpoint_rear_windows_12.midpoint);
    mesh_rear_windows_12.quaternion.copy(endpoint_rear_windows_12.quaternion);
  }
  mesh_rear_windows_12.castShadow = options.castShadow ?? true;
  mesh_rear_windows_12.receiveShadow = options.receiveShadow ?? true;
  mesh_rear_windows_12.userData.sculptComponent = {"id": "rear-windows", "name": "rear-windows", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "rear-windows-anchor", "localStart": [0, 3.8, -5.92], "localEnd": [0, 3.9, -5.92], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 20, "height": 3.6, "depth": 0.22, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "rear-windows", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "wood", "materialLayers": ["wood"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "rear-wall-window-rhythm", "type": "geometry", "evidenceRefs": ["full-object"], "description": "rear wall window rhythm"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(133, 61, 45, 1)", "secondaryAlbedo": "rgba(133, 61, 45, 1)", "materialClass": "wood", "materialClassConfidence": 0.85}};
  node_rear_windows_12.add(mesh_rear_windows_12);
  meshes["rear-windows"] = mesh_rear_windows_12;
  colliders["rear-windows"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."};
  destructionGroups["rear-windows"] ??= [];
  destructionGroups["rear-windows"].push(node_rear_windows_12);
  const socket_rear_windows_foundation_anchor_0 = new THREE.Object3D();
  socket_rear_windows_foundation_anchor_0.name = "foundation-anchor";
  socket_rear_windows_foundation_anchor_0.position.set(0.0, 0.65, 0.0);
  socket_rear_windows_foundation_anchor_0.rotation.set(0.0, 0.0, 0.0);
  socket_rear_windows_foundation_anchor_0.userData.socket = {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_rear_windows_12.add(socket_rear_windows_foundation_anchor_0);
  sockets["rear-windows:foundation-anchor"] = socket_rear_windows_foundation_anchor_0;
  const socket_rear_windows_stairs_anchor_1 = new THREE.Object3D();
  socket_rear_windows_stairs_anchor_1.name = "stairs-anchor";
  socket_rear_windows_stairs_anchor_1.position.set(0.0, 0.6, 11.5);
  socket_rear_windows_stairs_anchor_1.rotation.set(0.0, 0.0, 0.0);
  socket_rear_windows_stairs_anchor_1.userData.socket = {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_rear_windows_12.add(socket_rear_windows_stairs_anchor_1);
  sockets["rear-windows:stairs-anchor"] = socket_rear_windows_stairs_anchor_1;
  const socket_rear_windows_railings_anchor_2 = new THREE.Object3D();
  socket_rear_windows_railings_anchor_2.name = "railings-anchor";
  socket_rear_windows_railings_anchor_2.position.set(0.0, 1.3, 0.0);
  socket_rear_windows_railings_anchor_2.rotation.set(0.0, 0.0, 0.0);
  socket_rear_windows_railings_anchor_2.userData.socket = {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_rear_windows_12.add(socket_rear_windows_railings_anchor_2);
  sockets["rear-windows:railings-anchor"] = socket_rear_windows_railings_anchor_2;
  const socket_rear_windows_columns_anchor_3 = new THREE.Object3D();
  socket_rear_windows_columns_anchor_3.name = "columns-anchor";
  socket_rear_windows_columns_anchor_3.position.set(0.0, 3.95, 0.0);
  socket_rear_windows_columns_anchor_3.rotation.set(0.0, 0.0, 0.0);
  socket_rear_windows_columns_anchor_3.userData.socket = {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_rear_windows_12.add(socket_rear_windows_columns_anchor_3);
  sockets["rear-windows:columns-anchor"] = socket_rear_windows_columns_anchor_3;
  const socket_rear_windows_beams_anchor_4 = new THREE.Object3D();
  socket_rear_windows_beams_anchor_4.name = "beams-anchor";
  socket_rear_windows_beams_anchor_4.position.set(0.0, 6.15, 0.0);
  socket_rear_windows_beams_anchor_4.rotation.set(0.0, 0.0, 0.0);
  socket_rear_windows_beams_anchor_4.userData.socket = {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_rear_windows_12.add(socket_rear_windows_beams_anchor_4);
  sockets["rear-windows:beams-anchor"] = socket_rear_windows_beams_anchor_4;
  const socket_rear_windows_lower_roof_anchor_5 = new THREE.Object3D();
  socket_rear_windows_lower_roof_anchor_5.name = "lower-roof-anchor";
  socket_rear_windows_lower_roof_anchor_5.position.set(0.0, 6.8, 0.0);
  socket_rear_windows_lower_roof_anchor_5.rotation.set(0.0, 0.0, 0.0);
  socket_rear_windows_lower_roof_anchor_5.userData.socket = {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_rear_windows_12.add(socket_rear_windows_lower_roof_anchor_5);
  sockets["rear-windows:lower-roof-anchor"] = socket_rear_windows_lower_roof_anchor_5;
  const socket_rear_windows_lower_tiles_anchor_6 = new THREE.Object3D();
  socket_rear_windows_lower_tiles_anchor_6.name = "lower-tiles-anchor";
  socket_rear_windows_lower_tiles_anchor_6.position.set(0.0, 6.9, 0.0);
  socket_rear_windows_lower_tiles_anchor_6.rotation.set(0.0, 0.0, 0.0);
  socket_rear_windows_lower_tiles_anchor_6.userData.socket = {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_rear_windows_12.add(socket_rear_windows_lower_tiles_anchor_6);
  sockets["rear-windows:lower-tiles-anchor"] = socket_rear_windows_lower_tiles_anchor_6;
  const socket_rear_windows_lower_eaves_anchor_7 = new THREE.Object3D();
  socket_rear_windows_lower_eaves_anchor_7.name = "lower-eaves-anchor";
  socket_rear_windows_lower_eaves_anchor_7.position.set(0.0, 6.8, 0.0);
  socket_rear_windows_lower_eaves_anchor_7.rotation.set(0.0, 0.0, 0.0);
  socket_rear_windows_lower_eaves_anchor_7.userData.socket = {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_rear_windows_12.add(socket_rear_windows_lower_eaves_anchor_7);
  sockets["rear-windows:lower-eaves-anchor"] = socket_rear_windows_lower_eaves_anchor_7;
  const socket_rear_windows_brackets_anchor_8 = new THREE.Object3D();
  socket_rear_windows_brackets_anchor_8.name = "brackets-anchor";
  socket_rear_windows_brackets_anchor_8.position.set(0.0, 6.4, 0.0);
  socket_rear_windows_brackets_anchor_8.rotation.set(0.0, 0.0, 0.0);
  socket_rear_windows_brackets_anchor_8.userData.socket = {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_rear_windows_12.add(socket_rear_windows_brackets_anchor_8);
  sockets["rear-windows:brackets-anchor"] = socket_rear_windows_brackets_anchor_8;
  const socket_rear_windows_facades_anchor_9 = new THREE.Object3D();
  socket_rear_windows_facades_anchor_9.name = "facades-anchor";
  socket_rear_windows_facades_anchor_9.position.set(0.0, 3.9, 0.0);
  socket_rear_windows_facades_anchor_9.rotation.set(0.0, 0.0, 0.0);
  socket_rear_windows_facades_anchor_9.userData.socket = {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_rear_windows_12.add(socket_rear_windows_facades_anchor_9);
  sockets["rear-windows:facades-anchor"] = socket_rear_windows_facades_anchor_9;
  const socket_rear_windows_front_doors_anchor_10 = new THREE.Object3D();
  socket_rear_windows_front_doors_anchor_10.name = "front-doors-anchor";
  socket_rear_windows_front_doors_anchor_10.position.set(0.0, 3.6, 5.92);
  socket_rear_windows_front_doors_anchor_10.rotation.set(0.0, 0.0, 0.0);
  socket_rear_windows_front_doors_anchor_10.userData.socket = {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_rear_windows_12.add(socket_rear_windows_front_doors_anchor_10);
  sockets["rear-windows:front-doors-anchor"] = socket_rear_windows_front_doors_anchor_10;
  const socket_rear_windows_rear_windows_anchor_11 = new THREE.Object3D();
  socket_rear_windows_rear_windows_anchor_11.name = "rear-windows-anchor";
  socket_rear_windows_rear_windows_anchor_11.position.set(0.0, 3.8, -5.92);
  socket_rear_windows_rear_windows_anchor_11.rotation.set(0.0, 0.0, 0.0);
  socket_rear_windows_rear_windows_anchor_11.userData.socket = {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_rear_windows_12.add(socket_rear_windows_rear_windows_anchor_11);
  sockets["rear-windows:rear-windows-anchor"] = socket_rear_windows_rear_windows_anchor_11;
  const socket_rear_windows_upper_walls_anchor_12 = new THREE.Object3D();
  socket_rear_windows_upper_walls_anchor_12.name = "upper-walls-anchor";
  socket_rear_windows_upper_walls_anchor_12.position.set(0.0, 10.45, 0.0);
  socket_rear_windows_upper_walls_anchor_12.rotation.set(0.0, 0.0, 0.0);
  socket_rear_windows_upper_walls_anchor_12.userData.socket = {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_rear_windows_12.add(socket_rear_windows_upper_walls_anchor_12);
  sockets["rear-windows:upper-walls-anchor"] = socket_rear_windows_upper_walls_anchor_12;
  const socket_rear_windows_upper_columns_anchor_13 = new THREE.Object3D();
  socket_rear_windows_upper_columns_anchor_13.name = "upper-columns-anchor";
  socket_rear_windows_upper_columns_anchor_13.position.set(0.0, 10.5, 0.0);
  socket_rear_windows_upper_columns_anchor_13.rotation.set(0.0, 0.0, 0.0);
  socket_rear_windows_upper_columns_anchor_13.userData.socket = {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_rear_windows_12.add(socket_rear_windows_upper_columns_anchor_13);
  sockets["rear-windows:upper-columns-anchor"] = socket_rear_windows_upper_columns_anchor_13;
  const socket_rear_windows_upper_roof_anchor_14 = new THREE.Object3D();
  socket_rear_windows_upper_roof_anchor_14.name = "upper-roof-anchor";
  socket_rear_windows_upper_roof_anchor_14.position.set(0.0, 11.65, 0.0);
  socket_rear_windows_upper_roof_anchor_14.rotation.set(0.0, 0.0, 0.0);
  socket_rear_windows_upper_roof_anchor_14.userData.socket = {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_rear_windows_12.add(socket_rear_windows_upper_roof_anchor_14);
  sockets["rear-windows:upper-roof-anchor"] = socket_rear_windows_upper_roof_anchor_14;
  const socket_rear_windows_upper_tiles_anchor_15 = new THREE.Object3D();
  socket_rear_windows_upper_tiles_anchor_15.name = "upper-tiles-anchor";
  socket_rear_windows_upper_tiles_anchor_15.position.set(0.0, 11.75, 0.0);
  socket_rear_windows_upper_tiles_anchor_15.rotation.set(0.0, 0.0, 0.0);
  socket_rear_windows_upper_tiles_anchor_15.userData.socket = {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_rear_windows_12.add(socket_rear_windows_upper_tiles_anchor_15);
  sockets["rear-windows:upper-tiles-anchor"] = socket_rear_windows_upper_tiles_anchor_15;
  const socket_rear_windows_ornaments_anchor_16 = new THREE.Object3D();
  socket_rear_windows_ornaments_anchor_16.name = "ornaments-anchor";
  socket_rear_windows_ornaments_anchor_16.position.set(0.0, 10.6, 0.0);
  socket_rear_windows_ornaments_anchor_16.rotation.set(0.0, 0.0, 0.0);
  socket_rear_windows_ornaments_anchor_16.userData.socket = {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_rear_windows_12.add(socket_rear_windows_ornaments_anchor_16);
  sockets["rear-windows:ornaments-anchor"] = socket_rear_windows_ornaments_anchor_16;
  const socket_rear_windows_plaque_anchor_17 = new THREE.Object3D();
  socket_rear_windows_plaque_anchor_17.name = "plaque-anchor";
  socket_rear_windows_plaque_anchor_17.position.set(0.0, 5.85, 6.7);
  socket_rear_windows_plaque_anchor_17.rotation.set(0.0, 0.0, 0.0);
  socket_rear_windows_plaque_anchor_17.userData.socket = {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_rear_windows_12.add(socket_rear_windows_plaque_anchor_17);
  sockets["rear-windows:plaque-anchor"] = socket_rear_windows_plaque_anchor_17;

  const endpoint_upper_walls_13 = makeAttachmentEndpoint(null);
  const node_upper_walls_13 = new THREE.Group();
  node_upper_walls_13.name = "upper-walls__pivot";
  node_upper_walls_13.scale.set(1, 1, 1);
  if (endpoint_upper_walls_13) {
    node_upper_walls_13.position.copy(endpoint_upper_walls_13.start);
    node_upper_walls_13.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_upper_walls_13.position.set(0.0, 10.45, 0.0);
    node_upper_walls_13.rotation.set(0.0, 0.0, 0.0);
  }
  node_upper_walls_13.userData.sculptComponent = {"id": "upper-walls", "name": "upper-walls", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "upper-walls-anchor", "localStart": [0, 10.45, 0], "localEnd": [0, 10.549999999999999, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 11.3, "height": 2.4, "depth": 7.4, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 10.45, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-walls", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "ivory", "materialLayers": ["ivory"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "upper-ivory-infill", "type": "geometry", "evidenceRefs": ["full-object"], "description": "upper ivory infill"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(229, 215, 185, 1)", "secondaryAlbedo": "rgba(229, 215, 185, 1)", "materialClass": "stone", "materialClassConfidence": 0.85}};
  node_upper_walls_13.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-walls", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_upper_walls_13);
  nodes["upper-walls"] = node_upper_walls_13;
  const mesh_upper_walls_13Geometry = endpoint_upper_walls_13
    ? new THREE.CylinderGeometry(endpoint_upper_walls_13.endRadius, endpoint_upper_walls_13.baseRadius, endpoint_upper_walls_13.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_upper_walls_13) {
    mesh_upper_walls_13Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_upper_walls_13 = new THREE.Mesh(
    mesh_upper_walls_13Geometry,
    materialMap["ivory"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_upper_walls_13.name = "upper-walls";
  if (endpoint_upper_walls_13) {
    mesh_upper_walls_13.position.copy(endpoint_upper_walls_13.midpoint);
    mesh_upper_walls_13.quaternion.copy(endpoint_upper_walls_13.quaternion);
  }
  mesh_upper_walls_13.castShadow = options.castShadow ?? true;
  mesh_upper_walls_13.receiveShadow = options.receiveShadow ?? true;
  mesh_upper_walls_13.userData.sculptComponent = {"id": "upper-walls", "name": "upper-walls", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "upper-walls-anchor", "localStart": [0, 10.45, 0], "localEnd": [0, 10.549999999999999, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 11.3, "height": 2.4, "depth": 7.4, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 10.45, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-walls", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "ivory", "materialLayers": ["ivory"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "upper-ivory-infill", "type": "geometry", "evidenceRefs": ["full-object"], "description": "upper ivory infill"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(229, 215, 185, 1)", "secondaryAlbedo": "rgba(229, 215, 185, 1)", "materialClass": "stone", "materialClassConfidence": 0.85}};
  node_upper_walls_13.add(mesh_upper_walls_13);
  meshes["upper-walls"] = mesh_upper_walls_13;
  colliders["upper-walls"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."};
  destructionGroups["upper-walls"] ??= [];
  destructionGroups["upper-walls"].push(node_upper_walls_13);
  const socket_upper_walls_foundation_anchor_0 = new THREE.Object3D();
  socket_upper_walls_foundation_anchor_0.name = "foundation-anchor";
  socket_upper_walls_foundation_anchor_0.position.set(0.0, 0.65, 0.0);
  socket_upper_walls_foundation_anchor_0.rotation.set(0.0, 0.0, 0.0);
  socket_upper_walls_foundation_anchor_0.userData.socket = {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_walls_13.add(socket_upper_walls_foundation_anchor_0);
  sockets["upper-walls:foundation-anchor"] = socket_upper_walls_foundation_anchor_0;
  const socket_upper_walls_stairs_anchor_1 = new THREE.Object3D();
  socket_upper_walls_stairs_anchor_1.name = "stairs-anchor";
  socket_upper_walls_stairs_anchor_1.position.set(0.0, 0.6, 11.5);
  socket_upper_walls_stairs_anchor_1.rotation.set(0.0, 0.0, 0.0);
  socket_upper_walls_stairs_anchor_1.userData.socket = {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_walls_13.add(socket_upper_walls_stairs_anchor_1);
  sockets["upper-walls:stairs-anchor"] = socket_upper_walls_stairs_anchor_1;
  const socket_upper_walls_railings_anchor_2 = new THREE.Object3D();
  socket_upper_walls_railings_anchor_2.name = "railings-anchor";
  socket_upper_walls_railings_anchor_2.position.set(0.0, 1.3, 0.0);
  socket_upper_walls_railings_anchor_2.rotation.set(0.0, 0.0, 0.0);
  socket_upper_walls_railings_anchor_2.userData.socket = {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_walls_13.add(socket_upper_walls_railings_anchor_2);
  sockets["upper-walls:railings-anchor"] = socket_upper_walls_railings_anchor_2;
  const socket_upper_walls_columns_anchor_3 = new THREE.Object3D();
  socket_upper_walls_columns_anchor_3.name = "columns-anchor";
  socket_upper_walls_columns_anchor_3.position.set(0.0, 3.95, 0.0);
  socket_upper_walls_columns_anchor_3.rotation.set(0.0, 0.0, 0.0);
  socket_upper_walls_columns_anchor_3.userData.socket = {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_walls_13.add(socket_upper_walls_columns_anchor_3);
  sockets["upper-walls:columns-anchor"] = socket_upper_walls_columns_anchor_3;
  const socket_upper_walls_beams_anchor_4 = new THREE.Object3D();
  socket_upper_walls_beams_anchor_4.name = "beams-anchor";
  socket_upper_walls_beams_anchor_4.position.set(0.0, 6.15, 0.0);
  socket_upper_walls_beams_anchor_4.rotation.set(0.0, 0.0, 0.0);
  socket_upper_walls_beams_anchor_4.userData.socket = {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_walls_13.add(socket_upper_walls_beams_anchor_4);
  sockets["upper-walls:beams-anchor"] = socket_upper_walls_beams_anchor_4;
  const socket_upper_walls_lower_roof_anchor_5 = new THREE.Object3D();
  socket_upper_walls_lower_roof_anchor_5.name = "lower-roof-anchor";
  socket_upper_walls_lower_roof_anchor_5.position.set(0.0, 6.8, 0.0);
  socket_upper_walls_lower_roof_anchor_5.rotation.set(0.0, 0.0, 0.0);
  socket_upper_walls_lower_roof_anchor_5.userData.socket = {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_walls_13.add(socket_upper_walls_lower_roof_anchor_5);
  sockets["upper-walls:lower-roof-anchor"] = socket_upper_walls_lower_roof_anchor_5;
  const socket_upper_walls_lower_tiles_anchor_6 = new THREE.Object3D();
  socket_upper_walls_lower_tiles_anchor_6.name = "lower-tiles-anchor";
  socket_upper_walls_lower_tiles_anchor_6.position.set(0.0, 6.9, 0.0);
  socket_upper_walls_lower_tiles_anchor_6.rotation.set(0.0, 0.0, 0.0);
  socket_upper_walls_lower_tiles_anchor_6.userData.socket = {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_walls_13.add(socket_upper_walls_lower_tiles_anchor_6);
  sockets["upper-walls:lower-tiles-anchor"] = socket_upper_walls_lower_tiles_anchor_6;
  const socket_upper_walls_lower_eaves_anchor_7 = new THREE.Object3D();
  socket_upper_walls_lower_eaves_anchor_7.name = "lower-eaves-anchor";
  socket_upper_walls_lower_eaves_anchor_7.position.set(0.0, 6.8, 0.0);
  socket_upper_walls_lower_eaves_anchor_7.rotation.set(0.0, 0.0, 0.0);
  socket_upper_walls_lower_eaves_anchor_7.userData.socket = {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_walls_13.add(socket_upper_walls_lower_eaves_anchor_7);
  sockets["upper-walls:lower-eaves-anchor"] = socket_upper_walls_lower_eaves_anchor_7;
  const socket_upper_walls_brackets_anchor_8 = new THREE.Object3D();
  socket_upper_walls_brackets_anchor_8.name = "brackets-anchor";
  socket_upper_walls_brackets_anchor_8.position.set(0.0, 6.4, 0.0);
  socket_upper_walls_brackets_anchor_8.rotation.set(0.0, 0.0, 0.0);
  socket_upper_walls_brackets_anchor_8.userData.socket = {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_walls_13.add(socket_upper_walls_brackets_anchor_8);
  sockets["upper-walls:brackets-anchor"] = socket_upper_walls_brackets_anchor_8;
  const socket_upper_walls_facades_anchor_9 = new THREE.Object3D();
  socket_upper_walls_facades_anchor_9.name = "facades-anchor";
  socket_upper_walls_facades_anchor_9.position.set(0.0, 3.9, 0.0);
  socket_upper_walls_facades_anchor_9.rotation.set(0.0, 0.0, 0.0);
  socket_upper_walls_facades_anchor_9.userData.socket = {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_walls_13.add(socket_upper_walls_facades_anchor_9);
  sockets["upper-walls:facades-anchor"] = socket_upper_walls_facades_anchor_9;
  const socket_upper_walls_front_doors_anchor_10 = new THREE.Object3D();
  socket_upper_walls_front_doors_anchor_10.name = "front-doors-anchor";
  socket_upper_walls_front_doors_anchor_10.position.set(0.0, 3.6, 5.92);
  socket_upper_walls_front_doors_anchor_10.rotation.set(0.0, 0.0, 0.0);
  socket_upper_walls_front_doors_anchor_10.userData.socket = {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_walls_13.add(socket_upper_walls_front_doors_anchor_10);
  sockets["upper-walls:front-doors-anchor"] = socket_upper_walls_front_doors_anchor_10;
  const socket_upper_walls_rear_windows_anchor_11 = new THREE.Object3D();
  socket_upper_walls_rear_windows_anchor_11.name = "rear-windows-anchor";
  socket_upper_walls_rear_windows_anchor_11.position.set(0.0, 3.8, -5.92);
  socket_upper_walls_rear_windows_anchor_11.rotation.set(0.0, 0.0, 0.0);
  socket_upper_walls_rear_windows_anchor_11.userData.socket = {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_walls_13.add(socket_upper_walls_rear_windows_anchor_11);
  sockets["upper-walls:rear-windows-anchor"] = socket_upper_walls_rear_windows_anchor_11;
  const socket_upper_walls_upper_walls_anchor_12 = new THREE.Object3D();
  socket_upper_walls_upper_walls_anchor_12.name = "upper-walls-anchor";
  socket_upper_walls_upper_walls_anchor_12.position.set(0.0, 10.45, 0.0);
  socket_upper_walls_upper_walls_anchor_12.rotation.set(0.0, 0.0, 0.0);
  socket_upper_walls_upper_walls_anchor_12.userData.socket = {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_walls_13.add(socket_upper_walls_upper_walls_anchor_12);
  sockets["upper-walls:upper-walls-anchor"] = socket_upper_walls_upper_walls_anchor_12;
  const socket_upper_walls_upper_columns_anchor_13 = new THREE.Object3D();
  socket_upper_walls_upper_columns_anchor_13.name = "upper-columns-anchor";
  socket_upper_walls_upper_columns_anchor_13.position.set(0.0, 10.5, 0.0);
  socket_upper_walls_upper_columns_anchor_13.rotation.set(0.0, 0.0, 0.0);
  socket_upper_walls_upper_columns_anchor_13.userData.socket = {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_walls_13.add(socket_upper_walls_upper_columns_anchor_13);
  sockets["upper-walls:upper-columns-anchor"] = socket_upper_walls_upper_columns_anchor_13;
  const socket_upper_walls_upper_roof_anchor_14 = new THREE.Object3D();
  socket_upper_walls_upper_roof_anchor_14.name = "upper-roof-anchor";
  socket_upper_walls_upper_roof_anchor_14.position.set(0.0, 11.65, 0.0);
  socket_upper_walls_upper_roof_anchor_14.rotation.set(0.0, 0.0, 0.0);
  socket_upper_walls_upper_roof_anchor_14.userData.socket = {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_walls_13.add(socket_upper_walls_upper_roof_anchor_14);
  sockets["upper-walls:upper-roof-anchor"] = socket_upper_walls_upper_roof_anchor_14;
  const socket_upper_walls_upper_tiles_anchor_15 = new THREE.Object3D();
  socket_upper_walls_upper_tiles_anchor_15.name = "upper-tiles-anchor";
  socket_upper_walls_upper_tiles_anchor_15.position.set(0.0, 11.75, 0.0);
  socket_upper_walls_upper_tiles_anchor_15.rotation.set(0.0, 0.0, 0.0);
  socket_upper_walls_upper_tiles_anchor_15.userData.socket = {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_walls_13.add(socket_upper_walls_upper_tiles_anchor_15);
  sockets["upper-walls:upper-tiles-anchor"] = socket_upper_walls_upper_tiles_anchor_15;
  const socket_upper_walls_ornaments_anchor_16 = new THREE.Object3D();
  socket_upper_walls_ornaments_anchor_16.name = "ornaments-anchor";
  socket_upper_walls_ornaments_anchor_16.position.set(0.0, 10.6, 0.0);
  socket_upper_walls_ornaments_anchor_16.rotation.set(0.0, 0.0, 0.0);
  socket_upper_walls_ornaments_anchor_16.userData.socket = {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_walls_13.add(socket_upper_walls_ornaments_anchor_16);
  sockets["upper-walls:ornaments-anchor"] = socket_upper_walls_ornaments_anchor_16;
  const socket_upper_walls_plaque_anchor_17 = new THREE.Object3D();
  socket_upper_walls_plaque_anchor_17.name = "plaque-anchor";
  socket_upper_walls_plaque_anchor_17.position.set(0.0, 5.85, 6.7);
  socket_upper_walls_plaque_anchor_17.rotation.set(0.0, 0.0, 0.0);
  socket_upper_walls_plaque_anchor_17.userData.socket = {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_walls_13.add(socket_upper_walls_plaque_anchor_17);
  sockets["upper-walls:plaque-anchor"] = socket_upper_walls_plaque_anchor_17;

  const endpoint_upper_columns_14 = makeAttachmentEndpoint(null);
  const node_upper_columns_14 = new THREE.Group();
  node_upper_columns_14.name = "upper-columns__pivot";
  node_upper_columns_14.scale.set(1, 1, 1);
  if (endpoint_upper_columns_14) {
    node_upper_columns_14.position.copy(endpoint_upper_columns_14.start);
    node_upper_columns_14.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_upper_columns_14.position.set(0.0, 10.5, 0.0);
    node_upper_columns_14.rotation.set(0.0, 0.0, 0.0);
  }
  node_upper_columns_14.userData.sculptComponent = {"id": "upper-columns", "name": "upper-columns", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "upper-columns-anchor", "localStart": [0, 10.5, 0], "localEnd": [0, 10.6, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 11.3, "height": 2.5, "depth": 7.4, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 10.5, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-columns", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "wood", "materialLayers": ["wood"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "upper-vermilion-posts", "type": "geometry", "evidenceRefs": ["full-object"], "description": "upper vermilion posts"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(133, 61, 45, 1)", "secondaryAlbedo": "rgba(133, 61, 45, 1)", "materialClass": "wood", "materialClassConfidence": 0.85}};
  node_upper_columns_14.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-columns", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_upper_columns_14);
  nodes["upper-columns"] = node_upper_columns_14;
  const mesh_upper_columns_14Geometry = endpoint_upper_columns_14
    ? new THREE.CylinderGeometry(endpoint_upper_columns_14.endRadius, endpoint_upper_columns_14.baseRadius, endpoint_upper_columns_14.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_upper_columns_14) {
    mesh_upper_columns_14Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_upper_columns_14 = new THREE.Mesh(
    mesh_upper_columns_14Geometry,
    materialMap["wood"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_upper_columns_14.name = "upper-columns";
  if (endpoint_upper_columns_14) {
    mesh_upper_columns_14.position.copy(endpoint_upper_columns_14.midpoint);
    mesh_upper_columns_14.quaternion.copy(endpoint_upper_columns_14.quaternion);
  }
  mesh_upper_columns_14.castShadow = options.castShadow ?? true;
  mesh_upper_columns_14.receiveShadow = options.receiveShadow ?? true;
  mesh_upper_columns_14.userData.sculptComponent = {"id": "upper-columns", "name": "upper-columns", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "upper-columns-anchor", "localStart": [0, 10.5, 0], "localEnd": [0, 10.6, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 11.3, "height": 2.5, "depth": 7.4, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 10.5, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-columns", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "wood", "materialLayers": ["wood"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "upper-vermilion-posts", "type": "geometry", "evidenceRefs": ["full-object"], "description": "upper vermilion posts"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(133, 61, 45, 1)", "secondaryAlbedo": "rgba(133, 61, 45, 1)", "materialClass": "wood", "materialClassConfidence": 0.85}};
  node_upper_columns_14.add(mesh_upper_columns_14);
  meshes["upper-columns"] = mesh_upper_columns_14;
  colliders["upper-columns"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."};
  destructionGroups["upper-columns"] ??= [];
  destructionGroups["upper-columns"].push(node_upper_columns_14);
  const socket_upper_columns_foundation_anchor_0 = new THREE.Object3D();
  socket_upper_columns_foundation_anchor_0.name = "foundation-anchor";
  socket_upper_columns_foundation_anchor_0.position.set(0.0, 0.65, 0.0);
  socket_upper_columns_foundation_anchor_0.rotation.set(0.0, 0.0, 0.0);
  socket_upper_columns_foundation_anchor_0.userData.socket = {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_columns_14.add(socket_upper_columns_foundation_anchor_0);
  sockets["upper-columns:foundation-anchor"] = socket_upper_columns_foundation_anchor_0;
  const socket_upper_columns_stairs_anchor_1 = new THREE.Object3D();
  socket_upper_columns_stairs_anchor_1.name = "stairs-anchor";
  socket_upper_columns_stairs_anchor_1.position.set(0.0, 0.6, 11.5);
  socket_upper_columns_stairs_anchor_1.rotation.set(0.0, 0.0, 0.0);
  socket_upper_columns_stairs_anchor_1.userData.socket = {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_columns_14.add(socket_upper_columns_stairs_anchor_1);
  sockets["upper-columns:stairs-anchor"] = socket_upper_columns_stairs_anchor_1;
  const socket_upper_columns_railings_anchor_2 = new THREE.Object3D();
  socket_upper_columns_railings_anchor_2.name = "railings-anchor";
  socket_upper_columns_railings_anchor_2.position.set(0.0, 1.3, 0.0);
  socket_upper_columns_railings_anchor_2.rotation.set(0.0, 0.0, 0.0);
  socket_upper_columns_railings_anchor_2.userData.socket = {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_columns_14.add(socket_upper_columns_railings_anchor_2);
  sockets["upper-columns:railings-anchor"] = socket_upper_columns_railings_anchor_2;
  const socket_upper_columns_columns_anchor_3 = new THREE.Object3D();
  socket_upper_columns_columns_anchor_3.name = "columns-anchor";
  socket_upper_columns_columns_anchor_3.position.set(0.0, 3.95, 0.0);
  socket_upper_columns_columns_anchor_3.rotation.set(0.0, 0.0, 0.0);
  socket_upper_columns_columns_anchor_3.userData.socket = {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_columns_14.add(socket_upper_columns_columns_anchor_3);
  sockets["upper-columns:columns-anchor"] = socket_upper_columns_columns_anchor_3;
  const socket_upper_columns_beams_anchor_4 = new THREE.Object3D();
  socket_upper_columns_beams_anchor_4.name = "beams-anchor";
  socket_upper_columns_beams_anchor_4.position.set(0.0, 6.15, 0.0);
  socket_upper_columns_beams_anchor_4.rotation.set(0.0, 0.0, 0.0);
  socket_upper_columns_beams_anchor_4.userData.socket = {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_columns_14.add(socket_upper_columns_beams_anchor_4);
  sockets["upper-columns:beams-anchor"] = socket_upper_columns_beams_anchor_4;
  const socket_upper_columns_lower_roof_anchor_5 = new THREE.Object3D();
  socket_upper_columns_lower_roof_anchor_5.name = "lower-roof-anchor";
  socket_upper_columns_lower_roof_anchor_5.position.set(0.0, 6.8, 0.0);
  socket_upper_columns_lower_roof_anchor_5.rotation.set(0.0, 0.0, 0.0);
  socket_upper_columns_lower_roof_anchor_5.userData.socket = {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_columns_14.add(socket_upper_columns_lower_roof_anchor_5);
  sockets["upper-columns:lower-roof-anchor"] = socket_upper_columns_lower_roof_anchor_5;
  const socket_upper_columns_lower_tiles_anchor_6 = new THREE.Object3D();
  socket_upper_columns_lower_tiles_anchor_6.name = "lower-tiles-anchor";
  socket_upper_columns_lower_tiles_anchor_6.position.set(0.0, 6.9, 0.0);
  socket_upper_columns_lower_tiles_anchor_6.rotation.set(0.0, 0.0, 0.0);
  socket_upper_columns_lower_tiles_anchor_6.userData.socket = {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_columns_14.add(socket_upper_columns_lower_tiles_anchor_6);
  sockets["upper-columns:lower-tiles-anchor"] = socket_upper_columns_lower_tiles_anchor_6;
  const socket_upper_columns_lower_eaves_anchor_7 = new THREE.Object3D();
  socket_upper_columns_lower_eaves_anchor_7.name = "lower-eaves-anchor";
  socket_upper_columns_lower_eaves_anchor_7.position.set(0.0, 6.8, 0.0);
  socket_upper_columns_lower_eaves_anchor_7.rotation.set(0.0, 0.0, 0.0);
  socket_upper_columns_lower_eaves_anchor_7.userData.socket = {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_columns_14.add(socket_upper_columns_lower_eaves_anchor_7);
  sockets["upper-columns:lower-eaves-anchor"] = socket_upper_columns_lower_eaves_anchor_7;
  const socket_upper_columns_brackets_anchor_8 = new THREE.Object3D();
  socket_upper_columns_brackets_anchor_8.name = "brackets-anchor";
  socket_upper_columns_brackets_anchor_8.position.set(0.0, 6.4, 0.0);
  socket_upper_columns_brackets_anchor_8.rotation.set(0.0, 0.0, 0.0);
  socket_upper_columns_brackets_anchor_8.userData.socket = {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_columns_14.add(socket_upper_columns_brackets_anchor_8);
  sockets["upper-columns:brackets-anchor"] = socket_upper_columns_brackets_anchor_8;
  const socket_upper_columns_facades_anchor_9 = new THREE.Object3D();
  socket_upper_columns_facades_anchor_9.name = "facades-anchor";
  socket_upper_columns_facades_anchor_9.position.set(0.0, 3.9, 0.0);
  socket_upper_columns_facades_anchor_9.rotation.set(0.0, 0.0, 0.0);
  socket_upper_columns_facades_anchor_9.userData.socket = {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_columns_14.add(socket_upper_columns_facades_anchor_9);
  sockets["upper-columns:facades-anchor"] = socket_upper_columns_facades_anchor_9;
  const socket_upper_columns_front_doors_anchor_10 = new THREE.Object3D();
  socket_upper_columns_front_doors_anchor_10.name = "front-doors-anchor";
  socket_upper_columns_front_doors_anchor_10.position.set(0.0, 3.6, 5.92);
  socket_upper_columns_front_doors_anchor_10.rotation.set(0.0, 0.0, 0.0);
  socket_upper_columns_front_doors_anchor_10.userData.socket = {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_columns_14.add(socket_upper_columns_front_doors_anchor_10);
  sockets["upper-columns:front-doors-anchor"] = socket_upper_columns_front_doors_anchor_10;
  const socket_upper_columns_rear_windows_anchor_11 = new THREE.Object3D();
  socket_upper_columns_rear_windows_anchor_11.name = "rear-windows-anchor";
  socket_upper_columns_rear_windows_anchor_11.position.set(0.0, 3.8, -5.92);
  socket_upper_columns_rear_windows_anchor_11.rotation.set(0.0, 0.0, 0.0);
  socket_upper_columns_rear_windows_anchor_11.userData.socket = {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_columns_14.add(socket_upper_columns_rear_windows_anchor_11);
  sockets["upper-columns:rear-windows-anchor"] = socket_upper_columns_rear_windows_anchor_11;
  const socket_upper_columns_upper_walls_anchor_12 = new THREE.Object3D();
  socket_upper_columns_upper_walls_anchor_12.name = "upper-walls-anchor";
  socket_upper_columns_upper_walls_anchor_12.position.set(0.0, 10.45, 0.0);
  socket_upper_columns_upper_walls_anchor_12.rotation.set(0.0, 0.0, 0.0);
  socket_upper_columns_upper_walls_anchor_12.userData.socket = {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_columns_14.add(socket_upper_columns_upper_walls_anchor_12);
  sockets["upper-columns:upper-walls-anchor"] = socket_upper_columns_upper_walls_anchor_12;
  const socket_upper_columns_upper_columns_anchor_13 = new THREE.Object3D();
  socket_upper_columns_upper_columns_anchor_13.name = "upper-columns-anchor";
  socket_upper_columns_upper_columns_anchor_13.position.set(0.0, 10.5, 0.0);
  socket_upper_columns_upper_columns_anchor_13.rotation.set(0.0, 0.0, 0.0);
  socket_upper_columns_upper_columns_anchor_13.userData.socket = {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_columns_14.add(socket_upper_columns_upper_columns_anchor_13);
  sockets["upper-columns:upper-columns-anchor"] = socket_upper_columns_upper_columns_anchor_13;
  const socket_upper_columns_upper_roof_anchor_14 = new THREE.Object3D();
  socket_upper_columns_upper_roof_anchor_14.name = "upper-roof-anchor";
  socket_upper_columns_upper_roof_anchor_14.position.set(0.0, 11.65, 0.0);
  socket_upper_columns_upper_roof_anchor_14.rotation.set(0.0, 0.0, 0.0);
  socket_upper_columns_upper_roof_anchor_14.userData.socket = {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_columns_14.add(socket_upper_columns_upper_roof_anchor_14);
  sockets["upper-columns:upper-roof-anchor"] = socket_upper_columns_upper_roof_anchor_14;
  const socket_upper_columns_upper_tiles_anchor_15 = new THREE.Object3D();
  socket_upper_columns_upper_tiles_anchor_15.name = "upper-tiles-anchor";
  socket_upper_columns_upper_tiles_anchor_15.position.set(0.0, 11.75, 0.0);
  socket_upper_columns_upper_tiles_anchor_15.rotation.set(0.0, 0.0, 0.0);
  socket_upper_columns_upper_tiles_anchor_15.userData.socket = {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_columns_14.add(socket_upper_columns_upper_tiles_anchor_15);
  sockets["upper-columns:upper-tiles-anchor"] = socket_upper_columns_upper_tiles_anchor_15;
  const socket_upper_columns_ornaments_anchor_16 = new THREE.Object3D();
  socket_upper_columns_ornaments_anchor_16.name = "ornaments-anchor";
  socket_upper_columns_ornaments_anchor_16.position.set(0.0, 10.6, 0.0);
  socket_upper_columns_ornaments_anchor_16.rotation.set(0.0, 0.0, 0.0);
  socket_upper_columns_ornaments_anchor_16.userData.socket = {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_columns_14.add(socket_upper_columns_ornaments_anchor_16);
  sockets["upper-columns:ornaments-anchor"] = socket_upper_columns_ornaments_anchor_16;
  const socket_upper_columns_plaque_anchor_17 = new THREE.Object3D();
  socket_upper_columns_plaque_anchor_17.name = "plaque-anchor";
  socket_upper_columns_plaque_anchor_17.position.set(0.0, 5.85, 6.7);
  socket_upper_columns_plaque_anchor_17.rotation.set(0.0, 0.0, 0.0);
  socket_upper_columns_plaque_anchor_17.userData.socket = {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_columns_14.add(socket_upper_columns_plaque_anchor_17);
  sockets["upper-columns:plaque-anchor"] = socket_upper_columns_plaque_anchor_17;

  const endpoint_upper_roof_15 = makeAttachmentEndpoint(null);
  const node_upper_roof_15 = new THREE.Group();
  node_upper_roof_15.name = "upper-roof__pivot";
  node_upper_roof_15.scale.set(1, 1, 1);
  if (endpoint_upper_roof_15) {
    node_upper_roof_15.position.copy(endpoint_upper_roof_15.start);
    node_upper_roof_15.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_upper_roof_15.position.set(0.0, 11.65, 0.0);
    node_upper_roof_15.rotation.set(0.0, 0.0, 0.0);
  }
  node_upper_roof_15.userData.sculptComponent = {"id": "upper-roof", "name": "upper-roof", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Thin curved four-slope roof with a connected underside and fascia.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "profile": {"points": [[-0.5, 0], [0, 0.2], [0.5, 0]], "depth": 1}, "architecturalRoof": {"halfWidth": 8.2, "halfDepth": 5.8, "rise": 3.2, "radialRows": 20, "slopePower": 1.75, "cornerLift": 0.9, "ridgeHalfLength": 2.0}}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "upper-roof-anchor", "localStart": [0, 11.65, 0], "localEnd": [0, 11.75, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 16.4, "height": 3.2, "depth": 11.6, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 11.65, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-roof", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "roof", "materialLayers": ["roof"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "hip-ridge-corner-curl", "type": "geometry", "evidenceRefs": ["full-object"], "description": "hip ridge corner curl"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(39, 94, 91, 1)", "secondaryAlbedo": "rgba(39, 94, 91, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.85}};
  node_upper_roof_15.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-roof", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_upper_roof_15);
  nodes["upper-roof"] = node_upper_roof_15;
  const mesh_upper_roof_15Geometry = endpoint_upper_roof_15
    ? new THREE.CylinderGeometry(endpoint_upper_roof_15.endRadius, endpoint_upper_roof_15.baseRadius, endpoint_upper_roof_15.length, 32, 12)
    : buildExtrudeGeometry({"points": [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]], "depth": 0.1});
  if (!endpoint_upper_roof_15) {
    mesh_upper_roof_15Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_upper_roof_15 = new THREE.Mesh(
    mesh_upper_roof_15Geometry,
    materialMap["roof"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_upper_roof_15.name = "upper-roof";
  if (endpoint_upper_roof_15) {
    mesh_upper_roof_15.position.copy(endpoint_upper_roof_15.midpoint);
    mesh_upper_roof_15.quaternion.copy(endpoint_upper_roof_15.quaternion);
  }
  mesh_upper_roof_15.castShadow = options.castShadow ?? true;
  mesh_upper_roof_15.receiveShadow = options.receiveShadow ?? true;
  mesh_upper_roof_15.userData.sculptComponent = {"id": "upper-roof", "name": "upper-roof", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Thin curved four-slope roof with a connected underside and fascia.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "profile": {"points": [[-0.5, 0], [0, 0.2], [0.5, 0]], "depth": 1}, "architecturalRoof": {"halfWidth": 8.2, "halfDepth": 5.8, "rise": 3.2, "radialRows": 20, "slopePower": 1.75, "cornerLift": 0.9, "ridgeHalfLength": 2.0}}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "upper-roof-anchor", "localStart": [0, 11.65, 0], "localEnd": [0, 11.75, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 16.4, "height": 3.2, "depth": 11.6, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 11.65, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-roof", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "roof", "materialLayers": ["roof"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "hip-ridge-corner-curl", "type": "geometry", "evidenceRefs": ["full-object"], "description": "hip ridge corner curl"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(39, 94, 91, 1)", "secondaryAlbedo": "rgba(39, 94, 91, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.85}};
  node_upper_roof_15.add(mesh_upper_roof_15);
  meshes["upper-roof"] = mesh_upper_roof_15;
  colliders["upper-roof"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."};
  destructionGroups["upper-roof"] ??= [];
  destructionGroups["upper-roof"].push(node_upper_roof_15);
  const socket_upper_roof_foundation_anchor_0 = new THREE.Object3D();
  socket_upper_roof_foundation_anchor_0.name = "foundation-anchor";
  socket_upper_roof_foundation_anchor_0.position.set(0.0, 0.65, 0.0);
  socket_upper_roof_foundation_anchor_0.rotation.set(0.0, 0.0, 0.0);
  socket_upper_roof_foundation_anchor_0.userData.socket = {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_roof_15.add(socket_upper_roof_foundation_anchor_0);
  sockets["upper-roof:foundation-anchor"] = socket_upper_roof_foundation_anchor_0;
  const socket_upper_roof_stairs_anchor_1 = new THREE.Object3D();
  socket_upper_roof_stairs_anchor_1.name = "stairs-anchor";
  socket_upper_roof_stairs_anchor_1.position.set(0.0, 0.6, 11.5);
  socket_upper_roof_stairs_anchor_1.rotation.set(0.0, 0.0, 0.0);
  socket_upper_roof_stairs_anchor_1.userData.socket = {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_roof_15.add(socket_upper_roof_stairs_anchor_1);
  sockets["upper-roof:stairs-anchor"] = socket_upper_roof_stairs_anchor_1;
  const socket_upper_roof_railings_anchor_2 = new THREE.Object3D();
  socket_upper_roof_railings_anchor_2.name = "railings-anchor";
  socket_upper_roof_railings_anchor_2.position.set(0.0, 1.3, 0.0);
  socket_upper_roof_railings_anchor_2.rotation.set(0.0, 0.0, 0.0);
  socket_upper_roof_railings_anchor_2.userData.socket = {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_roof_15.add(socket_upper_roof_railings_anchor_2);
  sockets["upper-roof:railings-anchor"] = socket_upper_roof_railings_anchor_2;
  const socket_upper_roof_columns_anchor_3 = new THREE.Object3D();
  socket_upper_roof_columns_anchor_3.name = "columns-anchor";
  socket_upper_roof_columns_anchor_3.position.set(0.0, 3.95, 0.0);
  socket_upper_roof_columns_anchor_3.rotation.set(0.0, 0.0, 0.0);
  socket_upper_roof_columns_anchor_3.userData.socket = {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_roof_15.add(socket_upper_roof_columns_anchor_3);
  sockets["upper-roof:columns-anchor"] = socket_upper_roof_columns_anchor_3;
  const socket_upper_roof_beams_anchor_4 = new THREE.Object3D();
  socket_upper_roof_beams_anchor_4.name = "beams-anchor";
  socket_upper_roof_beams_anchor_4.position.set(0.0, 6.15, 0.0);
  socket_upper_roof_beams_anchor_4.rotation.set(0.0, 0.0, 0.0);
  socket_upper_roof_beams_anchor_4.userData.socket = {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_roof_15.add(socket_upper_roof_beams_anchor_4);
  sockets["upper-roof:beams-anchor"] = socket_upper_roof_beams_anchor_4;
  const socket_upper_roof_lower_roof_anchor_5 = new THREE.Object3D();
  socket_upper_roof_lower_roof_anchor_5.name = "lower-roof-anchor";
  socket_upper_roof_lower_roof_anchor_5.position.set(0.0, 6.8, 0.0);
  socket_upper_roof_lower_roof_anchor_5.rotation.set(0.0, 0.0, 0.0);
  socket_upper_roof_lower_roof_anchor_5.userData.socket = {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_roof_15.add(socket_upper_roof_lower_roof_anchor_5);
  sockets["upper-roof:lower-roof-anchor"] = socket_upper_roof_lower_roof_anchor_5;
  const socket_upper_roof_lower_tiles_anchor_6 = new THREE.Object3D();
  socket_upper_roof_lower_tiles_anchor_6.name = "lower-tiles-anchor";
  socket_upper_roof_lower_tiles_anchor_6.position.set(0.0, 6.9, 0.0);
  socket_upper_roof_lower_tiles_anchor_6.rotation.set(0.0, 0.0, 0.0);
  socket_upper_roof_lower_tiles_anchor_6.userData.socket = {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_roof_15.add(socket_upper_roof_lower_tiles_anchor_6);
  sockets["upper-roof:lower-tiles-anchor"] = socket_upper_roof_lower_tiles_anchor_6;
  const socket_upper_roof_lower_eaves_anchor_7 = new THREE.Object3D();
  socket_upper_roof_lower_eaves_anchor_7.name = "lower-eaves-anchor";
  socket_upper_roof_lower_eaves_anchor_7.position.set(0.0, 6.8, 0.0);
  socket_upper_roof_lower_eaves_anchor_7.rotation.set(0.0, 0.0, 0.0);
  socket_upper_roof_lower_eaves_anchor_7.userData.socket = {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_roof_15.add(socket_upper_roof_lower_eaves_anchor_7);
  sockets["upper-roof:lower-eaves-anchor"] = socket_upper_roof_lower_eaves_anchor_7;
  const socket_upper_roof_brackets_anchor_8 = new THREE.Object3D();
  socket_upper_roof_brackets_anchor_8.name = "brackets-anchor";
  socket_upper_roof_brackets_anchor_8.position.set(0.0, 6.4, 0.0);
  socket_upper_roof_brackets_anchor_8.rotation.set(0.0, 0.0, 0.0);
  socket_upper_roof_brackets_anchor_8.userData.socket = {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_roof_15.add(socket_upper_roof_brackets_anchor_8);
  sockets["upper-roof:brackets-anchor"] = socket_upper_roof_brackets_anchor_8;
  const socket_upper_roof_facades_anchor_9 = new THREE.Object3D();
  socket_upper_roof_facades_anchor_9.name = "facades-anchor";
  socket_upper_roof_facades_anchor_9.position.set(0.0, 3.9, 0.0);
  socket_upper_roof_facades_anchor_9.rotation.set(0.0, 0.0, 0.0);
  socket_upper_roof_facades_anchor_9.userData.socket = {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_roof_15.add(socket_upper_roof_facades_anchor_9);
  sockets["upper-roof:facades-anchor"] = socket_upper_roof_facades_anchor_9;
  const socket_upper_roof_front_doors_anchor_10 = new THREE.Object3D();
  socket_upper_roof_front_doors_anchor_10.name = "front-doors-anchor";
  socket_upper_roof_front_doors_anchor_10.position.set(0.0, 3.6, 5.92);
  socket_upper_roof_front_doors_anchor_10.rotation.set(0.0, 0.0, 0.0);
  socket_upper_roof_front_doors_anchor_10.userData.socket = {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_roof_15.add(socket_upper_roof_front_doors_anchor_10);
  sockets["upper-roof:front-doors-anchor"] = socket_upper_roof_front_doors_anchor_10;
  const socket_upper_roof_rear_windows_anchor_11 = new THREE.Object3D();
  socket_upper_roof_rear_windows_anchor_11.name = "rear-windows-anchor";
  socket_upper_roof_rear_windows_anchor_11.position.set(0.0, 3.8, -5.92);
  socket_upper_roof_rear_windows_anchor_11.rotation.set(0.0, 0.0, 0.0);
  socket_upper_roof_rear_windows_anchor_11.userData.socket = {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_roof_15.add(socket_upper_roof_rear_windows_anchor_11);
  sockets["upper-roof:rear-windows-anchor"] = socket_upper_roof_rear_windows_anchor_11;
  const socket_upper_roof_upper_walls_anchor_12 = new THREE.Object3D();
  socket_upper_roof_upper_walls_anchor_12.name = "upper-walls-anchor";
  socket_upper_roof_upper_walls_anchor_12.position.set(0.0, 10.45, 0.0);
  socket_upper_roof_upper_walls_anchor_12.rotation.set(0.0, 0.0, 0.0);
  socket_upper_roof_upper_walls_anchor_12.userData.socket = {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_roof_15.add(socket_upper_roof_upper_walls_anchor_12);
  sockets["upper-roof:upper-walls-anchor"] = socket_upper_roof_upper_walls_anchor_12;
  const socket_upper_roof_upper_columns_anchor_13 = new THREE.Object3D();
  socket_upper_roof_upper_columns_anchor_13.name = "upper-columns-anchor";
  socket_upper_roof_upper_columns_anchor_13.position.set(0.0, 10.5, 0.0);
  socket_upper_roof_upper_columns_anchor_13.rotation.set(0.0, 0.0, 0.0);
  socket_upper_roof_upper_columns_anchor_13.userData.socket = {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_roof_15.add(socket_upper_roof_upper_columns_anchor_13);
  sockets["upper-roof:upper-columns-anchor"] = socket_upper_roof_upper_columns_anchor_13;
  const socket_upper_roof_upper_roof_anchor_14 = new THREE.Object3D();
  socket_upper_roof_upper_roof_anchor_14.name = "upper-roof-anchor";
  socket_upper_roof_upper_roof_anchor_14.position.set(0.0, 11.65, 0.0);
  socket_upper_roof_upper_roof_anchor_14.rotation.set(0.0, 0.0, 0.0);
  socket_upper_roof_upper_roof_anchor_14.userData.socket = {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_roof_15.add(socket_upper_roof_upper_roof_anchor_14);
  sockets["upper-roof:upper-roof-anchor"] = socket_upper_roof_upper_roof_anchor_14;
  const socket_upper_roof_upper_tiles_anchor_15 = new THREE.Object3D();
  socket_upper_roof_upper_tiles_anchor_15.name = "upper-tiles-anchor";
  socket_upper_roof_upper_tiles_anchor_15.position.set(0.0, 11.75, 0.0);
  socket_upper_roof_upper_tiles_anchor_15.rotation.set(0.0, 0.0, 0.0);
  socket_upper_roof_upper_tiles_anchor_15.userData.socket = {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_roof_15.add(socket_upper_roof_upper_tiles_anchor_15);
  sockets["upper-roof:upper-tiles-anchor"] = socket_upper_roof_upper_tiles_anchor_15;
  const socket_upper_roof_ornaments_anchor_16 = new THREE.Object3D();
  socket_upper_roof_ornaments_anchor_16.name = "ornaments-anchor";
  socket_upper_roof_ornaments_anchor_16.position.set(0.0, 10.6, 0.0);
  socket_upper_roof_ornaments_anchor_16.rotation.set(0.0, 0.0, 0.0);
  socket_upper_roof_ornaments_anchor_16.userData.socket = {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_roof_15.add(socket_upper_roof_ornaments_anchor_16);
  sockets["upper-roof:ornaments-anchor"] = socket_upper_roof_ornaments_anchor_16;
  const socket_upper_roof_plaque_anchor_17 = new THREE.Object3D();
  socket_upper_roof_plaque_anchor_17.name = "plaque-anchor";
  socket_upper_roof_plaque_anchor_17.position.set(0.0, 5.85, 6.7);
  socket_upper_roof_plaque_anchor_17.rotation.set(0.0, 0.0, 0.0);
  socket_upper_roof_plaque_anchor_17.userData.socket = {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_roof_15.add(socket_upper_roof_plaque_anchor_17);
  sockets["upper-roof:plaque-anchor"] = socket_upper_roof_plaque_anchor_17;

  const endpoint_upper_tiles_16 = makeAttachmentEndpoint(null);
  const node_upper_tiles_16 = new THREE.Group();
  node_upper_tiles_16.name = "upper-tiles__pivot";
  node_upper_tiles_16.scale.set(1, 1, 1);
  if (endpoint_upper_tiles_16) {
    node_upper_tiles_16.position.copy(endpoint_upper_tiles_16.start);
    node_upper_tiles_16.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_upper_tiles_16.position.set(0.0, 11.75, 0.0);
    node_upper_tiles_16.rotation.set(0.0, 0.0, 0.0);
  }
  node_upper_tiles_16.userData.sculptComponent = {"id": "upper-tiles", "name": "upper-tiles", "level": "micro", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "upper-tiles-anchor", "localStart": [0, 11.75, 0], "localEnd": [0, 11.85, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 16.4, "height": 3.2, "depth": 11.6, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 11.75, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-tiles", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "roof", "materialLayers": ["roof"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "upper-tile-courses", "type": "geometry", "evidenceRefs": ["full-object"], "description": "upper tile courses"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(39, 94, 91, 1)", "secondaryAlbedo": "rgba(39, 94, 91, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.85}};
  node_upper_tiles_16.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-tiles", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_upper_tiles_16);
  nodes["upper-tiles"] = node_upper_tiles_16;
  const mesh_upper_tiles_16Geometry = endpoint_upper_tiles_16
    ? new THREE.CylinderGeometry(endpoint_upper_tiles_16.endRadius, endpoint_upper_tiles_16.baseRadius, endpoint_upper_tiles_16.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_upper_tiles_16) {
    mesh_upper_tiles_16Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_upper_tiles_16 = new THREE.Mesh(
    mesh_upper_tiles_16Geometry,
    materialMap["roof"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_upper_tiles_16.name = "upper-tiles";
  if (endpoint_upper_tiles_16) {
    mesh_upper_tiles_16.position.copy(endpoint_upper_tiles_16.midpoint);
    mesh_upper_tiles_16.quaternion.copy(endpoint_upper_tiles_16.quaternion);
  }
  mesh_upper_tiles_16.castShadow = options.castShadow ?? true;
  mesh_upper_tiles_16.receiveShadow = options.receiveShadow ?? true;
  mesh_upper_tiles_16.userData.sculptComponent = {"id": "upper-tiles", "name": "upper-tiles", "level": "micro", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "upper-tiles-anchor", "localStart": [0, 11.75, 0], "localEnd": [0, 11.85, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 16.4, "height": 3.2, "depth": 11.6, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 11.75, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-tiles", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "roof", "materialLayers": ["roof"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "upper-tile-courses", "type": "geometry", "evidenceRefs": ["full-object"], "description": "upper tile courses"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(39, 94, 91, 1)", "secondaryAlbedo": "rgba(39, 94, 91, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.85}};
  node_upper_tiles_16.add(mesh_upper_tiles_16);
  meshes["upper-tiles"] = mesh_upper_tiles_16;
  colliders["upper-tiles"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."};
  destructionGroups["upper-tiles"] ??= [];
  destructionGroups["upper-tiles"].push(node_upper_tiles_16);
  const socket_upper_tiles_foundation_anchor_0 = new THREE.Object3D();
  socket_upper_tiles_foundation_anchor_0.name = "foundation-anchor";
  socket_upper_tiles_foundation_anchor_0.position.set(0.0, 0.65, 0.0);
  socket_upper_tiles_foundation_anchor_0.rotation.set(0.0, 0.0, 0.0);
  socket_upper_tiles_foundation_anchor_0.userData.socket = {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_tiles_16.add(socket_upper_tiles_foundation_anchor_0);
  sockets["upper-tiles:foundation-anchor"] = socket_upper_tiles_foundation_anchor_0;
  const socket_upper_tiles_stairs_anchor_1 = new THREE.Object3D();
  socket_upper_tiles_stairs_anchor_1.name = "stairs-anchor";
  socket_upper_tiles_stairs_anchor_1.position.set(0.0, 0.6, 11.5);
  socket_upper_tiles_stairs_anchor_1.rotation.set(0.0, 0.0, 0.0);
  socket_upper_tiles_stairs_anchor_1.userData.socket = {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_tiles_16.add(socket_upper_tiles_stairs_anchor_1);
  sockets["upper-tiles:stairs-anchor"] = socket_upper_tiles_stairs_anchor_1;
  const socket_upper_tiles_railings_anchor_2 = new THREE.Object3D();
  socket_upper_tiles_railings_anchor_2.name = "railings-anchor";
  socket_upper_tiles_railings_anchor_2.position.set(0.0, 1.3, 0.0);
  socket_upper_tiles_railings_anchor_2.rotation.set(0.0, 0.0, 0.0);
  socket_upper_tiles_railings_anchor_2.userData.socket = {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_tiles_16.add(socket_upper_tiles_railings_anchor_2);
  sockets["upper-tiles:railings-anchor"] = socket_upper_tiles_railings_anchor_2;
  const socket_upper_tiles_columns_anchor_3 = new THREE.Object3D();
  socket_upper_tiles_columns_anchor_3.name = "columns-anchor";
  socket_upper_tiles_columns_anchor_3.position.set(0.0, 3.95, 0.0);
  socket_upper_tiles_columns_anchor_3.rotation.set(0.0, 0.0, 0.0);
  socket_upper_tiles_columns_anchor_3.userData.socket = {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_tiles_16.add(socket_upper_tiles_columns_anchor_3);
  sockets["upper-tiles:columns-anchor"] = socket_upper_tiles_columns_anchor_3;
  const socket_upper_tiles_beams_anchor_4 = new THREE.Object3D();
  socket_upper_tiles_beams_anchor_4.name = "beams-anchor";
  socket_upper_tiles_beams_anchor_4.position.set(0.0, 6.15, 0.0);
  socket_upper_tiles_beams_anchor_4.rotation.set(0.0, 0.0, 0.0);
  socket_upper_tiles_beams_anchor_4.userData.socket = {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_tiles_16.add(socket_upper_tiles_beams_anchor_4);
  sockets["upper-tiles:beams-anchor"] = socket_upper_tiles_beams_anchor_4;
  const socket_upper_tiles_lower_roof_anchor_5 = new THREE.Object3D();
  socket_upper_tiles_lower_roof_anchor_5.name = "lower-roof-anchor";
  socket_upper_tiles_lower_roof_anchor_5.position.set(0.0, 6.8, 0.0);
  socket_upper_tiles_lower_roof_anchor_5.rotation.set(0.0, 0.0, 0.0);
  socket_upper_tiles_lower_roof_anchor_5.userData.socket = {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_tiles_16.add(socket_upper_tiles_lower_roof_anchor_5);
  sockets["upper-tiles:lower-roof-anchor"] = socket_upper_tiles_lower_roof_anchor_5;
  const socket_upper_tiles_lower_tiles_anchor_6 = new THREE.Object3D();
  socket_upper_tiles_lower_tiles_anchor_6.name = "lower-tiles-anchor";
  socket_upper_tiles_lower_tiles_anchor_6.position.set(0.0, 6.9, 0.0);
  socket_upper_tiles_lower_tiles_anchor_6.rotation.set(0.0, 0.0, 0.0);
  socket_upper_tiles_lower_tiles_anchor_6.userData.socket = {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_tiles_16.add(socket_upper_tiles_lower_tiles_anchor_6);
  sockets["upper-tiles:lower-tiles-anchor"] = socket_upper_tiles_lower_tiles_anchor_6;
  const socket_upper_tiles_lower_eaves_anchor_7 = new THREE.Object3D();
  socket_upper_tiles_lower_eaves_anchor_7.name = "lower-eaves-anchor";
  socket_upper_tiles_lower_eaves_anchor_7.position.set(0.0, 6.8, 0.0);
  socket_upper_tiles_lower_eaves_anchor_7.rotation.set(0.0, 0.0, 0.0);
  socket_upper_tiles_lower_eaves_anchor_7.userData.socket = {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_tiles_16.add(socket_upper_tiles_lower_eaves_anchor_7);
  sockets["upper-tiles:lower-eaves-anchor"] = socket_upper_tiles_lower_eaves_anchor_7;
  const socket_upper_tiles_brackets_anchor_8 = new THREE.Object3D();
  socket_upper_tiles_brackets_anchor_8.name = "brackets-anchor";
  socket_upper_tiles_brackets_anchor_8.position.set(0.0, 6.4, 0.0);
  socket_upper_tiles_brackets_anchor_8.rotation.set(0.0, 0.0, 0.0);
  socket_upper_tiles_brackets_anchor_8.userData.socket = {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_tiles_16.add(socket_upper_tiles_brackets_anchor_8);
  sockets["upper-tiles:brackets-anchor"] = socket_upper_tiles_brackets_anchor_8;
  const socket_upper_tiles_facades_anchor_9 = new THREE.Object3D();
  socket_upper_tiles_facades_anchor_9.name = "facades-anchor";
  socket_upper_tiles_facades_anchor_9.position.set(0.0, 3.9, 0.0);
  socket_upper_tiles_facades_anchor_9.rotation.set(0.0, 0.0, 0.0);
  socket_upper_tiles_facades_anchor_9.userData.socket = {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_tiles_16.add(socket_upper_tiles_facades_anchor_9);
  sockets["upper-tiles:facades-anchor"] = socket_upper_tiles_facades_anchor_9;
  const socket_upper_tiles_front_doors_anchor_10 = new THREE.Object3D();
  socket_upper_tiles_front_doors_anchor_10.name = "front-doors-anchor";
  socket_upper_tiles_front_doors_anchor_10.position.set(0.0, 3.6, 5.92);
  socket_upper_tiles_front_doors_anchor_10.rotation.set(0.0, 0.0, 0.0);
  socket_upper_tiles_front_doors_anchor_10.userData.socket = {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_tiles_16.add(socket_upper_tiles_front_doors_anchor_10);
  sockets["upper-tiles:front-doors-anchor"] = socket_upper_tiles_front_doors_anchor_10;
  const socket_upper_tiles_rear_windows_anchor_11 = new THREE.Object3D();
  socket_upper_tiles_rear_windows_anchor_11.name = "rear-windows-anchor";
  socket_upper_tiles_rear_windows_anchor_11.position.set(0.0, 3.8, -5.92);
  socket_upper_tiles_rear_windows_anchor_11.rotation.set(0.0, 0.0, 0.0);
  socket_upper_tiles_rear_windows_anchor_11.userData.socket = {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_tiles_16.add(socket_upper_tiles_rear_windows_anchor_11);
  sockets["upper-tiles:rear-windows-anchor"] = socket_upper_tiles_rear_windows_anchor_11;
  const socket_upper_tiles_upper_walls_anchor_12 = new THREE.Object3D();
  socket_upper_tiles_upper_walls_anchor_12.name = "upper-walls-anchor";
  socket_upper_tiles_upper_walls_anchor_12.position.set(0.0, 10.45, 0.0);
  socket_upper_tiles_upper_walls_anchor_12.rotation.set(0.0, 0.0, 0.0);
  socket_upper_tiles_upper_walls_anchor_12.userData.socket = {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_tiles_16.add(socket_upper_tiles_upper_walls_anchor_12);
  sockets["upper-tiles:upper-walls-anchor"] = socket_upper_tiles_upper_walls_anchor_12;
  const socket_upper_tiles_upper_columns_anchor_13 = new THREE.Object3D();
  socket_upper_tiles_upper_columns_anchor_13.name = "upper-columns-anchor";
  socket_upper_tiles_upper_columns_anchor_13.position.set(0.0, 10.5, 0.0);
  socket_upper_tiles_upper_columns_anchor_13.rotation.set(0.0, 0.0, 0.0);
  socket_upper_tiles_upper_columns_anchor_13.userData.socket = {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_tiles_16.add(socket_upper_tiles_upper_columns_anchor_13);
  sockets["upper-tiles:upper-columns-anchor"] = socket_upper_tiles_upper_columns_anchor_13;
  const socket_upper_tiles_upper_roof_anchor_14 = new THREE.Object3D();
  socket_upper_tiles_upper_roof_anchor_14.name = "upper-roof-anchor";
  socket_upper_tiles_upper_roof_anchor_14.position.set(0.0, 11.65, 0.0);
  socket_upper_tiles_upper_roof_anchor_14.rotation.set(0.0, 0.0, 0.0);
  socket_upper_tiles_upper_roof_anchor_14.userData.socket = {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_tiles_16.add(socket_upper_tiles_upper_roof_anchor_14);
  sockets["upper-tiles:upper-roof-anchor"] = socket_upper_tiles_upper_roof_anchor_14;
  const socket_upper_tiles_upper_tiles_anchor_15 = new THREE.Object3D();
  socket_upper_tiles_upper_tiles_anchor_15.name = "upper-tiles-anchor";
  socket_upper_tiles_upper_tiles_anchor_15.position.set(0.0, 11.75, 0.0);
  socket_upper_tiles_upper_tiles_anchor_15.rotation.set(0.0, 0.0, 0.0);
  socket_upper_tiles_upper_tiles_anchor_15.userData.socket = {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_tiles_16.add(socket_upper_tiles_upper_tiles_anchor_15);
  sockets["upper-tiles:upper-tiles-anchor"] = socket_upper_tiles_upper_tiles_anchor_15;
  const socket_upper_tiles_ornaments_anchor_16 = new THREE.Object3D();
  socket_upper_tiles_ornaments_anchor_16.name = "ornaments-anchor";
  socket_upper_tiles_ornaments_anchor_16.position.set(0.0, 10.6, 0.0);
  socket_upper_tiles_ornaments_anchor_16.rotation.set(0.0, 0.0, 0.0);
  socket_upper_tiles_ornaments_anchor_16.userData.socket = {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_tiles_16.add(socket_upper_tiles_ornaments_anchor_16);
  sockets["upper-tiles:ornaments-anchor"] = socket_upper_tiles_ornaments_anchor_16;
  const socket_upper_tiles_plaque_anchor_17 = new THREE.Object3D();
  socket_upper_tiles_plaque_anchor_17.name = "plaque-anchor";
  socket_upper_tiles_plaque_anchor_17.position.set(0.0, 5.85, 6.7);
  socket_upper_tiles_plaque_anchor_17.rotation.set(0.0, 0.0, 0.0);
  socket_upper_tiles_plaque_anchor_17.userData.socket = {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_upper_tiles_16.add(socket_upper_tiles_plaque_anchor_17);
  sockets["upper-tiles:plaque-anchor"] = socket_upper_tiles_plaque_anchor_17;

  const endpoint_ornaments_17 = makeAttachmentEndpoint(null);
  const node_ornaments_17 = new THREE.Group();
  node_ornaments_17.name = "ornaments__pivot";
  node_ornaments_17.scale.set(1, 1, 1);
  if (endpoint_ornaments_17) {
    node_ornaments_17.position.copy(endpoint_ornaments_17.start);
    node_ornaments_17.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_ornaments_17.position.set(0.0, 10.6, 0.0);
    node_ornaments_17.rotation.set(0.0, 0.0, 0.0);
  }
  node_ornaments_17.userData.sculptComponent = {"id": "ornaments", "name": "ornaments", "level": "micro", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "ornaments-anchor", "localStart": [0, 10.6, 0], "localEnd": [0, 10.7, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 25.8, "height": 9.1, "depth": 18.8, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 10.6, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "ornaments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "gold-corner-caps", "type": "geometry", "evidenceRefs": ["full-object"], "description": "gold corner caps"}, {"id": "stacked-finial", "type": "geometry", "evidenceRefs": ["full-object"], "description": "stacked finial"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 161, 92, 1)", "secondaryAlbedo": "rgba(196, 161, 92, 1)", "materialClass": "metal", "materialClassConfidence": 0.85}};
  node_ornaments_17.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "ornaments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_ornaments_17);
  nodes["ornaments"] = node_ornaments_17;
  const mesh_ornaments_17Geometry = endpoint_ornaments_17
    ? new THREE.CylinderGeometry(endpoint_ornaments_17.endRadius, endpoint_ornaments_17.baseRadius, endpoint_ornaments_17.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_ornaments_17) {
    mesh_ornaments_17Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_ornaments_17 = new THREE.Mesh(
    mesh_ornaments_17Geometry,
    materialMap["gold"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_ornaments_17.name = "ornaments";
  if (endpoint_ornaments_17) {
    mesh_ornaments_17.position.copy(endpoint_ornaments_17.midpoint);
    mesh_ornaments_17.quaternion.copy(endpoint_ornaments_17.quaternion);
  }
  mesh_ornaments_17.castShadow = options.castShadow ?? true;
  mesh_ornaments_17.receiveShadow = options.receiveShadow ?? true;
  mesh_ornaments_17.userData.sculptComponent = {"id": "ornaments", "name": "ornaments", "level": "micro", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "ornaments-anchor", "localStart": [0, 10.6, 0], "localEnd": [0, 10.7, 0], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 25.8, "height": 9.1, "depth": 18.8, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 10.6, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "ornaments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "gold-corner-caps", "type": "geometry", "evidenceRefs": ["full-object"], "description": "gold corner caps"}, {"id": "stacked-finial", "type": "geometry", "evidenceRefs": ["full-object"], "description": "stacked finial"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 161, 92, 1)", "secondaryAlbedo": "rgba(196, 161, 92, 1)", "materialClass": "metal", "materialClassConfidence": 0.85}};
  node_ornaments_17.add(mesh_ornaments_17);
  meshes["ornaments"] = mesh_ornaments_17;
  colliders["ornaments"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."};
  destructionGroups["ornaments"] ??= [];
  destructionGroups["ornaments"].push(node_ornaments_17);
  const socket_ornaments_foundation_anchor_0 = new THREE.Object3D();
  socket_ornaments_foundation_anchor_0.name = "foundation-anchor";
  socket_ornaments_foundation_anchor_0.position.set(0.0, 0.65, 0.0);
  socket_ornaments_foundation_anchor_0.rotation.set(0.0, 0.0, 0.0);
  socket_ornaments_foundation_anchor_0.userData.socket = {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_ornaments_17.add(socket_ornaments_foundation_anchor_0);
  sockets["ornaments:foundation-anchor"] = socket_ornaments_foundation_anchor_0;
  const socket_ornaments_stairs_anchor_1 = new THREE.Object3D();
  socket_ornaments_stairs_anchor_1.name = "stairs-anchor";
  socket_ornaments_stairs_anchor_1.position.set(0.0, 0.6, 11.5);
  socket_ornaments_stairs_anchor_1.rotation.set(0.0, 0.0, 0.0);
  socket_ornaments_stairs_anchor_1.userData.socket = {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_ornaments_17.add(socket_ornaments_stairs_anchor_1);
  sockets["ornaments:stairs-anchor"] = socket_ornaments_stairs_anchor_1;
  const socket_ornaments_railings_anchor_2 = new THREE.Object3D();
  socket_ornaments_railings_anchor_2.name = "railings-anchor";
  socket_ornaments_railings_anchor_2.position.set(0.0, 1.3, 0.0);
  socket_ornaments_railings_anchor_2.rotation.set(0.0, 0.0, 0.0);
  socket_ornaments_railings_anchor_2.userData.socket = {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_ornaments_17.add(socket_ornaments_railings_anchor_2);
  sockets["ornaments:railings-anchor"] = socket_ornaments_railings_anchor_2;
  const socket_ornaments_columns_anchor_3 = new THREE.Object3D();
  socket_ornaments_columns_anchor_3.name = "columns-anchor";
  socket_ornaments_columns_anchor_3.position.set(0.0, 3.95, 0.0);
  socket_ornaments_columns_anchor_3.rotation.set(0.0, 0.0, 0.0);
  socket_ornaments_columns_anchor_3.userData.socket = {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_ornaments_17.add(socket_ornaments_columns_anchor_3);
  sockets["ornaments:columns-anchor"] = socket_ornaments_columns_anchor_3;
  const socket_ornaments_beams_anchor_4 = new THREE.Object3D();
  socket_ornaments_beams_anchor_4.name = "beams-anchor";
  socket_ornaments_beams_anchor_4.position.set(0.0, 6.15, 0.0);
  socket_ornaments_beams_anchor_4.rotation.set(0.0, 0.0, 0.0);
  socket_ornaments_beams_anchor_4.userData.socket = {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_ornaments_17.add(socket_ornaments_beams_anchor_4);
  sockets["ornaments:beams-anchor"] = socket_ornaments_beams_anchor_4;
  const socket_ornaments_lower_roof_anchor_5 = new THREE.Object3D();
  socket_ornaments_lower_roof_anchor_5.name = "lower-roof-anchor";
  socket_ornaments_lower_roof_anchor_5.position.set(0.0, 6.8, 0.0);
  socket_ornaments_lower_roof_anchor_5.rotation.set(0.0, 0.0, 0.0);
  socket_ornaments_lower_roof_anchor_5.userData.socket = {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_ornaments_17.add(socket_ornaments_lower_roof_anchor_5);
  sockets["ornaments:lower-roof-anchor"] = socket_ornaments_lower_roof_anchor_5;
  const socket_ornaments_lower_tiles_anchor_6 = new THREE.Object3D();
  socket_ornaments_lower_tiles_anchor_6.name = "lower-tiles-anchor";
  socket_ornaments_lower_tiles_anchor_6.position.set(0.0, 6.9, 0.0);
  socket_ornaments_lower_tiles_anchor_6.rotation.set(0.0, 0.0, 0.0);
  socket_ornaments_lower_tiles_anchor_6.userData.socket = {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_ornaments_17.add(socket_ornaments_lower_tiles_anchor_6);
  sockets["ornaments:lower-tiles-anchor"] = socket_ornaments_lower_tiles_anchor_6;
  const socket_ornaments_lower_eaves_anchor_7 = new THREE.Object3D();
  socket_ornaments_lower_eaves_anchor_7.name = "lower-eaves-anchor";
  socket_ornaments_lower_eaves_anchor_7.position.set(0.0, 6.8, 0.0);
  socket_ornaments_lower_eaves_anchor_7.rotation.set(0.0, 0.0, 0.0);
  socket_ornaments_lower_eaves_anchor_7.userData.socket = {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_ornaments_17.add(socket_ornaments_lower_eaves_anchor_7);
  sockets["ornaments:lower-eaves-anchor"] = socket_ornaments_lower_eaves_anchor_7;
  const socket_ornaments_brackets_anchor_8 = new THREE.Object3D();
  socket_ornaments_brackets_anchor_8.name = "brackets-anchor";
  socket_ornaments_brackets_anchor_8.position.set(0.0, 6.4, 0.0);
  socket_ornaments_brackets_anchor_8.rotation.set(0.0, 0.0, 0.0);
  socket_ornaments_brackets_anchor_8.userData.socket = {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_ornaments_17.add(socket_ornaments_brackets_anchor_8);
  sockets["ornaments:brackets-anchor"] = socket_ornaments_brackets_anchor_8;
  const socket_ornaments_facades_anchor_9 = new THREE.Object3D();
  socket_ornaments_facades_anchor_9.name = "facades-anchor";
  socket_ornaments_facades_anchor_9.position.set(0.0, 3.9, 0.0);
  socket_ornaments_facades_anchor_9.rotation.set(0.0, 0.0, 0.0);
  socket_ornaments_facades_anchor_9.userData.socket = {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_ornaments_17.add(socket_ornaments_facades_anchor_9);
  sockets["ornaments:facades-anchor"] = socket_ornaments_facades_anchor_9;
  const socket_ornaments_front_doors_anchor_10 = new THREE.Object3D();
  socket_ornaments_front_doors_anchor_10.name = "front-doors-anchor";
  socket_ornaments_front_doors_anchor_10.position.set(0.0, 3.6, 5.92);
  socket_ornaments_front_doors_anchor_10.rotation.set(0.0, 0.0, 0.0);
  socket_ornaments_front_doors_anchor_10.userData.socket = {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_ornaments_17.add(socket_ornaments_front_doors_anchor_10);
  sockets["ornaments:front-doors-anchor"] = socket_ornaments_front_doors_anchor_10;
  const socket_ornaments_rear_windows_anchor_11 = new THREE.Object3D();
  socket_ornaments_rear_windows_anchor_11.name = "rear-windows-anchor";
  socket_ornaments_rear_windows_anchor_11.position.set(0.0, 3.8, -5.92);
  socket_ornaments_rear_windows_anchor_11.rotation.set(0.0, 0.0, 0.0);
  socket_ornaments_rear_windows_anchor_11.userData.socket = {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_ornaments_17.add(socket_ornaments_rear_windows_anchor_11);
  sockets["ornaments:rear-windows-anchor"] = socket_ornaments_rear_windows_anchor_11;
  const socket_ornaments_upper_walls_anchor_12 = new THREE.Object3D();
  socket_ornaments_upper_walls_anchor_12.name = "upper-walls-anchor";
  socket_ornaments_upper_walls_anchor_12.position.set(0.0, 10.45, 0.0);
  socket_ornaments_upper_walls_anchor_12.rotation.set(0.0, 0.0, 0.0);
  socket_ornaments_upper_walls_anchor_12.userData.socket = {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_ornaments_17.add(socket_ornaments_upper_walls_anchor_12);
  sockets["ornaments:upper-walls-anchor"] = socket_ornaments_upper_walls_anchor_12;
  const socket_ornaments_upper_columns_anchor_13 = new THREE.Object3D();
  socket_ornaments_upper_columns_anchor_13.name = "upper-columns-anchor";
  socket_ornaments_upper_columns_anchor_13.position.set(0.0, 10.5, 0.0);
  socket_ornaments_upper_columns_anchor_13.rotation.set(0.0, 0.0, 0.0);
  socket_ornaments_upper_columns_anchor_13.userData.socket = {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_ornaments_17.add(socket_ornaments_upper_columns_anchor_13);
  sockets["ornaments:upper-columns-anchor"] = socket_ornaments_upper_columns_anchor_13;
  const socket_ornaments_upper_roof_anchor_14 = new THREE.Object3D();
  socket_ornaments_upper_roof_anchor_14.name = "upper-roof-anchor";
  socket_ornaments_upper_roof_anchor_14.position.set(0.0, 11.65, 0.0);
  socket_ornaments_upper_roof_anchor_14.rotation.set(0.0, 0.0, 0.0);
  socket_ornaments_upper_roof_anchor_14.userData.socket = {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_ornaments_17.add(socket_ornaments_upper_roof_anchor_14);
  sockets["ornaments:upper-roof-anchor"] = socket_ornaments_upper_roof_anchor_14;
  const socket_ornaments_upper_tiles_anchor_15 = new THREE.Object3D();
  socket_ornaments_upper_tiles_anchor_15.name = "upper-tiles-anchor";
  socket_ornaments_upper_tiles_anchor_15.position.set(0.0, 11.75, 0.0);
  socket_ornaments_upper_tiles_anchor_15.rotation.set(0.0, 0.0, 0.0);
  socket_ornaments_upper_tiles_anchor_15.userData.socket = {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_ornaments_17.add(socket_ornaments_upper_tiles_anchor_15);
  sockets["ornaments:upper-tiles-anchor"] = socket_ornaments_upper_tiles_anchor_15;
  const socket_ornaments_ornaments_anchor_16 = new THREE.Object3D();
  socket_ornaments_ornaments_anchor_16.name = "ornaments-anchor";
  socket_ornaments_ornaments_anchor_16.position.set(0.0, 10.6, 0.0);
  socket_ornaments_ornaments_anchor_16.rotation.set(0.0, 0.0, 0.0);
  socket_ornaments_ornaments_anchor_16.userData.socket = {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_ornaments_17.add(socket_ornaments_ornaments_anchor_16);
  sockets["ornaments:ornaments-anchor"] = socket_ornaments_ornaments_anchor_16;
  const socket_ornaments_plaque_anchor_17 = new THREE.Object3D();
  socket_ornaments_plaque_anchor_17.name = "plaque-anchor";
  socket_ornaments_plaque_anchor_17.position.set(0.0, 5.85, 6.7);
  socket_ornaments_plaque_anchor_17.rotation.set(0.0, 0.0, 0.0);
  socket_ornaments_plaque_anchor_17.userData.socket = {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_ornaments_17.add(socket_ornaments_plaque_anchor_17);
  sockets["ornaments:plaque-anchor"] = socket_ornaments_plaque_anchor_17;

  const endpoint_plaque_18 = makeAttachmentEndpoint(null);
  const node_plaque_18 = new THREE.Group();
  node_plaque_18.name = "plaque__pivot";
  node_plaque_18.scale.set(1, 1, 1);
  if (endpoint_plaque_18) {
    node_plaque_18.position.copy(endpoint_plaque_18.start);
    node_plaque_18.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_plaque_18.position.set(0.0, 5.85, 6.7);
    node_plaque_18.rotation.set(0.0, 0.0, 0.0);
  }
  node_plaque_18.userData.sculptComponent = {"id": "plaque", "name": "plaque", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "plaque-anchor", "localStart": [0, 5.85, 6.7], "localEnd": [0, 5.949999999999999, 6.7], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 4.8, "height": 1.15, "depth": 0.2, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "plaque", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "gold-inscription", "type": "geometry", "evidenceRefs": ["full-object"], "description": "gold inscription"}, {"id": "double-gold-frame", "type": "geometry", "evidenceRefs": ["full-object"], "description": "double gold frame"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 161, 92, 1)", "secondaryAlbedo": "rgba(196, 161, 92, 1)", "materialClass": "metal", "materialClassConfidence": 0.85}};
  node_plaque_18.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "plaque", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_plaque_18);
  nodes["plaque"] = node_plaque_18;
  const mesh_plaque_18Geometry = endpoint_plaque_18
    ? new THREE.CylinderGeometry(endpoint_plaque_18.endRadius, endpoint_plaque_18.baseRadius, endpoint_plaque_18.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_plaque_18) {
    mesh_plaque_18Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_plaque_18 = new THREE.Mesh(
    mesh_plaque_18Geometry,
    materialMap["gold"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_plaque_18.name = "plaque";
  if (endpoint_plaque_18) {
    mesh_plaque_18.position.copy(endpoint_plaque_18.midpoint);
    mesh_plaque_18.quaternion.copy(endpoint_plaque_18.quaternion);
  }
  mesh_plaque_18.castShadow = options.castShadow ?? true;
  mesh_plaque_18.receiveShadow = options.receiveShadow ?? true;
  mesh_plaque_18.userData.sculptComponent = {"id": "plaque", "name": "plaque", "level": "meso", "role": "body", "importance": 1.0, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid assembly of independently placed architectural solids with measurable thickness.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "plaque-anchor", "localStart": [0, 5.85, 6.7], "localEnd": [0, 5.949999999999999, 6.7], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.02, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 4.8, "height": 1.15, "depth": 0.2, "units": "metres", "confidence": 0.86}, "transform": {"position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"}, {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "plaque", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "gold-inscription", "type": "geometry", "evidenceRefs": ["full-object"], "description": "gold inscription"}, {"id": "double-gold-frame", "type": "geometry", "evidenceRefs": ["full-object"], "description": "double gold frame"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "game-ready", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 161, 92, 1)", "secondaryAlbedo": "rgba(196, 161, 92, 1)", "materialClass": "metal", "materialClassConfidence": 0.85}};
  node_plaque_18.add(mesh_plaque_18);
  meshes["plaque"] = mesh_plaque_18;
  colliders["plaque"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Runtime uses compound gameplay proxies; ornamental detail follows structural parent."};
  destructionGroups["plaque"] ??= [];
  destructionGroups["plaque"].push(node_plaque_18);
  const socket_plaque_foundation_anchor_0 = new THREE.Object3D();
  socket_plaque_foundation_anchor_0.name = "foundation-anchor";
  socket_plaque_foundation_anchor_0.position.set(0.0, 0.65, 0.0);
  socket_plaque_foundation_anchor_0.rotation.set(0.0, 0.0, 0.0);
  socket_plaque_foundation_anchor_0.userData.socket = {"id": "foundation-anchor", "position": [0, 0.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_plaque_18.add(socket_plaque_foundation_anchor_0);
  sockets["plaque:foundation-anchor"] = socket_plaque_foundation_anchor_0;
  const socket_plaque_stairs_anchor_1 = new THREE.Object3D();
  socket_plaque_stairs_anchor_1.name = "stairs-anchor";
  socket_plaque_stairs_anchor_1.position.set(0.0, 0.6, 11.5);
  socket_plaque_stairs_anchor_1.rotation.set(0.0, 0.0, 0.0);
  socket_plaque_stairs_anchor_1.userData.socket = {"id": "stairs-anchor", "position": [0, 0.6, 11.5], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_plaque_18.add(socket_plaque_stairs_anchor_1);
  sockets["plaque:stairs-anchor"] = socket_plaque_stairs_anchor_1;
  const socket_plaque_railings_anchor_2 = new THREE.Object3D();
  socket_plaque_railings_anchor_2.name = "railings-anchor";
  socket_plaque_railings_anchor_2.position.set(0.0, 1.3, 0.0);
  socket_plaque_railings_anchor_2.rotation.set(0.0, 0.0, 0.0);
  socket_plaque_railings_anchor_2.userData.socket = {"id": "railings-anchor", "position": [0, 1.3, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_plaque_18.add(socket_plaque_railings_anchor_2);
  sockets["plaque:railings-anchor"] = socket_plaque_railings_anchor_2;
  const socket_plaque_columns_anchor_3 = new THREE.Object3D();
  socket_plaque_columns_anchor_3.name = "columns-anchor";
  socket_plaque_columns_anchor_3.position.set(0.0, 3.95, 0.0);
  socket_plaque_columns_anchor_3.rotation.set(0.0, 0.0, 0.0);
  socket_plaque_columns_anchor_3.userData.socket = {"id": "columns-anchor", "position": [0, 3.95, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_plaque_18.add(socket_plaque_columns_anchor_3);
  sockets["plaque:columns-anchor"] = socket_plaque_columns_anchor_3;
  const socket_plaque_beams_anchor_4 = new THREE.Object3D();
  socket_plaque_beams_anchor_4.name = "beams-anchor";
  socket_plaque_beams_anchor_4.position.set(0.0, 6.15, 0.0);
  socket_plaque_beams_anchor_4.rotation.set(0.0, 0.0, 0.0);
  socket_plaque_beams_anchor_4.userData.socket = {"id": "beams-anchor", "position": [0, 6.15, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_plaque_18.add(socket_plaque_beams_anchor_4);
  sockets["plaque:beams-anchor"] = socket_plaque_beams_anchor_4;
  const socket_plaque_lower_roof_anchor_5 = new THREE.Object3D();
  socket_plaque_lower_roof_anchor_5.name = "lower-roof-anchor";
  socket_plaque_lower_roof_anchor_5.position.set(0.0, 6.8, 0.0);
  socket_plaque_lower_roof_anchor_5.rotation.set(0.0, 0.0, 0.0);
  socket_plaque_lower_roof_anchor_5.userData.socket = {"id": "lower-roof-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_plaque_18.add(socket_plaque_lower_roof_anchor_5);
  sockets["plaque:lower-roof-anchor"] = socket_plaque_lower_roof_anchor_5;
  const socket_plaque_lower_tiles_anchor_6 = new THREE.Object3D();
  socket_plaque_lower_tiles_anchor_6.name = "lower-tiles-anchor";
  socket_plaque_lower_tiles_anchor_6.position.set(0.0, 6.9, 0.0);
  socket_plaque_lower_tiles_anchor_6.rotation.set(0.0, 0.0, 0.0);
  socket_plaque_lower_tiles_anchor_6.userData.socket = {"id": "lower-tiles-anchor", "position": [0, 6.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_plaque_18.add(socket_plaque_lower_tiles_anchor_6);
  sockets["plaque:lower-tiles-anchor"] = socket_plaque_lower_tiles_anchor_6;
  const socket_plaque_lower_eaves_anchor_7 = new THREE.Object3D();
  socket_plaque_lower_eaves_anchor_7.name = "lower-eaves-anchor";
  socket_plaque_lower_eaves_anchor_7.position.set(0.0, 6.8, 0.0);
  socket_plaque_lower_eaves_anchor_7.rotation.set(0.0, 0.0, 0.0);
  socket_plaque_lower_eaves_anchor_7.userData.socket = {"id": "lower-eaves-anchor", "position": [0, 6.8, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_plaque_18.add(socket_plaque_lower_eaves_anchor_7);
  sockets["plaque:lower-eaves-anchor"] = socket_plaque_lower_eaves_anchor_7;
  const socket_plaque_brackets_anchor_8 = new THREE.Object3D();
  socket_plaque_brackets_anchor_8.name = "brackets-anchor";
  socket_plaque_brackets_anchor_8.position.set(0.0, 6.4, 0.0);
  socket_plaque_brackets_anchor_8.rotation.set(0.0, 0.0, 0.0);
  socket_plaque_brackets_anchor_8.userData.socket = {"id": "brackets-anchor", "position": [0, 6.4, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_plaque_18.add(socket_plaque_brackets_anchor_8);
  sockets["plaque:brackets-anchor"] = socket_plaque_brackets_anchor_8;
  const socket_plaque_facades_anchor_9 = new THREE.Object3D();
  socket_plaque_facades_anchor_9.name = "facades-anchor";
  socket_plaque_facades_anchor_9.position.set(0.0, 3.9, 0.0);
  socket_plaque_facades_anchor_9.rotation.set(0.0, 0.0, 0.0);
  socket_plaque_facades_anchor_9.userData.socket = {"id": "facades-anchor", "position": [0, 3.9, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_plaque_18.add(socket_plaque_facades_anchor_9);
  sockets["plaque:facades-anchor"] = socket_plaque_facades_anchor_9;
  const socket_plaque_front_doors_anchor_10 = new THREE.Object3D();
  socket_plaque_front_doors_anchor_10.name = "front-doors-anchor";
  socket_plaque_front_doors_anchor_10.position.set(0.0, 3.6, 5.92);
  socket_plaque_front_doors_anchor_10.rotation.set(0.0, 0.0, 0.0);
  socket_plaque_front_doors_anchor_10.userData.socket = {"id": "front-doors-anchor", "position": [0, 3.6, 5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_plaque_18.add(socket_plaque_front_doors_anchor_10);
  sockets["plaque:front-doors-anchor"] = socket_plaque_front_doors_anchor_10;
  const socket_plaque_rear_windows_anchor_11 = new THREE.Object3D();
  socket_plaque_rear_windows_anchor_11.name = "rear-windows-anchor";
  socket_plaque_rear_windows_anchor_11.position.set(0.0, 3.8, -5.92);
  socket_plaque_rear_windows_anchor_11.rotation.set(0.0, 0.0, 0.0);
  socket_plaque_rear_windows_anchor_11.userData.socket = {"id": "rear-windows-anchor", "position": [0, 3.8, -5.92], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_plaque_18.add(socket_plaque_rear_windows_anchor_11);
  sockets["plaque:rear-windows-anchor"] = socket_plaque_rear_windows_anchor_11;
  const socket_plaque_upper_walls_anchor_12 = new THREE.Object3D();
  socket_plaque_upper_walls_anchor_12.name = "upper-walls-anchor";
  socket_plaque_upper_walls_anchor_12.position.set(0.0, 10.45, 0.0);
  socket_plaque_upper_walls_anchor_12.rotation.set(0.0, 0.0, 0.0);
  socket_plaque_upper_walls_anchor_12.userData.socket = {"id": "upper-walls-anchor", "position": [0, 10.45, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_plaque_18.add(socket_plaque_upper_walls_anchor_12);
  sockets["plaque:upper-walls-anchor"] = socket_plaque_upper_walls_anchor_12;
  const socket_plaque_upper_columns_anchor_13 = new THREE.Object3D();
  socket_plaque_upper_columns_anchor_13.name = "upper-columns-anchor";
  socket_plaque_upper_columns_anchor_13.position.set(0.0, 10.5, 0.0);
  socket_plaque_upper_columns_anchor_13.rotation.set(0.0, 0.0, 0.0);
  socket_plaque_upper_columns_anchor_13.userData.socket = {"id": "upper-columns-anchor", "position": [0, 10.5, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_plaque_18.add(socket_plaque_upper_columns_anchor_13);
  sockets["plaque:upper-columns-anchor"] = socket_plaque_upper_columns_anchor_13;
  const socket_plaque_upper_roof_anchor_14 = new THREE.Object3D();
  socket_plaque_upper_roof_anchor_14.name = "upper-roof-anchor";
  socket_plaque_upper_roof_anchor_14.position.set(0.0, 11.65, 0.0);
  socket_plaque_upper_roof_anchor_14.rotation.set(0.0, 0.0, 0.0);
  socket_plaque_upper_roof_anchor_14.userData.socket = {"id": "upper-roof-anchor", "position": [0, 11.65, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_plaque_18.add(socket_plaque_upper_roof_anchor_14);
  sockets["plaque:upper-roof-anchor"] = socket_plaque_upper_roof_anchor_14;
  const socket_plaque_upper_tiles_anchor_15 = new THREE.Object3D();
  socket_plaque_upper_tiles_anchor_15.name = "upper-tiles-anchor";
  socket_plaque_upper_tiles_anchor_15.position.set(0.0, 11.75, 0.0);
  socket_plaque_upper_tiles_anchor_15.rotation.set(0.0, 0.0, 0.0);
  socket_plaque_upper_tiles_anchor_15.userData.socket = {"id": "upper-tiles-anchor", "position": [0, 11.75, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_plaque_18.add(socket_plaque_upper_tiles_anchor_15);
  sockets["plaque:upper-tiles-anchor"] = socket_plaque_upper_tiles_anchor_15;
  const socket_plaque_ornaments_anchor_16 = new THREE.Object3D();
  socket_plaque_ornaments_anchor_16.name = "ornaments-anchor";
  socket_plaque_ornaments_anchor_16.position.set(0.0, 10.6, 0.0);
  socket_plaque_ornaments_anchor_16.rotation.set(0.0, 0.0, 0.0);
  socket_plaque_ornaments_anchor_16.userData.socket = {"id": "ornaments-anchor", "position": [0, 10.6, 0], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_plaque_18.add(socket_plaque_ornaments_anchor_16);
  sockets["plaque:ornaments-anchor"] = socket_plaque_ornaments_anchor_16;
  const socket_plaque_plaque_anchor_17 = new THREE.Object3D();
  socket_plaque_plaque_anchor_17.name = "plaque-anchor";
  socket_plaque_plaque_anchor_17.position.set(0.0, 5.85, 6.7);
  socket_plaque_plaque_anchor_17.rotation.set(0.0, 0.0, 0.0);
  socket_plaque_plaque_anchor_17.userData.socket = {"id": "plaque-anchor", "position": [0, 5.85, 6.7], "rotation": [0, 0, 0], "purpose": "assembly"};
  node_plaque_18.add(socket_plaque_plaque_anchor_17);
  sockets["plaque:plaque-anchor"] = socket_plaque_plaque_anchor_17;

  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies ProceduralModelRuntime;
  root.userData.lookDevTargets = {"qualityPriority": "game-ready-procedural", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  root.userData.actionReadiness = {
    note: 'Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.',
  };
  return root;
}

export function createYunlanMainHallLookDevLights(
  mode: 'neutral' | 'grazing' | 'reference' = 'neutral',
): THREE.Group {
  const lights = new THREE.Group();
  lights.name = "Yunlan Main Hall look-dev lights";
  const hemi = new THREE.HemisphereLight(
    mode === 'reference' ? 0xfff0d6 : 0xf2f4ff,
    0x363b42,
    mode === 'grazing' ? 0.28 : mode === 'reference' ? 0.72 : 0.85,
  );
  lights.add(hemi);
  const key = new THREE.DirectionalLight(
    mode === 'reference' ? 0xffcf8a : 0xfff4e8,
    mode === 'grazing' ? 4.2 : mode === 'reference' ? 2.6 : 2.15,
  );
  if (mode === 'grazing') key.position.set(7.5, 1.1, 4.0);
  else if (mode === 'reference') key.position.set(-4.5, 7.5, 5.0);
  else key.position.set(-4.0, 6.0, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 7;
  key.shadow.blurSamples = 24;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.6;
  key.shadow.camera.bottom = -2.6;
  key.shadow.camera.updateProjectionMatrix();
  lights.add(key);
  const fill = new THREE.DirectionalLight(0xa8c4ff, mode === 'grazing' ? 0.12 : 0.42);
  fill.position.set(4.0, 3.0, 3.5);
  lights.add(fill);
  const rim = new THREE.DirectionalLight(0xfff1c4, mode === 'grazing' ? 0.28 : 0.85);
  rim.position.set(0.5, 4.5, -6.0);
  lights.add(rim);
  lights.userData.reviewMode = mode;
  lights.userData.lightingFromPhoto = [{"id": "key", "type": "directional", "direction": [-1, 2, 3], "color": "#fff4df", "intensity": 3}, {"id": "fill", "type": "hemisphere", "color": "#d8ebf1", "intensity": 1.4}, {"id": "renderer", "exposure": 1.05, "toneMapping": "ACES filmic", "shadow": "soft contact shadow"}];
  lights.userData.lookDevTargets = {"qualityPriority": "game-ready-procedural", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  return lights;
}

// PBR materials (clearcoat/iridescence/transmission/anisotropy) need an environment
// map to visually behave as intended — call this once per renderer and assign the
// result to scene.environment before rendering. No external HDR asset required.
export function createYunlanMainHallEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

// Plan 1.3 §3.2 — auto-framing by bounding box. The Divine Eye can only compare a
// render to the reference if the object is FRAMED consistently (an object framed
// differently scores as wrong even when its shape is right). This positions the camera
// deterministically from the object's bounding box so it fills the frame at a stable
// margin, and sets near/far to the object scale. Call after adding the model to the
// scene, and again on resize (after updating camera.aspect).
export function frameYunlanMainHallCamera(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  options: { margin?: number; azimuthDeg?: number; elevationDeg?: number } = {},
): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const margin = options.margin ?? 1.15;
  const maxDim = Math.max(size.x, size.y, size.z) * margin;
  const fov = (camera.fov * Math.PI) / 180;
  // distance so the largest object dimension fits vertically in the frame
  const distance = (maxDim / 2) / Math.tan(fov / 2);
  const az = ((options.azimuthDeg ?? 0) * Math.PI) / 180;
  const el = ((options.elevationDeg ?? 0) * Math.PI) / 180;
  const dir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  );
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = Math.max(0.01, distance - maxDim);
  camera.far = distance + maxDim * 2;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

// Plan 1.3 §3.2c — PRESENTATION composer (DOF + bloom). CRITICAL (R-POSTFX): this is
// for the showcase/hero render ONLY. The Divine Eye's EVALUATION render MUST use a
// plain renderer with NO composer — bloom blows highlights and DOF blurs edges, which
// would corrupt the deterministic IoU/DCD/edge/blowout signals. Enable dof/bloom ONLY
// when the reference photo actually exhibits them (detect_reference_effects.py authorizes).
export function createYunlanMainHallPresentationComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: { dof?: boolean; bloom?: boolean; bloomStrength?: number; dofFocus?: number; dofAperture?: number } = {},
): EffectComposer {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (options.dof) {
    composer.addPass(new BokehPass(scene, camera, {
      focus: options.dofFocus ?? 10.0,
      aperture: options.dofAperture ?? 0.0002,
      maxblur: 0.01,
    }));
  }
  if (options.bloom) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    composer.addPass(new UnrealBloomPass(size, options.bloomStrength ?? 0.4, 0.4, 0.85));
  }
  return composer;
}

export function configureYunlanMainHallRenderer(renderer: THREE.WebGLRenderer): void {
  // Load-bearing for view-dependent finishes (anodized / Doppler): without ACES + sRGB
  // the environment reflection reads flat/washed instead of a believable metal response.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function createYunlanMainHallInspectControls(
  camera: THREE.Camera,
  domElement: HTMLElement,
): OrbitControls {
  // View-dependent finishes only read correctly once the user orbits — their color
  // comes from the environment reflection, not albedo, so free rotation matters here.
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.minDistance = 1.0;
  controls.maxDistance = 8.0;
  controls.autoRotate = false;
  return controls;
}

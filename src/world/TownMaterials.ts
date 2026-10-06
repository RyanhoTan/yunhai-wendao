import * as THREE from 'three';

/** Original shop names; their order also selects the corresponding merchandise. */
export const SHOP_NAMES: string[] = [
  '云岚药庐', '溪月茶舍', '问雪书斋', '素云织坊',
  '苍梧陶馆', '桂露酒肆', '灵穗米行', '松风香铺',
  '青竹笔庄', '晨霞糕屋', '百草食坊', '沧海杂货',
];

const ATLAS_WIDTH = 2048;
const ATLAS_HEIGHT = 1024;
const SIGN_WIDTH = 512;
const SIGN_HEIGHT = 256;
const randomFrom = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

type Paint = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

/** A null map also lets geometry/baking diagnostics run without a DOM. */
function paintedTexture(name: string, size: [number, number], paint: Paint, repeat: [number, number] = [1, 1], atlas = false) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  paint(ctx, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = name;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = atlas ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 4;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

function speckle(ctx: CanvasRenderingContext2D, width: number, height: number, seed: number, amount: number, strength = 0.12) {
  const random = randomFrom(seed);
  for (let i = 0; i < amount; i++) {
    ctx.fillStyle = i % 3 ? `rgba(41,35,28,${random() * strength})` : `rgba(252,241,207,${random() * strength})`;
    ctx.fillRect(random() * width, random() * height, 0.6 + random() * 2.4, 0.6 + random() * 2.4);
  }
}

function timberPaint(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#715041'; ctx.fillRect(0, 0, width, height);
  const random = randomFrom(45921);
  for (let i = 0; i < 170; i++) {
    const x = random() * width, ripple = 2 + random() * 7, phase = random() * Math.PI * 2;
    ctx.strokeStyle = i % 4 ? 'rgba(40,27,22,0.2)' : 'rgba(212,159,111,0.23)';
    ctx.lineWidth = 0.4 + random() * 1.4; ctx.beginPath();
    for (let y = 0; y <= height; y += 8) {
      const px = x + Math.sin(y / height * Math.PI * 4 + phase) * ripple;
      if (y === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
    }
    ctx.stroke();
  }
  for (const x of [127, 255, 383]) {
    ctx.fillStyle = 'rgba(32,24,21,0.28)'; ctx.fillRect(x, 0, 1.5, height);
    ctx.fillStyle = 'rgba(203,162,111,0.13)'; ctx.fillRect(x + 2, 0, 1, height);
  }
  // Elongated knots establish timber scale without adding geometry to every beam.
  for (const [x, y] of [[74, 122], [312, 366], [440, 208]]) {
    for (let ring = 1; ring < 5; ring++) {
      ctx.strokeStyle = `rgba(39,29,24,${0.26 - ring * 0.025})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(x, y, ring * 3, ring * 10, 0.06, 0, Math.PI * 2); ctx.stroke();
    }
  }
  speckle(ctx, width, height, 251, 2600, 0.1);
}

function plasterPaint(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#dfd9c1'; ctx.fillRect(0, 0, width, height);
  const random = randomFrom(16281);
  for (let i = 0; i < 52; i++) {
    const x = random() * width, y = random() * height, radius = 10 + random() * 44;
    const cloud = ctx.createRadialGradient(x, y, 0, x, y, radius);
    cloud.addColorStop(0, 'rgba(129,119,91,0.055)'); cloud.addColorStop(1, 'rgba(129,119,91,0)');
    ctx.fillStyle = cloud; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  speckle(ctx, width, height, 1210, 3600, 0.15);
}

function roofPaint(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#344e4d'; ctx.fillRect(0, 0, width, height);
  // Overlapping ceramic courses; geometric ridges supply the large silhouette.
  for (let row = -1; row < 8; row++) {
    for (let col = -1; col < 9; col++) {
      const x = col * 64 + row % 2 * 32, y = row * 64;
      const gradient = ctx.createLinearGradient(x, y, x + 64, y);
      gradient.addColorStop(0, '#253d3e'); gradient.addColorStop(0.36, '#516360');
      gradient.addColorStop(0.68, '#3f5653'); gradient.addColorStop(1, '#243b3c');
      ctx.fillStyle = gradient; ctx.fillRect(x + 2, y + 2, 60, 63);
      ctx.strokeStyle = 'rgba(15,29,28,0.45)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 3, y + 60); ctx.quadraticCurveTo(x + 32, y + 67, x + 60, y + 60); ctx.stroke();
      ctx.strokeStyle = 'rgba(169,178,146,0.15)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 14, y + 6); ctx.lineTo(x + 14, y + 52); ctx.stroke();
    }
  }
  speckle(ctx, width, height, 5381, 3000, 0.18);
}

function stonePaint(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#7e8981'; ctx.fillRect(0, 0, width, height);
  const random = randomFrom(66381);
  for (let row = 0; row < 4; row++) {
    for (let col = -1; col < 4; col++) {
      const x = col * 170 + row % 2 * 85, y = row * 128;
      const tint = 125 + Math.round(random() * 19);
      ctx.fillStyle = `rgb(${tint - 3},${tint + 5},${tint})`; ctx.fillRect(x + 3, y + 3, 164, 122);
      ctx.strokeStyle = 'rgba(223,221,196,0.23)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 6, y + 123); ctx.lineTo(x + 6, y + 5); ctx.lineTo(x + 164, y + 5); ctx.stroke();
      ctx.strokeStyle = 'rgba(34,47,43,0.25)';
      ctx.beginPath(); ctx.moveTo(x + 165, y + 5); ctx.lineTo(x + 165, y + 124); ctx.lineTo(x + 7, y + 124); ctx.stroke();
    }
  }
  speckle(ctx, width, height, 732, 6800, 0.18);
}

function clothPaint(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#cebb8e'; ctx.fillRect(0, 0, width, height);
  for (let line = 0; line < width; line += 4) {
    ctx.fillStyle = line % 8 ? 'rgba(235,225,185,0.32)' : 'rgba(75,74,54,0.13)';
    ctx.fillRect(line, 0, 1, height); ctx.fillRect(0, line, width, 1);
  }
  // Small woven cloud lozenges are painted, keeping fabric rolls inexpensive.
  ctx.strokeStyle = 'rgba(57,92,83,0.38)'; ctx.lineWidth = 1.8;
  for (let row = -1; row < 5; row++) for (let col = -1; col < 5; col++) {
    const x = 32 + col * 64 + row % 2 * 32, y = 32 + row * 64;
    ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.quadraticCurveTo(x - 8, y - 12, x, y - 5);
    ctx.quadraticCurveTo(x + 10, y - 16, x + 14, y); ctx.quadraticCurveTo(x + 3, y + 10, x - 14, y); ctx.stroke();
  }
  speckle(ctx, width, height, 8201, 1500, 0.08);
}

function ceramicPaint(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#b5c7b2'; ctx.fillRect(0, 0, width, height);
  const glaze = ctx.createLinearGradient(0, 0, 0, height);
  glaze.addColorStop(0, 'rgba(35,86,81,0.25)'); glaze.addColorStop(0.35, 'rgba(237,231,187,0.2)');
  glaze.addColorStop(1, 'rgba(43,97,86,0.13)'); ctx.fillStyle = glaze; ctx.fillRect(0, 0, width, height);
  for (const y of [52, 58, 192, 198]) {
    ctx.fillStyle = '#597f76'; ctx.fillRect(0, y, width, 2);
  }
  ctx.strokeStyle = 'rgba(34,79,70,0.3)'; ctx.lineWidth = 1.2;
  for (let i = 0; i < 8; i++) {
    const x = i * 32 + 16;
    ctx.beginPath(); ctx.moveTo(x, 88); ctx.quadraticCurveTo(x - 14, 105, x, 121);
    ctx.quadraticCurveTo(x + 14, 140, x, 156); ctx.stroke();
  }
  speckle(ctx, width, height, 94410, 2500, 0.16);
}

function goodsPaint(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#bf9967'; ctx.fillRect(0, 0, width, height);
  const random = randomFrom(63951);
  for (let i = 0; i < 260; i++) {
    const x = random() * width, y = random() * height;
    ctx.fillStyle = i % 4 ? 'rgba(240,213,155,0.52)' : 'rgba(93,73,43,0.27)';
    ctx.beginPath(); ctx.ellipse(x, y, 2.2, 4, random() * Math.PI, 0, Math.PI * 2); ctx.fill();
  }
  speckle(ctx, width, height, 9365, 1100, 0.1);
}

function signsPaint(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#172d2b'; ctx.fillRect(0, 0, width, height);
  const fields = ['#183f36', '#243b42', '#482d27', '#344740'];
  [...SHOP_NAMES,'听潮坊'].forEach((name, index) => {
    const x = index % 4 * SIGN_WIDTH, y = Math.floor(index / 4) * SIGN_HEIGHT;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#987844'; ctx.fillRect(0, 0, SIGN_WIDTH, SIGN_HEIGHT);
    ctx.fillStyle = fields[index % fields.length]; ctx.fillRect(12, 12, SIGN_WIDTH - 24, SIGN_HEIGHT - 24);
    ctx.strokeStyle = '#c6ac71'; ctx.lineWidth = 3; ctx.strokeRect(21, 21, SIGN_WIDTH - 42, SIGN_HEIGHT - 42);
    ctx.strokeStyle = '#847b51'; ctx.lineWidth = 1; ctx.strokeRect(29, 29, SIGN_WIDTH - 58, SIGN_HEIGHT - 58);
    speckle(ctx, SIGN_WIDTH, SIGN_HEIGHT, 3781 + index, 850, 0.09);
    ctx.fillStyle = '#e8d4a0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 91px "Noto Serif CJK SC", "Noto Sans CJK SC", "KaiTi", serif';
    [...name].forEach((character, i) => {
      ctx.fillText(character, SIGN_WIDTH / 2 + (i - (name.length-1)/2) * 100, SIGN_HEIGHT / 2 + 3, 93);
    });
    // Framed corner flourishes and a little vermilion maker's seal are original.
    ctx.strokeStyle = '#c6ac71'; ctx.lineWidth = 3;
    for (const cornerX of [38, SIGN_WIDTH - 38]) for (const cornerY of [38, SIGN_HEIGHT - 38]) {
      const dx = cornerX < SIGN_WIDTH / 2 ? 1 : -1, dy = cornerY < SIGN_HEIGHT / 2 ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(cornerX + dx * 16, cornerY); ctx.lineTo(cornerX, cornerY);
      ctx.lineTo(cornerX, cornerY + dy * 16); ctx.stroke();
    }
    ctx.fillStyle = '#b6684b'; ctx.fillRect(SIGN_WIDTH - 58, SIGN_HEIGHT - 61, 20, 20);
    ctx.fillStyle = '#e4cb99'; ctx.font = '15px "Noto Serif CJK SC", serif';
    ctx.fillText('云', SIGN_WIDTH - 48, SIGN_HEIGHT - 50);
    ctx.restore();
  });
}

/** Eight original color textures; all shop meshes reuse these nine material roles. */
export function createTownMaterials() {
  const timberMap = paintedTexture('town_original_timber_grain', [512, 512], timberPaint, [1, 1]);
  const plasterMap = paintedTexture('town_original_lime_plaster', [256, 256], plasterPaint, [2, 2]);
  const roofMap = paintedTexture('town_original_celadon_roof_courses', [512, 512], roofPaint, [2, 2]);
  const stoneMap = paintedTexture('town_original_dressed_stone', [512, 512], stonePaint, [1, 1]);
  const clothMap = paintedTexture('town_original_woven_cloud_cloth', [256, 256], clothPaint);
  const ceramicMap = paintedTexture('town_original_celadon_glaze', [256, 256], ceramicPaint);
  const goodsMap = paintedTexture('town_original_grain_and_goods', [256, 256], goodsPaint);
  const signMap = paintedTexture('town_original_twelve_shop_sign_atlas', [ATLAS_WIDTH, ATLAS_HEIGHT], signsPaint, [1, 1], true);
  const material = (name: string, parameters: THREE.MeshStandardMaterialParameters) => {
    const result = new THREE.MeshStandardMaterial(parameters); result.name = `town_${name}`; return result;
  };
  return {
    timber: material('timber', { map: timberMap, color: 0xe3caa9, roughness: 0.86 }),
    plaster: material('plaster', { map: plasterMap, color: 0xf1ead0, roughness: 0.98 }),
    roof: material('roof', { map: roofMap, color: 0xcbd7bd, roughness: 0.72 }),
    stone: material('stone', { map: stoneMap, color: 0xd1d9c8, roughness: 0.96 }),
    cloth: material('cloth', { map: clothMap, color: 0x9bab94, roughness: 0.93, side: THREE.DoubleSide }),
    lantern: material('lantern', { map: clothMap, color: 0xffe1a7, emissive: 0xd59a48, emissiveIntensity: 0.36, roughness: 0.9 }),
    ceramic: material('ceramic', { map: ceramicMap, color: 0xe0e3c0, roughness: 0.42 }),
    goods: material('goods', { map: goodsMap, color: 0xf0d2a1, roughness: 0.93 }),
    sign: material('sign', { map: signMap, color: 0xffffff, roughness: 0.87 }),
    /** Bottom-left to top-right UVs, inset to prevent neighboring labels bleeding. */
    signUV(index: number): [number, number, number, number] {
      const cell = Math.max(0,Math.min(SHOP_NAMES.length,Math.floor(index)));
      const x = cell % 4 * SIGN_WIDTH, y = Math.floor(cell / 4) * SIGN_HEIGHT, inset = 3;
      return [(x + inset) / ATLAS_WIDTH, 1 - (y + SIGN_HEIGHT - inset) / ATLAS_HEIGHT,
        (x + SIGN_WIDTH - inset) / ATLAS_WIDTH, 1 - (y + inset) / ATLAS_HEIGHT];
    },
  };
}

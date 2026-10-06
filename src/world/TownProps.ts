import * as THREE from 'three';
import type { createTownMaterials } from './TownMaterials';

type TownMaterials = ReturnType<typeof createTownMaterials>;
type Surface = Exclude<keyof TownMaterials, 'signUV'>;
type Position = [number, number, number];

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 6);
const narrowCylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 4);
const coneGeometry = new THREE.ConeGeometry(1, 1, 6);
const handleGeometry = new THREE.TorusGeometry(0.16, 0.035, 3, 8, Math.PI * 1.65);
const plateGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);

const lathe = (profile: [number, number][], sides = 8) => new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), sides);
const jarGeometry = lathe([[0, 0], [0.13, 0], [0.23, 0.10], [0.25, 0.30], [0.15, 0.43], [0.12, 0.50], [0, 0.50]]);
const bowlGeometry = lathe([[0, 0], [0.07, 0], [0.18, 0.10], [0.21, 0.17], [0.185, 0.16], [0.11, 0.065], [0, 0.05]]);
const teapotGeometry = lathe([[0, 0], [0.10, 0], [0.20, 0.09], [0.21, 0.22], [0.13, 0.29], [0, 0.30]]);
const sackGeometry = lathe([[0, 0], [0.24, 0], [0.30, 0.16], [0.27, 0.39], [0.20, 0.50], [0.19, 0.47], [0.11, 0.44], [0, 0.44]]);
const lanternProfile: [number, number][] = [[0.16, -0.38], [0.25, -0.25], [0.29, 0], [0.25, 0.25], [0.16, 0.38]];
const lanternGeometry = lathe(lanternProfile, 10);
const fabricGeometry = lathe([[0, -0.4], [0.14, -0.4], [0.17, -0.36], [0.17, 0.36], [0.14, 0.4], [0, 0.4]], 8);

/** Curved bamboo ribs follow the lantern body instead of straight floating bars. */
function lanternRibs() {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let rib = 0; rib < 5; rib++) {
    const theta = rib / 5 * Math.PI * 2;
    const start = positions.length / 3;
    lanternProfile.forEach(([radius, y], row) => {
      for (const side of [-1, 1]) {
        const angle = theta + side * 0.018;
        positions.push(Math.sin(angle) * (radius + 0.004), y, Math.cos(angle) * (radius + 0.004));
        uvs.push((side + 1) / 2, row / (lanternProfile.length - 1));
      }
      if (row < lanternProfile.length - 1) {
        const a = start + row * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}
const lanternRibGeometry = lanternRibs();

/** Pleated hanging cloth, including a gently curved hem, all baked as static detail. */
function drapedFabric() {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const columns = 8, rows = 3;
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const u = column / columns, v = row / rows;
    positions.push((u - 0.5) * 0.82, -v * 1.07 + Math.sin(u * Math.PI) * v * v * 0.05,
      Math.sin(u * Math.PI * 6) * 0.036 + v * v * 0.065);
    uvs.push(u, 1 - v);
    if (row < rows && column < columns) {
      const a = row * (columns + 1) + column, b = a + columns + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}
const drapedFabricGeometry = drapedFabric();

function makeMesh(parent: THREE.Group, materials: TownMaterials, name: string, geometry: THREE.BufferGeometry,
  surface: Surface, position: Position, scale: Position = [1, 1, 1], rotation: Position = [0, 0, 0]) {
  const result = new THREE.Mesh(geometry, materials[surface]); result.name = name;
  result.position.set(...position); result.scale.set(...scale); result.rotation.set(...rotation);
  result.castShadow = true; result.receiveShadow = true; parent.add(result); return result;
}

function box(parent: THREE.Group, materials: TownMaterials, name: string, surface: Surface,
  position: Position, scale: Position, rotation: Position = [0, 0, 0]) {
  return makeMesh(parent, materials, name, boxGeometry, surface, position, scale, rotation);
}

function shelf(parent: THREE.Group, materials: TownMaterials, x: number, z: number) {
  const tag = x < 0 ? 'left' : 'right';
  box(parent, materials, `${tag}_shelf_back`, 'timber', [x, 1.31, z - 0.18], [2.18, 2.3, 0.07]);
  for (const dx of [-1.08, 1.08]) {
    box(parent, materials, `${tag}_shelf_upright`, 'timber', [x + dx, 1.32, z], [0.09, 2.5, 0.48]);
  }
  for (const y of [0.20, 0.85, 1.50, 2.15]) {
    box(parent, materials, `${tag}_shelf_board`, 'timber', [x, y, z + 0.025], [2.18, 0.075, 0.49]);
  }
  box(parent, materials, `${tag}_shelf_crown`, 'timber', [x, 2.60, z], [2.33, 0.11, 0.52]);
}

function counter(parent: THREE.Group, materials: TownMaterials, x: number) {
  const tag = x < 0 ? 'left' : 'right';
  // Full counter footprint stays inside 1.6 by 0.7 metres.
  box(parent, materials, `${tag}_counter_top`, 'timber', [x, 1.04, -1.2], [1.58, 0.12, 0.70]);
  box(parent, materials, `${tag}_counter_front`, 'timber', [x, 0.57, -0.895], [1.44, 0.78, 0.07]);
  box(parent, materials, `${tag}_counter_inset`, 'cloth', [x, 0.60, -0.858], [1.19, 0.52, 0.012]);
  for (const dx of [-0.66, 0.66]) {
    box(parent, materials, `${tag}_counter_leg`, 'timber', [x + dx, 0.52, -1.25], [0.10, 0.99, 0.56]);
  }
  box(parent, materials, `${tag}_counter_lower_rail`, 'timber', [x, 0.15, -1.31], [1.35, 0.08, 0.10]);
}

function lantern(parent: THREE.Group, materials: TownMaterials, x: number, index: number) {
  const tag = `${x < 0 ? 'left' : 'right'}_lantern`, stretch = 1 + index % 3 * 0.06;
  makeMesh(parent, materials, `${tag}_pleated_paper`, lanternGeometry, 'lantern', [x, 3, 1], [1, stretch, 1]);
  makeMesh(parent, materials, `${tag}_bamboo_ribs`, lanternRibGeometry, 'timber', [x, 3, 1], [1, stretch, 1]);
  for (const dy of [-0.39, 0.39]) {
    makeMesh(parent, materials, `${tag}_bamboo_collar`, cylinderGeometry, 'timber', [x, 3 + dy * stretch, 1], [0.175, 0.055, 0.175]);
  }
  const collarTop = 3 + 0.39 * stretch, collarBottom = 3 - 0.39 * stretch;
  makeMesh(parent, materials, `${tag}_cord`, narrowCylinderGeometry, 'timber', [x, (3.84 + collarTop) / 2, 1], [0.012, 3.84 - collarTop, 0.012]);
  makeMesh(parent, materials, `${tag}_tassel_thread`, narrowCylinderGeometry, 'timber', [x, collarBottom - 0.05, 1], [0.009, 0.10, 0.009]);
  makeMesh(parent, materials, `${tag}_tassel`, coneGeometry, 'cloth', [x, collarBottom - 0.20, 1], [0.06, 0.22, 0.06], [Math.PI, 0, 0]);
  box(parent, materials, `${tag}_bracket`, 'timber', [x, 3.84, 0.60], [0.07, 0.07, 0.88]);
}

function jar(parent: THREE.Group, materials: TownMaterials, position: Position, size = 1, surface: Surface = 'ceramic', lid = true) {
  makeMesh(parent, materials, 'hand_thrown_storage_jar', jarGeometry, surface, position, [size, size, size]);
  if (lid) makeMesh(parent, materials, 'jar_lid', plateGeometry, 'timber',
    [position[0], position[1] + 0.515 * size, position[2]], [0.135 * size, 0.038 * size, 0.135 * size]);
}

function bowl(parent: THREE.Group, materials: TownMaterials, position: Position, size = 1) {
  makeMesh(parent, materials, 'open_celadon_bowl', bowlGeometry, 'ceramic', position, [size, size, size]);
}

function books(parent: THREE.Group, materials: TownMaterials, position: Position, amount: number, yaw = 0) {
  const pile = new THREE.Group(); pile.name = 'thread_bound_book_pile'; pile.position.set(...position); pile.rotation.y = yaw;
  parent.add(pile);
  for (let i = 0; i < amount; i++) {
    const y = i * 0.10, offset = Math.sin(i * 1.7) * 0.035;
    box(pile, materials, 'book_page_block', 'plaster', [offset, y + 0.055, 0], [0.41, 0.055, 0.28]);
    for (const dy of [0.019, 0.091]) box(pile, materials, 'book_cloth_cover', 'cloth', [offset, y + dy, 0], [0.45, 0.015, 0.31]);
    box(pile, materials, 'stitched_book_spine', 'cloth', [offset - 0.217, y + 0.055, 0], [0.025, 0.075, 0.31]);
  }
}

function crate(parent: THREE.Group, materials: TownMaterials, position: Position, size = 1) {
  const root = new THREE.Group(); root.name = 'slatted_open_merchant_crate'; root.position.set(...position); root.scale.setScalar(size); parent.add(root);
  box(root, materials, 'crate_floor', 'timber', [0, 0.04, 0], [0.69, 0.075, 0.57]);
  for (const z of [-0.26, 0.26]) for (const y of [0.15, 0.29, 0.43]) {
    box(root, materials, 'crate_horizontal_slat', 'timber', [0, y, z], [0.69, 0.105, 0.045]);
  }
  for (const x of [-0.32, 0.32]) box(root, materials, 'crate_end_panel', 'timber', [x, 0.27, 0], [0.055, 0.45, 0.54]);
  for (const x of [-0.26, 0.26]) box(root, materials, 'crate_front_brace', 'timber', [x, 0.27, 0.29], [0.055, 0.47, 0.035]);
}

function tray(parent: THREE.Group, materials: TownMaterials, position: Position, contents: Surface = 'goods') {
  box(parent, materials, 'shallow_merchant_tray', 'timber', position, [0.51, 0.055, 0.34]);
  box(parent, materials, 'tray_merchandise', contents, [position[0], position[1] + 0.032, position[2]], [0.43, 0.025, 0.27]);
  for (const dz of [-0.17, 0.17]) box(parent, materials, 'tray_raised_edge', 'timber', [position[0], position[1] + 0.05, position[2] + dz], [0.51, 0.075, 0.025]);
}

function teaSet(parent: THREE.Group, materials: TownMaterials, x: number) {
  makeMesh(parent, materials, 'round_tea_serving_tray', plateGeometry, 'timber', [x, 1.115, -1.20], [0.55, 0.045, 0.28]);
  makeMesh(parent, materials, 'celadon_teapot_body', teapotGeometry, 'ceramic', [x, 1.145, -1.24], [0.9, 0.9, 0.9]);
  makeMesh(parent, materials, 'teapot_loop_handle', handleGeometry, 'ceramic', [x - 0.24, 1.30, -1.24], [0.7, 0.7, 0.7], [0, 0, -0.60]);
  makeMesh(parent, materials, 'teapot_tapered_spout', coneGeometry, 'ceramic', [x + 0.22, 1.32, -1.24], [0.075, 0.24, 0.075], [0, 0, -1.03]);
  makeMesh(parent, materials, 'teapot_lid', plateGeometry, 'ceramic', [x, 1.425, -1.24], [0.12, 0.025, 0.12]);
  makeMesh(parent, materials, 'teapot_lid_knob', coneGeometry, 'ceramic', [x, 1.46, -1.24], [0.036, 0.06, 0.036]);
  for (const dx of [-0.38, 0.38]) bowl(parent, materials, [x + dx, 1.14, -1.05], 0.47);
}

function fabricRoll(parent: THREE.Group, materials: TownMaterials, position: Position, yaw = 0) {
  makeMesh(parent, materials, 'rolled_woven_cloud_bolt', fabricGeometry, 'cloth', position, [1, 1, 1], [Math.PI / 2, 0, yaw]);
  makeMesh(parent, materials, 'fabric_wooden_spindle', cylinderGeometry, 'timber', position, [0.055, 0.88, 0.055], [Math.PI / 2, 0, yaw]);
}

function brushes(parent: THREE.Group, materials: TownMaterials, position: Position, amount: number) {
  jar(parent, materials, position, 0.55, 'ceramic', false);
  for (let i = 0; i < amount; i++) {
    const x = position[0] + Math.sin(i * 2.4) * 0.075, z = position[2] + Math.cos(i * 2.4) * 0.07;
    const tilt = (i - (amount - 1) / 2) * 0.09;
    makeMesh(parent, materials, 'bamboo_brush_handle', narrowCylinderGeometry, 'timber', [x, position[1] + 0.48, z], [0.017, 0.39, 0.017], [0, 0, tilt]);
    makeMesh(parent, materials, 'tapered_brush_hair', coneGeometry, 'goods', [x - Math.sin(tilt) * 0.20, position[1] + 0.715, z], [0.031, 0.12, 0.031], [0, 0, tilt]);
  }
}

/** Static, shared-role shop dressing. Entrance |x| < 1.5, z > -4 stays empty. */
export function addShopProps(parent: THREE.Group, materials: TownMaterials, index: number): void {
  const kind = ((Math.floor(index) % 12) + 12) % 12;
  const props = new THREE.Group(); props.name = `shop_${kind}_authored_merchandise`; parent.add(props);
  for (const x of [-2.8, 2.8]) shelf(props, materials, x, -5.90);
  for (const x of [-2.9, 2.9]) { counter(props, materials, x); lantern(props, materials, x < 0 ? -3 : 3, kind); }

  switch (kind) {
    case 0: // Pharmacy: lidded medicine jars, dried herbs, dispensing tray.
      for (let i = 0; i < 6; i++) jar(props, materials, [-3.58 + i % 3 * 0.74, i < 3 ? 0.89 : 1.54, -5.83], 0.72);
      tray(props, materials, [-2.9, 1.12, -1.2]); jar(props, materials, [2.9, 1.11, -1.22], 0.65);
      books(props, materials, [3.35, 1.10, -1.23], 2, -0.14);
      break;
    case 1: // Tea house: an actual spouted teapot and open bowls.
      teaSet(props, materials, -2.9);
      for (const x of [2.52, 3.26]) jar(props, materials, [x, 1.10, -1.22], 0.62);
      for (const x of [-3.40, -2.65, 2.45, 3.18]) bowl(props, materials, [x, 1.54, -5.77], 0.85);
      break;
    case 2: // Bookseller: stitched covers, visible page blocks, rolled scrolls.
      for (let i = 0; i < 4; i++) books(props, materials, [-3.40 + i % 2 * 0.94, i < 2 ? 0.89 : 1.54, -5.78], 3, i * 0.04);
      books(props, materials, [-2.9, 1.10, -1.2], 3, 0.10); books(props, materials, [2.9, 1.10, -1.2], 2, -0.19);
      for (let i = 0; i < 3; i++) makeMesh(props, materials, 'rolled_paper_scroll', cylinderGeometry, 'plaster', [2.40 + i * 0.34, 1.60, -5.78], [0.075, 0.62, 0.075], [0, 0, Math.PI / 2]);
      break;
    case 3: // Weaver: shaped bolts plus a pleated drape hanging inside the shop.
      for (let i = 0; i < 4; i++) fabricRoll(props, materials, [-3.43 + i % 2 * 0.97, i < 2 ? 1.06 : 1.72, -5.76]);
      fabricRoll(props, materials, [-2.9, 1.28, -1.2], 0.1); fabricRoll(props, materials, [2.9, 1.28, -1.2], -0.1);
      makeMesh(props, materials, 'hanging_pleated_fabric_sample', drapedFabricGeometry, 'cloth', [2.8, 2.55, -5.57]);
      break;
    case 4: // Potter: open bowls, tall vessels and an unfinished clay-colored jar.
      for (const x of [-3.43, -2.57, 2.41, 3.20]) jar(props, materials, [x, 0.89, -5.8], 0.73, 'ceramic', false);
      for (const x of [-2.9, 2.65, 3.14]) bowl(props, materials, [x, 1.11, -1.2], 0.92);
      jar(props, materials, [-2.82, 1.54, -5.8], 1.12, 'goods', false);
      break;
    case 5: // Wine shop: tall lidded crocks and a low crate for transport.
      for (const x of [-3.39, -2.52, 2.42, 3.22]) jar(props, materials, [x, 0.89, -5.8], 1.0);
      jar(props, materials, [-2.9, 1.11, -1.2], 1.05); bowl(props, materials, [2.9, 1.11, -1.2], 0.84);
      crate(props, materials, [3.55, 0, 0.65], 0.9);
      break;
    case 6: // Grain merchant: folded-rim sacks with visible grain at their mouths.
      for (let i = 0; i < 4; i++) makeMesh(props, materials, 'folded_grain_sack', sackGeometry, 'goods', [-3.45 + i % 2 * 0.80, 0, -2.60 - Math.floor(i / 2) * 0.72], [1, 1.15, 1]);
      tray(props, materials, [-2.9, 1.12, -1.2]); tray(props, materials, [2.9, 1.12, -1.2]);
      crate(props, materials, [3.45, 0, 0.62]);
      jar(props, materials, [2.8, 0.89, -5.80], 0.8);
      break;
    case 7: // Incense: small jars, a curved bowl burner and stacked wrapped packs.
      for (const x of [-3.38, -2.58, 2.40, 3.19]) jar(props, materials, [x, 1.54, -5.8], 0.6);
      bowl(props, materials, [-2.9, 1.11, -1.2], 1.05);
      for (let i = 0; i < 5; i++) makeMesh(props, materials, 'thin_incense_stick', narrowCylinderGeometry, 'timber', [-2.96 + i * 0.03, 1.55, -1.2], [0.006, 0.61, 0.006]);
      books(props, materials, [2.9, 1.1, -1.2], 3, -0.08); tray(props, materials, [-2.8, 0.89, -5.8], 'cloth');
      break;
    case 8: // Brush maker: tapered bristles, bamboo handles and writing paper.
      brushes(props, materials, [-2.9, 1.11, -1.2], 5); brushes(props, materials, [2.9, 1.11, -1.2], 4);
      books(props, materials, [-3.35, 0.89, -5.8], 3); books(props, materials, [-2.52, 1.54, -5.8], 3);
      tray(props, materials, [2.8, 0.89, -5.8], 'plaster');
      break;
    case 9: // Pastry stall: little tapered rice cakes displayed on trays.
      for (const x of [-2.9, 2.9]) {
        tray(props, materials, [x, 1.12, -1.2]);
        for (let i = 0; i < 4; i++) makeMesh(props, materials, 'moulded_rice_cake', plateGeometry, 'goods', [x - 0.17 + i % 2 * 0.32, 1.22, -1.29 + Math.floor(i / 2) * 0.18], [0.095, 0.10, 0.065]);
      }
      jar(props, materials, [-2.8, 0.89, -5.8], 0.86); crate(props, materials, [3.55, 0, 0.68], 0.8);
      break;
    case 10: // Herb kitchen: serving ware, provisions and work trays.
      teaSet(props, materials, 2.9); tray(props, materials, [-2.9, 1.12, -1.2]);
      for (const x of [-3.39, -2.59, 2.40]) jar(props, materials, [x, 0.89, -5.8], 0.75);
      for (const x of [-3.30, 3.25]) bowl(props, materials, [x, 1.54, -5.8], 0.9);
      break;
    case 11: // General goods: mixed silhouette instead of a recolored earlier shop.
      crate(props, materials, [-3.55, 0, 0.68], 0.95);
      jar(props, materials, [-2.9, 1.11, -1.2], 0.86); fabricRoll(props, materials, [2.9, 1.28, -1.2]);
      books(props, materials, [-3.33, 0.89, -5.8], 3); bowl(props, materials, [2.4, 1.54, -5.8], 0.96);
      jar(props, materials, [3.2, 0.89, -5.8], 1.02); tray(props, materials, [-2.5, 1.54, -5.8]);
      break;
  }
}

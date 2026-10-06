import * as THREE from 'three';
import { artGeometry as g, bake, mesh, taperedCloth, tube } from './ArtKit';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function swordGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.045, 0); shape.lineTo(-0.06, 0.67); shape.lineTo(0, 0.88);
  shape.lineTo(0.06, 0.67); shape.lineTo(0.045, 0); shape.closePath();
  const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.026, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1, steps: 1 });
  blade.translate(0, 0, -0.013);
  return blade;
}
const bladeGeometry = swordGeometry();
const robeGeometry = taperedCloth([{ y: 0.16, x: 0.36, z: 0.26 }, { y: 0.45, x: 0.3, z: 0.22 }, { y: 0.91, x: 0.22, z: 0.16 }], 24, 0.018);
const sleeveGeometry = taperedCloth([{ y: -0.53, x: 0.19, z: 0.15 }, { y: -0.25, x: 0.13, z: 0.115 }, { y: 0, x: 0.14, z: 0.14 }], 16);
const petalGeometry = new THREE.SphereGeometry(1, 8, 5);
const templates = new Map<string, THREE.Group>();

function remember(name: string, root: THREE.Group) { templates.set(name, root.clone(true)); }
function joint(root: THREE.Group, name: string) { return root.getObjectByName(name) as THREE.Group; }

export function makeSword(scale = 1) {
  const cached = templates.get('sword');
  if (cached) { const root = cached.clone(true); root.scale.setScalar(scale); return root; }
  const group = new THREE.Group();
  mesh(group, bladeGeometry, 'steel', [0, 0.16, 0]);
  mesh(group, g.box, 'gold', [0, 0.13, 0], [0.23, 0.045, 0.07]);
  mesh(group, g.cylinder, 'jade', [0, 0.03, 0], [0.04, 0.16, 0.04]);
  mesh(group, g.sphere, 'gold', [0, -0.07, 0], [0.045, 0.028, 0.04]);
  mesh(group, g.box, 'jade', [0, 0.5, -0.025], [0.012, 0.56, 0.005]);
  bake(group);
  remember('sword', group);
  group.scale.setScalar(scale);
  return group;
}

export function createCultivator() {
  const cached = templates.get('cultivator');
  if (cached) return animateCultivator(cached.clone(true));
  const root = new THREE.Group();
  root.name = 'YunhaiCultivator';
  const hips = new THREE.Group(); hips.name = 'hips'; root.add(hips);
  const body = new THREE.Group();
  mesh(body, g.sphere, 'jade', [0, 1.11, 0], [0.235, 0.33, 0.16]);
  mesh(body, g.box, 'ivory', [-0.09, 1.21, -0.145], [0.075, 0.34, 0.028], [0, 0, -0.35]);
  mesh(body, g.box, 'ivory', [0.09, 1.21, -0.15], [0.065, 0.34, 0.028], [0, 0, 0.37]);
  mesh(body, g.cylinder, 'dark', [0, 0.94, 0], [0.242, 0.08, 0.175]);
  mesh(body, g.box, 'gold', [0, 0.94, -0.182], [0.07, 0.08, 0.018]);
  mesh(body, g.cylinder, 'skin', [0, 1.43, 0], [0.07, 0.12, 0.07]);
  // Two long lapels and jade shoulder guards give a recognizable scholar-warrior silhouette.
  for (const side of [-1, 1]) {
    mesh(body, g.sphere, 'ivory', [side * 0.255, 1.32, 0], [0.145, 0.105, 0.18]);
    mesh(body, g.box, 'gold', [side * 0.25, 1.37, -0.04], [0.18, 0.025, 0.21]);
    mesh(body, g.box, 'jade', [side * 0.2, 0.78, -0.09], [0.11, 0.4, 0.035], [0, 0, side * 0.13]);
  }
  hips.add(bake(body));

  const skirt = new THREE.Group(); skirt.name = 'skirt';
  mesh(skirt, robeGeometry, 'ivory', [0, 0, 0]);
  for (const side of [-1, 1]) {
    mesh(skirt, g.box, 'teal', [side * 0.23, 0.49, 0.02], [0.12, 0.72, 0.29], [0, 0, side * -0.11]);
    mesh(skirt, g.box, 'gold', [side * 0.295, 0.46, -0.16], [0.025, 0.72, 0.015], [0, 0, side * -0.11]);
  }
  hips.add(bake(skirt));

  const head = new THREE.Group();
  mesh(head, g.sphere, 'skin', [0, 1.61, -0.035], [0.135, 0.175, 0.12]);
  mesh(head, g.sphere, 'hair', [0, 1.68, 0.015], [0.15, 0.155, 0.13]);
  mesh(head, g.sphere, 'hair', [0, 1.83, 0.03], [0.075, 0.075, 0.07]);
  mesh(head, g.cylinder, 'gold', [0, 1.815, 0.01], [0.09, 0.025, 0.08]);
  mesh(head, g.box, 'gold', [0, 1.855, 0.01], [0.27, 0.018, 0.018], [0, 0, 0.12]);
  for (const side of [-1, 1]) {
    mesh(head, g.box, 'dark', [side * 0.055, 1.626, -0.147], [0.042, 0.015, 0.008], [0, 0, side * 0.13]);
    mesh(head, g.sphere, 'hair', [side * 0.119, 1.58, 0], [0.023, 0.15, 0.045]);
  }
  hips.add(bake(head));
  const ponytail = new THREE.Group(); ponytail.name = 'ponytail';
  mesh(ponytail, tube([new THREE.Vector3(0, 1.72, 0.09), new THREE.Vector3(0, 1.52, 0.18), new THREE.Vector3(0, 1.27, 0.17), new THREE.Vector3(0.03, 1.05, 0.2)], 0.043, 14), 'hair', [0, 0, 0]);
  hips.add(bake(ponytail));

  const legs: THREE.Group[] = [], arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.name = `leg${legs.length}`; leg.position.set(side * 0.115, 0.72, 0);
    const geometry = new THREE.Group();
    mesh(geometry, g.cylinder, 'dark', [0, -0.3, 0], [0.065, 0.5, 0.065]);
    mesh(geometry, g.box, 'dark', [0, -0.66, -0.045], [0.12, 0.13, 0.22]);
    mesh(geometry, g.box, 'gold', [0, -0.61, -0.115], [0.09, 0.02, 0.03]);
    leg.add(bake(geometry)); hips.add(leg); legs.push(leg);
    const arm = new THREE.Group(); arm.name = `arm${arms.length}`; arm.position.set(side * 0.29, 1.31, 0);
    const geometryArm = new THREE.Group();
    mesh(geometryArm, sleeveGeometry, 'ivory', [0, 0, 0]);
    mesh(geometryArm, g.cylinder, 'jade', [0, -0.48, 0], [0.15, 0.05, 0.14]);
    mesh(geometryArm, g.sphere, 'skin', [0, -0.58, 0], [0.062, 0.1, 0.06]);
    arm.add(bake(geometryArm)); arm.rotation.z = side * -0.12; hips.add(arm); arms.push(arm);
  }
  const sword = makeSword(); sword.name = 'heldSword'; sword.position.set(0, -0.58, -0.015); sword.rotation.x = -Math.PI / 2; arms[1].add(sword);
  const flyingSword = makeSword(3.2); flyingSword.name = 'flyingSword'; flyingSword.rotation.x = -Math.PI / 2; flyingSword.position.set(0, -0.16, 1.1); root.add(flyingSword);
  flyingSword.visible = false;
  remember('cultivator', root);
  return animateCultivator(root);
}

function animateCultivator(root: THREE.Group) {
  const hips = joint(root, 'hips'), skirt = joint(root, 'skirt'), ponytail = joint(root, 'ponytail');
  const legs = [joint(root, 'leg0'), joint(root, 'leg1')], arms = [joint(root, 'arm0'), joint(root, 'arm1')];
  const sword = joint(root, 'heldSword'), flyingSword = joint(root, 'flyingSword');
  let gait = 0;
  return {
    root,
    animate(dt: number, time: number, speed: number, flying: boolean, attack: number) {
      const walk = Math.min(Math.abs(speed) / 6, 1);
      gait += dt * Math.abs(speed) * 2.8 * (walk > 0.03 ? 1 : 0);
      const swing = Math.sin(gait) * 0.78 * walk;
      hips.position.y = flying ? Math.sin(time * 2.2) * 0.025 : Math.abs(Math.sin(gait)) * 0.025 * walk;
      hips.rotation.x = flying ? 0.08 : 0;
      legs[0].rotation.x = flying ? -0.08 : swing; legs[1].rotation.x = flying ? 0.12 : -swing;
      arms[0].rotation.x = flying ? -0.55 : -swing * 0.7;
      const strike = attack > 0 ? Math.sin(Math.min(1, attack) * Math.PI) : 0;
      arms[1].rotation.x = flying ? -0.42 : swing * 0.7 + strike * 1.25;
      arms[1].rotation.z = -0.12 + strike * 0.32;
      skirt.rotation.x = flying ? -0.1 : Math.sin(gait + 0.3) * 0.03 * walk;
      ponytail.rotation.x = (flying ? -0.05 : 0) + Math.sin(time * 3) * 0.018;
      flyingSword.visible = flying;
      sword.visible = !flying;
    },
  };
}

export function createEnemy(kind: 'spirit' | 'guardian') {
  const model = kind === 'spirit' ? createFox() : createGuardian();
  let geometry=enemyLodGeometry.get(kind);
  if(!geometry){
    const parts:THREE.BufferGeometry[]=[];model.root.updateMatrixWorld(true);
    model.root.traverse(object=>{
      if(!(object instanceof THREE.Mesh)||Array.isArray(object.material))return;
      const part=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();part.applyMatrix4(object.matrixWorld);
      const color=(object.material as THREE.MeshStandardMaterial).color,colors:number[]=[];
      for(let i=0;i<part.getAttribute('position').count;i++)colors.push(color.r,color.g,color.b);
      part.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));parts.push(part);
    });
    geometry=mergeGeometries(parts,false)!;parts.forEach(part=>part.dispose());enemyLodGeometry.set(kind,geometry);
  }
  const distant=new THREE.Mesh(geometry,enemyLodMaterial);distant.name='OriginalEnemyDistantLOD';distant.castShadow=true;distant.visible=false;model.root.add(distant);
  let detailed=true;
  return {...model,setDetail(high:boolean){if(high===detailed)return;detailed=high;for(const child of model.root.children)child.visible=child===distant?!high:high;}};
}
const enemyLodGeometry=new Map<string,THREE.BufferGeometry>();
const enemyLodMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9});

function createFox() {
  const cached = templates.get('spirit');
  if (cached) return animateFox(cached.clone(true));
  const root = new THREE.Group(); root.name = 'JadeSpiritFox';
  const torso = new THREE.Group();
  mesh(torso, g.sphere, 'ivory', [0, 0.7, 0.12], [0.32, 0.36, 0.65]);
  mesh(torso, g.sphere, 'teal', [0, 0.91, 0.15], [0.235, 0.19, 0.6]);
  mesh(torso, g.sphere, 'ivory', [0, 0.67, -0.44], [0.32, 0.4, 0.3]);
  root.add(bake(torso));
  const head = new THREE.Group(); head.name = 'head'; head.position.set(0, 0.89, -0.55);
  const face = new THREE.Group();
  mesh(face, g.sphere, 'ivory', [0, 0, 0], [0.255, 0.27, 0.32]);
  mesh(face, g.cone, 'ivory', [0, -0.095, -0.3], [0.18, 0.4, 0.16], [-Math.PI / 2, 0, 0]);
  mesh(face, g.sphere, 'dark', [0, -0.09, -0.49], [0.055, 0.038, 0.045]);
  for (const side of [-1, 1]) {
    mesh(face, g.cone, 'ivory', [side * 0.185, 0.245, 0.02], [0.13, 0.38, 0.11], [0, 0, side * -0.16]);
    mesh(face, g.cone, 'jade', [side * 0.185, 0.254, -0.012], [0.085, 0.28, 0.078], [0, 0, side * -0.16]);
    mesh(face, g.sphere, 'warning', [side * 0.19, 0.02, -0.213], [0.048, 0.037, 0.023]);
  }
  mesh(face, g.ico, 'warning', [0, 0.12, -0.25], [0.045, 0.085, 0.027]);
  head.add(bake(face)); root.add(head);
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) for (const front of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.name = `leg${legs.length}`; pivot.position.set(side * 0.22, 0.62, front * 0.41);
    const leg = new THREE.Group();
    mesh(leg, g.cylinder, 'ivory', [0, -0.22, 0], [0.07, 0.46, 0.07], [0.1 * front, 0, 0]);
    mesh(leg, g.sphere, 'ivory', [0, -0.53, -0.05], [0.095, 0.075, 0.14]);
    pivot.add(bake(leg)); root.add(pivot); legs.push(pivot);
  }
  const tailFan = new THREE.Group(); tailFan.name = 'tailFan'; tailFan.position.set(0, 0.65, 0.62);
  for (const side of [-1, 0, 1]) {
    const tail = new THREE.Group(); tail.position.set(side * 0.12, 0, 0);
    const geometry = tube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(side * 0.21, 0.2, 0.4), new THREE.Vector3(side * 0.36, 0.5, 0.75), new THREE.Vector3(side * 0.3, 0.56, 1.01)], 0.12, 12);
    mesh(tail, geometry, 'teal', [0, 0, 0]);
    mesh(tail, g.sphere, 'ivory', [side * 0.3, 0.56, 1.01], [0.14, 0.14, 0.2]);
    tailFan.add(tail);
  }
  root.add(bake(tailFan));
  remember('spirit', root);
  return animateFox(root);
}

function animateFox(root: THREE.Group) {
  const legs = [0, 1, 2, 3].map((i) => joint(root, `leg${i}`)), tailFan = joint(root, 'tailFan'), head = joint(root, 'head');
  let stride = 0;
  return { root, animate(dt: number, time: number, moving: boolean, attack: number) {
    stride += dt * (moving ? 9 : 2);
    legs.forEach((leg, i) => { leg.rotation.x = moving ? Math.sin(stride + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.55 : 0; });
    tailFan.rotation.y = Math.sin(time * 2.8) * 0.14;
    head.rotation.x = attack > 0 ? -Math.sin(attack * Math.PI) * 0.35 : Math.sin(time * 1.7) * 0.035;
    root.scale.y = 1 - (attack > 0 ? Math.sin(attack * Math.PI) * 0.09 : 0);
  } };
}

function createGuardian() {
  const cached = templates.get('guardian');
  if (cached) return animateGuardian(cached.clone(true));
  const root = new THREE.Group(); root.name = 'AncientStoneGuardian';
  const waist = new THREE.Group();
  mesh(waist, g.ico, 'stone', [0, 2.5, 0], [0.96, 0.9, 0.58]);
  mesh(waist, g.box, 'jade', [0, 3.04, -0.42], [1.45, 0.7, 0.21]);
  mesh(waist, g.ico, 'spirit', [0, 3.0, -0.58], [0.22, 0.33, 0.11]);
  mesh(waist, g.box, 'gold', [0, 2.25, -0.51], [1.55, 0.1, 0.08]);
  for (const side of [-1, 1]) {
    mesh(waist, g.box, 'paleStone', [side * 0.6, 2.3, 0], [0.42, 0.8, 0.84], [0, 0, side * 0.18]);
    mesh(waist, g.box, 'gold', [side * 0.8, 3.3, -0.38], [0.065, 0.65, 0.08], [0, 0, side * -0.5]);
  }
  root.add(bake(waist));
  const head = new THREE.Group(); head.name = 'head'; head.position.y = 3.8;
  const skull = new THREE.Group();
  mesh(skull, g.ico, 'paleStone', [0, 0.05, 0], [0.6, 0.58, 0.51]);
  mesh(skull, g.box, 'jade', [0, -0.03, -0.465], [0.79, 0.36, 0.16]);
  for (const side of [-1, 1]) {
    mesh(skull, g.box, 'warning', [side * 0.22, 0.06, -0.56], [0.23, 0.07, 0.045]);
    mesh(skull, g.box, 'gold', [side * 0.43, 0.44, 0], [0.12, 0.74, 0.15], [0, 0, side * -0.25]);
  }
  mesh(skull, g.box, 'dark', [0, -0.22, -0.57], [0.34, 0.05, 0.015]);
  head.add(bake(skull)); root.add(head);
  const legs: THREE.Group[] = [], arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.name = `leg${legs.length}`; leg.position.set(side * 0.54, 2.1, 0);
    const geometry = new THREE.Group();
    mesh(geometry, g.ico, 'stone', [0, -0.55, 0], [0.44, 0.65, 0.45]);
    mesh(geometry, g.box, 'jade', [0, -0.81, -0.37], [0.53, 0.53, 0.11]);
    mesh(geometry, g.box, 'paleStone', [0, -1.59, -0.13], [0.71, 0.89, 0.87]);
    mesh(geometry, g.box, 'gold', [0, -1.74, -0.57], [0.57, 0.07, 0.045]);
    leg.add(bake(geometry)); root.add(leg); legs.push(leg);
    const arm = new THREE.Group(); arm.name = `arm${arms.length}`; arm.position.set(side * 1.04, 3.34, 0);
    const armGeometry = new THREE.Group();
    mesh(armGeometry, g.ico, 'stone', [side * 0.2, 0, 0], [0.64, 0.48, 0.5]);
    mesh(armGeometry, g.box, 'jade', [side * 0.31, -0.15, -0.42], [0.75, 0.41, 0.12]);
    mesh(armGeometry, g.ico, 'paleStone', [side * 0.4, -0.8, 0], [0.46, 0.76, 0.46]);
    mesh(armGeometry, g.box, 'stone', [side * 0.48, -1.54, -0.07], [0.7, 0.63, 0.7]);
    mesh(armGeometry, g.box, 'gold', [side * 0.42, -1.06, -0.43], [0.67, 0.08, 0.055]);
    arm.add(bake(armGeometry)); root.add(arm); arms.push(arm);
  }
  remember('guardian', root);
  return animateGuardian(root);
}

function animateGuardian(root: THREE.Group) {
  const legs = [joint(root, 'leg0'), joint(root, 'leg1')], arms = [joint(root, 'arm0'), joint(root, 'arm1')], head = joint(root, 'head');
  let gait = 0;
  return { root, animate(dt: number, time: number, moving: boolean, attack: number) {
    gait += dt * (moving ? 3.6 : 0);
    legs.forEach((leg, i) => { leg.rotation.x = moving ? Math.sin(gait + i * Math.PI) * 0.3 : 0; });
    arms.forEach((arm, i) => { arm.rotation.x = Math.sin(time * 1.1 + i) * 0.035 - (attack > 0 ? Math.sin(attack * Math.PI) * 2.2 : (moving ? Math.sin(gait + i * Math.PI) * 0.23 : 0)); });
    head.rotation.y = Math.sin(time * 0.4) * 0.05;
  } };
}

export function createHerb(): THREE.Group {
  const cached = templates.get('herb'); if (cached) return cached.clone(true);
  const root = new THREE.Group(); root.name = 'JadeLotusHerb';
  mesh(root, g.cylinder, 'jade', [0, 0.35, 0], [0.045, 0.7, 0.045]);
  for (let i = 0; i < 7; i++) {
    const angle = i / 7 * Math.PI * 2;
    mesh(root, petalGeometry, 'teal', [Math.cos(angle) * 0.24, 0.31 + i % 2 * 0.1, Math.sin(angle) * 0.24], [0.24, 0.045, 0.105], [0, -angle, -0.22]);
    mesh(root, petalGeometry, 'spirit', [Math.cos(angle) * 0.12, 0.7, Math.sin(angle) * 0.12], [0.09, 0.17, 0.05], [0.25, -angle, 0.3]);
  }
  mesh(root, g.ico, 'gold', [0, 0.8, 0], [0.085, 0.15, 0.085]);
  bake(root); remember('herb', root); return root;
}

export function createShrine(): THREE.Group {
  const cached = templates.get('shrine'); if (cached) return cached.clone(true);
  const root = new THREE.Group(); root.name = 'SpiritMeridianShrine';
  mesh(root, g.cylinder, 'stone', [0, 0.17, 0], [1.95, 0.34, 1.95]);
  mesh(root, g.cylinder, 'paleStone', [0, 0.39, 0], [1.55, 0.14, 1.55]);
  mesh(root, g.torus, 'gold', [0, 0.49, 0], [1.46, 1.46, 1.46], [Math.PI / 2, 0, 0]);
  mesh(root, g.ico, 'spirit', [0, 1.7, 0], [0.55, 1.05, 0.55]);
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    mesh(root, g.box, 'jade', [Math.sin(angle) * 1.43, 0.62, Math.cos(angle) * 1.43], [0.12, 0.13, 0.38], [0, angle, 0]);
  }
  mesh(root, g.torus, 'gold', [0, 1.8, 0], [0.92, 0.92, 0.92]);
  mesh(root, g.torus, 'gold', [0, 1.8, 0], [0.92, 0.92, 0.92], [0, Math.PI / 2, Math.PI / 5]);
  bake(root); remember('shrine', root); return root;
}

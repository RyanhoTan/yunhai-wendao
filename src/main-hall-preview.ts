import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createMainHallModel } from './world/MainHall';

const canvas = document.querySelector<HTMLCanvasElement>('#hall-canvas')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xededeb);
const camera = new THREE.OrthographicCamera(-17.2, 17.2, 10.2, -10.2, .1, 180);
const controls = new OrbitControls(camera, canvas); controls.target.set(0, 7.5, 0); controls.enableDamping = false;
const hemisphere = new THREE.HemisphereLight(0xe4f0f4, 0x80745e, 1.45); scene.add(hemisphere);
const key = new THREE.DirectionalLight(0xfff1d9, 3.0); key.position.set(-18, 33, 30); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = key.shadow.camera.bottom = -22;
key.shadow.camera.right = key.shadow.camera.top = 22; key.shadow.camera.far = 100; key.shadow.normalBias = .035;
scene.add(key);
const fill = new THREE.DirectionalLight(0xd5e9f2, 1); fill.position.set(20, 14, -18); scene.add(fill);
const params = new URLSearchParams(location.search);
const model = createMainHallModel({ stage: Number(params.get('stage') ?? 7) }); scene.add(model);
let activeView = 'front';
let explodeFactor = 0;
const assembledPositions = new Map(model.children.filter(p => p instanceof THREE.Group).map(p => [p, p.position.clone()]));
function explode(factor: number) {
  explodeFactor = factor; ground.visible = factor === 0;
  const center = new THREE.Vector3(0, 7.5, 0);
  for (const [part, original] of assembledPositions) part.position.copy(original).add(original.clone().sub(center).multiplyScalar(factor));
  resize(); renderer.render(scene, camera);
}
function pickAt(x: number, y: number) {
  const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, 1 - y / innerHeight * 2), camera);
  let part: THREE.Object3D | undefined = ray.intersectObject(model, true)[0]?.object;
  while (part && part.parent !== model) part = part.parent ?? undefined;
  return part?.name ?? null;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: 0xededeb, toneMapped: false }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -.012; ground.receiveShadow = true; scene.add(ground);
function setView(view: string) {
  activeView = view;
  const views: Record<string, THREE.Vector3> = {
    front: new THREE.Vector3(0, 9.7, 55), right: new THREE.Vector3(55, 9.7, 0),
    rear: new THREE.Vector3(0, 9.7, -55), left: new THREE.Vector3(-55, 9.7, 0),
    'three-quarter': new THREE.Vector3(36, 23, 42),
  };
  camera.position.copy(views[view] ?? views.front); camera.lookAt(controls.target); resize(); controls.update(); renderer.render(scene, camera);
}
function resize() {
  renderer.setSize(innerWidth, innerHeight); const height = (activeView === 'three-quarter' ? 22 : 16.8)+explodeFactor*14, width = height * innerWidth / innerHeight;
  camera.top = height / 2; camera.bottom = -height / 2;
  camera.left = -width / 2; camera.right = width / 2; camera.updateProjectionMatrix(); renderer.render(scene, camera);
}
controls.addEventListener('change', () => renderer.render(scene, camera));
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.onclick = () => setView(button.dataset.view!));
let exploded = false;
document.querySelector<HTMLButtonElement>('#explode')!.onclick = event => {
  exploded = !exploded; explode(exploded ? .4 : 0);
  (event.target as HTMLButtonElement).textContent = exploded ? '恢复组装' : '拆分查看';
};
addEventListener('resize', resize); resize(); setView(params.get('view') ?? 'front');
Object.assign(window, { __HALL_PREVIEW__: { model, scene, camera, renderer, setView, explode, pickAt } });

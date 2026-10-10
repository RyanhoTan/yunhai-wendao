import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadFrostboundSwordAssets, makeFrostboundSword } from './assets/FrostboundSword';

const params = new URLSearchParams(location.search);
if (params.has('capture')) document.body.classList.add('capture');
await loadFrostboundSwordAssets();
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1; document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x10171f);
const pmrem = new THREE.PMREMGenerator(renderer), environment = new RoomEnvironment();
const env = pmrem.fromScene(environment, .035); scene.environment = env.texture;
environment.dispose(); pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xb6dcf0, 0x182632, 1.3));
const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(-2, 3, 4); scene.add(key);
const rim = new THREE.DirectionalLight(0x72c8ff, 2); rim.position.set(2, .8, -2); scene.add(rim);
const camera = new THREE.OrthographicCamera();
const held = makeFrostboundSword(), flight = makeFrostboundSword(3.2); flight.scale.setScalar(1);
scene.add(held, flight); flight.visible = false;
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, .44, 0); controls.enableDamping = false;
let view = 'front';
function render() { renderer.render(scene, camera); }
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  const height = view === 'close' ? .45 : 1.44;
  camera.top = height / 2; camera.bottom = -height / 2;
  camera.left = -height * innerWidth / innerHeight / 2; camera.right = -camera.left;
  camera.updateProjectionMatrix(); render();
}
function setView(next: string) {
  view = next; held.visible = next !== 'flight'; flight.visible = next === 'flight';
  controls.target.set(0, next === 'close' ? .03 : .44, 0);
  const directions: Record<string, [number, number, number]> = {
    front: [0, 0, 4], right: [4, 0, 0], rear: [0, 0, -4], left: [-4, 0, 0],
    'three-quarter': [2.8, .65, 4], close: [1.4, .25, 4], flight: [0, 0, 4],
  };
  camera.position.copy(controls.target).add(new THREE.Vector3(...(directions[next] ?? directions.front)));
  camera.lookAt(controls.target); controls.update(); resize();
}
controls.addEventListener('change', render);
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.onclick = () => setView(button.dataset.view!));
addEventListener('resize', resize); setView(params.get('view') ?? 'three-quarter');
Object.assign(window, { __SWORD_PREVIEW__: { held, flight, scene, camera, renderer, setView, makeFrostboundSword, THREE } });

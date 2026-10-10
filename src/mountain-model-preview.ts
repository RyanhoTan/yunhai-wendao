import './mountain-model-preview.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createSectMountainModel } from './models/SectMountainModel';

const canvas = document.querySelector<HTMLCanvasElement>('#mountain-canvas')!;
const stage = document.querySelector<HTMLElement>('.preview-stage')!;
const returnLink = document.querySelector<HTMLAnchorElement>('#return-game')!;
const navigationEvents = new AbortController();

// A link from the game opens this page in a separate tab, preserving its live state.
// A directly opened preview instead navigates to the game using its relative URL.
returnLink.addEventListener('click', event => {
  if (new URLSearchParams(location.search).get('from') !== 'game' || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); window.close();
  setTimeout(() => { if (!window.closed) location.assign(returnLink.href); }, 150);
}, { signal: navigationEvents.signal });
if (import.meta.hot) import.meta.hot.dispose(() => navigationEvents.abort());

try { startPreview(); } catch (error) {
  console.error(error);
  const message = document.querySelector<HTMLParagraphElement>('.preview-error')!;
  message.hidden = false; message.textContent = '模型预览未能启动，请刷新页面或使用支持 WebGL 的浏览器。你仍可通过右上方入口返回游戏。';
}

function startPreview() {
  const events = new AbortController(), signal = events.signal;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.0; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#dce4df');
  const camera = new THREE.PerspectiveCamera(34, 1, .5, 2000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false; controls.minDistance = 15; controls.maxDistance = 650;
  controls.rotateSpeed = .65; controls.target.set(0, 28, 0);
  scene.add(new THREE.HemisphereLight('#b7cee4', '#667789', 1.25));
  const key = new THREE.DirectionalLight('#fff0d4', 2.9); key.position.set(-105, 175, -130); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = key.shadow.camera.bottom = -120;
  key.shadow.camera.right = key.shadow.camera.top = 120; key.shadow.camera.near = 1; key.shadow.camera.far = 500;
  key.shadow.normalBias = .25; key.shadow.bias = -.00012; scene.add(key);
  const fill = new THREE.DirectionalLight('#b9cde2', .45); fill.position.set(110, 80, 130); scene.add(fill);
  const undersideLight = new THREE.DirectionalLight('#c8d2ce', .85); undersideLight.position.set(-25, -90, -45); scene.add(undersideLight);
  const model = createSectMountainModel(); scene.add(model.root);
  // A soft display floor sits below the sealed mountain rather than cutting it.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.ShadowMaterial({ opacity: .12 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -2.3; ground.receiveShadow = true; scene.add(ground);
  document.querySelector('#triangle-count')!.textContent = model.stats.triangles.toLocaleString('zh-CN');
  document.querySelector('#mesh-count')!.textContent = String(model.stats.meshes);
  const views = {
    road: { direction: [-1.1, .95, -1.65], target: [0, 24, 0], span: 208 },
    front: { direction: [1.4, .7, 1.6], target: [0, 27, 0], span: 215 },
    side: { direction: [.1, .42, -1.8], target: [0, 25, 0], span: 210 },
    top: { direction: [0, 1, .0001], target: [0, 20, 0], span: 208 },
    summit: { direction: [-1, 1.1, -1.4], target: [53, 57, 17], span: 87 },
    bottom: { direction: [-1.2, -.95, -1.3], target: [0, 14, 0], span: 210 },
  } as const;
  type View = keyof typeof views;
  let activeView: View = 'road', disposed = false;
  function render() { if (!disposed) renderer.render(scene, camera); }
  function setView(next: View) {
    activeView = next;
    const view = views[next], aspect = stage.clientWidth / stage.clientHeight;
    controls.maxPolarAngle = next === 'bottom' ? Math.PI : Math.PI * .49;
    undersideLight.intensity = next === 'bottom' ? .85 : .1;
    const distance = view.span / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / Math.min(1, aspect);
    controls.target.fromArray(view.target);
    camera.position.copy(controls.target).add(new THREE.Vector3(...view.direction).normalize().multiplyScalar(distance));
    camera.up.set(0, 1, 0); camera.lookAt(controls.target); ground.visible = next !== 'bottom'; controls.update();
    document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === next)));
    render();
  }
  function resize() {
    const width = stage.clientWidth, height = stage.clientHeight;
    camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
    render();
  }
  const observer = new ResizeObserver(resize); observer.observe(stage);
  controls.addEventListener('change', render);
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => {
    button.addEventListener('click', () => setView(button.dataset.view as View), { signal });
  });
  document.querySelectorAll<HTMLInputElement>('[data-layer]').forEach(input => {
    input.addEventListener('change', () => {
      const layer = input.dataset.layer as 'body' | 'road' | 'cliffs' | 'scree';
      model.layers[layer].visible = input.checked;
      if (layer === 'body') model.layers.underside.visible = input.checked;
      render();
    }, { signal });
  });
  const wireframe = document.querySelector<HTMLInputElement>('#wireframe')!;
  wireframe.addEventListener('change', () => { model.setWireframe(wireframe.checked); render(); }, { signal });
  function reset() {
    document.querySelectorAll<HTMLInputElement>('[data-layer]').forEach(input => { input.checked = true; });
    for (const layer of Object.values(model.layers)) layer.visible = true;
    wireframe.checked = false; model.setWireframe(false); setView('road');
  }
  document.querySelector('#reset-view')!.addEventListener('click', reset, { signal });
  canvas.addEventListener('keydown', event => {
    if (event.code === 'KeyR' || event.code === 'Home') { event.preventDefault(); reset(); }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Equal', 'Minus'].includes(event.code)) {
      event.preventDefault();
      const offset = camera.position.clone().sub(controls.target), spherical = new THREE.Spherical().setFromVector3(offset);
      if (event.code === 'ArrowLeft') spherical.theta -= .12;
      if (event.code === 'ArrowRight') spherical.theta += .12;
      if (event.code === 'ArrowUp') spherical.phi -= .12;
      if (event.code === 'ArrowDown') spherical.phi += .12;
      if (event.code === 'Equal') spherical.radius *= .9;
      if (event.code === 'Minus') spherical.radius *= 1.1;
      spherical.radius = clampDistance(spherical.radius); spherical.makeSafe();
      camera.position.copy(controls.target).add(offset.setFromSpherical(spherical)); controls.update(); render();
    }
  }, { signal });
  function clampDistance(value: number) { return THREE.MathUtils.clamp(value, controls.minDistance, controls.maxDistance); }
  resize();
  const requested = new URLSearchParams(location.search).get('view'); setView(requested && Object.hasOwn(views, requested) ? requested as View : 'road');
  const preview = { model, scene, camera, renderer, controls, setView, reset, get view() { return activeView; } };
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('test')) Object.assign(window, { __MOUNTAIN_PREVIEW__: preview });
  function dispose() {
    if (disposed) return; disposed = true; events.abort(); observer.disconnect(); controls.dispose(); model.dispose();
    ground.geometry.dispose(); ground.material.dispose(); key.shadow.dispose(); renderer.dispose();
    if ('__MOUNTAIN_PREVIEW__' in window) Reflect.deleteProperty(window, '__MOUNTAIN_PREVIEW__');
  }
  addEventListener('pagehide', event => { if (!event.persisted) dispose(); }, { signal });
  if (import.meta.hot) import.meta.hot.dispose(dispose);
}

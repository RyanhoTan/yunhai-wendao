import * as THREE from 'three';
const currentViewport=new THREE.Vector4();

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

export function resizeRenderer(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  maxDpr = 2,
): boolean {
  const canvas = renderer.domElement;
  const width = Math.max(1, Math.floor(canvas.clientWidth));
  const height = Math.max(1, Math.floor(canvas.clientHeight));
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const bufferWidth = Math.floor(width * dpr);
  const bufferHeight = Math.floor(height * dpr);
  const needsResize = canvas.width !== bufferWidth || canvas.height !== bufferHeight;

  if (needsResize) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  // Some window backends allocate a smaller physical buffer than the canvas
  // attributes request. Keep the entire camera view inside that actual buffer.
  const gl=renderer.getContext(),pixelRatio=renderer.getPixelRatio();let viewportChanged=false;
  if(gl.drawingBufferWidth>0&&gl.drawingBufferHeight>0){
    const viewWidth=gl.drawingBufferWidth/pixelRatio,viewHeight=gl.drawingBufferHeight/pixelRatio;
    renderer.getViewport(currentViewport);
    if(currentViewport.x!==0||currentViewport.y!==0||currentViewport.z!==viewWidth||currentViewport.w!==viewHeight){
      renderer.setViewport(0,0,viewWidth,viewHeight);viewportChanged=true;
    }
  }

  return needsResize||viewportChanged;
}

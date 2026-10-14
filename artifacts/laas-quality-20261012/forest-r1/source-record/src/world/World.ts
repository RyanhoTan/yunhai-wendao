import * as THREE from 'three';
import {MERIDIAN_SITES,VALLEY_ROUTES,SECT_SUMMIT,SECT_ASCENT} from './WorldLayout';
import {ascentDistance} from './MountainLayout';
import {createMountainWater} from './MountainWater';
import {artGeometry as g,artMaterials as m,bake,mesh,seededRandom} from '../assets/ArtKit';
import {shorelineAt} from './CoastMath';
import {createCoastalEnvironment} from './CoastalEnvironment';
import {createCoastalRocks} from './CoastalRocks';
import {createNaturalTerrain} from './NaturalTerrain';
import {createNaturalForest} from './NaturalForest';
import {createLimestoneOutcrops} from './LimestoneOutcrops';
import {createGeologicalEscarpments} from './GeologicalEscarpments';
import {townDistance} from './TownLayout';
import {createTown} from './Town';
import {createMainHallModel,mainHallCollision} from './MainHall';
import type {BodyCollisionMesh} from '../core/StaticBodyCollision';
import {createSectSite} from './SectSite';
import {sectPathDistance} from './SectLayout';
import {terrainHeight,terrainSurfaceHeight,protectedPoint,rockSurfaceExposure,roadDistance,safeAreas} from './TerrainField';
export {terrainHeight,terrainSurfaceHeight,protectedPoint,rockSurfaceExposure} from './TerrainField';

type Point = {x:number;z:number};
const shrines=MERIDIAN_SITES,routes=VALLEY_ROUTES;

function lantern(group: THREE.Group, x: number, y: number, z: number) {
  mesh(group, g.cylinder, 'wood', [x, y + 1.0, z], [0.12, 2, 0.12]);
  mesh(group, g.cylinder, 'lantern', [x, y + 2.12, z], [0.31, 0.6, 0.31]);
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    mesh(group, g.box, 'gold', [x + Math.sin(angle) * 0.3, y + 2.12, z + Math.cos(angle) * 0.3], [0.028, 0.64, 0.028]);
  }
  for (const h of [1.8, 2.44]) mesh(group, g.cylinder, 'roof', [x, y + h, z], [0.39, 0.1, 0.39]);
  mesh(group, g.cone, 'roof', [x, y + 2.57, z], [0.48, 0.22, 0.48]);
}

function temple(root: THREE.Group, group: THREE.Group, colliders: { x: number; z: number; r: number }[], walls: THREE.Box3[], bodySolids: BodyCollisionMesh[], cameraOccluders: THREE.Box3[]) {
  const floor = SECT_SUMMIT.height, cz = SECT_SUMMIT.z;
  const hall = createMainHallModel(); hall.position.set(0, floor, cz); root.add(hall);
  const collision = mainHallCollision(floor, cz);
  colliders.push(...collision.colliders); walls.push(...collision.walls); cameraOccluders.push(...collision.cameraOccluders);
  bodySolids.push(...collision.bodySolids);
  for (const sx of [-1, 1]) lantern(group, sx * 5.7, floor, 22.3);
}

function groundTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'); if (!ctx) return null;
  const random = seededRandom(74231);
  ctx.fillStyle = '#ecefe5'; ctx.fillRect(0, 0, 256, 256);
  // Nine translated copies make the wide marks continuous across tiled edges.
  for (let i = 0; i < 28; i++) {
    const x = random() * 256, y = random() * 256, radius = 12 + random() * 33;
    for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) {
      const gradient = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius);
      gradient.addColorStop(0, 'rgba(76,91,66,0.15)'); gradient.addColorStop(1, 'rgba(76,91,66,0)');
      ctx.fillStyle = gradient; ctx.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2);
    }
  }
  for (let i = 0; i < 1900; i++) {
    const x = random() * 256, y = random() * 256, value = 115 + Math.floor(random() * 80);
    ctx.fillStyle = `rgba(${value},${value + 5},${value - 5},0.35)`;
    ctx.fillRect(x, y, 0.6 + random() * 1.4, 0.5 + random() * 1.1);
    if (i % 7 === 0) {
      ctx.strokeStyle = 'rgba(79,104,74,0.19)'; ctx.lineWidth = 0.7; ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + 1.5 + random() * 2, y - 3 - random() * 4); ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  texture.name = 'OriginalValleyGritAndGrass'; return texture;
}

/** Flat inlaid paving follows the existing height field, so it adds no collision or step. */
function createGroundInlays(root: THREE.Group) {
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [];
  const tones = [0x647b72, 0x72877b, 0x87988a, 0x819285, 0x6e8479].map((hex) => new THREE.Color(hex));
  const addQuad = (points: Point[], color: THREE.Color) => {
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const p = points[index]; positions.push(p.x, terrainHeight(p.x, p.z) + 0.025, p.z);
      colors.push(color.r, color.g, color.b); uvs.push(p.x / 6, p.z / 6);
    }
  };
  const areas = [{ x: 0, z: 29, radius: 10.5, rings: 4 }, ...shrines.map((p) => ({ ...p, radius: 8, rings: 4 })), { x: 0, z: -280, radius: 22.2, rings: 9 }];
  for (const [areaIndex, area] of areas.entries()) {
    for (let ring = 0; ring < area.rings; ring++) {
      const inner = ring / area.rings * area.radius + 0.028, outer = (ring + 1) / area.rings * area.radius - 0.028;
      const segments = Math.max(12, (ring + 1) * 8), phase = ring % 2 * Math.PI / segments;
      for (let segment = 0; segment < segments; segment++) {
        const a = segment / segments * Math.PI * 2 + phase + 0.002, b = (segment + 1) / segments * Math.PI * 2 + phase - 0.002;
        const point = (angle: number, radius: number): Point => ({ x: area.x + Math.sin(angle) * radius, z: area.z + Math.cos(angle) * radius });
        addQuad([point(a, inner), point(a, outer), point(b, outer), point(b, inner)], tones[(segment * 3 + ring + areaIndex) % tones.length]);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.computeVertexNormals();
  const grit = groundTexture();
  const paving = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, map: grit, roughness: 0.94 }));
  paving.name = 'OriginalMeridianRadialPaving'; paving.receiveShadow = true; root.add(paving);

  // One shared painted lotus seal is used for both the school and its meridian plazas.
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.translate(256, 256); ctx.strokeStyle = '#b6ab78'; ctx.lineWidth = 3;
  for (const radius of [66, 201, 214, 232]) { ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke(); }
  for (let petal = 0; petal < 12; petal++) {
    ctx.save(); ctx.rotate(petal / 12 * Math.PI * 2); ctx.beginPath(); ctx.moveTo(0, -190);
    ctx.bezierCurveTo(60, -117, 32, -55, 0, -31); ctx.bezierCurveTo(-32, -55, -60, -117, 0, -190); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -211); ctx.lineTo(0, -230); ctx.stroke(); ctx.restore();
  }
  for (let i = 0; i < 8; i++) {
    ctx.save(); ctx.rotate(i * Math.PI / 4); ctx.lineWidth = 5;
    for (let line = 0; line < 3; line++) {
      ctx.beginPath(); ctx.moveTo(-19, -241 + line * 8); ctx.lineTo(line === 1 ? -4 : 19, -241 + line * 8); ctx.stroke();
      if (line === 1) { ctx.beginPath(); ctx.moveTo(4, -241 + line * 8); ctx.lineTo(19, -241 + line * 8); ctx.stroke(); }
    }
    ctx.restore();
  }
  const sealTexture = new THREE.CanvasTexture(canvas); sealTexture.colorSpace = THREE.SRGBColorSpace; sealTexture.anisotropy = 8;
  sealTexture.name = 'OriginalTwelvePetalMeridianSeal';
  const sealMaterial = new THREE.MeshStandardMaterial({ map: sealTexture, transparent: true, opacity: 0.71, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  sealMaterial.name = 'original_lotus_inlay';
  const seals = new THREE.Group(); seals.name = 'OriginalLotusGroundInlays';
  for (const area of areas) {
    const radius = area.z === -280 ? 11 : area.radius * 0.65;
    const sealGeometry = new THREE.PlaneGeometry(radius * 2, radius * 2, 8, 8); sealGeometry.rotateX(-Math.PI / 2);
    const vertices = sealGeometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) vertices.setY(i, terrainHeight(area.x + vertices.getX(i), area.z + vertices.getZ(i)) + 0.034);
    sealGeometry.computeVertexNormals();
    const seal = new THREE.Mesh(sealGeometry, sealMaterial); seal.position.set(area.x, 0, area.z); seals.add(seal);
  }
  const mergedSeals = bake(seals); mergedSeals.traverse((part) => { if (part instanceof THREE.Mesh) { part.castShadow = false; part.receiveShadow = true; } }); root.add(mergedSeals);
}

function surfaceTexture() {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const random = seededRandom(231);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2400; i++) { const shade = 175 + Math.floor(random() * 65); ctx.fillStyle = `rgb(${shade},${shade},${shade})`; ctx.fillRect(random() * 128, random() * 128, 1 + random() * 2, 1 + random() * 2); }
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(2, 2); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  m.stone.map = texture; m.paleStone.map = texture;
  return texture;
}

export function createWorld(scene: THREE.Scene,moonTexture:THREE.Texture) {
  const root = new THREE.Group(); root.name = 'YunhaiOriginalWorld'; scene.add(root);
  scene.fog = new THREE.FogExp2(0xb4cbd6, 0.00075);
  createNaturalTerrain(root,terrainSurfaceHeight,(x,z)=>Math.min(roadDistance(x,z),ascentDistance(x,z),sectPathDistance(x,z)));
  const coastal = createCoastalEnvironment(root,terrainHeight,moonTexture);
  const mountainWater=createMountainWater(root,terrainHeight,coastal.waterUniforms);
  createGroundInlays(root);
  const texture = surfaceTexture();
  const colliders: { x: number; z: number; r: number }[] = [];
  const walls: THREE.Box3[] = [], cameraOccluders: THREE.Box3[] = [];
  const bodySolids: BodyCollisionMesh[] = [];
  const sect=createSectSite(root,terrainHeight);walls.push(...sect.walls);cameraOccluders.push(...sect.cameraOccluders);bodySolids.push(...sect.bodySolids);
  const town=createTown(root);walls.push(...town.walls);cameraOccluders.push(...town.cameraOccluders);
  const rocks=createCoastalRocks(root,terrainHeight,shorelineAt);
  colliders.push(...rocks.colliders); cameraOccluders.push(...rocks.cameraOccluders);
  // Solid rock bounds also constrain low sword flight; above the actual crown is free.
  walls.push(...rocks.cameraOccluders);
  const architecture = new THREE.Group(); temple(root, architecture, colliders, walls, bodySolids, cameraOccluders);
  // Meridian plazas feature low perimeter stones and gateway pillars, leaving centers free.
  for (const [i, shrine] of shrines.entries()) {
    const h = terrainHeight(shrine.x, shrine.z);
    for (let j = 0; j < 12; j++) {
      const angle = j / 12 * Math.PI * 2;
      mesh(architecture, g.box, 'paleStone', [shrine.x + Math.sin(angle) * 8.5, h + 0.14, shrine.z + Math.cos(angle) * 8.5], [1.7, 0.28, 0.7], [0, angle, 0]);
    }
    for (const side of [-1, 1]) {
      const px = shrine.x + side * 7.3, pz = shrine.z - 5;
      mesh(architecture, g.box, 'stone', [px, h + 1.4, pz], [1.0, 2.8 + i * 0.5, 1.0]);
      mesh(architecture, g.ico, 'jade', [px, h + 3.1 + i * 0.5, pz], [0.7, 0.7, 0.7]);
      lantern(architecture, shrine.x + side * 5.5, h, shrine.z + 5);
      colliders.push({ x: px, z: pz, r: 0.7 });
    }
  }
  const arenaHeight = terrainHeight(0, -280);
  for (let i = 0; i < 32; i++) {
    const angle = i / 32 * Math.PI * 2;
    mesh(architecture, g.box, 'paleStone', [Math.sin(angle) * 23, arenaHeight + 0.05, -280 + Math.cos(angle) * 23], [1.8, 0.17, 0.62], [0, angle, 0]);
    if (i % 8 === 0) {
      mesh(architecture, g.box, 'stone', [Math.sin(angle) * 25.2, arenaHeight + 2, -280 + Math.cos(angle) * 25.2], [1.4, 4, 1.4]);
      mesh(architecture, g.ico, 'spirit', [Math.sin(angle) * 25.2, arenaHeight + 4.4, -280 + Math.cos(angle) * 25.2], [0.4, 0.75, 0.4]);
    }
  }
  // Path paving and practical lanterns subtly orient navigation without obstructing travel.
  for (const route of [...routes,SECT_ASCENT]) {
    let station=0,nextStone=0,stoneIndex=0;
    for(let segment=1;segment<route.length;segment++){
      const a=route[segment-1],b=route[segment],length=Math.hypot(b.x-a.x,b.z-a.z);
      for(;nextStone<=station+length;nextStone+=4,stoneIndex++){
        const t=(nextStone-station)/length,x=THREE.MathUtils.lerp(a.x,b.x,t),z=THREE.MathUtils.lerp(a.z,b.z,t);
        if(townDistance(x,z)===0||Math.hypot(x,z-14)<20||safeAreas.some(area=>area.z<-50&&Math.hypot(x-area.x,z-area.z)<8))continue;
        const stoneX=x+Math.sin(stoneIndex*2.8)*.17;
        const stone=mesh(architecture,g.box,'paleStone',[stoneX,terrainHeight(stoneX,z)+.025,z],[1.5,.045,.95],[0,-Math.atan2(b.x-a.x,b.z-a.z)+Math.sin(stoneIndex)*.08,0]);
        const normal=new THREE.Vector3(terrainHeight(stoneX-.4,z)-terrainHeight(stoneX+.4,z),.8,terrainHeight(stoneX,z-.4)-terrainHeight(stoneX,z+.4)).normalize();
        stone.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),normal));
        if(stoneIndex%7===2){
          const angle=Math.atan2(b.x-a.x,b.z-a.z),px=x+Math.cos(angle)*5.3,pz=z-Math.sin(angle)*5.3;
          lantern(architecture,px,terrainHeight(px,pz),pz);
        }
      }
      station+=length;
    }
  }
  root.add(bake(architecture));
  const forest = createNaturalForest(root,terrainHeight,protectedPoint);
  colliders.push(...forest.colliders);
  cameraOccluders.push(...forest.cameraOccluders);
  const outcrops=createLimestoneOutcrops(root,terrainSurfaceHeight,protectedPoint,forest.colliders);walls.push(...outcrops.walls);cameraOccluders.push(...outcrops.cameraOccluders);
  const escarpments=createGeologicalEscarpments(root,terrainSurfaceHeight,rockSurfaceExposure);
  bodySolids.push(...escarpments.bodySolids);
  const weatherOccluders=cameraOccluders.slice();for(const bounds of escarpments.rainOccluders)weatherOccluders.push(bounds);
  const waterMaterial = new THREE.ShaderMaterial({ transparent: true, uniforms: { uTime: { value: 0 },uDay:{value:1} }, vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: 'varying vec2 vUv; uniform float uTime,uDay; void main(){float rip=sin(vUv.x*80.0+uTime*0.6)*sin(vUv.y*65.0-uTime*0.45)*0.035;vec3 col=vec3(0.22,0.5,0.48)+rip;gl_FragColor=vec4(col*(.12+uDay*.88),0.88);}' });
  const lake = new THREE.Mesh(new THREE.CircleGeometry(25, 56), waterMaterial); lake.rotation.x = -Math.PI / 2; lake.scale.x = 1.25; lake.position.set(-160, -0.6, 110); root.add(lake);
  const ripple = new THREE.Mesh(new THREE.RingGeometry(20, 20.05, 80), new THREE.MeshBasicMaterial({ color: 0xb7d1be, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })); ripple.rotation.x = -Math.PI / 2; ripple.position.copy(lake.position).y += 0.02; ripple.scale.x = 1.25; root.add(ripple);
  const pendingAssets=new Set<Promise<unknown>>();
  root.traverse(o=>{if(o instanceof THREE.Mesh)for(const material of Array.isArray(o.material)?o.material:[o.material]){
    const ready=(material as THREE.Material&{rockAssetsReady?:Promise<unknown>}).rockAssetsReady;if(ready)pendingAssets.add(ready);
  }});
  const assetsReady=Promise.all(pendingAssets);assetsReady.catch(()=>{/* Test hooks await and report failures. */});
  let disposed = false;
  return {
    sky: coastal.sky,
    assetsReady,
    setWeather(a:Parameters<typeof coastal.setWeather>[0],time:number){coastal.setWeather(a,time);waterMaterial.uniforms.uDay.value=a.day;},
    colliders,
    walls,
    bodySolids,
    cameraOccluders,
    cameraRockFaces:escarpments.cameraMeshes,
    prepareRender:forest.prepareRender,
    weatherOccluders,
    update(_dt: number, time: number) {
      forest.update(time);
      waterMaterial.uniforms.uTime.value = time;
      mountainWater.update(time);
      coastal.update(time);
    },
    dispose() {
      if (disposed) return; disposed = true;
      coastal.dispose();
      const sharedGeometry = new Set<THREE.BufferGeometry>(Object.values(g)), sharedMaterial = new Set<THREE.Material>(Object.values(m));
      const disposedGeometry = new Set<THREE.BufferGeometry>(), disposedMaterial = new Set<THREE.Material>(), disposedTexture = new Set<THREE.Texture>();
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        if(object instanceof THREE.InstancedMesh)object.dispose();
        if(object.customDepthMaterial&&!disposedMaterial.has(object.customDepthMaterial)){object.customDepthMaterial.dispose();disposedMaterial.add(object.customDepthMaterial);}
        if (!sharedGeometry.has(object.geometry) && !disposedGeometry.has(object.geometry)) { object.geometry.dispose(); disposedGeometry.add(object.geometry); }
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) if (!sharedMaterial.has(material) && !disposedMaterial.has(material)) {
          for(const value of Object.values(material))if(value instanceof THREE.Texture&&!disposedTexture.has(value)){value.dispose();disposedTexture.add(value);}
          material.dispose(); disposedMaterial.add(material);
        }
      });
      texture?.dispose(); m.stone.map = null; m.paleStone.map = null;
      root.removeFromParent();
    },
  };
}

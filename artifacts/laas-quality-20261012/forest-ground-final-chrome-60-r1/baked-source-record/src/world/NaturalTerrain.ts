import * as THREE from 'three';
import {createNaturalLandMaterial} from './NaturalLandMaterial';
export {createRockSurfaceMaterial} from './NaturalLandMaterial';
import {woodlandCover} from './ForestLayout';
import {TERRAIN_BOUNDS} from './WorldLayout';

// Ground detail depends on horizontal proximity, including a player on a high summit.
const terrainCamera=new THREE.PerspectiveCamera();terrainCamera.matrixAutoUpdate=false;terrainCamera.matrixWorldAutoUpdate=false;
class TerrainLOD extends THREE.LOD {
  override update(camera:THREE.Camera){
    terrainCamera.matrixWorld.copy(camera.matrixWorld);terrainCamera.matrixWorld.elements[13]=0;
    terrainCamera.zoom=camera instanceof THREE.PerspectiveCamera||camera instanceof THREE.OrthographicCamera?camera.zoom:1;
    super.update(terrainCamera);
  }
}

// Original seeded gradient noise. Terrain and decorations use independent seeds.
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
function gradient(ix: number, iz: number, x: number, z: number) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ 74291;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  const a = ((h >>> 0) / 4294967296) * Math.PI * 2;
  return Math.cos(a) * x + Math.sin(a) * z;
}
export function landNoise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), dx = x - ix, dz = z - iz;
  const u = fade(dx), v = fade(dz);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(gradient(ix, iz, dx, dz), gradient(ix + 1, iz, dx - 1, dz), u),
    THREE.MathUtils.lerp(gradient(ix, iz + 1, dx, dz - 1), gradient(ix + 1, iz + 1, dx - 1, dz - 1), u), v) * 1.5;
}

/** Low-frequency ridges plus diminishing detail; no imported demo heightmap. */
export function naturalRelief(x: number, z: number) {
  const wx = x + landNoise(x * .008, z * .008) * 28, wz = z + landNoise(x * .009 + 4, z * .009) * 24;
  let detail = 0, amplitude = 8, frequency = .015;
  for (let i = 0; i < 4; i++) { detail += landNoise(wx * frequency + i * 9, wz * frequency - i * 13) * amplitude; frequency *= 2; amplitude *= .43; }
  return detail;
}

/** New hill detail is modest: the authored ridges establish the mountain scale. */
export function mountainRelief(x:number,z:number){
  const wx=x+landNoise(x*.007+21,z*.009-12)*19,wz=z+landNoise(x*.008-8,z*.006+17)*17;
  return landNoise(wx*.016+47,wz*.014-19)*5.8+landNoise(wx*.041-7,wz*.039+31)*2.2+landNoise(wx*.10+5,wz*.11-4)*.55;
}

function sharedNormals(geometry:THREE.BufferGeometry,heightAt:(x:number,z:number)=>number){
  const p=geometry.getAttribute('position'),normals:number[]=[],n=new THREE.Vector3(),e=.25;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i);
    n.set(heightAt(x-e,z)-heightAt(x+e,z),2*e,heightAt(x,z-e)-heightAt(x,z+e)).normalize();normals.push(n.x,n.y,n.z);
  }
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
}

// Rock at a cliff foot continues through the graded shoulder. Sample the
// uphill rock mass rather than hard-cutting its material at a 1m skin cell.
const APRON_OFFSETS=[[-3,0],[3,0],[0,-3],[0,3],[-2.1,-2.1],[2.1,-2.1],[-2.1,2.1],[2.1,2.1]] as const;
function cliffApron(x:number,z:number,y:number,heightAt:(x:number,z:number)=>number){
  if(z>=119||y<=14)return 0;
  let rise=0;
  for(const [dx,dz] of APRON_OFFSETS)rise=Math.max(rise,heightAt(x+dx,z+dz)-y);
  return THREE.MathUtils.smoothstep(rise,2.2,6.5)*THREE.MathUtils.smoothstep(y,14,22)*(1-THREE.MathUtils.smoothstep(z,95,119));
}

export function createNaturalTerrain(root: THREE.Group, heightAt: (x: number, z: number) => number, roadDistance: (x: number, z: number) => number) {
  const material = createNaturalLandMaterial();
  // 1m near terrain and 2m distant terrain share normals, materials and spatial culling.
  for (let tz = TERRAIN_BOUNDS.minZ; tz < TERRAIN_BOUNDS.maxZ; tz += 80) for (let tx = TERRAIN_BOUNDS.minX; tx < TERRAIN_BOUNDS.maxX; tx += 80) {
    const lod=new TerrainLOD();lod.position.set(tx+40,0,tz+40);lod.name=`NaturalTerrainLOD_${tx}_${tz}`;
    for(const segments of [80,40]){
    const geometry = new THREE.PlaneGeometry(80, 80, segments, segments); geometry.rotateX(-Math.PI / 2); geometry.translate(tx + 40, 0, tz + 40);
    const p = geometry.getAttribute('position'), colors: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, heightAt(x,z) - (Math.abs(x)<14&&Math.abs(z-7)<13 ? .16 : 0));
      const path = 1 - THREE.MathUtils.smoothstep(roadDistance(x,z), 4.5, 7);
      const plaza = (1 - THREE.MathUtils.smoothstep(Math.hypot(x,z-14),26,36)) * .65;
      colors.push(Math.max(path,plaza),woodlandCover(x,z)*(1-Math.max(path,plaza)),cliffApron(x,z,heightAt(x,z),heightAt));
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));sharedNormals(geometry,heightAt);
    geometry.translate(-tx-40,0,-tz-40);
    const tile = new THREE.Mesh(geometry,material);tile.receiveShadow=true;tile.name=`NaturalTerrainChunk_${tx}_${tz}_${segments}`;lod.addLevel(tile,segments===80?0:70);
    }root.add(lod);
  }
  // One continuous mountain belt beyond the playable map, replacing individual cylindrical peaks.
  // Matching 2m boundary vertices close the seam; outer intervals grow with distance.
  const xs:number[]=[];
  for(let x=-1400;x<TERRAIN_BOUNDS.minX;x+=20)xs.push(x);
  for(let x=TERRAIN_BOUNDS.minX;x<=TERRAIN_BOUNDS.maxX;x+=2)xs.push(x);
  for(let x=TERRAIN_BOUNDS.maxX+20;x<=1400;x+=20)xs.push(x);
  const zs:number[]=[-1450];
  for(let z=-1440;z<TERRAIN_BOUNDS.minZ;z+=20)zs.push(z);
  for(let z=TERRAIN_BOUNDS.minZ;z<=136;z+=2)zs.push(z);
  const backdropHeight=(x:number,z:number)=>{
    const outside=Math.max(TERRAIN_BOUNDS.minX-x,x-TERRAIN_BOUNDS.maxX,TERRAIN_BOUNDS.minZ-z,0);
    const blend=THREE.MathUtils.smoothstep(outside,0,150);
    const ridge=1-Math.abs(landNoise(x*.003+z*.0014+19,z*.0042-x*.0006-31));
    const envelope=Math.exp(-(((z+650)/630)**2))*(.45+THREE.MathUtils.smoothstep(Math.abs(x),160,550)*.55);
    // Three distinct far silhouettes frame the school, rather than one uniform belt.
    const summit=(cx:number,cz:number,rx:number,rz:number,high:number)=>Math.exp(-(((x-cx)/rx)**2+((z-cz)/rz)**2))*high;
    const folded=1-Math.abs(landNoise(x*.009+z*.004+41,z*.007-x*.002-18));
    const drainage=Math.abs(landNoise(x*.014+z*.007,z*.009+7));
    const mountain=24+envelope*(45+Math.pow(ridge,1.5)*80+Math.pow(folded,3)*28-drainage*18)
      +summit(-360,-480,145,200,135)+summit(20,-570,110,235,205)
      +summit(360,-450,160,210,140)+landNoise(x*.012+37,z*.011-9)*24+landNoise(x*.014-5,z*.012+14)*9;
    const coastalTaper=1-THREE.MathUtils.smoothstep(z,50,136);
    return THREE.MathUtils.lerp(heightAt(x,z),mountain,blend*coastalTaper);
  };
  // The hole contains no vertices. Reuse only corners referenced by the three
  // outer strips, rather than allocating an increasingly large hidden grid.
  const positions:number[]=[],colors:number[]=[],normals:number[]=[],indices:number[]=[];
  const vertexMap=new Map<number,number>(),normal=new THREE.Vector3(),e=.25;
  const vertex=(i:number,j:number)=>{
    const key=j*xs.length+i,existing=vertexMap.get(key);if(existing!==undefined)return existing;
    const x=xs[i],z=zs[j],index=positions.length/3;
    positions.push(x,backdropHeight(x,z),z);colors.push(0,0,0);
    // Analytic height samples give identical normals on the playable boundary.
    const isBoundary=((x===TERRAIN_BOUNDS.minX||x===TERRAIN_BOUNDS.maxX)&&z>=TERRAIN_BOUNDS.minZ)
      ||(z===TERRAIN_BOUNDS.minZ&&x>=TERRAIN_BOUNDS.minX&&x<=TERRAIN_BOUNDS.maxX);
    const sample=isBoundary?heightAt:backdropHeight;
    normal.set(sample(x-e,z)-sample(x+e,z),2*e,sample(x,z-e)-sample(x,z+e)).normalize();
    normals.push(normal.x,normal.y,normal.z);vertexMap.set(key,index);return index;
  };
  for(let j=0;j<zs.length-1;j++)for(let i=0;i<xs.length-1;i++){
    if(xs[i+1]>TERRAIN_BOUNDS.minX&&xs[i]<TERRAIN_BOUNDS.maxX&&zs[j+1]>TERRAIN_BOUNDS.minZ)continue;
    const a=vertex(i,j),b=vertex(i,j+1),c=vertex(i+1,j),d=vertex(i+1,j+1);
    indices.push(a,b,c,c,b,d);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setIndex(indices);
  const backdropMaterial=material.clone();backdropMaterial.onBeforeCompile=shader=>{
    material.onBeforeCompile(shader,undefined as unknown as THREE.WebGLRenderer);
    // The central hole is in the index buffer, so there is no fragment-cut boundary gap.
  };
  backdropMaterial.customProgramCacheKey=()=> 'original-laas-layered-mountain-belt-v5';
  const backdrop=new THREE.Mesh(geometry,backdropMaterial);backdrop.name='ContinuousNaturalMountainBelt';root.add(backdrop);
}

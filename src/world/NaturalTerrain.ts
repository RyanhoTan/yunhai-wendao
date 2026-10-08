import * as THREE from 'three';
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
  return landNoise(wx*.016+47,wz*.014-19)*3.2+landNoise(wx*.041-7,wz*.039+31)*1.35+landNoise(wx*.10+5,wz*.11-4)*.34;
}

const LAND_GLSL = `
float landHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float landNoise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(landHash(i),landHash(i+vec2(1,0)),f.x),mix(landHash(i+vec2(0,1)),landHash(i+vec2(1,1)),f.x),f.y);}
float landFbm(vec2 p){return landNoise2(p)*.57+landNoise2(p*2.03+7.0)*.27+landNoise2(p*4.07-4.0)*.16;}
`;

function landscapeMaterial() {
  const material = new THREE.MeshStandardMaterial({ roughness: .97, vertexColors: true });
  material.name = 'OriginalSlopeHeightBiomeMaterial';
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vLandPosition;varying vec3 vLandNormal;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvLandPosition=(modelMatrix*vec4(position,1.0)).xyz;vLandNormal=normalize(mat3(modelMatrix)*normal);');
    shader.fragmentShader = `varying vec3 vLandPosition;varying vec3 vLandNormal;${LAND_GLSL}\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 lp=vLandPosition;vec3 ln=normalize(vLandNormal);float slope=1.0-abs(ln.y);
      float patches=landFbm(lp.xz*.046),grit=landNoise2(lp.xz*6.0),soil=landFbm(lp.xz*.6);
      float nearDetail=1.0-smoothstep(24.0,105.0,length(vViewPosition));
      vec3 grass=mix(vec3(.072,.145,.064),vec3(.19,.285,.105),patches);
      grass*=.78+soil*.30+(grit-.5)*.12*nearDetail;
      float closeDetail=landFbm(lp.xz*1.8);grass=mix(grass,grass*vec3(.83,.91,.69),smoothstep(.59,.78,closeDetail)*.24);
      vec3 weights=pow(abs(ln),vec3(4.0));weights/=max(.001,weights.x+weights.y+weights.z);
      float rockNoise=landFbm(lp.zy*.17)*weights.x+landFbm(lp.xz*.17)*weights.y+landFbm(lp.xy*.17)*weights.z;
      float fractures=landFbm(lp.xz*.31+vec2(lp.y*.23,-lp.y*.19)),crevice=pow(1.0-abs(fractures*2.0-1.0),16.0);
      vec3 rock=mix(vec3(.15,.18,.17),vec3(.32,.33,.27),rockNoise)*(.94-crevice*.15+(grit-.5)*.07*nearDetail);
      float moss=smoothstep(.48,.72,soil)*(1.0-smoothstep(.24,.64,slope))*(1.0-smoothstep(65.0,145.0,lp.y));
      rock=mix(rock,vec3(.095,.16,.075),moss*.27);
      float stony=smoothstep(.23,.58,slope)+smoothstep(52.0,115.0,lp.y)*.50;
      vec3 biome=mix(grass,rock,clamp(stony,0.0,1.0));
      float snow=smoothstep(205.0,270.0,lp.y+patches*30.0)*(1.0-smoothstep(.18,.48,slope));
      biome=mix(biome,vec3(.68,.70,.66),snow*.83);
      float forest=vColor.g*(1.0-smoothstep(.20,.50,slope));
      vec3 humus=mix(vec3(.085,.072,.041),vec3(.16,.13,.064),soil);
      humus=mix(humus,vec3(.07,.14,.061),smoothstep(.51,.72,closeDetail)*.55);
      biome=mix(biome,humus,forest*.68);
      vec3 trail=mix(vec3(.235,.197,.125),vec3(.365,.302,.185),soil)*(.96+(grit-.5)*.06*nearDetail);
      float road=vColor.r;
      diffuseColor.rgb=mix(biome,trail,road);
      float beach=smoothstep(119.0,136.0,lp.z);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.58,.45,.30),beach);
      if(lp.z>136.0)discard;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      normal=normalize(normal+mat3(viewMatrix)*vec3((grit-.5)*.045,0.0,(soil-.5)*.045)*nearDetail);`);
  };
  material.customProgramCacheKey = () => 'original-woodland-meadow-rock-surface-v2';
  return material;
}

function sharedNormals(geometry:THREE.BufferGeometry,heightAt:(x:number,z:number)=>number){
  const p=geometry.getAttribute('position'),normals:number[]=[],n=new THREE.Vector3(),e=.25;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i);
    n.set(heightAt(x-e,z)-heightAt(x+e,z),2*e,heightAt(x,z-e)-heightAt(x,z+e)).normalize();normals.push(n.x,n.y,n.z);
  }
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
}

export function createNaturalTerrain(root: THREE.Group, heightAt: (x: number, z: number) => number, roadDistance: (x: number, z: number) => number) {
  const material = landscapeMaterial();
  // 1m near terrain and 2m distant terrain share normals, materials and spatial culling.
  for (let tz = TERRAIN_BOUNDS.minZ; tz < TERRAIN_BOUNDS.maxZ; tz += 80) for (let tx = TERRAIN_BOUNDS.minX; tx < TERRAIN_BOUNDS.maxX; tx += 80) {
    const lod=new TerrainLOD();lod.position.set(tx+40,0,tz+40);lod.name=`NaturalTerrainLOD_${tx}_${tz}`;
    for(const segments of [80,40]){
    const geometry = new THREE.PlaneGeometry(80, 80, segments, segments); geometry.rotateX(-Math.PI / 2); geometry.translate(tx + 40, 0, tz + 40);
    const p = geometry.getAttribute('position'), colors: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, heightAt(x,z) - (Math.abs(x)<14&&Math.abs(z-7)<13 ? .16 : 0));
      const path = 1 - THREE.MathUtils.smoothstep(roadDistance(x,z), 3.5, 7);
      const plaza = (1 - THREE.MathUtils.smoothstep(Math.hypot(x,z-14),26,36)) * .65;
      colors.push(Math.max(path,plaza),woodlandCover(x,z)*(1-Math.max(path,plaza)),0);
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));sharedNormals(geometry,heightAt);
    geometry.translate(-tx-40,0,-tz-40);
    const tile = new THREE.Mesh(geometry,material);tile.receiveShadow=true;tile.name=`NaturalTerrainChunk_${tx}_${tz}_${segments}`;lod.addLevel(tile,segments===80?0:70);
    }root.add(lod);
  }
  // One continuous mountain belt beyond the playable map, replacing individual cylindrical peaks.
  // Matching 2m boundary vertices close the seam; outer intervals grow with distance.
  const xs=[-1400,-1200,-1000,-800,-720,-640,-600].filter(x=>x<TERRAIN_BOUNDS.minX);
  for(let x=TERRAIN_BOUNDS.minX;x<=TERRAIN_BOUNDS.maxX;x+=2)xs.push(x);
  xs.push(...[360,400,480,640,800,1000,1200,1400].filter(x=>x>TERRAIN_BOUNDS.maxX));
  const zs=[-1450,-1200,-1000,-800,-640,-480,-400,-360];
  for(let z=TERRAIN_BOUNDS.minZ;z<=136;z+=2)zs.push(z);
  const backdropHeight=(x:number,z:number)=>{
    const outside=Math.max(TERRAIN_BOUNDS.minX-x,x-TERRAIN_BOUNDS.maxX,TERRAIN_BOUNDS.minZ-z,0);
    const blend=THREE.MathUtils.smoothstep(outside,0,150);
    const ridge=1-Math.abs(landNoise(x*.003+z*.0014+19,z*.0042-x*.0006-31));
    const envelope=Math.exp(-(((z+650)/630)**2))*(.45+THREE.MathUtils.smoothstep(Math.abs(x),160,550)*.55);
    // Three distinct far silhouettes frame the school, rather than one uniform belt.
    const summit=(cx:number,cz:number,rx:number,rz:number,high:number)=>Math.exp(-(((x-cx)/rx)**2+((z-cz)/rz)**2))*high;
    const mountain=24+envelope*(60+Math.pow(ridge,1.5)*115)
      +summit(-360,-480,145,200,180)+summit(20,-570,110,235,275)
      +summit(360,-450,160,210,160)+mountainRelief(x*.52,z*.52)*2;
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
  backdropMaterial.customProgramCacheKey=()=> 'original-eroded-mountain-belt-v2';
  const backdrop=new THREE.Mesh(geometry,backdropMaterial);backdrop.name='ContinuousNaturalMountainBelt';root.add(backdrop);
}

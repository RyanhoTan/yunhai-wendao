import * as THREE from 'three';

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
      vec3 grass=mix(vec3(.13,.22,.055),vec3(.32,.40,.13),patches);
      grass*=.68+soil*.46+grit*.14;
      float closeDetail=landFbm(lp.xz*1.8);grass=mix(grass,grass*vec3(.74,.85,.52),smoothstep(.59,.78,closeDetail)*.30);
      vec3 weights=pow(abs(ln),vec3(4.0));weights/=max(.001,weights.x+weights.y+weights.z);
      float rockNoise=landFbm(lp.zy*.17)*weights.x+landFbm(lp.xz*.17)*weights.y+landFbm(lp.xy*.17)*weights.z;
      float strata=sin(lp.y*2.1+rockNoise*9.0),cracks=pow(max(0.0,-strata),10.0);
      vec3 rock=mix(vec3(.21,.23,.21),vec3(.44,.43,.35),rockNoise)*(.93-cracks*.13+grit*.05);
      float stony=smoothstep(.16,.42,slope)+smoothstep(42.0,90.0,lp.y)*.62;
      vec3 biome=mix(grass,rock,clamp(stony,0.0,1.0));
      float snow=smoothstep(205.0,270.0,lp.y+patches*30.0)*(1.0-smoothstep(.18,.48,slope));
      biome=mix(biome,vec3(.68,.70,.66),snow*.83);
      vec3 trail=mix(vec3(.27,.235,.16),vec3(.43,.37,.24),soil)*(.95+grit*.08);
      float road=vColor.r;
      diffuseColor.rgb=mix(biome,trail,road);
      float beach=smoothstep(119.0,136.0,lp.z);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.58,.45,.30),beach);
      if(lp.z>136.0)discard;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      normal=normalize(normal+mat3(viewMatrix)*vec3((grit-.5)*.065,0.0,(soil-.5)*.065));`);
  };
  material.customProgramCacheKey = () => 'original-natural-slope-height-biome-v1';
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
  for (let tz = -320; tz < 160; tz += 80) for (let tx = -320; tx < 320; tx += 80) {
    const lod=new THREE.LOD();lod.position.set(tx+40,0,tz+40);lod.name=`NaturalTerrainLOD_${tx}_${tz}`;
    for(const segments of [80,40]){
    const geometry = new THREE.PlaneGeometry(80, 80, segments, segments); geometry.rotateX(-Math.PI / 2); geometry.translate(tx + 40, 0, tz + 40);
    const p = geometry.getAttribute('position'), colors: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, heightAt(x,z) - (Math.abs(x)<14&&Math.abs(z-7)<13 ? .16 : 0));
      const path = 1 - THREE.MathUtils.smoothstep(roadDistance(x,z), 3.5, 7);
      const plaza = (1 - THREE.MathUtils.smoothstep(Math.hypot(x,z-14),26,36)) * .65;
      colors.push(Math.max(path,plaza),0,0);
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));sharedNormals(geometry,heightAt);
    geometry.translate(-tx-40,0,-tz-40);
    const tile = new THREE.Mesh(geometry,material);tile.receiveShadow=true;tile.name=`NaturalTerrainChunk_${tx}_${tz}_${segments}`;lod.addLevel(tile,segments===80?0:70);
    }root.add(lod);
  }
  // One continuous mountain belt beyond the playable map, replacing individual cylindrical peaks.
  // Matching 2m boundary vertices close the seam; outer intervals grow with distance.
  const xs=[-1400,-1200,-1000,-800,-640,-480,-400,-360];
  for(let x=-320;x<=320;x+=2)xs.push(x);
  xs.push(360,400,480,640,800,1000,1200,1400);
  const zs=[-1450,-1200,-1000,-800,-640,-480,-400,-360];
  for(let z=-320;z<=136;z+=2)zs.push(z);
  const positions:number[]=[],colors:number[]=[],indices:number[]=[];
  for(let j=0;j<zs.length;j++)for(let i=0;i<xs.length;i++){
    const x=xs[i],z=zs[j],outside=Math.max(Math.abs(x)-320,-z-320,0);
    const blend=THREE.MathUtils.smoothstep(outside,0,150);
    const ridge=1-Math.abs(landNoise(x*.004+19,z*.004-31));
    const envelope=Math.exp(-(((z+650)/630)**2))*(.45+THREE.MathUtils.smoothstep(Math.abs(x),160,550)*.55);
    const mountain=28+envelope*(65+ridge*145)+naturalRelief(x*.48,z*.48)*4;
    const coastalTaper=1-THREE.MathUtils.smoothstep(z,50,136);
    positions.push(x,THREE.MathUtils.lerp(heightAt(x,z),mountain,blend*coastalTaper),z);colors.push(0,0,0);
    if(i<xs.length-1&&j<zs.length-1&&(xs[i+1]<=-320||xs[i]>=320||zs[j+1]<=-320)){
      const a=j*xs.length+i,b=a+xs.length;indices.push(a,b,a+1,a+1,b,b+1);
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const backdropMaterial=material.clone();backdropMaterial.onBeforeCompile=shader=>{
    material.onBeforeCompile(shader,undefined as unknown as THREE.WebGLRenderer);
    // The central hole is in the index buffer, so there is no fragment-cut boundary gap.
  };
  backdropMaterial.customProgramCacheKey=()=> 'original-natural-mountain-belt-v1';
  const backdrop=new THREE.Mesh(geometry,backdropMaterial);backdrop.name='ContinuousNaturalMountainBelt';root.add(backdrop);
}

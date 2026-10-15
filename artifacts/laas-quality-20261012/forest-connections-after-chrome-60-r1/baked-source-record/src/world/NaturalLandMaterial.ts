import * as THREE from 'three';
import {loadForestFloorTextures,FOREST_FLOOR_GLSL,FOREST_FLOOR_COLOR,FOREST_FLOOR_NORMAL,FOREST_FLOOR_ROUGHNESS} from './ForestFloorMaterial';

const STONY_EXPRESSION='float stony=max(mix(smoothstep(.29,.68,slope),smoothstep(.18,.44,slope),geology),vColor.b*geology)+smoothstep(108.0,192.0,lp.y)*.42;';

const LAND_GLSL = `
uniform sampler2D uRockColor;uniform sampler2D uRockRoughness;uniform sampler2D uRockNormal;uniform float uRockReady;
// Two offset samples at incommensurate scales interrupt recognisable tiling.
vec4 rockTexture(sampler2D tex,vec2 uv){return mix(texture2D(tex,uv),texture2D(tex,uv*.617+vec2(.173,.619)),.37);}
vec3 rockTriplanar(sampler2D tex,vec3 point,vec3 weights){return rockTexture(tex,point.zy).rgb*weights.x+rockTexture(tex,point.xz).rgb*weights.y+rockTexture(tex,point.xy).rgb*weights.z;}
float landHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float landNoise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(landHash(i),landHash(i+vec2(1,0)),f.x),mix(landHash(i+vec2(0,1)),landHash(i+vec2(1,1)),f.x),f.y);}
float landFbm(vec2 p){return landNoise2(p)*.57+landNoise2(p*2.03+7.0)*.27+landNoise2(p*4.07-4.0)*.16;}
float rockFissure(vec2 p){
  vec2 cell=floor(p),f=fract(p);float nearest=8.0,second=8.0;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 q=vec2(float(x),float(y)),seed=cell+q;
    vec2 offset=vec2(landHash(seed),landHash(seed+vec2(17.0,-31.0)))*.72+.14;
    float distance=length(q+offset-f);
    if(distance<nearest){second=nearest;nearest=distance;}else second=min(second,distance);
  }
  return second-nearest;
}
vec3 landSurfaceNormal(vec3 viewPoint,vec3 baseNormal,float height){
  vec3 dx=dFdx(viewPoint),dy=dFdy(viewPoint),sx=cross(dy,baseNormal),sy=cross(baseNormal,dx);
  float determinant=dot(dx,sx);vec3 gradient=sx*dFdx(height)+sy*dFdy(height);
  return normalize(abs(determinant)*baseNormal-sign(determinant)*gradient);
}
`;

export function createNaturalLandMaterial(forestFloor=true) {
  const material = new THREE.MeshStandardMaterial({ roughness: .97, vertexColors: true });
  const pending:Promise<void>[]=[];
  // Keep all shader textures owned by the material for normal world teardown.
  const load=(name:string,color=false,directory='rock-face')=>{
    let texture:THREE.Texture;
    if(typeof document==='undefined')texture=new THREE.Texture();
    else {
      let resolve!:()=>void,reject!:(e:unknown)=>void;pending.push(new Promise<void>((yes,no)=>{resolve=yes;reject=no;}));
      texture=new THREE.TextureLoader().load(`${import.meta.env?.BASE_URL??'/'}assets/materials/${directory}/${name}`,()=>resolve(),undefined,e=>reject(e));
    }
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=8;
    if(color)texture.colorSpace=THREE.SRGBColorSpace;return texture;
  };
  const textures={rockColor:load('rock_face_diff_1k.jpg',true),rockRoughness:load('rock_face_rough_1k.jpg'),rockNormal:load('rock_face_nor_gl_1k.jpg')};
  const rockTasks=pending.slice();
  const floorTextures=forestFloor?loadForestFloorTextures(load):{forestFloorColor:textures.rockColor,forestFloorNormal:textures.rockNormal,forestFloorRoughness:textures.rockRoughness};
  const floorTasks=pending.slice(rockTasks.length);
  const rockReady={value:rockTasks.length?0:1},floorReady={value:forestFloor&&!floorTasks.length?1:0};
  const stoneGroup=Promise.all(rockTasks).then(()=>{rockReady.value=1;});
  const floorGroup=Promise.all(floorTasks).then(()=>{if(forestFloor)floorReady.value=1;});
  // Resolving world readiness also guarantees the shader flags have changed.
  const rockAssetsReady=Promise.all([stoneGroup,floorGroup]);rockAssetsReady.catch(()=>{/* QA retains the original rejection. */});
  Object.assign(material,{...textures,...floorTextures,rockAssetsReady});
  material.name = 'OriginalSlopeHeightBiomeMaterial';
  material.onBeforeCompile = shader => {
    shader.uniforms.uRockColor={value:textures.rockColor};shader.uniforms.uRockRoughness={value:textures.rockRoughness};shader.uniforms.uRockNormal={value:textures.rockNormal};
    shader.uniforms.uRockReady=rockReady;
    shader.uniforms.uForestFloorColor={value:floorTextures.forestFloorColor};shader.uniforms.uForestFloorNormal={value:floorTextures.forestFloorNormal};shader.uniforms.uForestFloorRoughness={value:floorTextures.forestFloorRoughness};shader.uniforms.uForestFloorEnabled=floorReady;
    shader.vertexShader = 'varying vec3 vLandPosition;varying vec3 vLandNormal;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 landPoint=vec4(position,1.0);vec3 landNormal=normal;
      #ifdef USE_INSTANCING
        mat3 landInstance=mat3(instanceMatrix);
        landNormal/=vec3(dot(landInstance[0],landInstance[0]),dot(landInstance[1],landInstance[1]),dot(landInstance[2],landInstance[2]));
        landNormal=landInstance*landNormal;landPoint=instanceMatrix*landPoint;
      #endif
      vLandPosition=(modelMatrix*landPoint).xyz;vLandNormal=normalize(mat3(modelMatrix)*landNormal);`);
    shader.fragmentShader = `varying vec3 vLandPosition;varying vec3 vLandNormal;${LAND_GLSL}${FOREST_FLOOR_GLSL}\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 lp=vLandPosition;vec3 ln=normalize(vLandNormal);vec3 faceNormal=normalize(cross(dFdx(lp),dFdy(lp)));float slope=max(1.0-abs(ln.y),1.0-abs(faceNormal.y));
      float patches=landFbm(lp.xz*.046),grit=landNoise2(lp.xz*6.0),soil=landFbm(lp.xz*.6),macro=landFbm(lp.xz*.009);
      float geology=1.0-smoothstep(95.0,119.0,lp.z);
      float nearDetail=1.0-smoothstep(24.0,105.0,length(vViewPosition));
      vec3 grass=mix(vec3(.050,.108,.028),vec3(.16,.205,.064),patches*.66+macro*.34);
      grass*=.80+soil*.34+(grit-.5)*.14*nearDetail;
      float closeDetail=landFbm(lp.xz*1.8);grass=mix(grass,grass*vec3(.83,.91,.69),smoothstep(.59,.78,closeDetail)*.24);
      vec3 weights=pow(abs(ln),vec3(4.0));weights/=max(.001,weights.x+weights.y+weights.z);
      float rockNoise=landFbm(lp.zy*.17)*weights.x+landFbm(lp.xz*.17)*weights.y+landFbm(lp.xy*.17)*weights.z;
      float strata=landFbm(vec2(lp.y*.16+rockNoise*.36,lp.x*.012+lp.z*.017));
      float fractures=landFbm(lp.zy*.73)*weights.x+soil*weights.y+landFbm(lp.xy*.73)*weights.z;
      vec3 rock=mix(vec3(.14,.165,.165),vec3(.30,.30,.25),rockNoise*.64+strata*.36);
      float stoneDetail=1.0-smoothstep(70.0,320.0,length(vViewPosition));
      vec2 cliffUv=abs(ln.x)>abs(ln.z)?lp.zy:lp.xy;
      float fissure=0.0;
      if(stoneDetail>.02&&(slope>.18||lp.y>100.0)){
        vec2 fractureUv=cliffUv*vec2(.31,.075)+vec2(landFbm(cliffUv*.028)*1.35,landFbm(cliffUv*.033+19.0)*.63);
        fractureUv=mix(fractureUv,cliffUv*vec2(.71,.36)+vec2(landFbm(cliffUv*.16)*.38,landFbm(cliffUv*.13+17.0)*.24),geology);
        fissure=(1.0-smoothstep(.003,.025,rockFissure(fractureUv)))*smoothstep(.30,.65,landFbm(cliffUv*.065));
        fissure*=mix(1.0,1.0-smoothstep(.035,.20,length(fwidth(fractureUv))),geology);
      }
      float layers=fract(lp.y*.095+landNoise2(lp.xz*.038)*.27);
      float bedding=smoothstep(.18,.23,layers)*(1.0-smoothstep(.25,.30,layers));
      rock*=.82+fractures*.26+(grit-.5)*.09*nearDetail;
      rock*=1.0-fissure*.19*stoneDetail-bedding*.055*stoneDetail;
      rock=mix(rock,vec3(.14,.18,.195),fissure*.07*stoneDetail);
      rock=mix(rock,vec3(.245,.183,.114),smoothstep(.61,.77,strata)*.18);
      // Inclined sediment bands, interrupted mineral seams and seepage. All
      // three axes contribute: a vertical cliff cannot stretch XZ grain lines.
      float mineral=landFbm(lp.zy*.43+12.0)*weights.x+landFbm(lp.xz*.43-9.0)*weights.y+landFbm(lp.xy*.43+27.0)*weights.z;
      float stoneGrain=landNoise2(lp.zy*5.7)*weights.x+grit*weights.y+landNoise2(lp.xy*5.7)*weights.z;
      float bedPosition=lp.y*.127+lp.x*.018+lp.z*.009+landFbm(lp.xz*.024)*.24;
      float bed=landFbm(vec2(bedPosition,lp.x*.032+lp.z*.026+mineral*.24));
      float seams=1.0-smoothstep(.08,.19,abs(bed-.48));
      float weathering=landFbm(lp.zy*.052)*weights.x+macro*weights.y+landFbm(lp.xy*.052+13.0)*weights.z;
      float seepage=smoothstep(.58,.78,landFbm(cliffUv*vec2(.12,.019)+vec2(mineral*.13,7.0)))*(1.0-abs(ln.y));
      float grainFilter=1.0-smoothstep(.15,.65,length(fwidth(lp))*5.7);
      vec3 limestone=mix(vec3(.225,.233,.218),vec3(.365,.345,.289),bed*.24+mineral*.76);
      limestone*=.79+weathering*.35+(stoneGrain-.5)*.13*grainFilter;
      limestone=mix(limestone,vec3(.17,.198,.193),seepage*.35);
      limestone*=1.0-seams*.085-fissure*.035*stoneDetail;
      float lichen=smoothstep(.62,.77,mineral)*smoothstep(.45,.66,weathering);
      limestone=mix(limestone,vec3(.285,.31,.187),lichen*.30);
      rock=mix(rock,limestone,geology);
      vec3 rockPoint=lp/2.4+vec3(landFbm(lp.xz*.019)*.12,0.0,landFbm(lp.zy*.017)*.10);
      vec3 scannedStone=rockTriplanar(uRockColor,rockPoint,weights);
      float stoneLuma=dot(scannedStone,vec3(.2126,.7152,.0722));
      scannedStone=mix(scannedStone,vec3(stoneLuma)*vec3(1.07,1.04,.98),.45)*1.6;
      // Retain mineral/moisture variation over the scanned surface's natural
      // fissures, rather than tinting every stratum with one noise field.
      rock=mix(rock,scannedStone*vec3(.86,.94,.98)*(.82+weathering*.34),geology*.76*uRockReady);
      float moss=smoothstep(.39,.66,soil)*(1.0-smoothstep(.30,.76,slope))*(1.0-smoothstep(115.0,205.0,lp.y));
      rock=mix(rock,vec3(.07,.125,.032),moss*.38);
      ${STONY_EXPRESSION}
      vec3 biome=mix(grass,rock,clamp(stony,0.0,1.0));
      float snow=smoothstep(205.0,270.0,lp.y+patches*30.0)*(1.0-smoothstep(.18,.48,slope));
      biome=mix(biome,vec3(.68,.70,.66),snow*.83);
      float forest=vColor.g*(1.0-smoothstep(.20,.50,slope));
      vec3 humus=mix(vec3(.085,.072,.041),vec3(.16,.13,.064),soil);
      humus=mix(humus,vec3(.07,.14,.061),smoothstep(.51,.72,closeDetail)*.55);
      biome=mix(biome,humus,forest*.47);
      vec3 trail=mix(vec3(.17,.132,.082),vec3(.30,.243,.157),soil)*(.96+(grit-.5)*.09*nearDetail);
      float road=vColor.r;
      diffuseColor.rgb=mix(biome,trail,road);
      ${FOREST_FLOOR_COLOR}
      float beach=smoothstep(119.0,136.0,lp.z);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.58,.45,.30),beach);
      if(lp.z>136.0)discard;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      float relief=mix(soil*.032,(fractures*.10-fissure*.032+bedding*.018)*stoneDetail,clamp(stony,0.0,1.0));
      relief=mix(relief,soil*.020,road)+grit*.004;
      float geologicalRelief=(mineral*.085+seams*.017-fissure*.004)*stoneDetail+stoneGrain*.004*grainFilter;
      relief=mix(relief,geologicalRelief,geology*clamp(stony,0.0,1.0)*(1.0-road));
      normal=landSurfaceNormal(-vViewPosition,normal,relief*nearDetail);
      vec3 nx=rockTexture(uRockNormal,rockPoint.zy).rgb*2.0-1.0;
      vec3 ny=rockTexture(uRockNormal,rockPoint.xz).rgb*2.0-1.0;
      vec3 nz=rockTexture(uRockNormal,rockPoint.xy).rgb*2.0-1.0;
      vec3 stoneNormal=normalize(vec3(nx.z*sign(ln.x),nx.y,nx.x)*weights.x+vec3(ny.x,ny.z*sign(ln.y),ny.y)*weights.y+vec3(nz.x,nz.y,nz.z*sign(ln.z))*weights.z);
      normal=normalize(mix(normal,normalize(mat3(viewMatrix)*stoneNormal),geology*clamp(stony,0.0,1.0)*(1.0-road)*nearDetail*.35*uRockReady));
      ${FOREST_FLOOR_NORMAL}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor=mix(.87,.98,1.0-clamp(stony,0.0,1.0));
      float scannedRoughness=rockTriplanar(uRockRoughness,rockPoint,weights).r;
      roughnessFactor=mix(roughnessFactor,clamp(scannedRoughness*(1.0-seepage*.13),.70,.98),geology*clamp(stony,0.0,1.0)*(1.0-road)*uRockReady);
      ${FOREST_FLOOR_ROUGHNESS}`);
    // Keep the sky probe's colour on shadowed land rock. This affects only
    // rock indirect diffuse, leaving road/grass, sea and the global lights alone.
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',`#include <lights_fragment_maps>
      iblIrradiance*=mix(1.0,1.8,geology*clamp(stony,0.0,1.0)*(1.0-road));`);
  };
  material.customProgramCacheKey = () => `original-laas-layered-rock-and-meadow-surface-v9-floor${forestFloor?1:0}`;
  return material;
}

/** Same world-space stone texture on spatially batched broken crags. */
export function createRockSurfaceMaterial(){
  const material=createNaturalLandMaterial(false),base=material.onBeforeCompile;
  material.name='OriginalFracturedLimestone';material.onBeforeCompile=(shader,renderer)=>{
    base(shader,renderer);
    shader.fragmentShader=shader.fragmentShader.replace(STONY_EXPRESSION,'float stony=1.0;');
  };
  material.customProgramCacheKey=()=> 'original-batched-layered-limestone-v6';return material;
}

# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: forest-floor-material.spec.ts >> broken rock material owns only its original three maps and keeps litter disabled
- Location: tests/forest-floor-material.spec.ts:33:1

# Error details

```
TypeError: Cannot read properties of undefined (reading 'BASE_URL')
```

# Test source

```ts
  1   | import * as THREE from 'three';
  2   | import {loadForestFloorTextures,FOREST_FLOOR_GLSL,FOREST_FLOOR_COLOR,FOREST_FLOOR_NORMAL,FOREST_FLOOR_ROUGHNESS} from './ForestFloorMaterial';
  3   | 
  4   | const STONY_EXPRESSION='float stony=max(mix(smoothstep(.29,.68,slope),smoothstep(.18,.44,slope),geology),vColor.b*geology)+smoothstep(108.0,192.0,lp.y)*.42;';
  5   | 
  6   | const LAND_GLSL = `
  7   | uniform sampler2D uRockColor;uniform sampler2D uRockRoughness;uniform sampler2D uRockNormal;uniform float uRockReady;
  8   | // Two offset samples at incommensurate scales interrupt recognisable tiling.
  9   | vec4 rockTexture(sampler2D tex,vec2 uv){return mix(texture2D(tex,uv),texture2D(tex,uv*.617+vec2(.173,.619)),.37);}
  10  | vec3 rockTriplanar(sampler2D tex,vec3 point,vec3 weights){return rockTexture(tex,point.zy).rgb*weights.x+rockTexture(tex,point.xz).rgb*weights.y+rockTexture(tex,point.xy).rgb*weights.z;}
  11  | float landHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  12  | float landNoise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(landHash(i),landHash(i+vec2(1,0)),f.x),mix(landHash(i+vec2(0,1)),landHash(i+vec2(1,1)),f.x),f.y);}
  13  | float landFbm(vec2 p){return landNoise2(p)*.57+landNoise2(p*2.03+7.0)*.27+landNoise2(p*4.07-4.0)*.16;}
  14  | float rockFissure(vec2 p){
  15  |   vec2 cell=floor(p),f=fract(p);float nearest=8.0,second=8.0;
  16  |   for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  17  |     vec2 q=vec2(float(x),float(y)),seed=cell+q;
  18  |     vec2 offset=vec2(landHash(seed),landHash(seed+vec2(17.0,-31.0)))*.72+.14;
  19  |     float distance=length(q+offset-f);
  20  |     if(distance<nearest){second=nearest;nearest=distance;}else second=min(second,distance);
  21  |   }
  22  |   return second-nearest;
  23  | }
  24  | vec3 landSurfaceNormal(vec3 viewPoint,vec3 baseNormal,float height){
  25  |   vec3 dx=dFdx(viewPoint),dy=dFdy(viewPoint),sx=cross(dy,baseNormal),sy=cross(baseNormal,dx);
  26  |   float determinant=dot(dx,sx);vec3 gradient=sx*dFdx(height)+sy*dFdy(height);
  27  |   return normalize(abs(determinant)*baseNormal-sign(determinant)*gradient);
  28  | }
  29  | `;
  30  | 
  31  | export function createNaturalLandMaterial(forestFloor=true) {
  32  |   const material = new THREE.MeshStandardMaterial({ roughness: .97, vertexColors: true });
  33  |   const pending:Promise<void>[]=[];
  34  |   // Keep all shader textures owned by the material for normal world teardown.
  35  |   const load=(name:string,color=false,directory='rock-face')=>{
  36  |     let texture:THREE.Texture;
  37  |     if(typeof document==='undefined')texture=new THREE.Texture();
  38  |     else {
  39  |       let resolve!:()=>void,reject!:(e:unknown)=>void;pending.push(new Promise<void>((yes,no)=>{resolve=yes;reject=no;}));
> 40  |       texture=new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/materials/${directory}/${name}`,()=>resolve(),undefined,e=>reject(e));
      |                                                                 ^ TypeError: Cannot read properties of undefined (reading 'BASE_URL')
  41  |     }
  42  |     texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=8;
  43  |     if(color)texture.colorSpace=THREE.SRGBColorSpace;return texture;
  44  |   };
  45  |   const textures={rockColor:load('rock_face_diff_1k.jpg',true),rockRoughness:load('rock_face_rough_1k.jpg'),rockNormal:load('rock_face_nor_gl_1k.jpg')};
  46  |   const rockTasks=pending.slice();
  47  |   const floorTextures=forestFloor?loadForestFloorTextures(load):{forestFloorColor:textures.rockColor,forestFloorNormal:textures.rockNormal,forestFloorRoughness:textures.rockRoughness};
  48  |   const floorTasks=pending.slice(rockTasks.length);
  49  |   const rockAssetsReady=Promise.all(pending);rockAssetsReady.catch(()=>{/* QA reports the original rejected promise; the loader logs live failures. */});
  50  |   const rockReady={value:rockTasks.length?0:1};Promise.all(rockTasks).then(()=>{rockReady.value=1;},()=>{});
  51  |   const floorReady={value:forestFloor&&!floorTasks.length?1:0};Promise.all(floorTasks).then(()=>{if(forestFloor)floorReady.value=1;},()=>{});
  52  |   Object.assign(material,{...textures,...floorTextures,rockAssetsReady});
  53  |   material.name = 'OriginalSlopeHeightBiomeMaterial';
  54  |   material.onBeforeCompile = shader => {
  55  |     shader.uniforms.uRockColor={value:textures.rockColor};shader.uniforms.uRockRoughness={value:textures.rockRoughness};shader.uniforms.uRockNormal={value:textures.rockNormal};
  56  |     shader.uniforms.uRockReady=rockReady;
  57  |     shader.uniforms.uForestFloorColor={value:floorTextures.forestFloorColor};shader.uniforms.uForestFloorNormal={value:floorTextures.forestFloorNormal};shader.uniforms.uForestFloorRoughness={value:floorTextures.forestFloorRoughness};shader.uniforms.uForestFloorEnabled=floorReady;
  58  |     shader.vertexShader = 'varying vec3 vLandPosition;varying vec3 vLandNormal;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  59  |       vec4 landPoint=vec4(position,1.0);vec3 landNormal=normal;
  60  |       #ifdef USE_INSTANCING
  61  |         mat3 landInstance=mat3(instanceMatrix);
  62  |         landNormal/=vec3(dot(landInstance[0],landInstance[0]),dot(landInstance[1],landInstance[1]),dot(landInstance[2],landInstance[2]));
  63  |         landNormal=landInstance*landNormal;landPoint=instanceMatrix*landPoint;
  64  |       #endif
  65  |       vLandPosition=(modelMatrix*landPoint).xyz;vLandNormal=normalize(mat3(modelMatrix)*landNormal);`);
  66  |     shader.fragmentShader = `varying vec3 vLandPosition;varying vec3 vLandNormal;${LAND_GLSL}${FOREST_FLOOR_GLSL}\n` + shader.fragmentShader;
  67  |     shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  68  |       vec3 lp=vLandPosition;vec3 ln=normalize(vLandNormal);vec3 faceNormal=normalize(cross(dFdx(lp),dFdy(lp)));float slope=max(1.0-abs(ln.y),1.0-abs(faceNormal.y));
  69  |       float patches=landFbm(lp.xz*.046),grit=landNoise2(lp.xz*6.0),soil=landFbm(lp.xz*.6),macro=landFbm(lp.xz*.009);
  70  |       float geology=1.0-smoothstep(95.0,119.0,lp.z);
  71  |       float nearDetail=1.0-smoothstep(24.0,105.0,length(vViewPosition));
  72  |       vec3 grass=mix(vec3(.050,.108,.028),vec3(.16,.205,.064),patches*.66+macro*.34);
  73  |       grass*=.80+soil*.34+(grit-.5)*.14*nearDetail;
  74  |       float closeDetail=landFbm(lp.xz*1.8);grass=mix(grass,grass*vec3(.83,.91,.69),smoothstep(.59,.78,closeDetail)*.24);
  75  |       vec3 weights=pow(abs(ln),vec3(4.0));weights/=max(.001,weights.x+weights.y+weights.z);
  76  |       float rockNoise=landFbm(lp.zy*.17)*weights.x+landFbm(lp.xz*.17)*weights.y+landFbm(lp.xy*.17)*weights.z;
  77  |       float strata=landFbm(vec2(lp.y*.16+rockNoise*.36,lp.x*.012+lp.z*.017));
  78  |       float fractures=landFbm(lp.zy*.73)*weights.x+soil*weights.y+landFbm(lp.xy*.73)*weights.z;
  79  |       vec3 rock=mix(vec3(.14,.165,.165),vec3(.30,.30,.25),rockNoise*.64+strata*.36);
  80  |       float stoneDetail=1.0-smoothstep(70.0,320.0,length(vViewPosition));
  81  |       vec2 cliffUv=abs(ln.x)>abs(ln.z)?lp.zy:lp.xy;
  82  |       float fissure=0.0;
  83  |       if(stoneDetail>.02&&(slope>.18||lp.y>100.0)){
  84  |         vec2 fractureUv=cliffUv*vec2(.31,.075)+vec2(landFbm(cliffUv*.028)*1.35,landFbm(cliffUv*.033+19.0)*.63);
  85  |         fractureUv=mix(fractureUv,cliffUv*vec2(.71,.36)+vec2(landFbm(cliffUv*.16)*.38,landFbm(cliffUv*.13+17.0)*.24),geology);
  86  |         fissure=(1.0-smoothstep(.003,.025,rockFissure(fractureUv)))*smoothstep(.30,.65,landFbm(cliffUv*.065));
  87  |         fissure*=mix(1.0,1.0-smoothstep(.035,.20,length(fwidth(fractureUv))),geology);
  88  |       }
  89  |       float layers=fract(lp.y*.095+landNoise2(lp.xz*.038)*.27);
  90  |       float bedding=smoothstep(.18,.23,layers)*(1.0-smoothstep(.25,.30,layers));
  91  |       rock*=.82+fractures*.26+(grit-.5)*.09*nearDetail;
  92  |       rock*=1.0-fissure*.19*stoneDetail-bedding*.055*stoneDetail;
  93  |       rock=mix(rock,vec3(.14,.18,.195),fissure*.07*stoneDetail);
  94  |       rock=mix(rock,vec3(.245,.183,.114),smoothstep(.61,.77,strata)*.18);
  95  |       // Inclined sediment bands, interrupted mineral seams and seepage. All
  96  |       // three axes contribute: a vertical cliff cannot stretch XZ grain lines.
  97  |       float mineral=landFbm(lp.zy*.43+12.0)*weights.x+landFbm(lp.xz*.43-9.0)*weights.y+landFbm(lp.xy*.43+27.0)*weights.z;
  98  |       float stoneGrain=landNoise2(lp.zy*5.7)*weights.x+grit*weights.y+landNoise2(lp.xy*5.7)*weights.z;
  99  |       float bedPosition=lp.y*.127+lp.x*.018+lp.z*.009+landFbm(lp.xz*.024)*.24;
  100 |       float bed=landFbm(vec2(bedPosition,lp.x*.032+lp.z*.026+mineral*.24));
  101 |       float seams=1.0-smoothstep(.08,.19,abs(bed-.48));
  102 |       float weathering=landFbm(lp.zy*.052)*weights.x+macro*weights.y+landFbm(lp.xy*.052+13.0)*weights.z;
  103 |       float seepage=smoothstep(.58,.78,landFbm(cliffUv*vec2(.12,.019)+vec2(mineral*.13,7.0)))*(1.0-abs(ln.y));
  104 |       float grainFilter=1.0-smoothstep(.15,.65,length(fwidth(lp))*5.7);
  105 |       vec3 limestone=mix(vec3(.225,.233,.218),vec3(.365,.345,.289),bed*.24+mineral*.76);
  106 |       limestone*=.79+weathering*.35+(stoneGrain-.5)*.13*grainFilter;
  107 |       limestone=mix(limestone,vec3(.17,.198,.193),seepage*.35);
  108 |       limestone*=1.0-seams*.085-fissure*.035*stoneDetail;
  109 |       float lichen=smoothstep(.62,.77,mineral)*smoothstep(.45,.66,weathering);
  110 |       limestone=mix(limestone,vec3(.285,.31,.187),lichen*.30);
  111 |       rock=mix(rock,limestone,geology);
  112 |       vec3 rockPoint=lp/2.4+vec3(landFbm(lp.xz*.019)*.12,0.0,landFbm(lp.zy*.017)*.10);
  113 |       vec3 scannedStone=rockTriplanar(uRockColor,rockPoint,weights);
  114 |       float stoneLuma=dot(scannedStone,vec3(.2126,.7152,.0722));
  115 |       scannedStone=mix(scannedStone,vec3(stoneLuma)*vec3(1.07,1.04,.98),.45)*1.6;
  116 |       // Retain mineral/moisture variation over the scanned surface's natural
  117 |       // fissures, rather than tinting every stratum with one noise field.
  118 |       rock=mix(rock,scannedStone*vec3(.86,.94,.98)*(.82+weathering*.34),geology*.76*uRockReady);
  119 |       float moss=smoothstep(.39,.66,soil)*(1.0-smoothstep(.30,.76,slope))*(1.0-smoothstep(115.0,205.0,lp.y));
  120 |       rock=mix(rock,vec3(.07,.125,.032),moss*.38);
  121 |       ${STONY_EXPRESSION}
  122 |       vec3 biome=mix(grass,rock,clamp(stony,0.0,1.0));
  123 |       float snow=smoothstep(205.0,270.0,lp.y+patches*30.0)*(1.0-smoothstep(.18,.48,slope));
  124 |       biome=mix(biome,vec3(.68,.70,.66),snow*.83);
  125 |       float forest=vColor.g*(1.0-smoothstep(.20,.50,slope));
  126 |       vec3 humus=mix(vec3(.085,.072,.041),vec3(.16,.13,.064),soil);
  127 |       humus=mix(humus,vec3(.07,.14,.061),smoothstep(.51,.72,closeDetail)*.55);
  128 |       biome=mix(biome,humus,forest*.47);
  129 |       vec3 trail=mix(vec3(.17,.132,.082),vec3(.30,.243,.157),soil)*(.96+(grit-.5)*.09*nearDetail);
  130 |       float road=vColor.r;
  131 |       diffuseColor.rgb=mix(biome,trail,road);
  132 |       ${FOREST_FLOOR_COLOR}
  133 |       float beach=smoothstep(119.0,136.0,lp.z);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.58,.45,.30),beach);
  134 |       if(lp.z>136.0)discard;`);
  135 |     shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  136 |       float relief=mix(soil*.032,(fractures*.10-fissure*.032+bedding*.018)*stoneDetail,clamp(stony,0.0,1.0));
  137 |       relief=mix(relief,soil*.020,road)+grit*.004;
  138 |       float geologicalRelief=(mineral*.085+seams*.017-fissure*.004)*stoneDetail+stoneGrain*.004*grainFilter;
  139 |       relief=mix(relief,geologicalRelief,geology*clamp(stony,0.0,1.0)*(1.0-road));
  140 |       normal=landSurfaceNormal(-vViewPosition,normal,relief*nearDetail);
```
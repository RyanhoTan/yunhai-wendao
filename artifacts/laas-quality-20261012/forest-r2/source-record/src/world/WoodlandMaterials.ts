import * as THREE from 'three';
import {woodlandRandom} from './WoodlandGeometry';
import {type WoodlandLodField} from './WoodlandLOD';

function originalBarkMap(){
  if(typeof document==='undefined')return null;
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=512;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  const random=woodlandRandom(851039);ctx.fillStyle='#b7af9b';ctx.fillRect(0,0,256,512);
  for(let i=0;i<140;i++){
    const x=random()*256,y=random()*512,length=20+random()*160,curve=(random()-.5)*9;
    ctx.strokeStyle=i%4?'rgba(66,57,43,.31)':'rgba(226,219,196,.38)';ctx.lineWidth=.6+random()*1.3;
    for(const shift of [-512,0,512]){ctx.beginPath();ctx.moveTo(x,y+shift);ctx.bezierCurveTo(x+curve,y+length*.34+shift,x-curve*.6,y+length*.77+shift,x+curve*.3,y+length+shift);ctx.stroke();}
  }
  for(let i=0;i<950;i++){ctx.fillStyle=i%3?'rgba(53,46,36,.13)':'rgba(235,227,206,.25)';ctx.fillRect(random()*256,random()*512,.5+random()*1.3,1+random()*3);}
  const map=new THREE.CanvasTexture(canvas);map.name='OriginalWoodlandBarkGrooves';map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=4;return map;
}

/** Rest coordinates keep the common wind direction independent of instance yaw. */
export function installWoodlandSurface(material:THREE.Material,time:{value:number},field:WoodlandLodField,level:number,foliage=false){
  Object.assign(material,{forestCellsTexture:field.texture});
  material.onBeforeCompile=shader=>{
    shader.uniforms.uWoodlandTime=time;shader.uniforms.uForestCells={value:field.texture};shader.uniforms.uForestCellCount={value:field.count};
    shader.vertexShader=`attribute float woodlandWind;attribute float woodlandSway;attribute float woodlandCluster;attribute float forestCellId;
      uniform float uWoodlandTime;varying vec3 vWoodlandRest;varying vec2 vWoodlandUv;varying float vWoodlandCell;varying float vWoodlandCluster;
`+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec4 woodlandPosition=vec4(position,1.);mat3 woodlandBasis=mat3(modelMatrix);
      #ifdef USE_INSTANCING
        woodlandPosition=instanceMatrix*woodlandPosition;woodlandBasis=woodlandBasis*mat3(instanceMatrix);
      #endif
      woodlandPosition=modelMatrix*woodlandPosition;vWoodlandRest=woodlandPosition.xyz;vWoodlandUv=uv;vWoodlandCell=forestCellId;vWoodlandCluster=woodlandCluster;
      float woodlandPhase=woodlandPosition.x*.047+woodlandPosition.z*.039;
      float woodlandGust=.70+.30*sin(uWoodlandTime*.21+woodlandPhase*.34);
      vec3 woodlandDelta=vec3(.22,0.,.10)*sin(uWoodlandTime*.57+woodlandPhase)*woodlandSway*woodlandGust;
      woodlandDelta+=vec3(.049*sin(uWoodlandTime*1.9+woodlandPhase*7.),0.,.028*cos(uWoodlandTime*2.3+woodlandPhase*8.))*woodlandWind*woodlandGust;
      woodlandDelta*=step(.001,uWoodlandTime);
      transformed+=vec3(dot(woodlandDelta,woodlandBasis[0])/dot(woodlandBasis[0],woodlandBasis[0]),dot(woodlandDelta,woodlandBasis[1])/dot(woodlandBasis[1],woodlandBasis[1]),dot(woodlandDelta,woodlandBasis[2])/dot(woodlandBasis[2],woodlandBasis[2]));`);
    shader.fragmentShader=`uniform sampler2D uForestCells;uniform float uForestCellCount;
      varying vec3 vWoodlandRest;varying vec2 vWoodlandUv;varying float vWoodlandCell;varying float vWoodlandCluster;
`+shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
      vec3 woodlandWeights=texture2D(uForestCells,vec2((vWoodlandCell+.5)/uForestCellCount,.5)).rgb;
      float woodlandLower=${level===0?'0.':level===1?'woodlandWeights.r':'woodlandWeights.r+woodlandWeights.g'};
      float woodlandUpper=woodlandLower+woodlandWeights[${level}];
      vec3 woodlandDither=floor(vWoodlandRest*12.);
      float woodlandThreshold=fract(sin(dot(woodlandDither,vec3(12.9898,78.233,37.719)))*43758.5453);
      if(woodlandThreshold<woodlandLower||woodlandThreshold>=woodlandUpper)discard;`);
    if(foliage){
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float woodlandVeinWidth=max(fwidth(vWoodlandUv.x)*.8,.009);
        float woodlandVein=1.-smoothstep(woodlandVeinWidth,woodlandVeinWidth*2.,abs(vWoodlandUv.x-.5));
        float woodlandSideVein=1.-smoothstep(.015,max(.025,fwidth(vWoodlandUv.y)*1.2),abs(fract(vWoodlandUv.y*6.+abs(vWoodlandUv.x-.5)*3.)-.5));
        diffuseColor.rgb*=mix(1.,.90,(woodlandVein*.6+woodlandSideVein*.15)*(1.-vWoodlandCluster));`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
          vec3 woodlandLight=directionalLights[i].color;
          #if defined(USE_SHADOWMAP) && (UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS)
            DirectionalLightShadow woodlandShadow=directionalLightShadows[i];
            woodlandLight*=receiveShadow?getShadow(directionalShadowMap[i],woodlandShadow.shadowMapSize,woodlandShadow.shadowIntensity,woodlandShadow.shadowBias,woodlandShadow.shadowRadius,vDirectionalShadowCoord[i]):1.;
          #endif
          float woodlandBack=max(0.,dot(-normal,directionalLights[i].direction));
          float woodlandForward=pow(max(0.,dot(geometryViewDir,-directionalLights[i].direction)),3.);
          reflectedLight.directDiffuse+=woodlandLight*diffuseColor.rgb*vec3(.81,1.,.57)*woodlandBack*(.20+woodlandForward*.30)*RECIPROCAL_PI;
        }
        #pragma unroll_loop_end
        #endif
        // Thin leaves also scatter the existing sky irradiance across both sides.
        reflectedLight.indirectDiffuse+=iblIrradiance*diffuseColor.rgb*vec3(.72,1.,.64)*.11*RECIPROCAL_PI;`);
    }
  };
  material.customProgramCacheKey=()=>`woodland-rest-wind-lod${level}-${foliage?'thin-leaf':'wood'}-v3`;
}

export function createWoodlandMaterials(field:WoodlandLodField){
  const time={value:0},barkMap=originalBarkMap();
  const levels=Array.from({length:3},(_,level)=>{
    const bark=new THREE.MeshStandardMaterial({map:barkMap,vertexColors:true,roughness:.94});bark.name=`WoodlandBarkLOD${level}`;
    const living=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78,side:THREE.DoubleSide});living.name=`WoodlandThinLeavesLOD${level}`;
    const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});depth.name=`WoodlandAttachedShadowLOD${level}`;
    installWoodlandSurface(bark,time,field,level);installWoodlandSurface(living,time,field,level,true);installWoodlandSurface(depth,time,field,level);
    return {bark,living,depth};
  });
  const litterMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide});litterMaterial.name='OriginalWoodlandDryLitter';
  // Fallen litter has no wind, and remains in the nearby cell until its own future ecological pass.
  return {time,levels,litterMaterial};
}

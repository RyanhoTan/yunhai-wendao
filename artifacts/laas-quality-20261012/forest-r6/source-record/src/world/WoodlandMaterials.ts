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

/** Bark furrows have their own relief field, separate from color weathering. */
function barkReliefMap(){
  const width=256,height=512,data=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=x/width,v=y/height,warp=Math.sin(v*Math.PI*4+u*Math.PI*2)*.045+Math.sin(v*Math.PI*12)*.011;
    const groove=Math.abs(Math.sin((u+warp)*Math.PI*24.)),fine=Math.sin(u*Math.PI*80+v*Math.PI*6)*.065;
    const knot=Math.exp(-((u-.43)**2*340.+(v-.37)**2*98.));
    const value=Math.round(THREE.MathUtils.clamp(.22+Math.pow(groove,.55)*.53+fine+knot*.12,0,1)*255),i=(y*width+x)*4;
    data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);texture.name='WoodlandBarkFineFurrowRelief';
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=4;texture.needsUpdate=true;
  return texture;
}

/** A small authored leaf-spray atlas gives distant cluster surfaces fine holes.
 * Nearby foliage still consists of separate botanical leaves, not this proxy. */
function clusterLeafMap(){
  if(typeof document==='undefined')return null;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  const random=woodlandRandom(718349),centers=[[.28,.29],[.72,.32],[.30,.72],[.69,.70]];
  for(let i=0;i<310;i++){
    const center=centers[i%centers.length],a=random()*Math.PI*2,r=Math.sqrt(random())*.33;
    const x=(center[0]+Math.cos(a)*r)*512,y=(center[1]+Math.sin(a)*r)*512,length=25+random()*27,width=length*(.28+random()*.15),angle=random()*Math.PI*2;
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);
    ctx.fillStyle=`rgb(${Math.round(213+random()*41)},${Math.round(225+random()*29)},${Math.round(197+random()*47)})`;
    ctx.beginPath();ctx.moveTo(0,-length*.5);ctx.bezierCurveTo(width,-length*.18,width,length*.25,0,length*.5);ctx.bezierCurveTo(-width,length*.21,-width,-length*.22,0,-length*.5);ctx.fill();
    ctx.strokeStyle='rgba(162,182,134,.46)';ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(0,-length*.38);ctx.quadraticCurveTo(width*.10,0,0,length*.42);ctx.stroke();ctx.restore();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.name='WoodlandDistantLeafSprayAtlas';texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=4;
  return texture;
}

/** Rest coordinates keep the common wind direction independent of instance yaw. */
export function installWoodlandSurface(material:THREE.Material,time:{value:number},field:WoodlandLodField,level:number,foliage=false,clusterMap:THREE.Texture|null=null){
  Object.assign(material,{forestCellsTexture:field.texture,forestClusterTexture:clusterMap});
  material.onBeforeCompile=shader=>{
    shader.uniforms.uWoodlandTime=time;shader.uniforms.uForestCells={value:field.texture};shader.uniforms.uForestCellCount={value:field.count};shader.uniforms.uWoodlandClusterMap={value:clusterMap};
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
    shader.fragmentShader=`uniform sampler2D uForestCells;uniform sampler2D uWoodlandClusterMap;uniform float uForestCellCount;
      varying vec3 vWoodlandRest;varying vec2 vWoodlandUv;varying float vWoodlandCell;varying float vWoodlandCluster;
`+shader.fragmentShader;
    // A stochastic discard before PBR derivatives produced black quad artefacts
    // on actual NVIDIA frames. Evaluate the complete surface before applying
    // the same world-fixed complementary coverage in color and depth passes.
    const mainEnd=shader.fragmentShader.lastIndexOf('}');
    if(mainEnd<0)throw new Error('Woodland shader has no final main block');
    shader.fragmentShader=shader.fragmentShader.slice(0,mainEnd)+`
      vec3 woodlandWeights=texture2D(uForestCells,vec2((vWoodlandCell+.5)/uForestCellCount,.5)).rgb;
      float woodlandLower=${level===0?'0.':level===1?'woodlandWeights.r':'woodlandWeights.r+woodlandWeights.g'};
      float woodlandUpper=woodlandLower+woodlandWeights[${level}];
      vec3 woodlandDither=floor(vWoodlandRest*12.);
      float woodlandThreshold=fract(sin(dot(woodlandDither,vec3(12.9898,78.233,37.719)))*43758.5453);
      if(woodlandThreshold<woodlandLower||woodlandThreshold>=woodlandUpper)discard;
`+shader.fragmentShader.slice(mainEnd);
    // Stock alpha filtering is shared by color and shadow passes. Atlas mips
    // filter subpixel leaf holes; root/trunk and actual leaf vertices bypass it.
    if(clusterMap)shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`if(vWoodlandCluster>.5)diffuseColor.a*=texture2D(uWoodlandClusterMap,vWoodlandUv).a;
      #include <alphatest_fragment>`);
    if(foliage){
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        if(vWoodlandCluster>.5)diffuseColor.rgb*=mix(vec3(1.),texture2D(uWoodlandClusterMap,vWoodlandUv).rgb*1.2,.20);
        float woodlandVeinWidth=max(fwidth(vWoodlandUv.x)*.8,.009);
        float woodlandVein=1.-smoothstep(woodlandVeinWidth,woodlandVeinWidth*2.,abs(vWoodlandUv.x-.5));
        float woodlandSideVein=1.-smoothstep(.015,max(.025,fwidth(vWoodlandUv.y)*1.2),abs(fract(vWoodlandUv.y*6.+abs(vWoodlandUv.x-.5)*3.)-.5));
        diffuseColor.rgb*=mix(1.,.90,(woodlandVein*.6+woodlandSideVein*.15)*(1.-vWoodlandCluster));`);
      // Extend the renderer's already shadowed light evaluation. A second
      // unrolled loop would redeclare locals and duplicate shadow lookups.
      const directCall='RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
      const directLightChunk=THREE.ShaderChunk.lights_fragment_begin.replaceAll(directCall,`${directCall}
        reflectedLight.directDiffuse+=directLight.color*diffuseColor.rgb*vec3(.81,1.,.57)*max(0.,dot(-normal,directLight.direction))*(.20+pow(max(0.,dot(geometryViewDir,-directLight.direction)),3.)*.30)*RECIPROCAL_PI;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',directLightChunk);
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
        // Thin leaves also scatter the existing sky irradiance across both sides.
        reflectedLight.indirectDiffuse+=iblIrradiance*diffuseColor.rgb*vec3(.72,1.,.64)*.11*RECIPROCAL_PI;`);
    }
  };
  material.customProgramCacheKey=()=>`woodland-rest-wind-lod${level}-${foliage?'thin-leaf':'wood'}-v6`;
}

export function createWoodlandMaterials(field:WoodlandLodField){
  const time={value:0},barkMap=originalBarkMap(),bumpMap=barkReliefMap(),clusterMap=clusterLeafMap();
  const levels=Array.from({length:3},(_,level)=>{
    const bark=new THREE.MeshStandardMaterial({map:barkMap,bumpMap,bumpScale:.018,vertexColors:true,roughness:.94});bark.name=`WoodlandBarkLOD${level}`;
    const living=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78,side:THREE.DoubleSide,alphaTest:.36,alphaToCoverage:true});living.name=`WoodlandThinLeavesLOD${level}`;
    const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide,alphaTest:.36});depth.name=`WoodlandAttachedShadowLOD${level}`;
    installWoodlandSurface(bark,time,field,level);installWoodlandSurface(living,time,field,level,true,clusterMap);installWoodlandSurface(depth,time,field,level,false,clusterMap);
    return {bark,living,depth};
  });
  const litterMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide});litterMaterial.name='OriginalWoodlandDryLitter';
  // Fallen litter has no wind, and remains in the nearby cell until its own future ecological pass.
  return {time,levels,litterMaterial};
}

import * as THREE from 'three';
import {createWoodlandLodField} from './WoodlandLOD';
import {installWoodlandSurface} from './WoodlandMaterials';

/** Geometry supplies the break, grain direction and material zones. Fine
 * relief is filtered in physical UV metres, before any distance discard. */
export function createForestDeadwoodMaterial(){
  const field=createWoodlandLodField(1);field.write(0,[1,0,0]);field.flush();
  const view=new THREE.Vector3(),time={value:0};
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,side:THREE.DoubleSide});material.name='ForestDeadwood_WeatheredBarkFibreMoss';
  const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});depth.name='ForestDeadwood_AttachedShadow';
  const enabled={value:0},pending:Promise<void>[]=[],loader=new THREE.TextureLoader();
  const load=(name:string,color=false)=>{
    if(typeof document==='undefined')return new THREE.Texture();
    let resolve!:()=>void,reject!:(error:unknown)=>void;pending.push(new Promise<void>((yes,no)=>{resolve=yes;reject=no;}));
    const texture=loader.load(`${import.meta.env?.BASE_URL??'/'}assets/materials/deadwood-bark/${name}`,()=>resolve(),undefined,reject);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=8;if(color)texture.colorSpace=THREE.SRGBColorSpace;return texture;
  };
  const barkColor=load('bark_brown_01_diff_1k.jpg',true),barkNormal=load('bark_brown_01_nor_gl_1k.jpg'),barkRoughness=load('bark_brown_01_rough_1k.jpg');
  // The existing world awaits this material readiness contract before QA poses.
  const ready=Promise.all(pending).then(()=>{enabled.value=pending.length?1:0;});ready.catch(()=>{/* World assetsReady reports failures. */});
  Object.assign(material,{deadwoodBarkColor:barkColor,deadwoodBarkNormal:barkNormal,deadwoodBarkRoughness:barkRoughness,rockAssetsReady:ready});
  for(const m of [material,depth]){
    installWoodlandSurface(m,time,field,0);
    const base=m.onBeforeCompile,key=m.customProgramCacheKey;
    m.onBeforeCompile=(shader,renderer)=>{
      base.call(m,shader,renderer);shader.uniforms.uDeadwoodView={value:view};
      shader.vertexShader='attribute float deadwoodSeed;varying float vDeadwoodSeed;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vDeadwoodSeed=deadwoodSeed;');
      shader.fragmentShader='uniform vec3 uDeadwoodView;varying float vDeadwoodSeed;\n'+shader.fragmentShader;
      if(m===material){
        shader.uniforms.uDeadwoodBarkColor={value:barkColor};shader.uniforms.uDeadwoodBarkNormal={value:barkNormal};shader.uniforms.uDeadwoodBarkRoughness={value:barkRoughness};shader.uniforms.uDeadwoodBarkEnabled=enabled;
        shader.fragmentShader=`
          uniform sampler2D uDeadwoodBarkColor;uniform sampler2D uDeadwoodBarkNormal;uniform sampler2D uDeadwoodBarkRoughness;uniform float uDeadwoodBarkEnabled;
          float dwHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          float dwNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(dwHash(i),dwHash(i+vec2(1.,0.)),f.x),mix(dwHash(i+vec2(0.,1.)),dwHash(i+vec2(1.)),f.x),f.y);}
          vec2 dwOffset(vec2 p){return vec2(dwHash(p+17.9),dwHash(p+vec2(31.7,-7.1)));}
          vec3 dwBarkSample(sampler2D tex,vec2 uv,vec2 dx,vec2 dy){
            vec2 skew=vec2(uv.x-uv.y*.57735027,uv.y*1.15470054),cell=floor(skew),f=fract(skew);vec2 a=cell,b=cell+vec2(1.,0.),c=cell+vec2(0.,1.);vec3 w=vec3(1.-f.x-f.y,f.x,f.y);
            if(f.x+f.y>1.){a=cell+vec2(1.);w=vec3(f.x+f.y-1.,1.-f.y,1.-f.x);}w=w*w*w;w/=max(.00001,w.x+w.y+w.z);
            return textureGrad(tex,uv+dwOffset(a),dx,dy).rgb*w.x+textureGrad(tex,uv+dwOffset(b),dx,dy).rgb*w.y+textureGrad(tex,uv+dwOffset(c),dx,dy).rgb*w.z;
          }
`+shader.fragmentShader;
        // Longitudinal fibres use several incommensurate scales with explicit
        // derivative attenuation, rather than unfiltered high-frequency noise.
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          vec2 dwUV=vWoodlandUv+vec2(vDeadwoodSeed*31.7,vDeadwoodSeed*7.1);
          float dwBark=1.-smoothstep(.10,.65,vWoodlandCluster);
          float dwWarp=.012*sin(dwUV.x*3.7)+.005*sin(dwUV.x*11.3+dwUV.y*7.);
          float dwPhase=(dwUV.y+dwWarp)*260.;
          float dwFilter=exp(-pow(fwidth(dwPhase)*.50,2.));
          float dwGrain=sin(dwPhase)*dwFilter;
          float dwMidPhase=(dwUV.y+dwWarp+dwNoise(dwUV*vec2(.8,2.7))*.022)*67.;
          float dwMidFilter=exp(-pow(fwidth(dwMidPhase)*.65,2.));
          float dwFurrow=(1.-smoothstep(.10,.48,abs(sin(dwMidPhase))))*dwMidFilter;
          float dwWeather=dwNoise(dwUV*vec2(1.3,3.2));
          float dwFlake=dwNoise(dwUV*vec2(4.,13.));
          float dwWood=1.-step(2.5,vWoodlandCluster);
          diffuseColor.rgb*=mix(vec3(1.),vec3(1.08,.97,.85),dwBark);
          diffuseColor.rgb*=mix(1.,.83+.24*dwWeather+.08*dwFlake-.22*dwFurrow*dwBark+.045*dwGrain,dwWood);
          diffuseColor.rgb*=mix(1.,.83+.30*dwNoise(dwUV*6.),step(2.5,vWoodlandCluster));
          float dwRelief=(dwGrain*.0009-dwFurrow*.0035*dwBark)*dwWood;
          // The CC0 bark scan is physically 1m wide. Its vertical wood axis is
          // our axial U; stochastic offsets preserve direction without mirrors.
          vec2 dwBarkUV=dwUV.yx,dwBarkDx=dFdx(dwBarkUV),dwBarkDy=dFdy(dwBarkUV);
          float dwBarkBlend=dwBark*uDeadwoodBarkEnabled;
          vec3 dwScannedNormal=vec3(0.,0.,1.);float dwScannedRoughness=.94;
          if(dwBarkBlend>.001){
            vec3 dwScannedColor=dwBarkSample(uDeadwoodBarkColor,dwBarkUV,dwBarkDx,dwBarkDy);
            dwScannedNormal=normalize(dwBarkSample(uDeadwoodBarkNormal,dwBarkUV,dwBarkDx,dwBarkDy)*2.-1.);
            dwScannedRoughness=dwBarkSample(uDeadwoodBarkRoughness,dwBarkUV,dwBarkDx,dwBarkDy).r;
            diffuseColor.rgb=mix(diffuseColor.rgb,dwScannedColor*vec3(.78,.79,.77)*(.90+.10*dwWeather),dwBarkBlend*.89);
          }
`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
          roughnessFactor=clamp(roughnessFactor-(dwWeather*.11+dwGrain*.018)*dwWood,.80,.99);
          roughnessFactor=mix(roughnessFactor,clamp(dwScannedRoughness,.72,.98),dwBarkBlend*.76);
`);
        // Surface-gradient perturbation uses view-space derivatives. A small
        // scale gives grain relief without changing real silhouette/geometry.
        shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
          vec3 dwDx=dFdx(-vViewPosition),dwDy=dFdy(-vViewPosition);
          vec3 dwR1=cross(dwDy,normal),dwR2=cross(normal,dwDx);
          float dwDet=dot(dwDx,dwR1);
          vec3 dwGradient=sign(dwDet)*(dFdx(dwRelief)*dwR1+dFdy(dwRelief)*dwR2);
          if(abs(dwDet)>1.e-12)normal=normalize(abs(dwDet)*normal-dwGradient);
          vec3 dwQ1perp=cross(dwDy,normal),dwQ0perp=cross(normal,dwDx);
          vec3 dwT=dwQ1perp*dwBarkDx.x+dwQ0perp*dwBarkDy.x,dwB=dwQ1perp*dwBarkDx.y+dwQ0perp*dwBarkDy.y;
          float dwFrameLength=max(dot(dwT,dwT),dot(dwB,dwB));
          if(dwFrameLength>1.e-12){float dwFrameScale=inversesqrt(dwFrameLength);vec3 dwMapped=normalize(dwT*dwFrameScale*dwScannedNormal.x+dwB*dwFrameScale*dwScannedNormal.y+normal*dwScannedNormal.z);normal=normalize(mix(normal,dwMapped,dwBarkBlend*.68));}
`);
      }
      const end=shader.fragmentShader.lastIndexOf('}');
      shader.fragmentShader=shader.fragmentShader.slice(0,end)+`
        float dwCoverage=1.-smoothstep(64.,96.,distance(vWoodlandRest,uDeadwoodView));
        if(woodlandThreshold>=dwCoverage)discard;
`+shader.fragmentShader.slice(end);
    };
    m.customProgramCacheKey=()=>`${key.call(m)}-deadwood-physical-grain-distance-v3`;
  }
  return {material,depth,view};
}

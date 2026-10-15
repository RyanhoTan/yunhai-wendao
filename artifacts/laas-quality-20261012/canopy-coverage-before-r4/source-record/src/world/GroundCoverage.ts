import * as THREE from 'three';

/** The old coarse floor recedes where the new fine layer is fully present.
 * World coverage is complementary and late, including the shadow material. */
export function installLegacyGroundCoverage(material:THREE.Material,view:THREE.Vector3){
  const base=material.onBeforeCompile,key=material.customProgramCacheKey;
  material.onBeforeCompile=(shader,renderer)=>{
    base.call(material,shader,renderer);shader.uniforms.uGroundView={value:view};
    shader.vertexShader='attribute float woodlandLegacyGround;varying float vLegacyGround;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vLegacyGround=woodlandLegacyGround;');
    shader.fragmentShader='uniform vec3 uGroundView;varying float vLegacyGround;\n'+shader.fragmentShader;
    const end=shader.fragmentShader.lastIndexOf('}');
    shader.fragmentShader=shader.fragmentShader.slice(0,end)+`
      float fineGroundCoverage=1.-smoothstep(16.,24.,distance(vWoodlandRest,uGroundView));
      if(vLegacyGround>.5&&woodlandThreshold<fineGroundCoverage)discard;
`+shader.fragmentShader.slice(end);
  };
  material.customProgramCacheKey=()=>`${key.call(material)}-legacy-ground-complement-v1`;
}

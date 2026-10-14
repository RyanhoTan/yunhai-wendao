import * as THREE from 'three';
import {createWoodlandLodField} from './WoodlandLOD';
import {installWoodlandSurface} from './WoodlandMaterials';

/** Nearby detail uses the forest's actual wind and thin-leaf lighting. Its
 * distance coverage is shared with shadows and evaluated after derivatives. */
export function createGroundCoverMaterials(time:{value:number}){
  const field=createWoodlandLodField(1);field.write(0,[1,0,0]);field.flush();
  const view=new THREE.Vector3(),materials=new Map<string,THREE.Material>();
  const install=(material:THREE.Material,foliage:boolean)=>{
    installWoodlandSurface(material,time,field,0,foliage);
    const base=material.onBeforeCompile,baseKey=material.customProgramCacheKey;
    material.onBeforeCompile=(shader,renderer)=>{
      base.call(material,shader,renderer);shader.uniforms.uGroundView={value:view};
      shader.fragmentShader='uniform vec3 uGroundView;\n'+shader.fragmentShader;
      const end=shader.fragmentShader.lastIndexOf('}');
      shader.fragmentShader=shader.fragmentShader.slice(0,end)+`
        float groundCoverage=1.-smoothstep(16.,24.,distance(vWoodlandRest,uGroundView));
        if(woodlandThreshold>=groundCoverage)discard;
`+shader.fragmentShader.slice(end);
    };
    material.customProgramCacheKey=()=>`${baseKey.call(material)}-ground-distance-v1`;
    return material;
  };
  for(const kind of ['living','dead','stone']){
    const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:kind==='stone'?.96:.88,side:kind==='living'?THREE.DoubleSide:THREE.FrontSide,alphaToCoverage:kind==='living'});
    material.name=`EcologicalGround_${kind}`;materials.set(kind,install(material,kind==='living'));
  }
  const depth=install(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide}),false);
  depth.name='EcologicalGround_AttachedShadows';
  return {view,materials,depth};
}

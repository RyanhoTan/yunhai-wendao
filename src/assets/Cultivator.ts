import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { dressCultivator } from './CultivatorAppearance';
import { makeSword } from './Models';
import { disposeSkeletons } from '../utils/dispose';

type MotionName = 'idle'|'walk'|'run'|'slash'|'crouchSlash'|'float'|'land'|'hop';
type MotionJSON = Parameters<typeof THREE.AnimationClip.parse>[0];
let library: {scene:THREE.Group;clips:Map<string,THREE.AnimationClip>}|undefined;

export async function loadCultivatorAssets(): Promise<void> {
  if(library)return;
  const base=`${import.meta.env.BASE_URL}assets/character/`;
  const [body,response]=await Promise.all([new GLTFLoader().loadAsync(`${base}body.glb`),fetch(`${base}motions.json`)]);
  if(!response.ok)throw new Error(`角色动作加载失败：${response.status}`);
  const data=await response.json() as {clips:MotionJSON[]};
  const clips=new Map(data.clips.map(json=>{const clip=THREE.AnimationClip.parse(json);return [clip.name,clip];}));
  for(const name of ['idle','walk','run','slash','float','land'])if(!clips.has(name))throw new Error(`缺少角色动作：${name}`);
  library={scene:body.scene,clips};
}

export function createAnimatedCultivator() {
  if(!library)throw new Error('角色资源尚未加载');
  const root=new THREE.Group();root.name='YunhaiHumanCultivator';
  const visual=new THREE.Group();visual.name='HumanMetreFrame';root.add(visual);
  const model=clone(library.scene) as THREE.Group;visual.add(model);
  model.rotation.y=Math.PI;model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
  const scale=1.82/size.y;model.scale.multiplyScalar(scale);model.updateMatrixWorld(true);
  bounds.setFromObject(model);model.position.y-=bounds.min.y;model.updateMatrixWorld(true);
  const bones=new Map<string,THREE.Bone>();
  model.traverse(node=>{if(node instanceof THREE.Bone)bones.set(node.name.replace(/^mixamorig:?/,''),node);});
  for(const name of ['Hips','Head','Spine2','RightHand','LeftUpLeg'])if(!bones.has(name))throw new Error(`角色骨骼缺失：${name}`);
  const headY=bones.get('Head')!.getWorldPosition(new THREE.Vector3()).y;
  const palette:Record<string,{color:string;metalness:number;roughness:number}>={
    armor_mat:{color:'#52665b',metalness:.52,roughness:.5},body_mat:{color:'#5c8174',metalness:0,roughness:.86},
    top_mat:{color:'#d1cab4',metalness:0,roughness:.88},legs_mat:{color:'#3a514e',metalness:0,roughness:.85},
    details_mat:{color:'#a39366',metalness:.55,roughness:.47},weapon_mat:{color:'#64736e',metalness:.75,roughness:.4},
  };
  const materialCopies=new Map<THREE.Material,THREE.Material>();
  model.traverse(node=>{
    if(!(node instanceof THREE.Mesh))return;
    // Remove the helmet and masked face by spatial region, retaining sleeves sharing their material.
    const geometry=node.geometry.clone(),position=geometry.getAttribute('position'),source=geometry.index;
    const count=source?.count??position.count,indices:number[]=[],groups:{start:number;count:number;materialIndex:number}[]=[];
    const point=new THREE.Vector3();
    for(const group of geometry.groups.length?geometry.groups:[{start:0,count,materialIndex:0}]){
      const start=indices.length;
      for(let i=group.start;i<group.start+group.count;i+=3){
        const triangle=[0,1,2].map(k=>source?source.getX(i+k):i+k);
        if(triangle.some(vertex=>point.fromBufferAttribute(position,vertex).applyMatrix4(node.matrixWorld).y>headY-.04))continue;
        indices.push(...triangle);
      }
      groups.push({start,count:indices.length-start,materialIndex:group.materialIndex??0});
    }
    geometry.setIndex(indices);geometry.clearGroups();for(const group of groups)geometry.addGroup(group.start,group.count,group.materialIndex);geometry.computeBoundingSphere();node.geometry=geometry;
    const recolor=(original:THREE.Material)=>{
      if(materialCopies.has(original))return materialCopies.get(original)!;
      const material=original.clone() as THREE.MeshStandardMaterial;
      const style=palette[original.name]??palette.top_mat;material.color.set(style.color);material.metalness=style.metalness;material.roughness=style.roughness;
      material.emissive?.set(0);material.emissiveMap=null;
      // Keep authored surface relief, replacing the spectral green/red palette with jade cloth.
      if(material.map?.image){
        const image=material.map.image as CanvasImageSource & {width:number;height:number};
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const context=canvas.getContext('2d')!;context.drawImage(image,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height);
        for(let i=0;i<pixels.data.length;i+=4){const l=.2126*pixels.data[i]+.7152*pixels.data[i+1]+.0722*pixels.data[i+2];const value=original.name==='body_mat'?170+l*.28:85+l*.66;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;}
        context.putImageData(pixels,0,0);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=material.map.flipY;texture.offset.copy(material.map.offset);texture.repeat.copy(material.map.repeat);texture.anisotropy=4;material.map=texture;
      }
      materialCopies.set(original,material);return material;
    };
    node.material=Array.isArray(node.material)?node.material.map(recolor):recolor(node.material);node.castShadow=true;node.receiveShadow=true;
  });
  dressCultivator(model,visual,bones);
  const mixer=new THREE.AnimationMixer(model),actions=new Map<MotionName,THREE.AnimationAction>();
  for(const [name,clip] of library.clips){
    const action=mixer.clipAction(clip);action.play();action.setEffectiveWeight(name==='idle'?1:0);actions.set(name as MotionName,action);
  }
  const heldSword=makeSword();heldSword.name='heldSword';heldSword.scale.x=.45;
  const socket=new THREE.Group();socket.name='SwordHandSocket';bones.get('RightHand')!.add(socket);
  // FBX centimetre bones and mesh scaling cancel here: weapon dimensions remain metres.
  model.updateMatrixWorld(true);const handScale=bones.get('RightHand')!.getWorldScale(new THREE.Vector3());socket.scale.set(1/handScale.x,1/handScale.y,1/handScale.z);
  heldSword.position.set(-.051,.102,.052);
  heldSword.quaternion.setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(-168.3),THREE.MathUtils.degToRad(84),THREE.MathUtils.degToRad(-.8)))
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2));socket.add(heldSword);
  const flyingSword=makeSword(3.2);flyingSword.name='flyingSword';flyingSword.rotation.x=-Math.PI/2;flyingSword.position.set(0,-.16,1.1);root.add(flyingSword);flyingSword.visible=false;
  // Measure an actual weighted boot vertex in the source flight pose, rather than an ankle proxy.
  for(const [name,action] of actions)action.setEffectiveWeight(name==='float'?1:0);
  mixer.update(0);root.updateMatrixWorld(true);
  let support:{mesh:THREE.SkinnedMesh;vertex:number}|undefined,minY=Infinity;
  const supportPoint=new THREE.Vector3();
  model.traverse(node=>{
    if(!(node instanceof THREE.SkinnedMesh))return;
    const index=node.geometry.index;
    for(let i=0;i<(index?.count??node.geometry.getAttribute('position').count);i++){
      const vertex=index?index.getX(i):i;node.getVertexPosition(vertex,supportPoint);supportPoint.applyMatrix4(node.matrixWorld);
      if(supportPoint.y<minY){minY=supportPoint.y;support={mesh:node,vertex};}
    }
  });
  const swordSurfaceY=flyingSword.position.y+.013*3.2;
  const flightOffset=swordSurfaceY-minY,groundOffset=.022;
  let current:MotionName='idle',wasFlying=false,landing=0;
  const weights=new Map<MotionName,number>([...actions.keys()].map(name=>[name,name==='idle'?1:0]));
  const animate=(dt:number,_time:number,speed:number,flying:boolean,attack:number,dashProgress=-1)=>{
    heldSword.visible=!flying;flyingSword.visible=flying;
    if(dt===0){if(wasFlying!==flying)resetPose(flying);return;}
    if(wasFlying&&!flying)landing=.3;wasFlying=flying;landing=Math.max(0,landing-dt);
    current=flying?'float':attack>0?'slash':dashProgress>=0?'crouchSlash':landing>0?'land':speed>.08?(speed<2?'walk':'run'):'idle';
    const blend=1-Math.exp(-dt*24);
    for(const [name,action] of actions){
      const weight=THREE.MathUtils.lerp(weights.get(name)??0,name===current?1:0,blend);weights.set(name,weight);action.setEffectiveWeight(weight);
      action.paused=name==='slash'||name==='land'||name==='crouchSlash';
      if(name==='run')action.setEffectiveTimeScale(THREE.MathUtils.clamp(speed/6.35,.3,1.6));
      if(name==='walk')action.setEffectiveTimeScale(THREE.MathUtils.clamp(speed/1.35,.3,1.6));
      if(name==='slash'&&attack>0){
        const seconds=attack*.45;
        // Preserve the reference sweep; time-warp its forward arc across our damage window.
        const phase=seconds<=.10?seconds/.10*.33:seconds<=.12?.33+(seconds-.10)/.02*.055:seconds<=.24?.385+(seconds-.12)/.12*.032:.417+(seconds-.24)/.21*.303;
        action.time=action.getClip().duration*phase;
      }
      if(name==='land')action.time=action.getClip().duration*(.25+.75*(1-landing/.3));
      if(name==='crouchSlash'&&dashProgress>=0)action.time=action.getClip().duration*Math.min(.999,dashProgress);
    }
    mixer.update(dt);visual.position.y=THREE.MathUtils.lerp(visual.position.y,flying?flightOffset:groundOffset,blend);
  };
  const resetPose=(flying=false)=>{
    wasFlying=flying;landing=0;current=flying?'float':'idle';
    visual.position.y=flying?flightOffset:groundOffset;
    for(const [name,action] of actions){action.time=0;weights.set(name,name===current?1:0);action.setEffectiveWeight(name===current?1:0);}
    mixer.update(0);heldSword.visible=!flying;flyingSword.visible=flying;
  };
  resetPose();
  return {root,animate,resetPose,diagnostics(){
    root.updateMatrixWorld(true);const tip=new THREE.Vector3(0,1.04,0);heldSword.localToWorld(tip);root.worldToLocal(tip);
    support!.mesh.getVertexPosition(support!.vertex,supportPoint);supportPoint.applyMatrix4(support!.mesh.matrixWorld);root.worldToLocal(supportPoint);
    return {leftLeg:bones.get('LeftUpLeg')!.rotation.x,swordTip:{x:tip.x,y:tip.y,z:tip.z},motion:current,bones:bones.size,clips:[...actions.keys()],flightSupportGap:supportPoint.y-swordSurfaceY,flyingSwordVisible:flyingSword.visible,motionTime:actions.get(current)!.time};
  },dispose(){mixer.stopAllAction();mixer.uncacheRoot(model);disposeSkeletons(model);}};
}

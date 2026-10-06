import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Original Chinese costume and face, authored in the normalized character's metre frame. */
export function dressCultivator(rig: THREE.Group, visual: THREE.Group, bones: Map<string, THREE.Bone>) {
  const skinCanvas=document.createElement('canvas');skinCanvas.width=256;skinCanvas.height=256;
  const skinContext=skinCanvas.getContext('2d')!,skinPixels=skinContext.createImageData(256,256);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const index=(y*256+x)*4;
    const grain=Math.sin(x*133.7+y*71.9)*Math.cos(x*27.3-y*89.1)*3;
    const warm=5*Math.exp(-Math.pow((y-145)/28,2));
    skinPixels.data[index]=204+grain+warm;skinPixels.data[index+1]=161+grain;skinPixels.data[index+2]=133+grain-warm*.4;skinPixels.data[index+3]=255;
  }
  skinContext.putImageData(skinPixels,0,0);const skinMap=new THREE.CanvasTexture(skinCanvas);skinMap.colorSpace=THREE.SRGBColorSpace;
  const skin = new THREE.MeshStandardMaterial({map:skinMap,roughness:.69});
  const hair = new THREE.MeshStandardMaterial({color:'#181a19',roughness:.64});
  const eye = new THREE.MeshStandardMaterial({color:'#201b18',roughness:.3});
  const white = new THREE.MeshStandardMaterial({color:'#d4c7ac',roughness:.9,side:THREE.DoubleSide});
  const jade = new THREE.MeshStandardMaterial({color:'#315955',roughness:.75,side:THREE.DoubleSide});
  const gold = new THREE.MeshStandardMaterial({color:'#9f8150',metalness:.72,roughness:.37});
  rig.updateMatrixWorld(true);
  const frameInverse = visual.matrixWorld.clone().invert();
  const bonePoint = (name:string) => bones.get(name)!.getWorldPosition(new THREE.Vector3()).applyMatrix4(frameInverse);
  const headPoint = bonePoint('Head');
  const parts: {geometry:THREE.BufferGeometry;material:THREE.Material;bone:string}[]=[];
  const add = (geometry:THREE.BufferGeometry,material:THREE.Material,point:THREE.Vector3,scale:THREE.Vector3,bone='Head',rotation?:THREE.Euler) => {
    geometry.applyMatrix4(new THREE.Matrix4().compose(point,new THREE.Quaternion().setFromEuler(rotation??new THREE.Euler()),scale));
    parts.push({geometry,material,bone});
  };
  const offset=(x:number,y:number,z:number)=>headPoint.clone().add(new THREE.Vector3(x,y,z));
  // A continuous sculpted surface: jaw, cheekbones, eye sockets, nose bridge and chin.
  const face=new THREE.SphereGeometry(1,48,36), positions=face.getAttribute('position');
  const gauss=(a:number,s:number)=>Math.exp(-a*a/(s*s));
  for(let i=0;i<positions.count;i++){
    let x=positions.getX(i)*.088,y=positions.getY(i)*.122,z=positions.getZ(i)*.083;
    if(y<-.025)x*=1-(-y-.025)*2.2;
    if(z<0){
      const front=Math.max(0,-z/.083);
      z-=front*(.013*gauss(x,.015)*gauss(y-.024,.055)+.028*gauss(x,.018)*gauss(y+.006,.016));
      z-=front*.007*(gauss(x-.044,.025)+gauss(x+.044,.025))*gauss(y+.018,.032);
      z+=front*.009*(gauss(x-.033,.018)+gauss(x+.033,.018))*gauss(y-.028,.019);
      z-=front*.006*gauss(x,.033)*gauss(y+.058,.012);
    }
    positions.setXYZ(i,x,y,z);
  }
  face.computeVertexNormals();add(face,skin,offset(0,.061,-.006),new THREE.Vector3(1,1,1));
  add(new THREE.CylinderGeometry(.035,.041,.09,24),skin,offset(0,-.085,.012),new THREE.Vector3(1,1,1));
  for(const side of [-1,1]){
    add(new THREE.SphereGeometry(1,16,12),skin,offset(side*.086,.055,.001),new THREE.Vector3(.017,.033,.014));
    add(new THREE.SphereGeometry(1,20,12),white,offset(side*.033,.090,-.071),new THREE.Vector3(.017,.006,.005));
    add(new THREE.SphereGeometry(1,16,10),eye,offset(side*.033,.09,-.077),new THREE.Vector3(.004,.004,.002));
    const brow=new THREE.CatmullRomCurve3([offset(side*.015,.109,-.072),offset(side*.037,.113,-.075),offset(side*.056,.106,-.065)]);
    parts.push({geometry:new THREE.TubeGeometry(brow,10,.0027,6,false),material:hair,bone:'Head'});
    const lid=new THREE.CatmullRomCurve3([offset(side*.017,.091,-.075),offset(side*.033,.096,-.077),offset(side*.05,.09,-.07)]);
    parts.push({geometry:new THREE.TubeGeometry(lid,10,.0017,5,false),material:skin,bone:'Head'});
  }
  const lips=new THREE.MeshStandardMaterial({color:'#8a5e50',roughness:.85});
  const lipCurve=new THREE.CatmullRomCurve3([offset(-.024,.007,-.080),offset(-.01,.005,-.088),offset(0,.008,-.09),offset(.01,.005,-.088),offset(.024,.007,-.08)]);
  parts.push({geometry:new THREE.TubeGeometry(lipCurve,24,.0017,6,false),material:lips,bone:'Head'});
  // Hair follows the skull with an open forehead; it does not hide the face behind a helmet.
  const cap=new THREE.SphereGeometry(1,40,24),capPositions=cap.getAttribute('position'),indices:number[]=[];
  const capIndex=cap.index!;
  const retained=(i:number)=>capPositions.getY(i)>(capPositions.getZ(i)<-.25?.37:-.72);
  for(let i=0;i<capIndex.count;i+=3){const a=capIndex.getX(i),b=capIndex.getX(i+1),c=capIndex.getX(i+2);if(retained(a)&&retained(b)&&retained(c))indices.push(a,b,c);}
  cap.setIndex(indices);add(cap,hair,offset(0,.075,.001),new THREE.Vector3(.094,.123,.09));
  add(new THREE.SphereGeometry(1,24,16),hair,offset(0,.212,.028),new THREE.Vector3(.047,.051,.041));
  add(new THREE.TorusGeometry(.042,.004,8,32),gold,offset(0,.196,.026),new THREE.Vector3(1,1,1), 'Head',new THREE.Euler(Math.PI/2,0,0));
  add(new THREE.CylinderGeometry(.003,.003,.175,10),gold,offset(0,.21,.027),new THREE.Vector3(1,1,1),'Head',new THREE.Euler(0,0,Math.PI/2-.1));
  for(let i=0;i<10;i++){
    const x=(i-4.5)*.0055;
    const curve=new THREE.CatmullRomCurve3([offset(x,.181,.025),offset(x,.115,.083),offset(x,.014,.15),offset(x*.5,-.15,.22),offset(x*.7,-.27,.21)]);
    parts.push({geometry:new THREE.TubeGeometry(curve,18,.0038,5,false),material:hair,bone:'Head'});
  }
  const chest=bonePoint('Spine2'),hips=bonePoint('Hips');
  // Crossed lapels and a narrow scarf distinguish the robe from the source armour.
  const panel=(points:THREE.Vector3[],material:THREE.Material,bone:string)=>{
    const geometry=new THREE.BufferGeometry().setFromPoints(points);geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();parts.push({geometry,material,bone});
  };
  for(const side of [-1,1]){
    const end=-.07;
    panel([new THREE.Vector3(side*.105,chest.y+.11,-.135),new THREE.Vector3(side*.153,chest.y+.092,-.13),new THREE.Vector3(end,hips.y+.19,-.165),new THREE.Vector3(end-.043,hips.y+.20,-.17)],white,'Spine2');
    panel([new THREE.Vector3(side*.145,hips.y-.02,-.16),new THREE.Vector3(side*.225,hips.y-.02,-.11),new THREE.Vector3(side*.285,hips.y-.49,-.08),new THREE.Vector3(side*.123,hips.y-.49,-.16)],jade,'Hips');
  }
  const groups=new Map<string,THREE.BufferGeometry[]>();
  for(const part of parts){
    const bone=bones.get(part.bone)!;rig.updateMatrixWorld(true);
    part.geometry.applyMatrix4(bone.matrixWorld.clone().invert().multiply(visual.matrixWorld));
    const key=`${part.bone}:${part.material.uuid}`;const list=groups.get(key)??[];list.push(part.geometry);groups.set(key,list);
  }
  for(const [key,geometries] of groups){
    const boneName=key.split(':')[0],material=parts.find(p=>`${p.bone}:${p.material.uuid}`===key)!.material;
    const geometry=mergeGeometries(geometries.map(g=>g.index?g.toNonIndexed():g),false)!;
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`AuthoredCultivator_${boneName}`;mesh.castShadow=true;mesh.receiveShadow=true;bones.get(boneName)!.add(mesh);geometries.forEach(g=>g.dispose());
  }
  return {headPoint};
}

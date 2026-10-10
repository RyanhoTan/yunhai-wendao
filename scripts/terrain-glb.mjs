import * as THREE from 'three';
import {readFile,writeFile} from 'node:fs/promises';

// The source assets contain one untransformed static mesh. Reject other layouts
// rather than silently losing node transforms, interleaved attributes or skins.
export async function readTerrain(path) {
  const raw=await readFile(path);
  if(raw.toString('ascii',0,4)!=='glTF'||raw.readUInt32LE(4)!==2||raw.readUInt32LE(8)!==raw.length)throw new Error('Invalid GLB');
  const length=raw.readUInt32LE(12),document=JSON.parse(raw.subarray(20,20+length));
  const binary=raw.subarray(28+length);
  if(raw.readUInt32LE(16)!==0x4E4F534A||raw.readUInt32LE(24+length)!==0x004E4942||raw.readUInt32LE(20+length)!==binary.length)throw new Error('Invalid GLB chunks');
  if(document.buffers.length!==1||document.buffers[0].uri||document.buffers[0].byteLength>binary.length)throw new Error('Expected one embedded buffer');
  if(document.meshes.length!==1||document.nodes.length!==1||document.nodes[0].mesh!==0||Object.keys(document.nodes[0]).some(k=>!['name','mesh'].includes(k)))throw new Error('Expected one identity mesh');
  if(document.meshes[0].primitives.length!==1)throw new Error('Expected one primitive');
  const primitive=document.meshes[0].primitives[0];
  const array=index=>{
    const a=document.accessors[index],v=document.bufferViews[a.bufferView];
    if(a.sparse||v.byteStride)throw new Error('Unsupported accessor layout');
    const kind={5126:Float32Array,5125:Uint32Array,5123:Uint16Array}[a.componentType],width={VEC3:3,VEC2:2,SCALAR:1}[a.type];
    if(!kind||!width)throw new Error('Unsupported accessor type');
    const start=(v.byteOffset??0)+(a.byteOffset??0),size=a.count*width*kind.BYTES_PER_ELEMENT;
    const bytes=binary.subarray(start,start+size);if(bytes.length!==size)throw new Error('Truncated accessor');
    return {array:new kind(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),width};
  };
  const geometry=new THREE.BufferGeometry();
  for(const [semantic,index] of Object.entries(primitive.attributes)){
    const name={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv'}[semantic];if(!name)throw new Error('Unexpected terrain attribute '+semantic);
    const a=array(index);geometry.setAttribute(name,new THREE.BufferAttribute(a.array,a.width));
  }
  const indices=array(primitive.indices);geometry.setIndex(new THREE.BufferAttribute(indices.array,1));geometry.computeBoundingBox();
  return {raw,document,binary,geometry,primitive};
}

export function sourcePixelSurface(geometry,pixels) {
  const bounds=geometry.boundingBox,size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),scale=3/Math.max(size.x,size.y,size.z);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.scale.setScalar(scale);mesh.position.copy(center).multiplyScalar(-scale);mesh.updateMatrixWorld();
  const camera=new THREE.PerspectiveCamera(40,1200/800,.001,100);camera.position.set(.001,5.2,.001);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const ray=new THREE.Raycaster();
  return pixels.map(pixel=>{ray.setFromCamera(new THREE.Vector2(pixel[0]/600-1,1-pixel[1]/400),camera);const hit=ray.intersectObject(mesh)[0];if(!hit)throw new Error('Source pixel misses mesh: '+pixel);return {pixel,point:mesh.worldToLocal(hit.point).toArray(),normal:hit.face.normal.toArray()};});
}

/** XZ bins retain every layer; callers choose by height/normal, not a sky ray. */
export function triangleGrid(geometry,cellSize) {
  const p=geometry.attributes.position,indices=geometry.index.array,cells=new Map();
  for(let t=0;t<indices.length;t+=3){
    const ids=[indices[t],indices[t+1],indices[t+2]],xs=ids.map(i=>p.getX(i)),zs=ids.map(i=>p.getZ(i));
    for(let z=Math.floor(Math.min(...zs)/cellSize);z<=Math.floor(Math.max(...zs)/cellSize);z++)for(let x=Math.floor(Math.min(...xs)/cellSize);x<=Math.floor(Math.max(...xs)/cellSize);x++){
      const key=x+','+z,list=cells.get(key)??[];list.push(t);cells.set(key,list);
    }
  }
  function surfaces(x,z){
    const hits=[];
    for(const t of cells.get(Math.floor(x/cellSize)+','+Math.floor(z/cellSize))??[]){
      const a=indices[t],b=indices[t+1],c=indices[t+2],ax=p.getX(a),az=p.getZ(a),bx=p.getX(b),bz=p.getZ(b),cx=p.getX(c),cz=p.getZ(c);
      const den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(den)<1e-12)continue;
      const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/den,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/den,w=1-u-v;
      if(Math.min(u,v,w)<-1e-7)continue;
      const ay=p.getY(a),by=p.getY(b),cy=p.getY(c),nx=(by-ay)*(cz-az)-(bz-az)*(cy-ay),ny=(bz-az)*(cx-ax)-(bx-ax)*(cz-az),nz=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax),length=Math.hypot(nx,ny,nz);
      hits.push({y:u*ay+v*by+w*cy,normal:[nx/length,ny/length,nz/length],triangle:t/3});
    }
    return hits.sort((a,b)=>b.y-a.y);
  }
  return {cells,surfaces,top:(x,z)=>surfaces(x,z).find(h=>h.normal[1]>0)};
}

export async function writeTerrain(source,destination,geometry) {
  const doc=structuredClone(source.document),parts=[],views=[];
  let byteLength=0;
  for(const [i,view] of doc.bufferViews.entries()){
    const semantic=Object.entries(source.primitive.attributes).find(([,a])=>doc.accessors[a].bufferView===i)?.[0];
    let data=source.binary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
    if(semantic){const attribute=geometry.attributes[{POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv'}[semantic]],index=source.primitive.attributes[semantic];if(attribute.count!==doc.accessors[index].count)throw new Error('Vertex count changes are unsupported');data=Buffer.from(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength);}
    if(doc.accessors[source.primitive.indices].bufferView===i){const a=geometry.index.array;data=Buffer.from(a.buffer,a.byteOffset,a.byteLength);doc.accessors[source.primitive.indices].count=a.length;}
    const pad=Buffer.alloc((-byteLength)&3);parts.push(pad,data);byteLength+=pad.length;views.push({...view,byteOffset:byteLength,byteLength:data.length});byteLength+=data.length;
  }
  geometry.computeBoundingBox();const a=doc.accessors[source.primitive.attributes.POSITION];a.min=geometry.boundingBox.min.toArray();a.max=geometry.boundingBox.max.toArray();
  doc.bufferViews=views;doc.buffers[0].byteLength=byteLength;
  let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((-json.length)&3,32)]);const binary=Buffer.concat([...parts,Buffer.alloc((-byteLength)&3)]);
  const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4E4F534A,16);
  const bh=Buffer.alloc(8);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004E4942,4);await writeFile(destination,Buffer.concat([header,json,bh,binary]));
}

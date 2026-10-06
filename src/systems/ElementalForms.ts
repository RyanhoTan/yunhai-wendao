import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const ELEMENTS = ['metal','wood','water','fire','earth'] as const;
export type Element = typeof ELEMENTS[number];
export const ELEMENT_INFO: Record<Element,{name:string;color:string;damage:number;speed:number}> = {
  metal:{name:'金 · 飞剑',color:'#ffe0a1',damage:14,speed:34},
  wood:{name:'木 · 青藤',color:'#a2e77f',damage:12,speed:29},
  water:{name:'水 · 流珠',color:'#82d9ff',damage:12,speed:32},
  fire:{name:'火 · 炎羽',color:'#ffa557',damage:16,speed:31},
  earth:{name:'土 · 岩矢',color:'#d3b284',damage:18,speed:25},
};

function tinted(g:THREE.BufferGeometry,color:string) {
  if(g.index) {const flat=g.toNonIndexed();g.dispose();g=flat;}
  const c=new THREE.Color(color),data=new Float32Array(g.getAttribute('position').count*3);
  for(let i=0;i<data.length;i+=3){data[i]=c.r;data[i+1]=c.g;data[i+2]=c.b;}
  g.setAttribute('color',new THREE.BufferAttribute(data,3));g.deleteAttribute('uv');return g;
}
function merge(parts:THREE.BufferGeometry[]) {const result=mergeGeometries(parts)!;parts.forEach(g=>g.dispose());result.computeBoundingSphere();return result;}
function leaf(x:number,y:number,z:number,angle:number) {
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,.13,.04,.14,0,0,.36,-.13,.04,.14,0,0,0,0,0,.36],3));
  g.computeVertexNormals();g.rotateZ(angle);g.translate(x,y,z);return tinted(g,'#83c75b');
}

/** Original metre-scale silhouettes; the references inform orbit/launch rhythm. */
export function createElementalForms() {
  const swordShape=new THREE.Shape();swordShape.moveTo(-.08,-.44);swordShape.lineTo(.08,-.44);swordShape.lineTo(.085,.38);swordShape.lineTo(0,.72);swordShape.lineTo(-.085,.38);swordShape.closePath();
  const blade=new THREE.ExtrudeGeometry(swordShape,{depth:.045,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.012,bevelThickness:.01});blade.rotateX(Math.PI/2);
  const guard=new THREE.BoxGeometry(.38,.075,.07);guard.translate(0,0,-.45);
  const hilt=new THREE.CylinderGeometry(.045,.045,.25,6);hilt.rotateX(Math.PI/2);hilt.translate(0,0,-.61);
  const metal=merge([tinted(blade,'#fff1ca'),tinted(guard,'#c8a152'),tinted(hilt,'#726a4b')]);

  const vines:THREE.BufferGeometry[]=[];
  for(let strand=0;strand<2;strand++) {
    const pts=Array.from({length:14},(_,i)=>{const t=i/13,a=t*7+strand*Math.PI;return new THREE.Vector3(Math.sin(a)*.1,Math.cos(a)*.08,t*1.12-.5);});
    vines.push(tinted(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),20,.035,5,false),strand?'#547f36':'#355d2f'));
  }
  for(let i=0;i<6;i++)vines.push(leaf(Math.sin(i*2)*.1,Math.cos(i*2)*.08,i*.17-.4,i*Math.PI*.8));
  const wood=merge(vines);

  const profile=Array.from({length:17},(_,i)=>{const t=i/16;return new THREE.Vector2(.34*Math.sin(Math.PI*t)*Math.pow(1-t,.42),t*1.12-.48);});
  const water=tinted(new THREE.LatheGeometry(profile,16),'#70c8ed');water.rotateX(Math.PI/2);
  const flames:THREE.BufferGeometry[]=[];
  for(let strand=0;strand<3;strand++) {
    const profile=Array.from({length:12},(_,i)=>{const t=i/11;return new THREE.Vector2(.24*Math.sin(Math.PI*t)*Math.pow(1-t,.4),t*1.25-.48);});
    const g=new THREE.LatheGeometry(profile,9),pos=g.getAttribute('position');
    for(let i=0;i<pos.count;i++){const t=(pos.getY(i)+.48)/1.25;pos.setX(i,pos.getX(i)+Math.sin(t*5+strand*2)*t*.2);pos.setZ(i,pos.getZ(i)+Math.cos(t*4+strand*2)*t*.12);}
    g.computeVertexNormals();g.scale(strand?.55:1,strand?.78:1,strand?.55:1);g.translate(strand===1?.12:strand===2?-.12:0,0,0);g.rotateX(Math.PI/2);
    flames.push(tinted(g,strand?'#ffe2a0':'#f77932'));
  }
  const fire=merge(flames);
  const rock=new THREE.IcosahedronGeometry(.44,1),rp=rock.getAttribute('position');
  for(let i=0;i<rp.count;i++){const x=rp.getX(i),y=rp.getY(i),z=rp.getZ(i),n=1+.17*Math.sin(x*19+y*11+z*17);rp.setXYZ(i,x*n,y*n*.86,z*n*1.12);}
  rock.computeVertexNormals();const earth=tinted(rock,'#ae8a58');
  const geometry={metal,wood,water,fire,earth};
  const materials=Object.fromEntries(ELEMENTS.map(e=>[e,new THREE.MeshStandardMaterial({vertexColors:true,roughness:e==='water'?.2:e==='metal'?.32:.85,metalness:e==='metal'?.55:0,emissive:new THREE.Color(ELEMENT_INFO[e].color),emissiveIntensity:e==='fire'?.8:e==='metal'?.18:.06,side:e==='wood'?THREE.DoubleSide:THREE.FrontSide})])) as Record<Element,THREE.MeshStandardMaterial>;
  return {geometry,materials,dispose(){ELEMENTS.forEach(e=>{geometry[e].dispose();materials[e].dispose();});}};
}

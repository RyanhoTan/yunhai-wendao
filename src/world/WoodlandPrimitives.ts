import * as THREE from 'three';
import type {WoodlandDetail} from './WoodlandTree';

export type Leaf = {base:THREE.Vector3;axis:THREE.Vector3;length:number;width:number;twist:number;tone:number};
export const UP=new THREE.Vector3(0,1,0),TAU=Math.PI*2;

export class Writer {
  position:number[]=[];color:number[]=[];uv:number[]=[];wind:number[]=[];sway:number[]=[];cluster:number[]=[];indices:number[]=[];
  constructor(private swayAt:(point:THREE.Vector3)=>number=()=>0){}
  vertex(p:THREE.Vector3,c:THREE.Color,u=0,v=0,wind=0,cluster=0,swayOverride?:number){const i=this.position.length/3;this.position.push(p.x,p.y,p.z);this.color.push(c.r,c.g,c.b);this.uv.push(u,v);this.wind.push(wind);this.sway.push(swayOverride??this.swayAt(p));this.cluster.push(cluster);return i;}
  triangle(a:number,b:number,c:number){this.indices.push(a,b,c);}
  finish(name:string,padding=0){const g=new THREE.BufferGeometry();g.name=name;g.setAttribute('position',new THREE.Float32BufferAttribute(this.position,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.color,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));g.setAttribute('woodlandWind',new THREE.Float32BufferAttribute(this.wind,1));g.setAttribute('woodlandSway',new THREE.Float32BufferAttribute(this.sway,1));g.setAttribute('woodlandCluster',new THREE.Float32BufferAttribute(this.cluster,1));g.setAttribute('woodlandLegacyGround',new THREE.Float32BufferAttribute(new Float32Array(this.position.length/3),1));g.setIndex(this.indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();g.boundingBox!.expandByScalar(padding);g.boundingSphere!.radius+=padding;return g;}
}

export function sweep(writer:Writer,points:THREE.Vector3[],radius:number,tip:number,sides:number,color:THREE.Color){
  const rows:number[][]=[],side=new THREE.Vector3();let distance=0;
  for(let k=0;k<points.length;k++){
    if(k)distance+=points[k].distanceTo(points[k-1]);
    const axis=points[Math.min(k+1,points.length-1)].clone().sub(points[Math.max(0,k-1)]).normalize();
    if(!k)side.crossVectors(axis,Math.abs(axis.y)>.93?new THREE.Vector3(0,0,1):UP).normalize();
    else{side.addScaledVector(axis,-side.dot(axis));if(side.lengthSq()<.001)side.crossVectors(axis,UP);side.normalize();}
    const other=axis.clone().cross(side),row:number[]=[],r=THREE.MathUtils.lerp(radius,tip,Math.pow(k/(points.length-1),.86));
    for(let j=0;j<=sides;j++){
      const angle=(j%sides)*TAU/sides,grain=1+.055*Math.sin(angle*3+k*.7),p=points[k].clone().addScaledVector(side,Math.cos(angle)*r*grain).addScaledVector(other,Math.sin(angle)*r*grain);
      if(k===0&&points[0].y===0)p.y=0;
      row.push(writer.vertex(p,color.clone().multiplyScalar(.86+.10*Math.cos(angle-.4)),j/sides,distance*.54));
    }
    rows.push(row);
  }
  for(let k=0;k<rows.length-1;k++)for(let j=0;j<sides;j++){writer.triangle(rows[k][j],rows[k][j+1],rows[k+1][j]);writer.triangle(rows[k][j+1],rows[k+1][j+1],rows[k+1][j]);}
}

export function leaf(writer:Writer,item:Leaf,color:THREE.Color,detail:WoodlandDetail,sizeOverride?:number){
  const {base,axis,length,width,twist,tone}=item;
  const lateral=new THREE.Vector3().crossVectors(UP,axis);if(lateral.lengthSq()<.01)lateral.set(1,0,0);lateral.normalize().applyAxisAngle(axis,twist);
  const normal=axis.clone().cross(lateral).normalize(),size=sizeOverride??(detail===0?1.28:detail===1?2.35:3.85);
  const p=(u:number,t:number)=>base.clone().addScaledVector(axis,length*t*size).addScaledVector(lateral,width*u*Math.sin(t*Math.PI)*size).addScaledVector(normal,length*(.065*Math.sin(t*Math.PI)-.11*t*t)*size);
  const c=color.clone().multiplyScalar(tone),a=writer.vertex(base,c,.5,0,0),l=writer.vertex(p(-1,.45),c.clone().multiplyScalar(.94),0,.45,.5),r=writer.vertex(p(1,.45),c.clone().multiplyScalar(1.04),1,.45,.5),b=writer.vertex(p(0,1),c.clone().multiplyScalar(1.12),.5,1,1);
  if(detail===2){writer.triangle(a,l,r);writer.triangle(l,b,r);}
  else{const m=writer.vertex(p(0,.45).addScaledVector(normal,length*.08),c.clone().multiplyScalar(1.08),.5,.45,.5);writer.triangle(a,l,m);writer.triangle(a,m,r);writer.triangle(l,b,m);writer.triangle(m,b,r);}
}

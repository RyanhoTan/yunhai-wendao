import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {woodlandRandom} from './WoodlandGeometry';
import {createRockSurfaceMaterial} from './NaturalLandMaterial';
import {landNoise} from './NaturalTerrain';
import {TERRAIN_BOUNDS} from './WorldLayout';

type Placement={x:number;y:number;z:number;scale:THREE.Vector3;yaw:number;kind:number};
type Trunk={x:number;z:number;r:number};
/** Broken limestone bedding, retaining the same silhouette anchors in both LODs. */
function cragGeometry(seed:number,low:boolean){
  const random=woodlandRandom(seed),facets=low?16:32;
  const strata=[0,.06,.19,.32,.46,.61,.74,.85,.94,1].map((h,i)=>i===0||i===9?h:h+(random()-.5)*.045);
  // Both LODs evaluate the same surface and retain every structural bedding
  // anchor. Extra near rings bevel the breaks instead of creating flat shards.
  const heights=low?strata:strata.flatMap((h,i)=>i===9?[h]:[h,h+(strata[i+1]-h)*.27,h+(strata[i+1]-h)*.72]);
  const offset=random()*67,leanX=(random()-.5)*.13,leanZ=(random()-.5)*.10;
  const layerWidths=strata.map((_,i)=>.87+random()*.17-(i===9?.22:0));
  const positions:number[]=[],indices:number[]=[];
  for(const h of heights)for(let i=0;i<facets;i++){
    const angle=i*Math.PI*2/facets,u=Math.cos(angle),v=Math.sin(angle);
    let layer=0;while(layer<strata.length-2&&h>strata[layer+1])layer++;
    const t=(h-strata[layer])/(strata[layer+1]-strata[layer]);
    const blend=THREE.MathUtils.smoothstep(t,.52,.84);
    const bedding=THREE.MathUtils.lerp(layerWidths[layer],layerWidths[layer+1],blend);
    const fracture=landNoise(u*3.2+offset,v*3.2-7+h*.34)*.16
      +landNoise(u*7.3+offset,v*7.3+h*1.4)*.065
      +landNoise(u*15.7-offset,v*15.7+h*4)*.022;
    const groove=Math.abs(landNoise(u*6.1+offset,v*6.1+h*.6))* .115;
    const radius=(.98-h*.29)*bedding+fracture-groove;
    const crown=h>.85?(h-.85)/.15*(landNoise(u*2.7+offset,v*2.7-11)*.045-.02):0;
    positions.push(u*radius*.5+h*leanX,h+crown,v*radius*.45+h*leanZ);
  }
  const rings=heights;
  for(let row=0;row<rings.length-1;row++)for(let i=0;i<facets;i++){
    const next=(i+1)%facets,a=row*facets+i,b=row*facets+next,c=(row+1)*facets+i,d=(row+1)*facets+next;
    indices.push(a,c,b,b,c,d);
  }
  for(let i=1;i<facets-1;i++){indices.push(0,i,(i+1));const top=(rings.length-1)*facets;indices.push(top,top+i+1,top+i);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count*3),3));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.name=`OriginalBrokenLimestone_${seed}_${low?'Far':'Near'}`;return geometry;
}

/** Deterministic cliff ribs and talus; the sea, shoreline and lake banks are excluded. */
export function createLimestoneOutcrops(root:THREE.Group,heightAt:(x:number,z:number)=>number,isProtected:(x:number,z:number,extra:number)=>boolean,trunks:readonly Trunk[]){
  const group=new THREE.Group();group.name='OriginalLimestoneOutcrops';root.add(group);
  const random=woodlandRandom(194708),placements:Placement[]=[],walls:THREE.Box3[]=[];
  const prototypes=Array.from({length:8},(_,i)=>[cragGeometry(9081+i*137,false),cragGeometry(9081+i*137,true)]);
  const extent=Math.max(...prototypes.flat().map(g=>Math.max(Math.abs(g.boundingBox!.min.x),Math.abs(g.boundingBox!.max.x),Math.abs(g.boundingBox!.min.z),Math.abs(g.boundingBox!.max.z))));
  for(let z=-280;z<104;z+=13)for(let x=-477;x<286;x+=13){
    const px=x+(random()-.5)*9,pz=z+(random()-.5)*9,h=heightAt(px,pz);
    const dx=(heightAt(px+2,pz)-heightAt(px-2,pz))*.25,dz=(heightAt(px,pz+2)-heightAt(px,pz-2))*.25,slope=Math.hypot(dx,dz);
    const cliff=slope>1.35&&h>15,talus=!cliff&&slope<1.05&&h>5;
    if(!Number.isFinite(h+slope)||(!cliff&&!talus)||random()>(cliff?.85:.34))continue;
    // The main mountain now has its own displaced, conforming rock skin.
    // Legacy ribs stretched a 6–12m rounded prop through up to 78m of cliff,
    // leaving freestanding columns and long flat caps over that real surface.
    // Retain talus and other regions; do not stack a second mountain silhouette
    // or its broad collision box onto the rebuilt geological faces.
    const legacyMainRib=cliff&&px>-160&&px<160&&pz>-155&&pz<94;
    if(Math.hypot((px+160)/1.25,pz-110)<65||px<TERRAIN_BOUNDS.minX+6)continue;
    const width=cliff?6+random()*6:1.2+random()*2.8;let height=cliff?3+random()*4:.7+random()*2.2;
    const scale=new THREE.Vector3(width,height,width*(.70+random()*.20)),radius=Math.hypot(scale.x*extent,scale.z*extent)+.35;
    if(isProtected(px,pz,radius+.5)||trunks.some(t=>Math.hypot(px-t.x,pz-t.z)<radius+t.r+.35))continue;
    // A vertical rib penetrates the cliff on its upslope side; talus is partly buried in soil.
    const yaw=random()*Math.PI*2,kind=Math.floor(random()*prototypes.length),p=prototypes[kind][0].getAttribute('position'),c=Math.cos(yaw),s=Math.sin(yaw);
    let lowest=Infinity,highest=-Infinity;
    for(let i=0;i<p.count;i++)if(p.getY(i)<.0001){
      const x=p.getX(i)*scale.x,z=p.getZ(i)*scale.z,ground=heightAt(px+x*c+z*s,pz-x*s+z*c);lowest=Math.min(lowest,ground);highest=Math.max(highest,ground);
    }
    // Ribs span the local cliff drop, rather than becoming small badges on a tall face.
    if(cliff){height=(Math.min(78,highest-lowest)+height)/.83;scale.y=height;}
    // Consume the same candidate random values before rejecting this legacy
    // layer, so the removal itself does not move later rocks in other regions.
    if(legacyMainRib)continue;
    const y=lowest-height*.17;placements.push({x:px,y,z:pz,scale,yaw,kind});
  }
  const material=createRockSurfaceMaterial();
  const cells=new Map<string,Placement[]>();
  for(const p of placements){const key=`${Math.floor(p.x/96)},${Math.floor(p.z/96)}`;const list=cells.get(key)??[];list.push(p);cells.set(key,list);}
  for(const [key,list] of cells){
    const [cx,cz]=key.split(',').map(Number),center=new THREE.Vector3(cx*96+48,list.reduce((sum,p)=>sum+p.y,0)/list.length,cz*96+48),lod=new THREE.LOD();lod.position.copy(center);lod.name=`LimestoneCell_${key}`;
    for(let detail=0;detail<2;detail++){
      const level=new THREE.Group();
      const parts:THREE.BufferGeometry[]=[];
      for(const p of list){
        const geometry=prototypes[p.kind][detail],world=new THREE.Matrix4().compose(new THREE.Vector3(p.x,p.y,p.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.yaw),p.scale);
        const local=new THREE.Matrix4().makeTranslation(-center.x,-center.y,-center.z).multiply(world);parts.push(geometry.clone().applyMatrix4(local));
        if(detail===0)walls.push(geometry.boundingBox!.clone().applyMatrix4(world));
      }
      const geometry=mergeGeometries(parts,false)!;parts.forEach(g=>g.dispose());geometry.computeBoundingBox();geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,material);mesh.name=`Limestone_${key}_LOD${detail}`;mesh.castShadow=detail===0;mesh.receiveShadow=true;level.add(mesh);
      lod.addLevel(level,detail===0?0:95,.1);
    }
    group.add(lod);
  }
  prototypes.flat().forEach(g=>g.dispose());if(!placements.length)material.dispose();
  group.userData={placements:placements.map(p=>({x:p.x,y:p.y,z:p.z,width:p.scale.x,height:p.scale.y,depth:p.scale.z})),count:placements.length,cliffRibs:placements.filter(p=>p.scale.y>5).length};
  return {walls,cameraOccluders:walls};
}

import * as THREE from 'three';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readTerrain,triangleGrid,writeTerrain} from './terrain-glb.mjs';

const directory='artifacts/terrain-pipeline/assembly/sect-v1';
const measured=JSON.parse(await readFile(directory+'/source-measurements.json'));
const mountain=await readTerrain(measured.mountain.path),summit=await readTerrain(measured.summit.path);
for(const [asset,source] of [[mountain,measured.mountain],[summit,measured.summit]])if(createHash('sha256').update(asset.raw).digest('hex')!==source.sha256)throw new Error('Measured source changed');
const mPoints=measured.mountain.road.map(p=>new THREE.Vector3(...p.point)),sPoints=measured.summit.landmarks.slice(1,6).map(p=>new THREE.Vector3(...p.point));
const mScale=220,foot=mPoints[0],mPosition=new THREE.Vector3(-foot.z*mScale,2-foot.y*mScale,126+foot.x*mScale);
const mountainMatrix=new THREE.Matrix4().compose(mPosition,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2),new THREE.Vector3(mScale,mScale,mScale));
const worldMountain=mPoints.map(p=>p.clone().applyMatrix4(mountainMatrix)),end=worldMountain.at(-1),sScale=150,sPosition=end.clone().addScaledVector(sPoints[0],-sScale);
const summitMatrix=new THREE.Matrix4().compose(sPosition,new THREE.Quaternion(),new THREE.Vector3(sScale,sScale,sScale));
const worldSummit=sPoints.map(p=>p.clone().applyMatrix4(summitMatrix));
mountain.geometry.applyMatrix4(mountainMatrix);const mountainSurface=triangleGrid(mountain.geometry,4),summitSnapshot=summit.geometry.clone(),sourceSummitSurface=triangleGrid(summitSnapshot,.02);
// Extend the downloaded crown's closed lower skirt to the actual supporting
// body/valley. Uppermost surfaces and the approved apron contour stay in place.
const sp=summit.geometry.attributes.position,sBase=summit.geometry.boundingBox.min.y;
let skirtVertices=0,maxSkirtExtension=0;
for(let i=0;i<sp.count;i++){
  const x=sp.getX(i),y=sp.getY(i),z=sp.getZ(i),upper=sourceSummitSurface.top(x,z)?.y??y,weight=THREE.MathUtils.clamp((upper-y)/Math.max(.002,upper-sBase),0,1);
  const world=new THREE.Vector3(x,y,z).applyMatrix4(summitMatrix),support=mountainSurface.top(world.x,world.z),base=support?Math.max(1.6,support.y-.6):1.6;
  const oldBase=sBase*sScale+sPosition.y,extension=(base-oldBase)*weight;
  world.y+=extension;sp.setXYZ(i,world.x,world.y,world.z);
  if(Math.abs(extension)>.001){skirtVertices++;maxSkirtExtension=Math.max(maxSkirtExtension,Math.abs(extension));}
}
summitSnapshot.dispose();

const spline=new THREE.CatmullRomCurve3([...worldMountain,...worldSummit.slice(1)],false,'centripetal');
const length=spline.getLength(),count=Math.ceil(length/.25),route=[];
for(let i=0;i<=count;i++){const p=spline.getPointAt(i/count),t=spline.getTangentAt(i/count);route.push({x:p.x,y:p.y,z:p.z,nx:t.z/Math.hypot(t.x,t.z),nz:-t.x/Math.hypot(t.x,t.z)});}
// A small arc-length window removes source pebble steps without substituting a
// synthetic hillside. All height changes are baked into the derived visible GLBs.
for(let i=0;i<route.length;i++){
  const lo=Math.max(0,i-12),hi=Math.min(route.length-1,i+12);let sum=0;
  for(let j=lo;j<=hi;j++)sum+=spline.getPointAt(j/count).y;
  route[i].y=sum/(hi-lo+1);
}
const roadSegments=new Map(),roadCell=8;
for(let i=1;i<route.length;i++){
  const a=route[i-1],b=route[i];
  for(let z=Math.floor((Math.min(a.z,b.z)-10)/roadCell);z<=Math.floor((Math.max(a.z,b.z)+10)/roadCell);z++)for(let x=Math.floor((Math.min(a.x,b.x)-10)/roadCell);x<=Math.floor((Math.max(a.x,b.x)+10)/roadCell);x++){
    const key=x+','+z,list=roadSegments.get(key)??[];list.push(i);roadSegments.set(key,list);
  }
}
function roadAt(x,z){
  let nearest={distance:Infinity,y:0};
  for(const i of roadSegments.get(Math.floor(x/roadCell)+','+Math.floor(z/roadCell))??[]){
    const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z,t=THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1),distance=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
    if(distance<nearest.distance)nearest={distance,y:THREE.MathUtils.lerp(a.y,b.y,t)};
  }
  return nearest;
}
const changed=[];
for(const asset of [mountain,summit]){
  const p=asset.geometry.attributes.position;let vertices=0,maxDelta=0;
  for(let i=0;i<p.count;i++){
    const road=roadAt(p.getX(i),p.getZ(i)),y=p.getY(i);
    if(road.distance>=9||Math.abs(y-road.y)>8)continue;
    const blend=1-THREE.MathUtils.smoothstep(road.distance,4.8,9),target=THREE.MathUtils.lerp(y,road.y,blend);
    p.setY(i,target);if(Math.abs(target-y)>.001){vertices++;maxDelta=Math.max(maxDelta,Math.abs(target-y));}
  }
  asset.geometry.computeVertexNormals();asset.geometry.computeBoundingBox();asset.geometry.computeBoundingSphere();changed.push({vertices,maxDelta});
}
await mkdir(directory+'/derived',{recursive:true});
await writeTerrain(mountain,directory+'/derived/mountain-body.glb',mountain.geometry);await writeTerrain(summit,directory+'/derived/summit-plateau.glb',summit.geometry);
const crownHeight=.0794*sScale+sPosition.y;
const layout={schema_version:1,status:'engineering_candidate_unaccepted',source_measurements:directory+'/source-measurements.json',mountain:{source_sha256:measured.mountain.sha256,scale:mScale,yaw:Math.PI/2,position:mPosition.toArray(),road_adjustment:changed[0]},summit:{source_sha256:measured.summit.sha256,scale:sScale,position:sPosition.toArray(),skirt_vertices_adjusted:skirtVertices,max_skirt_extension_metres:maxSkirtExtension,road_adjustment:changed[1]},summit_anchor:{x:0,y:crownHeight,z:sPosition.z-.2*sScale},gate:{x:worldSummit[2].x,y:worldSummit[2].y,z:worldSummit[2].z,yaw:Math.atan2(worldSummit[3].x-worldSummit[1].x,worldSummit[3].z-worldSummit[1].z)+Math.PI},road:{length_metres:length,flat_core_width_metres:9.6,target_clear_width_metres:8,minimum_clear_width_metres:7,body_radius_metres:.55,route},runtime_activated:false,limitations:['Skirt geometry changed substantially to support the crown; combined silhouette needs image review before activation.','The five-lane floor/collision measurements and actual game verification are pending.']};
await writeFile(directory+'/layout.json',JSON.stringify(layout,null,2)+'\n');console.log(JSON.stringify({...layout,road:{...layout.road,route:'saved '+route.length+' measured/graded points'}}));

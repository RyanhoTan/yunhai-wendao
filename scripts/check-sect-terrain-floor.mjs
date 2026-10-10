import {readTerrain,triangleGrid} from './terrain-glb.mjs';
import {readFile,writeFile} from 'node:fs/promises';
const directory='artifacts/terrain-pipeline/assembly/sect-v1',layout=JSON.parse(await readFile(directory+'/layout.json'));
const assets=await Promise.all(['mountain-body','summit-plateau'].map(id=>readTerrain(directory+'/derived/'+id+'.glb'))),grids=assets.map(a=>triangleGrid(a.geometry,4));
const offsets=[-3.5,-3.15,-2.6,-1.3,0,1.3,2.6,3.15,3.5];
let missing=0,steep=0,above=0,maxFloorError=0,maxGrade=0;
const previous=[],failures=[];
for(let i=0;i<layout.road.route.length;i++){
  const p=layout.road.route[i];
  for(let lane=0;lane<offsets.length;lane++){
    const offset=offsets[lane],x=p.x+p.nx*offset,z=p.z+p.nz*offset;
    const surfaces=grids.flatMap(g=>g.surfaces(x,z)).filter(h=>h.normal[1]>0).sort((a,b)=>b.y-a.y),hit=surfaces[0];
    if(!hit){missing++;previous[lane]=undefined;if(failures.length<100)failures.push({i,offset,reason:'missing'});continue;}
    const error=Math.abs(hit.y-p.y);maxFloorError=Math.max(maxFloorError,error);
    if(hit.normal[1]<.86){steep++;if(failures.length<100)failures.push({i,offset,reason:'slope',normal_y:hit.normal[1],height_error:error});}
    if(error>.3)above++;
    const old=previous[lane];if(old)maxGrade=Math.max(maxGrade,Math.abs(hit.y-old.y)/Math.hypot(x-old.x,z-old.z));previous[lane]={x,z,y:hit.y};
  }
}
const report={status:missing||steep||above||maxGrade>.55?'rejected_floor_candidate':'floor_sampling_pass_only',samples:layout.road.route.length*offsets.length,offsets_metres:offsets,missing_samples:missing,steep_face_samples:steep,height_error_over_30cm_samples:above,max_floor_error_metres:maxFloorError,max_lane_grade:maxGrade,failures,gameplay_verified:false,limitations:['Local floor probes only; no obstacle clearance, continuous body sweep, turn-envelope, topology repair or real input proof.','Sky-most sample is a defect locator in this preview, not a runtime height policy for multilayer geometry.']};
await writeFile(directory+'/floor-check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,failures:report.failures.slice(0,4)}));

import {Box3,Vector3} from 'three';
import {bodyPointBlocked,type BodyCollisionMesh} from '../core/StaticBodyCollision';
import type {DeadwoodPlacement} from '../world/ForestDeadwood';

type Obstacles={colliders:readonly {x:number;z:number;r:number}[];walls:readonly Box3[];bodySolids:readonly BodyCollisionMesh[]};

/** QA selects a real, safe ground location beside an actually accepted piece.
 * It keeps the ordinary player boom and does not build the large SAT snapshot. */
export function chooseDeadwoodQualityPose(records:readonly DeadwoodPlacement[],form:number,heightAt:(x:number,z:number)=>number,obstacles:Obstacles){
  const ordered=records.filter(piece=>piece.form===form).sort((a,b)=>Math.hypot(a.x+215,a.z+222)-Math.hypot(b.x+215,b.z+222));
  for(const piece of ordered)for(const side of [1,-1])for(const distance of [1.8,2.5,3.2]){
    const x=piece.x+Math.sin(piece.yaw)*distance*side,z=piece.z+Math.cos(piece.yaw)*distance*side,y=heightAt(x,z);
    if(obstacles.colliders.some(c=>Math.hypot(x-c.x,z-c.z)<c.r+.7)||bodyPointBlocked(obstacles.bodySolids,new Vector3(x,y,z))||obstacles.walls.some(w=>x>w.min.x-.55&&x<w.max.x+.55&&z>w.min.z-.55&&z<w.max.z+.55&&y+1.8>w.min.y&&y<w.max.y))continue;
    return {x,z,yaw:piece.yaw+(side<0?Math.PI:0),seed:piece.seed};
  }
  throw new Error(`No safe ordinary camera pose for deadwood form ${form}`);
}

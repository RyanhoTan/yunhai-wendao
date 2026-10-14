import {Box3,Vector3} from 'three';
import {PLAYER_BODY,type BodyCollisionMesh} from '../../../src/core/StaticBodyCollision';
import {nearbyStaticOccluders} from '../../../src/core/StaticOccluderIndex';

/** Query the complete plant envelope against the actual slab axes. Stored
 * feet-space slabs are unexpanded before projecting the plant's own volume. */
export function createGroundObstacleQuery(walls:readonly Box3[],meshes:readonly BodyCollisionMesh[]){
  const probe=new Box3(),physicalBounds=new Box3(),center=new Vector3(),half=new Vector3();
  const bodyMin=new Vector3(PLAYER_BODY.radius,PLAYER_BODY.height,PLAYER_BODY.radius),bodyMax=new Vector3(PLAYER_BODY.radius,0,PLAYER_BODY.radius);
  return (x:number,y:number,z:number,r:number,bounds?:Box3)=>{
    if(bounds)probe.copy(bounds);
    else{probe.min.set(x-r,y-.4,z-r);probe.max.set(x+r,y+1.2,z+r);}
    for(const wall of nearbyStaticOccluders(walls,probe.min.x,probe.max.x,probe.min.z,probe.max.z))if(wall.intersectsBox(probe))return true;
    probe.getCenter(center);probe.getSize(half).multiplyScalar(.5);
    const overlaps=(bounds:Box3)=>{
      physicalBounds.copy(bounds);physicalBounds.min.add(bodyMin);
      physicalBounds.max.sub(bodyMax);return physicalBounds.intersectsBox(probe);
    };
    for(const mesh of meshes){
      if(!overlaps(mesh.bounds))continue;
      for(const solid of mesh.solids){
        if(!overlaps(solid.bounds))continue;
        if(solid.axes.every(axis=>{
          const bodyHorizontal=PLAYER_BODY.radius*(Math.abs(axis.x)+Math.abs(axis.z));
          const min=axis.min+bodyHorizontal+Math.max(0,PLAYER_BODY.height*axis.y),max=axis.max-bodyHorizontal+Math.min(0,PLAYER_BODY.height*axis.y);
          const projection=center.x*axis.x+center.y*axis.y+center.z*axis.z,extent=half.x*Math.abs(axis.x)+half.y*Math.abs(axis.y)+half.z*Math.abs(axis.z);
          return projection+extent>=min&&projection-extent<=max;
        }))return true;
      }
    }
    return false;
  };
}

import { Box3, Matrix4, Vector3 } from 'three';
import {visitPackedBodySolids,type PackedBodyData} from './PackedBodyCollision';

export const PLAYER_BODY = { radius: .55, height: 1.8 } as const;
type Axis = { x: number; y: number; z: number; min: number; max: number };
export type BodySolid = { bounds: Box3; axes: Axis[] };
export type BodyCollisionMesh = { bounds: Box3; solids: BodySolid[]; packed?:PackedBodyData };

/** A fixed triangular slab, expanded for the player's upright body using SAT axes. */
export function triangleBodySolid(a: Vector3, b: Vector3, c: Vector3, below: number, above: number): BodySolid {
  const axes: Axis[] = [];
  const addAxis = (normal: Vector3) => {
    if (normal.lengthSq() < 1e-12) return;
    normal.normalize();
    if (axes.some(axis => Math.abs(axis.x * normal.x + axis.y * normal.y + axis.z * normal.z) > .999999)) return;
    const projections = [a.dot(normal), b.dot(normal), c.dot(normal)];
    const horizontal = PLAYER_BODY.radius * (Math.abs(normal.x) + Math.abs(normal.z));
    axes.push({ x: normal.x, y: normal.y, z: normal.z,
      min: Math.min(...projections) + Math.min(-below * normal.y, above * normal.y) - horizontal - Math.max(0, PLAYER_BODY.height * normal.y),
      max: Math.max(...projections) + Math.max(-below * normal.y, above * normal.y) + horizontal - Math.min(0, PLAYER_BODY.height * normal.y) });
  };
  const basis = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
  for (const axis of basis) addAxis(axis.clone());
  addAxis(new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)));
  for (const [from, to] of [[a, b], [b, c], [c, a]]) {
    const edge = new Vector3().subVectors(to, from);
    for (const axis of basis) addAxis(edge.clone().cross(axis));
  }
  const bounds = new Box3().setFromPoints([a, b, c]);
  bounds.min.add(new Vector3(-PLAYER_BODY.radius, -below - PLAYER_BODY.height, -PLAYER_BODY.radius));
  bounds.max.add(new Vector3(PLAYER_BODY.radius, above, PLAYER_BODY.radius));
  return { bounds, axes };
}

/** The same feet-space expansion for an enclosed architectural volume. */
export function boxBodySolid(box: Box3): BodySolid {
  const bounds = box.clone();
  bounds.min.add(new Vector3(-PLAYER_BODY.radius, -PLAYER_BODY.height, -PLAYER_BODY.radius));
  bounds.max.add(new Vector3(PLAYER_BODY.radius, 0, PLAYER_BODY.radius));
  return { bounds, axes: [
    { x: 1, y: 0, z: 0, min: bounds.min.x, max: bounds.max.x },
    { x: 0, y: 1, z: 0, min: bounds.min.y, max: bounds.max.y },
    { x: 0, y: 0, z: 1, min: bounds.min.z, max: bounds.max.z },
  ] };
}

/** SAT envelope of a rotated box against the upright player volume. Keeping
 * its oblique axes avoids the large invisible corners of a world-axis box. */
export function transformedBoxBodySolid(box:Box3,matrix:Matrix4):BodySolid{
  const corners=Array.from({length:8},(_,i)=>new Vector3(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).applyMatrix4(matrix));
  const basis=[new Vector3(1,0,0),new Vector3(0,1,0),new Vector3(0,0,1)],oriented=basis.map(axis=>axis.clone().transformDirection(matrix));
  const axes:Axis[]=[];
  const add=(normal:Vector3)=>{
    if(normal.lengthSq()<1e-12)return;normal.normalize();
    if(axes.some(axis=>Math.abs(axis.x*normal.x+axis.y*normal.y+axis.z*normal.z)>.999999))return;
    const projections=corners.map(point=>point.dot(normal)),horizontal=PLAYER_BODY.radius*(Math.abs(normal.x)+Math.abs(normal.z));
    axes.push({x:normal.x,y:normal.y,z:normal.z,min:Math.min(...projections)-horizontal-Math.max(0,PLAYER_BODY.height*normal.y),max:Math.max(...projections)+horizontal-Math.min(0,PLAYER_BODY.height*normal.y)});
  };
  basis.forEach(axis=>add(axis.clone()));oriented.forEach(axis=>add(axis.clone()));
  for(const a of basis)for(const b of oriented)add(a.clone().cross(b));
  const bounds=new Box3().setFromPoints(corners);bounds.min.add(new Vector3(-PLAYER_BODY.radius,-PLAYER_BODY.height,-PLAYER_BODY.radius));bounds.max.add(new Vector3(PLAYER_BODY.radius,0,PLAYER_BODY.radius));
  return {bounds,axes};
}

/** Many rigid segments of one fallen trunk share their SAT basis. Analytic
 * centre/half extents avoid rebuilding that basis and eight corners per box. */
export function createTransformedBoxBodySampler(matrix:Matrix4){
  const e=matrix.elements.slice(),basis=[new Vector3(1,0,0),new Vector3(0,1,0),new Vector3(0,0,1)],oriented=basis.map(axis=>axis.clone().transformDirection(matrix)),normals:Vector3[]=[];
  const add=(normal:Vector3)=>{if(normal.lengthSq()<1e-12)return;normal.normalize();if(!normals.some(axis=>Math.abs(axis.dot(normal))>.999999))normals.push(normal);};
  basis.forEach(axis=>add(axis.clone()));oriented.forEach(axis=>add(axis.clone()));for(const a of basis)for(const b of oriented)add(a.clone().cross(b));
  const planes=normals.map(n=>({x:n.x,y:n.y,z:n.z,ex:Math.abs(n.x*e[0]+n.y*e[1]+n.z*e[2]),ey:Math.abs(n.x*e[4]+n.y*e[5]+n.z*e[6]),ez:Math.abs(n.x*e[8]+n.y*e[9]+n.z*e[10]),lo:PLAYER_BODY.radius*(Math.abs(n.x)+Math.abs(n.z))+Math.max(0,PLAYER_BODY.height*n.y),hi:PLAYER_BODY.radius*(Math.abs(n.x)+Math.abs(n.z))-Math.min(0,PLAYER_BODY.height*n.y)}));
  return (box:Box3):BodySolid=>{
    const cx=(box.min.x+box.max.x)*.5,cy=(box.min.y+box.max.y)*.5,cz=(box.min.z+box.max.z)*.5,hx=(box.max.x-box.min.x)*.5,hy=(box.max.y-box.min.y)*.5,hz=(box.max.z-box.min.z)*.5;
    const x=e[0]*cx+e[4]*cy+e[8]*cz+e[12],y=e[1]*cx+e[5]*cy+e[9]*cz+e[13],z=e[2]*cx+e[6]*cy+e[10]*cz+e[14];
    const wx=Math.abs(e[0])*hx+Math.abs(e[4])*hy+Math.abs(e[8])*hz,wy=Math.abs(e[1])*hx+Math.abs(e[5])*hy+Math.abs(e[9])*hz,wz=Math.abs(e[2])*hx+Math.abs(e[6])*hy+Math.abs(e[10])*hz;
    const bounds=new Box3(new Vector3(x-wx-PLAYER_BODY.radius,y-wy-PLAYER_BODY.height,z-wz-PLAYER_BODY.radius),new Vector3(x+wx+PLAYER_BODY.radius,y+wy,z+wz+PLAYER_BODY.radius));
    const axes=planes.map(n=>{const p=x*n.x+y*n.y+z*n.z,r=hx*n.ex+hy*n.ey+hz*n.ez;return {x:n.x,y:n.y,z:n.z,min:p-r-n.lo,max:p+r+n.hi};});
    return {bounds,axes};
  };
}

export function bodyCollisionMesh(solids: BodySolid[]): BodyCollisionMesh {
  const bounds = new Box3();
  for (const solid of solids) bounds.union(solid.bounds);
  return { bounds, solids };
}

/** Feet-space solids already include the player's radius and standing height. */
export function bodyPointBlocked(meshes:readonly BodyCollisionMesh[],position:Vector3):boolean{
  const contains=(solid:BodySolid)=>solid.bounds.containsPoint(position)&&solid.axes.every(axis=>{
    const p=position.x*axis.x+position.y*axis.y+position.z*axis.z;return p>axis.min+1e-5&&p<axis.max-1e-5;
  });
  let query:Box3|undefined;
  return meshes.some(mesh=>mesh.bounds.containsPoint(position)&&(mesh.solids.some(contains)||(mesh.packed&&visitPackedBodySolids(mesh.packed,query??=new Box3(position,position),contains))));
}

/** Continuous sweep and sliding: handles top, underside and edges without teleporting across a roof. */
export function constrainBodySolids(meshes: readonly BodyCollisionMesh[], previous: Vector3, position: Vector3): boolean {
  let x = previous.x, y = previous.y, z = previous.z;
  let dx = position.x - x, dy = position.y - y, dz = position.z - z, blocked = false;
  for (let pass = 0; pass < 6; pass++) {
    if (dx * dx + dy * dy + dz * dz < 1e-14) break;
    let time = 1, nx = 0, ny = 0, nz = 0;
    const minX = Math.min(x, x + dx), maxX = Math.max(x, x + dx);
    const minY = Math.min(y, y + dy), maxY = Math.max(y, y + dy);
    const minZ = Math.min(z, z + dz), maxZ = Math.max(z, z + dz);
    const overlaps = (bounds: Box3) => maxX >= bounds.min.x && minX <= bounds.max.x && maxY >= bounds.min.y && minY <= bounds.max.y && maxZ >= bounds.min.z && minZ <= bounds.max.z;
    const considerSolid=(solid:BodySolid)=>{
        if (!overlaps(solid.bounds)) return false;
        let near = -Infinity, far = time, ax = 0, ay = 0, az = 0;
        for (const axis of solid.axes) {
          const origin = x * axis.x + y * axis.y + z * axis.z;
          const delta = dx * axis.x + dy * axis.y + dz * axis.z;
          if (Math.abs(delta) < 1e-12) {
            if (origin < axis.min || origin > axis.max) { far = -Infinity; break; }
          } else {
            const t0 = (axis.min - origin) / delta, t1 = (axis.max - origin) / delta;
            const entry = Math.min(t0, t1);
            if (entry > near) { near = entry; const sign = delta > 0 ? -1 : 1; ax = sign * axis.x; ay = sign * axis.y; az = sign * axis.z; }
            far = Math.min(far, Math.max(t0, t1));
            if (near > far) break;
          }
        }
        // A valid start is outside each solid. Ignore exits and tangent contacts.
        if (near >= -1e-7 && near <= far && near < time) { time = Math.max(0, near); nx = ax; ny = ay; nz = az; }
        return false;
    };
    let query:Box3|undefined;
    for (const mesh of meshes) {
      if (!overlaps(mesh.bounds)) continue;
      for (const solid of mesh.solids) considerSolid(solid);
      if(mesh.packed)visitPackedBodySolids(mesh.packed,query??=new Box3(new Vector3(minX,minY,minZ),new Vector3(maxX,maxY,maxZ)),considerSolid);
    }
    x += dx * time; y += dy * time; z += dz * time;
    if (time === 1) { dx = dy = dz = 0; break; }
    blocked = true;
    // Pure ascent/descent rests at contact; gravity must not invent lateral movement on a slope.
    if (dx * dx + dz * dz < 1e-14 && Math.abs(ny) > .05) { y += .001 / ny; dx = dy = dz = 0; break; }
    x += nx * .001; y += ny * .001; z += nz * .001;
    dx *= 1 - time; dy *= 1 - time; dz *= 1 - time;
    const into = Math.min(0, dx * nx + dy * ny + dz * nz);
    dx -= into * nx; dy -= into * ny; dz -= into * nz;
  }
  // If a corner exhausts the sliding passes, retain the last safe contact position.
  position.set(x, y, z);
  return blocked;
}

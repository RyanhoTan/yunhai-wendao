import * as THREE from 'three';
import {landNoise} from './NaturalTerrain';
import {summitBedRelief} from './SummitStrata';
const smooth=THREE.MathUtils.smoothstep;

/** Continuous rock displacement, shared by meshing and focused surface diagnostics. */
export function createGeologicalDisplacement(heightAt:(x:number,z:number)=>number,surfaceExposure:(x:number,y:number,z:number)=>number,eligible:ReadonlySet<string>,observe?:(record:Record<string,unknown>)=>void){
  const normal=new THREE.Vector3();
  return (p:THREE.Vector3)=>{
    // Average the extrusion direction over a rock block. Using the 1m
    // triangulation derivative amplified every column into a thin pleat.
    const e=2.5,gx=(heightAt(p.x+e,p.z)-heightAt(p.x-e,p.z))/(2*e),gz=(heightAt(p.x,p.z+e)-heightAt(p.x,p.z-e))/(2*e),grade=Math.hypot(gx,gz);
    normal.set(-gx,0,-gz).normalize();
    let boundary=1;
    const cx=Math.floor(p.x),cz=Math.floor(p.z);
    // An open skin boundary embeds back into the base rock. The function is
    // identical on both sides of a cell/tile boundary, including partial cuts.
    for(let z=cz-2;z<=cz+2;z++)for(let x=cx-2;x<=cx+2;x++)if(!eligible.has(`${x},${z}`)){
      const distance=Math.hypot(Math.max(x-p.x,0,p.x-x-1),Math.max(z-p.z,0,p.z-z-1));boundary=Math.min(boundary,smooth(distance,0,1.5));
    }
    const exposure=smooth(grade,1.6,3.5)*surfaceExposure(p.x,p.y,p.z)*boundary;
    // Bedding is gently inclined and locally interrupted, rather than rings
    // around a cylinder. Water cuts narrow channels across the ledges.
    const bed=p.y*.080+p.x*.012+p.z*.022+landNoise(p.x*.021,p.z*.018)*.30;
    const ledge=landNoise(bed,p.x*.012+p.z*.015+19);
    const bedPhase=bed-Math.floor(bed);
    // A broken lip projects from a bed, then retreats into its weathered
    // face. Local variation prevents a continuous ring around the mountain.
    const lip=(1-smooth(bedPhase,.52,.98))*smooth(bedPhase,0,.30)
      *smooth(landNoise(p.x*.052+p.y*.009+8,p.z*.047-21),-.55,.30);
    // These blocks turn and end with elevation. A nearly height-invariant
    // rib field produced the same vertical pleat through the entire wall.
    const ribs=landNoise(p.x*.033+p.y*.040,p.z*.039-p.y*.032);
    const fracture=landNoise(p.x*.49+p.y*.11+23,p.z*.43-p.y*.08-9);
    const channels=Math.abs(landNoise(p.x*.072+p.z*.015,p.y*.028+p.z*.060));
    const mountainShoulder=(1-smooth(Math.abs(p.x),110,155))*(1-smooth(Math.abs(p.z-7),100,143))*smooth(p.y,32,60);
    // The summit skin follows the same unequal, faulted beds as its mass.
    // Recesses cut into the projected rock volume, with the base behind them.
    const bedDetail=THREE.MathUtils.lerp(ledge*1.6+lip*1.5,summitBedRelief(p.x,p.y,p.z),mountainShoulder);
    let depth=Math.max(.12,1.9+bedDetail+ribs*2.2+fracture*.34-channels*.80)*exposure;
    depth=Math.min(12,depth*(1+mountainShoulder*.60));
    // Large shelves remain embedded, and stop before protected water/building
    // volumes. Road exposure independently preserves walking headroom.
    const unclippedDepth=depth,endpointExposure=surfaceExposure(p.x+normal.x*depth,p.y,p.z+normal.z*depth);
    {
      // Road exposure along a projecting shelf is not monotonic: a ray may
      // enter and leave the headroom envelope. Endpoint-triggered bisection
      // jumped between two unrelated roots as exposure crossed .02. Fade the
      // entire shelf continuously before any sampled protected volume instead.
      let clearance=Math.min(surfaceExposure(p.x,p.y,p.z),endpointExposure);
      for(const t of [.25,.5,.75])clearance=Math.min(clearance,surfaceExposure(p.x+normal.x*depth*t,p.y,p.z+normal.z*depth*t));
      depth*=smooth(clearance,0,.5);
    }
    observe?.({base:p.toArray(),gx,gz,grade,boundary,exposure,bedDetail,unclippedDepth,endpointExposure,depth});
    const world=p.clone().addScaledVector(normal,depth-.025*(1-exposure));
    // A faded skin must be buried in three dimensions. Horizontal retreat
    // alone left nearly flat road-edge faces millimetres above the base after
    // the averaged extrusion normal crossed a different local ground slope.
    // Such duplicate ground faces acted as SAT walls and caused coplanar seams.
    world.y-=.45*(1-exposure);
    return world;
  };
}

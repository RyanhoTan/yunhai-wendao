import * as THREE from 'three';

export type WoodlandLodField=ReturnType<typeof createWoodlandLodField>;
/** One main-camera field feeds both visible foliage and its shadow pass. */
export function createWoodlandLodField(count:number){
  const data=new Uint8Array(Math.max(1,count)*4);
  const texture=new THREE.DataTexture(data,Math.max(1,count),1,THREE.RGBAFormat);
  texture.name='WoodlandContinuousLodWeights';texture.minFilter=texture.magFilter=THREE.NearestFilter;
  texture.needsUpdate=true;
  let dirty=false;
  return {texture,count:Math.max(1,count),data,
    write(id:number,weights:number[]){
      for(let level=0;level<3;level++){const value=Math.round(weights[level]*255);if(data[id*4+level]!==value){data[id*4+level]=value;dirty=true;}}
    },flush(){if(dirty){texture.needsUpdate=true;dirty=false;}}
  };
}

/** Hysteresis picks a diagnostic level; overlapping draws fade over 10–16m. */
export class WoodlandLOD extends THREE.LOD{
  constructor(private field:WoodlandLodField,readonly cellId:number,private meadow=false){super();this.autoUpdate=false;}
  override update(camera:THREE.Camera){
    super.update(camera);
    const center=new THREE.Vector3().setFromMatrixPosition(this.matrixWorld),view=new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const distance=center.distanceTo(view)/(camera as THREE.PerspectiveCamera).zoom;
    const first=this.levels[1].distance,second=this.levels[2].distance;
    const t0=THREE.MathUtils.smoothstep(distance,first-5,first+5),t1=THREE.MathUtils.smoothstep(distance,second-8,second+8);
    const end=this.meadow?1:1-THREE.MathUtils.smoothstep(distance,1190,1210);
    const weights=[(1-t0)*end,t0*(1-t1)*end,this.meadow?0:t1*end];
    this.field.write(this.cellId,weights);
    this.levels.forEach((level,i)=>{level.object.visible=(weights[i]??0)>0;});
  }
}

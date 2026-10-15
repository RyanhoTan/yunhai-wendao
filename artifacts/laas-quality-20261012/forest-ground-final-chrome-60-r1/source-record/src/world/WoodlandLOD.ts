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
      const total=Math.round(weights.reduce((sum,weight)=>sum+weight,0)*255);
      const quantized=[Math.round(weights[0]*255),Math.round(weights[1]*255),0];
      quantized[1]=Math.min(quantized[1],total-quantized[0]);quantized[2]=total-quantized[0]-quantized[1];
      for(let level=0;level<3;level++){const value=quantized[level];if(data[id*4+level]!==value){data[id*4+level]=value;dirty=true;}}
    },flush(){if(dirty){texture.needsUpdate=true;dirty=false;}}
  };
}

/** Hysteresis picks a diagnostic level; overlapping draws fade over 10–16m. */
export class WoodlandLOD extends THREE.LOD{
  private center=new THREE.Vector3();private view=new THREE.Vector3();
  constructor(private field:WoodlandLodField,readonly cellId:number,private meadow=false){super();this.autoUpdate=false;}
  override update(camera:THREE.Camera){
    super.update(camera);
    this.center.setFromMatrixPosition(this.matrixWorld);this.view.setFromMatrixPosition(camera.matrixWorld);
    const distance=this.center.distanceTo(this.view)/(camera as THREE.PerspectiveCamera).zoom;
    const first=this.levels[1].distance,second=this.levels[2].distance;
    const t0=THREE.MathUtils.smoothstep(distance,first-5,first+5),t1=THREE.MathUtils.smoothstep(distance,second-8,second+8);
    const end=this.meadow?1:1-THREE.MathUtils.smoothstep(distance,1190,1210);
    const weights=[(1-t0)*end,t0*(1-t1)*end,this.meadow?0:t1*end];
    this.field.write(this.cellId,weights);
    this.levels.forEach((level,i)=>{level.object.visible=i<3&&this.field.data[this.cellId*4+i]>0;});
  }
}

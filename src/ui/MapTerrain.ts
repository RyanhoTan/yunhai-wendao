import {terrainHeight} from '../world/World';
import {WORLD_MAP} from '../world/WorldLayout';
import {woodlandCover} from '../world/ForestLayout';
import {shorelineAt} from '../world/CoastMath';
import {JADE_POOL,WATERCOURSE} from '../world/WaterLayout';

/** A reusable relief chart, sampled from the same surface that supports the player. */
export function createReliefChart():HTMLCanvasElement {
  const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;
  const c=canvas.getContext('2d',{willReadFrequently:true})!;
  const step=8,cols=100,rows=75,heights:number[][]=[];
  for(let j=0;j<=rows;j++){
    const row:number[]=[];
    for(let i=0;i<=cols;i++)row.push(terrainHeight(WORLD_MAP.minX+i*step,WORLD_MAP.minZ+j*step));
    heights.push(row);
  }
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
    const x=WORLD_MAP.minX+i*step,z=WORLD_MAP.minZ+j*step,y=heights[j][i];
    const light=Math.max(-9,Math.min(9,(heights[j][i+1]-y)*.8-(heights[j+1][i]-y)*.6));
    const high=Math.min(1,Math.max(0,y/95)),forest=woodlandCover(x,z);
    const r=24+high*46-forest*7+light,g=53+high*28+forest*7+light,b=48+high*21-forest*6+light;
    c.fillStyle=z>shorelineAt(x)?'#285660':`rgb(${r},${g},${b})`;c.fillRect(i*step,j*step,step+1,step+1);
  }
  // Marching squares traces actual contour crossings; no invented decorative river.
  c.strokeStyle='rgba(199,210,170,.24)';c.lineWidth=1;
  for(const level of [12,24,40,60,80]){
    c.beginPath();
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
      if(WORLD_MAP.minZ+j*step>125)continue;
      const values=[heights[j][i],heights[j][i+1],heights[j+1][i+1],heights[j+1][i]];
      const corners=[[i*step,j*step],[(i+1)*step,j*step],[(i+1)*step,(j+1)*step],[i*step,(j+1)*step]];
      const crossings:number[][]=[];
      for(let edge=0;edge<4;edge++){
        const next=(edge+1)%4,a=values[edge],b=values[next];
        if((a<level)===(b<level))continue;
        const t=(level-a)/(b-a);
        crossings.push([corners[edge][0]+(corners[next][0]-corners[edge][0])*t,corners[edge][1]+(corners[next][1]-corners[edge][1])*t]);
      }
      for(let k=1;k<crossings.length;k+=2){c.moveTo(...crossings[k-1] as [number,number]);c.lineTo(...crossings[k] as [number,number]);}
    }
    c.stroke();
  }
  c.strokeStyle='#70b6b3';c.lineWidth=5;c.lineJoin='round';c.lineCap='round';c.beginPath();
  for(const [i,p] of WATERCOURSE.entries()){const x=p.x-WORLD_MAP.minX,z=p.z-WORLD_MAP.minZ;if(i===0)c.moveTo(x,z);else c.lineTo(x,z);}c.stroke();
  c.fillStyle='#70b6b3';c.beginPath();c.ellipse(JADE_POOL.x-WORLD_MAP.minX,JADE_POOL.z-WORLD_MAP.minZ,JADE_POOL.rx,JADE_POOL.rz,0,0,Math.PI*2);c.fill();
  return canvas;
}

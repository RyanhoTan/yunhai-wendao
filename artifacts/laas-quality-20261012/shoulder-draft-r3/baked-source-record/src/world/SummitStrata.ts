import {landNoise} from './NaturalTerrain';

const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
// Unequal sediment packages share an inclined strike. These are physical
// elevation datums, rather than a periodic quantisation of the radial massif.
const beds=[12,25,43,54,73,87,108,119,138,156,179];

export function summitStrataCoordinate(x:number,y:number,z:number){
  // Two finite faults offset beds locally; neither wraps around the summit.
  const northwest=(1-smooth(35,90,Math.abs(z+49)))*smooth(-4,4,x+z*.43+43)*6.2;
  const southeast=(1-smooth(27,72,Math.abs(x-46)))*smooth(-3,3,z-x*.35-8)*4.5;
  return y+x*.23+z*.11+northwest-southeast;
}

/** Erosion of individual weak beds; surviving ledges end at joints and gullies. */
export function summitBedRelief(x:number,y:number,z:number){
  const coordinate=summitStrataCoordinate(x,y,z);
  const strike=x*.81-z*.58;
  let relief=0;
  for(let i=0;i<beds.length;i++){
    const distance=coordinate-beds[i];if(distance< -4||distance>6)continue;
    const survival=smooth(-.30,.45,landNoise(strike*.025+i*1.73,z*.018-i*.81));
    const lip=smooth(-1.2,.2,distance)*(1-smooth(.5,2.8,distance));
    const recess=smooth(-3.8,-2.2,distance)*(1-smooth(-1.6,.1,distance));
    relief+=(lip*(1.1+(i%3)*.45)-recess*(1.8+(i%4)*.55))*survival;
  }
  return relief;
}

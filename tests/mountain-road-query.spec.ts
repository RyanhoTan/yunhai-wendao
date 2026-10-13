import {test,expect} from '@playwright/test';
import {ascentDistance} from '../src/world/MountainLayout';
import {SECT_ASCENT} from '../src/world/WorldLayout';

test('road distances cover the full drainage buffer across spatial-index boundaries',()=>{
  const exhaustive=(x:number,z:number)=>Math.min(...SECT_ASCENT.slice(1).map((b,i)=>{
    const a=SECT_ASCENT[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
    return Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
  }));
  let checked=0;
  for(let i=1;i<SECT_ASCENT.length;i++){
    const a=SECT_ASCENT[i-1],b=SECT_ASCENT[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    for(let step=0;step<=10;step++)for(let offset=-20;offset<=20;offset+=2){
      const x=a.x+dx*step/10-dz/length*offset,z=a.z+dz*step/10+dx/length*offset,expected=exhaustive(x,z);
      if(expected>20+1e-8)continue;
      expect(ascentDistance(x,z),'every drainage-buffer query must find the true nearby road').toBeCloseTo(expected,8);checked++;
    }
  }
  expect(checked).toBeGreaterThan(3000);
});

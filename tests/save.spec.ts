import { test, expect } from '@playwright/test';
import { validateSave } from '../src/game/Save';
const valid = {version:1,position:{x:0,y:2,z:50},health:100,qi:100,xp:0,realm:0,quest:0,herbs:0,pills:2,stones:0,kills:0,shrines:[false,false,false],collected:[],defeated:[],treasures:[]};
test('save validation rejects damaged and unbounded persisted data',()=>{
  expect(validateSave(valid)).toBe(true);
  expect(validateSave({...valid,position:{x:-420,y:12,z:-123}}),'new western forest saves are valid').toBe(true);
  expect(validateSave({...valid,position:{x:-501,y:12,z:-123}}),'beyond the expanded bounds remains invalid').toBe(false);
  for (const value of [null,{}, {...valid,position:{x:Infinity,y:0,z:0}}, {...valid,realm:7}, {...valid,collected:[999]}, {...valid,defeated:[1,1]}, {...valid,shrines:[true]}, {...valid,quest:-1}, {...valid,qi:NaN}]) expect(validateSave(value)).toBe(false);
});

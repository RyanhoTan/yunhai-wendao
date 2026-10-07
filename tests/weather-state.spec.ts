import {test,expect} from '@playwright/test';
import {WeatherState} from '../src/systems/WeatherState';

test('weather follows local calendar time, including midnight and wall-clock jumps',()=>{
  let date=new Date(2026,9,7,23,59,30);const state=new WeatherState(()=>date);
  expect(state.snapshot().timeMode).toBe('real');expect(state.snapshot().hour).toBeCloseTo(23.991666,4);
  date=new Date(2026,9,8,0,0,30);state.update(0);expect(state.snapshot().hour).toBeCloseTo(.008333,4);
  date=new Date(2026,9,8,11,30);state.update(0);expect(state.snapshot().hour).toBe(11.5);
  state.apply({type:'hour',value:18.5});date=new Date(2026,9,8,2,0);state.update(1);expect(state.snapshot().hour).toBe(18.5);
  state.apply({type:'time-mode',value:'real'});expect(state.snapshot().hour).toBe(2);
});
test('random weather transitions smoothly without changing the day clock, and manual overrides stop it',()=>{
  const values=[.99,.5,0,0];const state=new WeatherState(()=>new Date(2026,9,7,3,0),()=>values.shift()??0);
  state.apply({type:'random',value:true});const start=state.snapshot();expect(start.targetRain).toBe(.75);expect(start.rain).toBe(0);expect(start.nextChange).toBe(180);
  state.update(4);const middle=state.snapshot();expect(middle.rain).toBeGreaterThan(0);expect(middle.rain).toBeLessThan(.75);expect(middle.hour).toBe(3);
  state.update(176);expect(state.snapshot().targetRain).toBe(0);expect(state.snapshot().targetCloudCover).toBe(.22);
  state.apply({type:'rain',value:.4});expect(state.snapshot().randomWeather).toBe(false);expect(state.snapshot().rain).toBe(.4);
  state.apply({type:'cloud-cover',value:.2});expect(state.snapshot().cloudCover).toBe(.2);
});
test('weather preferences validate corrupt inputs, remain independent of progression and freeze simulation at zero dt',()=>{
  const state=new WeatherState(()=>new Date(2026,9,7,10,0));
  state.restore({timeMode:'manual',manualHour:25,cloudCover:2,rain:-1,randomWeather:true});const p=state.preferences();
  expect(p).toEqual({timeMode:'manual',manualHour:1,cloudCover:1,rain:0,randomWeather:true});
  const before=state.snapshot();state.update(0);expect(state.snapshot()).toEqual(before);
  state.restore({timeMode:'invalid',manualHour:NaN,rain:Infinity,cloudCover:'many',randomWeather:'yes'});
  expect(state.preferences()).toEqual({timeMode:'real',manualHour:12,cloudCover:.42,rain:0,randomWeather:false});
});

import {expect,test} from '@playwright/test';
import {Loop} from '../src/core/Loop';

test('initialization and resume never send negative time into physics',()=>{
  const oldRequest=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame;
  let callback:FrameRequestCallback|undefined;
  globalThis.requestAnimationFrame=fn=>{callback=fn;return 1;};
  globalThis.cancelAnimationFrame=()=>{};
  try{
    const deltas:number[]=[],loop=new Loop(dt=>deltas.push(dt),()=>{});
    loop.start();callback!(100);callback!(116);callback!(216);
    loop.stop();loop.start();callback!(800);
    expect(deltas).toEqual([0,.016,.05,0]);
    loop.stop();
  }finally{globalThis.requestAnimationFrame=oldRequest;globalThis.cancelAnimationFrame=oldCancel;}
});

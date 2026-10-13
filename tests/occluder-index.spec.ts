import {expect,test} from '@playwright/test';
import {Box3,Vector3} from 'three';
import {nearbyStaticOccluders} from '../src/core/StaticOccluderIndex';

test('static occluder queries retain spanning walls, negative cells, expanded edges and newly appended bounds',()=>{
  const wall=new Box3(new Vector3(-33,0,-2),new Vector3(34,20,2));
  const roof=new Box3(new Vector3(-17,12,-17),new Vector3(-15,16,-15));
  const distant=new Box3(new Vector3(130,0,130),new Vector3(133,3,133));
  const boxes=[wall,roof,distant];
  expect([...nearbyStaticOccluders(boxes,-16,-16,-16,-16)]).toEqual([roof]);
  expect([...nearbyStaticOccluders(boxes,-33,34,-2,2)]).toEqual([wall]);
  expect([...nearbyStaticOccluders(boxes,15.9,16.1,-2.1,2.1)]).toEqual([wall]);
  expect([...nearbyStaticOccluders(boxes,50,80,50,80)]).toEqual([]);
  const newBound=new Box3(new Vector3(60,0,60),new Vector3(61,3,61));boxes.push(newBound);
  expect([...nearbyStaticOccluders(boxes,60,60,60,60)]).toEqual([newBound]);
});

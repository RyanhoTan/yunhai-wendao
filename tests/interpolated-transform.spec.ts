import { expect, test } from '@playwright/test';
import * as THREE from 'three';
import { InterpolatedTransform } from '../src/core/InterpolatedTransform';

test('fixed-step presentation remains continuous at 60, 90, 120 and 144 Hz', () => {
  const step = 1 / 60, speed = 6.8;
  for (const hz of [60, 90, 120, 144]) {
    const object = new THREE.Object3D(), pose = new InterpolatedTransform(object);
    let accumulator = 0;
    for (let frame = 1; frame <= hz * 2; frame++) {
      accumulator += 1 / hz;
      while (accumulator >= step) {
        pose.capturePrevious();
        object.position.z += speed * step;
        accumulator -= step;
      }
      pose.sample(accumulator / step);
      // One simulation tick of latency; no duplicated render poses between ticks.
      expect(pose.position.z).toBeCloseTo(Math.max(0, frame / hz - step) * speed, 8);
      const simulationZ = object.position.z;
      pose.apply();
      expect(object.position.z).toBe(pose.position.z);
      pose.restore();
      expect(object.position.z).toBe(simulationZ);
      expect(object.matrixWorld.elements[14]).toBe(simulationZ);
    }
  }
});

test('rotation takes the short arc, and teleports reset the interpolation history', () => {
  const object = new THREE.Object3D();
  object.rotation.y = THREE.MathUtils.degToRad(179);
  const pose = new InterpolatedTransform(object);
  pose.capturePrevious();
  object.position.set(2, 4, 6);
  object.rotation.y = THREE.MathUtils.degToRad(-179);
  pose.sample(.5);
  expect(pose.position.toArray()).toEqual([1, 2, 3]);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(pose.quaternion);
  expect(forward.z).toBeCloseTo(-1, 8);
  const simulationQuaternion = object.quaternion.clone();
  const simulationRotation = object.rotation.clone();
  pose.apply(); pose.restore();
  expect(object.quaternion.equals(simulationQuaternion)).toBe(true);
  expect(object.rotation.equals(simulationRotation)).toBe(true);
  object.position.set(100, 20, -300);
  pose.reset(); pose.sample(.1);
  expect(pose.position.toArray()).toEqual([100, 20, -300]);
});

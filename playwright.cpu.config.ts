import {defineConfig} from '@playwright/test';

// These suites exercise actual geometry/query functions without browser or
// preview startup. Browser and player-view acceptance use the normal config.
export default defineConfig({
  testDir:'./tests',workers:1,timeout:30000,
  testMatch:['body-point.spec.ts','packed-body-collision.spec.ts','indexed-triangle-collision.spec.ts','geological-surface-data.spec.ts'],
  reporter:'list',
});

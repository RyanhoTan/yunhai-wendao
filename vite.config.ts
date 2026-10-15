import { defineConfig } from 'vite';
import {readFileSync} from 'node:fs';

const geologicalManifest=JSON.parse(readFileSync(new URL('./public/assets/terrain/geological/manifest.json',import.meta.url),'utf8'));

export default defineConfig({
  base: './',
  define:{__GEOLOGICAL_SOURCE_HASH__:JSON.stringify(geologicalManifest.sourceHash)},
  server: {
    host: '127.0.0.1',
    port: 5188,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
    strictPort: true,
  },
  build: {
    rolldownOptions: {
      input: { game: 'index.html', mountainModel: 'mountain-model.html' },
    },
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});

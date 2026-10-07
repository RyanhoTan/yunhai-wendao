# Moon reference intake — 2026-10-07

- Repository: https://github.com/joshtol/emotive-engine
- Fixed source commit: `ae2accddc8f3e65a024c38b55e71a54b7fb10a14`
- User preview: https://joshtol.github.io/emotive-engine/examples/3d/elemental-gestures.html
- Read-only source checkout; no texture/model copied into the game, no dependency installed.

## Verified source route

`site/public/examples/3d/elemental-gestures.html` sets `materialVariant: 'multiplexer'` at line 418, uses the Moon geometry at line 185 and exposes eight phases at lines 193–200. Clicking Moon disables particle/rotation/blinking effects and chooses Full after the morph (lines 764–787).

`src/3d/utils/MaterialFactory.js` lines 419–427 routes that variant to `createMoonMultiplexerMaterial()`.

`src/3d/geometries/Moon.js` owns a 64×64 sphere (lines 148–160), phase definitions (47–69), async color and normal maps, and the multiplexer material (679–773).

`src/3d/shaders/shadows/moonWithBlendLayers.js` computes a view-space spherical normal, a directional half-space phase mask with screen-space anti-aliasing, very faint blue earthshine on the dark side, surface contrast, and subtle emissive glow. The full moon face derives from `colorMap`, not a procedural crater function. `normalMap` is declared and loaded but not sampled by this selected shader.

`src/3d/shaders/shadows/moonCrescent.js` is the alternate world-space shader. The standalone `.frag.glsl` is older sphere-sphere clipping code and is not the selected demo route.

`src/3d/effects/GlowLayer.js` is a generic full-screen ring/halo effect; it is not needed for a distant moon. An original angular halo in the existing sky shader avoids a render pass.

## Actual preview and limitations

One full Chromium GPU window rendered the exact URL at 1440×900 on an RTX 4050. It returned HTTP 200. Full, First Quarter and Waxing Crescent were clicked and captured without page errors; the browser was closed in `finally`.

- `moon-full-reference.png`: original screenshot, selected Full, gray disc.
- `moon-first-quarter-reference.png`: original screenshot, selected First Quarter.
- `moon-waxing-crescent-reference.png`: original screenshot, selected Waxing Crescent, visible phase boundary.
- `moon-preview-report.json`: URL, GPU, interactions, requests and actual runtime state.

The live page did not render its real lunar color map: runtime `colorMapReady` was false and the screenshots show the gray fallback. Its `/assets` base path points at the domain root. Read-only HEAD checks returned HTTP 404 for `https://joshtol.github.io/assets/textures/Moon/moon-color-4k.jpg`, and HTTP 200 for `https://joshtol.github.io/emotive-engine/assets/textures/Moon/moon-color-4k.jpg`. Neither texture was downloaded into the checkout. A record-script request also aborted; it did not prevent Moon phase interaction.

## Suitable original adaptation

In the existing sky shader, project view direction into a fixed moon tangent frame, reconstruct a spherical normal inside the angular disc, shade against a phase light vector and anti-alias the terminator with `fwidth()`. Use original deterministic broad dark lunar regions and sparse crater/rim noise, a very faint cool dark-side value, and a small angular halo. Cloud opacity then covers both moon surface and halo. This gives the demonstrated Moon phase structure without importing its engine, maps, postprocessing or generic overlay system.

Keep moon frame fixed in world space, so camera yaw does not rotate or flip the lunar surface or phase. A fixed artistic Full phase is acceptable unless an actual date-dependent lunar phase is explicitly implemented; reality-synced day/night alone does not establish astronomical lunar accuracy.

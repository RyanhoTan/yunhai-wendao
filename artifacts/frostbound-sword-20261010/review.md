# Frostbound sword independent review

Scope: this request's changes in `FrostboundSword.ts`, `Models.ts`, `PlayerCharacters.ts`, `Cultivator.ts`, `main.ts`. Read-only review; no runtime files or commits changed. The user's Vite/female-character work is outside scope. The canceled Qingxiao reconstruction and its pass gates were not continued.

## Final focused review status

The earlier unsupported-foot finding is corrected. No new blocking defect was found in the final loading/cache/flight preparation code or in the independently measured foot-support footprint.

The final code broadens only the authored blade (factor 4.8, with the same fade near the guard), samples X ±.065 / 0 in the template frame (world ±.208 / 0), requires all three intersections, and atomically publishes both caches. The imported guard/grip and material are retained. Index/UV attributes now remain shared; only position/normal attributes change for the flight variant.

Independent dynamic evidence: `review-flight-cycle.json`, reproducible read-only probe `review-flight-cycle.mjs`.

| Actor / pose | Captured poses | Actual sole-band vertex intersections | Missing intersections / poses | Max lowest-sole gap | Max complete sole-band gap |
| --- | ---: | ---: | ---: | ---: | ---: |
| Jade, complete float cycle plus first wrapped poses | 188 | 15,513 | 0 / 0 | .010238 m | .019244 m |
| Shadowbound, authored rest pose (no float clip exists) | 14 | 2,912 | 0 / 0 | .009810 m | .021186 m |

The Jade scan covers the full 3.041666746 s clip with approximately 60 Hz samples, plus three wrap samples. Each pose evaluates every current foot/toe skin-weighted vertex (> .5 weight) within 1 cm of that foot's minimum. Contact uses exact world-space triangles of the actual imported/deformed flight geometry. The analysis acceleration grid preserves native vertices/indices; selected lowest-sole samples were independently cross-checked against `THREE.Raycaster`, with maximum difference 2.78e-17 m.

All tested sole footprints remain over real sword surfaces. Small positive shoe/surface gaps remain, so this result does not claim that every sole point is perfectly flush with the curved mesh. The worst Jade lowest-point gap is 1.024 cm, rather than strictly under 1 cm at every pose. Those small offsets are materially different from the old off-blade foot intersection failure. The fixed `flightSupportGap` diagnostic should still be described as a deck-plane alignment check; the independent triangle evidence supplies the actual contact result.

The previous `review-foot-contact.json` has been rerun against the corrected geometry and now reports all four initial lowest-sole rays hit. The old unsupported-foot coordinates and first review message describe the superseded factor-2.8 variant, not the final variant.

## Finding corrected during review

The first version published `heldTemplate` before constructing and validating the flight template. A failed final deck ray test left a populated held cache and an invalid flight cache; a subsequent `load()` returned success from its early held-cache check. The current source now publishes both templates only after the flight preparation and deck validation succeed. That resolves the partial-ready cache condition. A failed temporary import is still not explicitly disposed; at present this is an error-path cleanup limitation, not a claim of steady-state leaking.

## Nonblocking performance observations

- The previous full `BufferGeometry.clone()` duplication is corrected: the final flight geometry explicitly shares index/UV attributes and only clones modified position/normal attributes. Ordinary actor clones also share the two cached geometries and common materials; switching actors does not allocate a fresh weapon mesh buffer set.
- The actual asset has 116,344 triangles, 65,229 vertices, one material and three 2048² textures. One visible weapon costs 116,344 base-pass triangles; a player plus visible mentor costs about 232,688 before any other scene mesh. The explicit `castShadow=false` avoids submitting that mesh to the sun's shadow map.
- JPEG reduces file size, not GPU allocation. Three uncompressed RGBA8 2048² textures with mipmaps are approximately 64 MiB. Textures/materials are shared between held/flight and actor clones, so this is not multiplied per character. This remains a material mobile-memory / distant-draw budget, but no measured frame-time regression is claimed.

## Verified structural facts and limits

- Main startup awaits the weapon import before constructing `Game`, so delayed/failed network loading cannot create a partially initialized character through the normal startup path.
- The actual GLB has one identity-transform mesh node, raw min Y=0, max Y=.8. Its actual tip is `[-.00000673, 0, -.000405946]`; the wrapper's rotation/scaling maps max sword Y to 1.04 and the raw grip plane .675 to .03. The nominal tip socket differs from the actual tip by only about 10 µm laterally and 6 µm in Z.
- The visible original GLB PBR material is retained. Held/flight actor clones share materials and cached geometries; character switching only disposes actor skeletons, which avoids destroying shared weapon resources.
- The dynamic foot probe provides independent physical footprint evidence at the measured poses. Animated hand grip fit and full game input behavior remain the main task's actual input capture scope; a socket name alone is not proof of hand contact.

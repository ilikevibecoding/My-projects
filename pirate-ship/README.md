# ☠ Pirate Cove — Sail the Jungle Isles

A browser pirate-ship sailing game built with Three.js. No build step, no
assets to download — everything (ship, islands, jungle, ocean) is generated
procedurally in code. Open `index.html` from any static server and sail.

## Controls

| Input | Action |
| --- | --- |
| `W` / `S` | more / less sail (Anchored → Slow → Half → Full) |
| `A` / `D` | rudder (turns scale with boat speed) |
| `Space` | drop / weigh anchor |
| `R` | reset ship to spawn |
| `H` | toggle the help card |
| mouse drag | orbit the camera |
| scroll | zoom |

Sail with the wind (see the dial, top right) for extra speed.

## How the water physics works

- **One wave model, two consumers.** `src/waves.js` defines a sum of Gerstner
  (trochoidal) waves — swells, mid waves and chop. The exact same wave list is
  packed into shader uniforms (GPU displaces the ocean mesh vertices and
  computes analytic normals) and evaluated in JS for the physics. The ship
  floats on precisely the surface you see.
- **True height sampling.** Gerstner waves displace water horizontally as well
  as vertically, so "height at (x, z)" needs the inverse of the horizontal
  displacement — solved with a fast fixed-point iteration (≈ millimetre
  accuracy, verified by tests).
- **Buoyancy probes.** The hull carries 14 probes spread over its footprint.
  Each samples the live wave field and contributes a depth-proportional
  buoyancy force at its location — the ship naturally heaves, pitches, rolls,
  and rides swells. Per-probe damping acts on velocity *relative to the moving
  water surface*, which kills jitter without making the sea feel sticky.
- **Sailing model.** Sail thrust (modulated by wind alignment), speed-dependent
  rudder yaw, heel in turns and from beam wind, strong lateral keel drag,
  quadratic hull drag, plus soft grounding against the islands' terrain field.
- **Fixed timestep.** Physics runs at 60 Hz with an accumulator, independent of
  render rate.

## The environment

- The ocean is a single radial mesh centred on the ship — dense near the
  camera, geometrically coarser toward a ~7 km horizon. Small waves fade with
  distance in the shader (no aliasing), fog hides the rim.
- The water shader colours by true depth against the islands' terrain field:
  turquoise shallows, navy deeps, crest foam from wave steepness, animated
  shore foam, sun glints and a fresnel sky reflection.
- Islands are radial-harmonic mounds shared by three consumers: terrain mesh,
  physics collision, and the ocean shader's depth tint — all from
  `src/islandField.js`.
- Jungle: instanced palms (wind-swayed in the vertex shader), undergrowth,
  rocks, drifting clouds, circling gulls, wake ribbon, bow spray and a
  wave-conforming contact shadow under the hull.

## Performance

Designed to stay light: ~27 draw calls and ~430 k triangles in view, one
2048 px shadow map, pixel ratio capped at 1.6, instancing for all vegetation.

## Tests

```
node pirate-ship/test/physics.test.mjs
```

Covers wave-inversion accuracy, flotation stability, drive/steering behaviour
and island grounding.

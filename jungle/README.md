# Jungle — a Three.js WebGPU graphics test

A first-person jungle biome walking simulator built to stress-test the
new-generation Three.js stack: **`WebGPURenderer` + TSL** (three.js r184) with
automatic WebGL 2 fallback. Everything — terrain, textures, plants, water,
sound — is generated procedurally in code. No downloaded assets, no build step.

## Run it

Live: https://ehpurple.com/jungle/

Locally, from the repo root:

```bash
python3 -m http.server 4173
```

then open http://127.0.0.1:4173/jungle/

## Controls

- **Desktop**: click to capture the mouse — `WASD` walk, `Shift` sprint,
  `Space` jump. Walk into the lagoon to wade; keep going to swim. Look down
  while swimming to dive.
- **Mobile**: left thumb = move (push to the edge to sprint), right thumb =
  look, double-tap the right side to jump.

## What's being stress-tested

- `WebGPURenderer` with the node material system — the HUD badge shows whether
  you're on **WebGPU** or the **WebGL 2 fallback** (force it with `?webgl`)
- TSL shading throughout: terrain splat blending, vertex-shader wind over all
  instanced foliage, a custom water material (planar reflections, depth tint,
  shoreline foam, sun glints), animated caustics
- An interactive **ripple simulation** (ping-pong wave equation in render
  targets) — footsteps, splashes and the waterfall all stir the water
- The new node-based post-processing stack: god rays, depth-masked bloom,
  color grade, vignette, FXAA
- Thousands of GPU instances: canopy trees, palms, ferns, banana plants,
  grass, vines, flowers, butterflies, pollen, birds
- Procedural WebAudio ambience: waterfall rumble (distance + direction aware),
  wind, synthesized bird chirps — plus underwater muffling

## Quality presets

`Low / Med / High / Ultra` in the HUD (auto-detected default; override with
`?q=low|medium|high|ultra`). Presets scale pixel ratio, shadow resolution,
vegetation density, reflections, god rays and particle counts live.

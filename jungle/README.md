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

## How it was built

The first version was treated as a rough draft and then taken through eleven
inspect → critique → fix passes, each verified with headless Chromium
screenshots from fixed viewpoints and a scripted walk/jump/swim run:

1. **Structure** — authored landforms (falls cliff, east ridge + overlook,
   west ravine, NE terraces, SE clearing, ruins knoll), a trail network baked
   into a control map, an irregular rim so the map has no visible edge
2. **Vegetation** — 36 instanced species layers with ecological placement
   rules (slope, canopy density, water proximity, clustering, keep-outs)
3. **Materials** — tileable FBM / Voronoi rock and soil textures with
   height-field normal maps, triplanar cliffs, seamless bark, moss/lichen masks
4. **Lighting** — art-directed sun/fill ratio, ACES, analytic two-layer fog
   (distance haze + basin mist), depth-masked bloom, localized god rays, GTAO
5. **Water + VFX** — refraction, absorption along both light legs, caustics,
   ripple sim, terrain-fitted waterfall, pollen, leaves, butterflies, birds
6. **Exploration** — landmarks with discovery toasts, stepping-stone fords,
   a log bridge, ruins, a giant buttressed tree, an overlook with a railing
7. **Microdetail** — trail litter and damp patches, trodden centre lines,
   rubble, crevice ferns, lily pads that ride their own wave
8. **Distance & scale** — layered mountain backdrop with lit flanks, far
   canopy density, fog falloff, vegetation fade that never floats
9. **Performance + bugs** — water-surface culling over dry land, zero console
   errors on every preset, controller checks, WebGPU device-loss fallback
10. **Independent review** — a separate reviewer walked the scene blind and
    filed 30 findings; the bugs (dead tree lookup for falling leaves /
    fireflies / audio, blown-out backlit leaves, wake glints, FPS meter clamp,
    no trunk collision) and the art-direction notes (noon light, milky haze,
    perfect-circle landforms, solid foam band, cardboard mountains, bark rings,
    guitar-string lianas) were fixed in this pass
11. **Polish** — off-axis shrub clusters, muted fungi, warmer shaded rock,
    analytic treeline reflection for the low presets

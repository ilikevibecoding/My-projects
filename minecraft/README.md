# BlockCraft

A Minecraft-style voxel sandbox that runs entirely in the browser. No build
step, no asset files — terrain, textures, sounds and the sky are all generated
procedurally at runtime.

Open `index.html` through any static file server (it uses ES modules, so the
`file://` protocol won't work):

```bash
cd minecraft
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Features

- **Infinite procedural terrain** — chunked world streamed around the player,
  with rolling hills, mountains, deserts, snow biomes, beaches, lakes and seas
- **Caves and ores** — 3D-noise carved caverns with coal and iron deposits
- **Trees** that generate across chunk borders deterministically
- **Block breaking and placing** with a 9-slot hotbar (keys 1–9, mouse wheel,
  or middle-click to pick the block you're looking at)
- **Pixel-art texture atlas** painted onto a canvas at startup — grass, stone,
  sand, logs, leaves, glass, water and more
- **Lighting** — baked ambient occlusion, per-face shading and a depth-based
  darkness heuristic for caves
- **Day/night cycle** — square sun and moon, stars, drifting blocky clouds,
  and dawn/dusk fog tinting
- **Physics** — AABB collision, jumping, swimming with an underwater fog
  effect, and a creative-style fly mode (`F`)
- **Persistence** — your block edits are stored in `localStorage` per world
  seed; use `?seed=...` in the URL to visit a specific world
- **Procedural audio** — break/place/splash sounds synthesized with WebAudio

## Controls

| Input            | Action                |
| ---------------- | --------------------- |
| `W A S D`        | Move                  |
| Mouse            | Look                  |
| Left click       | Break block           |
| Right click      | Place block           |
| Middle click     | Pick block            |
| `Space`          | Jump / swim / fly up  |
| `Shift`          | Sprint / fly down     |
| `F`              | Toggle flying         |
| `1`–`9` / wheel  | Select hotbar slot    |
| `Esc`            | Pause menu            |

## Tech notes

- [three.js](https://threejs.org) r165, vendored in `vendor/` so the game works
  offline and the version is pinned
- One mesh per 16×16×96 chunk (plus a translucent mesh for water/glass), built
  with face culling, per-vertex ambient occlusion and a texture atlas
- Terrain from seeded 2D simplex noise (continents, hills, mountain mask,
  biomes) plus 3D value noise for caves
- Voxel raycasting uses the Amanatides–Woo DDA traversal

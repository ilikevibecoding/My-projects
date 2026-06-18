# Hyper-Realistic Minecraft Demo

A self-contained, browser-based voxel sandbox that keeps Minecraft's blocky geometry
but renders it with **physically based lighting** and **high-detail procedural textures**.

Open `index.html` (served over HTTP) and click to play. It's deployed alongside the
rest of the site under `/minecraft-demo/`.

## Highlights

- **Procedural PBR textures** — every block face is drawn at runtime to a canvas
  (`textures.js`). Each texture is seamless-tiling and detailed (grain, cracks,
  mineral specks, faceted ore crystals, see-through leaf cutouts). A tangent-space
  **normal map** and a **roughness map** are derived from each albedo so surfaces
  catch the sunlight realistically.
- **Real-time lighting** — directional sun with soft shadow mapping, hemisphere +
  ambient fill, ACES filmic tone mapping, sRGB output, gradient sky, drifting
  clouds, distance fog, and a glowing sun sprite.
- **Baked ambient occlusion** — classic per-vertex voxel AO darkens block crevices.
- **Procedural world** — value-noise terrain with hills, beaches, water lakes, snowy
  peaks, oak trees, and underground coal/diamond ore pockets.
- **Full interaction** — first-person controls, gravity + collision, flying, voxel
  ray-casting, and block break/place with live chunk re-meshing.

## Controls

| Input | Action |
| --- | --- |
| `W A S D` | Move |
| `Mouse` | Look |
| `Space` | Jump / fly up |
| `Shift` | Sprint / fly down |
| `Left click` | Break block |
| `Right click` | Place block |
| `1`–`9` / Scroll | Pick block |
| `F` | Toggle fly |
| `Esc` | Release mouse |

## Files

- `index.html` — page shell, HUD, hotbar, start overlay.
- `textures.js` — 16 procedural block textures (`window.MC_TEXTURES`).
- `engine.js` — Three.js voxel engine: world gen, meshing + AO, materials,
  lighting, controls, and interaction.

## Tech

- [Three.js](https://threejs.org/) `r160` loaded from a CDN via an import map.
- No build step; everything runs as static files.

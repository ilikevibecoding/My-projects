# ❄ IceCraft

A browser-based **Minecraft-style voxel sandbox** set in a frozen world of endless snow,
frozen lakes, and **large procedurally-generated ice castles**. Built with
[Three.js](https://threejs.org/) (vendored locally) and plain ES modules — no build step.

## Play locally

Serve the repository (or this folder) with any static server, then open the page:

```bash
# from the repo root
python3 -m http.server 8099
# then visit:
#   http://localhost:8099/ice-craft/
```

Or serve just this folder:

```bash
python3 -m http.server 8099 --directory ice-craft
# visit http://localhost:8099/
```

Then **click the screen** to lock the mouse and start playing.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| `Mouse` | Look |
| `Space` | Jump |
| `Shift` | Sprint |
| `F` | Toggle fly (then `Space` / `C` to go up / down) |
| `Left click` | Break block |
| `Right click` | Place block |
| `1`–`8` / mouse wheel | Choose block in the hotbar |
| `Esc` | Release the mouse |

## What's inside

- **Chunked voxel world** (16×16 columns, 64 tall) with per-face-culled meshing and dynamic
  chunk loading/unloading around the player.
- **Procedural icy terrain**: snow, packed ice, blue-ice veins, glacier stone, frozen dirt,
  and flat frozen lakes at sea level.
- **Large ice castles** placed deterministically across the world — curtain walls with
  battlements, corner towers with spires, a tall central keep, and a gatehouse. They are
  stamped chunk-independently, so they're seamless across chunk borders and identical on reload.
- **First-person physics**: gravity, AABB voxel collision, jumping, sprinting, and a creative fly mode.
- **Block editing** via a DDA voxel raycast with a targeted-block highlight.
- **Cold atmosphere**: sky gradient, blue depth fog, translucent ice, sun + hemisphere lighting,
  and falling snow particles.

## Code layout

```
ice-craft/
  index.html        # canvas, HUD, importmap, entry
  styles.css        # HUD / crosshair / hotbar / overlay
  vendor/
    three.module.js # vendored Three.js
  src/
    config.js   blocks.js   noise.js    textures.js
    chunk.js    terrain.js  castle.js   world.js
    player.js   raycast.js  input.js    hud.js   snow.js
    main.js     # scene, lights, game loop, input wiring, debug API
```

## Tuning

Most knobs live in `src/config.js`: world seed, chunk size, render distance, sea level,
movement/physics speeds, and block IDs. Castle frequency/size live in `src/castle.js`.

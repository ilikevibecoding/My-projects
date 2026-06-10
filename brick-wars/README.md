# Brick Wars: Spirit Quest

A small browser game rendered with Three.js: explore a desert diorama built
entirely out of procedurally generated plastic construction bricks, smash
crates for studs, build a staircase out of a rattling brick pile, and collect
all **7 glowing spirits** of the fallen master builders.

> **Disclaimer** — This is an unofficial fan parody made for personal,
> non-commercial use. It is not affiliated with, endorsed by, or connected to
> the LEGO Group or Lucasfilm. Every asset (models, textures, audio) is
> original and generated procedurally in code at runtime; no third-party
> assets, logos, or trademarks are used.

## Play

Everything is static — no build step, no server-side code.

**Local:**

```bash
# from the repository root
python3 -m http.server 8123
# then open http://localhost:8123/brick-wars/
```

**Via CDN (this branch):**

- https://raw.githack.com/ilikevibecoding/My-projects/cursor/bc-a9d7f41c-76dd-4702-9e55-dfef9095a961-8f96/brick-wars/index.html
- https://cdn.jsdelivr.net/gh/ilikevibecoding/My-projects@cursor/bc-a9d7f41c-76dd-4702-9e55-dfef9095a961-8f96/brick-wars/index.html

Best played on a desktop browser with hardware WebGL.

## Controls

| Input          | Action                          |
| -------------- | ------------------------------- |
| `W A S D`      | move                            |
| Mouse          | look (pointer lock)             |
| `Space`        | jump                            |
| Click / `F`    | swing the energy sword          |
| `E` (hold)     | build the rattling brick pile   |
| `Shift`        | sprint                          |
| `Esc`          | release the mouse               |

## Objectives

1. **Find the 7 spirits** drifting around the flats — walk into them to
   collect. Each collected spirit becomes a wisp that follows you.
2. **Smash brick crates** with the sword; they burst into tumbling bricks and
   spill golden studs that magnet to you.
3. The final spirit waits **on top of the mesa**. Find the rattling pile of
   bricks at its foot and hold `E` — the bricks fly into place and snap into a
   staircase you can climb.

## Tech notes

- **Graphics-first build.** Every structure is assembled from bricks at true
  construction-toy ratios (8 mm module: plates 0.4, bricks 1.2, studs Ø0.6 ×
  0.21) with chamfered edges, glossy clearcoat "ABS plastic" materials
  (`MeshPhysicalMaterial`), per-brick molded-batch color jitter, PMREM
  environment speculars, soft shadows, ACES tone mapping, and selective bloom
  on the sword blade and spirits.
- The terrain is a terraced heightfield of stacked 1×1 plates over a studded
  baseplate; huts are laid brick-by-brick in running bond with slope-brick
  roofs. Static geometry is rendered with a handful of `InstancedMesh` draw
  calls.
- The minifig hero and ghost spirits share one procedural rig (studded
  cylinder head with a canvas-painted face, tapered torso, claw hands) with a
  procedural walk/idle/swing animation.
- Audio is synthesized WebAudio (sword hum, stud pickup ladder, build snaps,
  win fanfare) — no audio files.
- Three.js (v0.170) is vendored under `vendor/` so the page works offline and
  from any static host.
- `?nobloom=1` disables post-processing (useful for slow/software WebGL).

## Files

```
index.html      page shell, HUD, title/win overlays
styles.css      HUD and overlay styling
src/main.js     renderer, bloom, state machine, game loop
src/bricks.js   brick geometry factories + plastic materials (the look)
src/world.js    terraced desert diorama, sky, lighting
src/minifig.js  minifig rig + energy sword + animations
src/spirits.js  collectible spirits, particles, follower wisps
src/smash.js    crate smashing, debris physics, stud magneting
src/build.js    hold-to-build staircase set piece
src/controls.js third-person pointer-lock controls
src/hud.js      counters, toasts, win screen
src/audio.js    synthesized sound effects
vendor/         pinned Three.js + postprocessing modules
```

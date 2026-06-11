# Drifter MCV-7 — first-person ship interior demo

A small first-person walkable spaceship interior (Three.js + Vite). Everything is
procedural: canvas-generated PBR textures, kit-bashed geometry, shader planets.

## Run

```bash
npm install
npm run dev
```

Click to grab pointer lock. WASD + mouse, `E` to interact (bed / galley / bathroom sink).

## Screenshot harness

```bash
node tools/shots.mjs <iteration>
```

Spawns vite + headless Chromium (SwiftShader), captures deterministic views
(`cockpit`, `corridor`, `quarters`, `window`) plus interaction smoke tests into
`shots/iter_<n>/`.

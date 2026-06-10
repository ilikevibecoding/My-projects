# Galactic Battlefront — Assault on Dune Outpost

A self-contained, browser-playable **Star Wars Battlefront-style conquest shooter** inspired by the
cancelled Battlefront 3 — including its signature **ground-to-space** gameplay. No build step, no
dependencies to install, no assets to download: every texture, model, and sound effect is generated
procedurally in code.

## How to play

**Option 1 — just open it:** double-click `index.html` in any desktop browser (Chrome/Edge/Firefox).

**Option 2 — local server:**

```bash
python3 -m http.server 8000
# then visit http://localhost:8000/battlefront/
```

Desktop + mouse/keyboard required. Click the canvas to lock the pointer.

## The game

- **Conquest mode** — five command posts (A–E) on a desert valley map. Stand inside a post's ring to
  neutralize and capture it. Each side has **200 reinforcement tickets**: deaths cost tickets, and
  holding the majority of posts makes the enemy's tickets bleed. First army to 0 loses.
- **Two factions** — the tan-armoured **Coalition** (crimson blasters) vs the white-armoured
  **Dominion** (emerald blasters).
- **Four classes** — Assault (blaster rifle + grenades), Heavy (rocket launcher + extra armour),
  Sniper (charged precision rifle with zoom), Engineer (scatter blaster + repair pulse).
- **16 v 16 AI armies** that navigate, fight, capture, and defend on their own.
- **Vehicles** — speeder bikes at each base, emplaced E-Web turrets that fight for whoever owns the
  nearest post… and one **starfighter per base**.
- **Ground-to-space** — fly the starfighter straight up. Past ~150 m the desert haze gives way to a
  starfield: you're in **low orbit**, where both factions' capital ships loom. Destroy all four
  glowing shield generators on the enemy capital ship to cost them **50 tickets**, then dive back
  into the ground war.

## Controls

| Input | Action |
|---|---|
| `WASD` | Move (throttle/steer in vehicles) |
| `Mouse` | Aim / pitch & roll in starfighter |
| `LMB` | Fire |
| `RMB` | Zoom (sniper) / aim-down slow walk |
| `Shift` | Sprint / boost |
| `Space` | Jump / ascend (fighter) |
| `R` | Reload |
| `G` | Thermal grenade |
| `F` | Repair pulse (Engineer) |
| `E` | Enter / exit vehicles |
| `V` | Toggle third person |

## Graphics

Physically-based rendering with ACES filmic tone mapping, real-time PCF soft shadows, an
UnrealBloom + FXAA + film-grade post-processing stack, slope-splatted terrain with procedural
normal maps, sun lens flare, holographic command-post flags, and layered explosion/blaster
effects — all running on a vendored three.js r147 (UMD, so it works from `file://`).

**Performance:** the game sniffs your GPU at boot and picks a sensible default preset, caps the
render resolution (max 1.5× pixel ratio), and runs an **adaptive watchdog** that automatically
steps the quality down (with an on-screen notice) if your frame rate dips below ~42 fps. Picking
HIGH / MEDIUM / LOW manually on the title screen disables the watchdog and locks your choice.

## Dev / testing

Headless smoke test (needs `playwright-core` and a local Chrome):

```bash
cd battlefront
node test/smoke.mjs            # serves expects http://localhost:8077 (python3 -m http.server 8077 at repo root)
```

Debug query params: `?debug=1` (fps counter), `?test=1` (autopilot bot-match for CI),
`?speed=N` (sim time-scale), `?quality=high|medium|low`.

### Audit results (headless CI run)

- **Balance:** a full unattended 16v16 match resolves naturally in ~6.5 sim-minutes
  (posts captured within the first 2 minutes, majority-hold bleed decides the winner).
- **Perf:** ~220 draw calls and ~35k triangles per frame at HIGH (including the shadow and
  bloom passes), 47 shader programs — comfortably within WebGL budgets; any discrete or
  integrated GPU should hold 60 fps.

## Credits

Everything procedural — no external art, audio, or IP assets. Original faction names and designs,
heavily inspired by a galaxy far, far away.

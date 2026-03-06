# Doodle Jump Parody

Doodle Jump Parody is a faithful browser parody clone tuned to feel closer to the original Doodle Jump formula while still running as a plain static web app.

The project uses plain HTML, CSS, and JavaScript and now bundles local sprite/audio assets in the repository, so local play does not depend on fetching remote art or sounds at runtime.

## Features

- Portrait graph-paper playfield
- Score in the top-left and pause in the top-right
- Automatic jumping / bouncing
- Horizontal wraparound
- Canonical platform families:
  - green standard platforms
  - blue moving platforms
  - brown breakable platforms
  - white disappearing platforms
- Boost pickups:
  - spring
  - propeller hat
  - jetpack
- Monsters that can be stomped or shot
- Upward shooting
- Start, pause, and game-over overlays
- Keyboard and touch controls
- Persistent best score and sound setting with `localStorage`
- Local bundled assets under `assets/images` and `assets/audio`

## Run locally

From the project folder:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

If `python3` is unavailable, try:

```bash
python -m http.server 8000
```

Opening `index.html` directly can work, but a local server is recommended.

## Controls

### Desktop

- `A` / `D` — move left / right
- `←` / `→` — move left / right
- `Space` — shoot upward
- `P` or `Esc` — pause / resume
- `Enter` — start a run from the start or game-over screen
- `R` — quick restart from the start or game-over screen

### Mobile / touch

- Use the on-screen left / shoot / right buttons

## Gameplay tips

- Land on platforms from above to bounce automatically.
- Use wraparound movement to rescue awkward jumps.
- Springs, propellers, and jetpacks are the fastest ways to climb.
- Brown platforms break after one bounce.
- White platforms disappear after contact.
- Stomp monsters from above or shoot them.

## Project files

- `index.html` — page structure and overlays
- `styles.css` — portrait parody presentation and responsive layout
- `game.js` — gameplay loop, platform generation, rendering, input, audio, and persistence
- `assets/images` — local sprite assets used by the game
- `assets/audio` — local sound effects used by the game
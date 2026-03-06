# Skybound Scribble

Skybound Scribble is a polished browser-based arcade platformer inspired by Doodle Jump.  
It is built with plain HTML, CSS, and JavaScript, so you can run it locally in any modern desktop browser without a bundler or framework.

## Features

- Endless vertical jumping gameplay
- Auto-bounce movement just like classic Doodle Jump-style games
- Horizontal wraparound
- Procedural platform generation
- Multiple platform types:
  - stable platforms
  - moving platforms
  - breakable platforms
  - vanishing platforms
  - boost platforms
- Power-ups:
  - spring boosts
  - jetpack bursts
- Hazards:
  - doodle sky monsters
- HUD with score, height, best score, and style streak
- Start, pause, and game-over overlays
- Keyboard and touch controls
- Persistent best score and sound setting with `localStorage`
- Lightweight procedural sound toggle

## Run locally

From the project folder:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

You can also open `index.html` directly, but a local server is recommended.

## Controls

### Desktop

- `A` / `D` — move left / right
- `←` / `→` — move left / right
- `P` or `Esc` — pause / resume
- `Enter` — start a run from the start or game-over screen
- `R` — quick restart from the start or game-over screen

### Mobile / touch

- Use the on-screen left / right buttons at the bottom of the page

## Gameplay tips

- Land on platforms from above to bounce automatically.
- Use wraparound movement to recover from awkward jumps.
- Springs and boost pads are your best tools for skipping dangerous gaps.
- Vanishing pads help once, then disappear.
- Breakable pads crack and drop out after contact.
- The longer you survive, the more hazards and tricky platform combinations appear.

## Project files

- `index.html` — page structure and overlays
- `styles.css` — full visual design and responsive layout
- `game.js` — gameplay loop, physics, rendering, input, audio, and persistence
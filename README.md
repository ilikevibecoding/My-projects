# Bombsite Breach

Bombsite Breach is a self-contained browser tactical shooter inspired by the CS:GO retake loop.
The whole prototype lives in `index.html` with no dependencies or build step.

## What is included

- Top-down tactical shooter gameplay
- Bombsite A retake scenario with a live bomb timer
- Enemy bots with patrol, sightlines, and combat behavior
- Weapon switching between USP-S, M4A1-S, and AWP
- Reloading, armor, round transitions, score tracking, and HUD updates
- Defuse mechanic with a hold-to-complete progress bar

## How to run

Open `index.html` in a desktop browser.

If you want to serve it locally instead of opening the file directly:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Controls

- `WASD` - move
- `Shift` - slow walk for tighter spread
- `Mouse` - aim
- `Left Click` - fire
- `R` - reload
- `1` - USP-S
- `2` - M4A1-S
- `3` - AWP
- `E` - hold to defuse when near the bomb
- `Enter` or `Space` - start the match from the intro screen

## Objective

You play as the counter-terrorist on a solo retake. Eliminate defenders if needed, but the round is only won once the bomb is defused before the timer expires.
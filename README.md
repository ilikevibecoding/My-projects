# Pelagia Depths

Pelagia Depths is a graphics-first underwater exploration prototype inspired by the feel of Subnautica.
The repository is still a lightweight browser project, so the clone is delivered as a no-build canvas experience
instead of a Unity scene.

## What is included

- Fullscreen underwater exploration with a cinematic HUD
- Large layered seascape with reefs, kelp forests, coral fields, vents, and deep-biome lighting
- Animated caustics, volumetric light shafts, bubbles, plankton, glowing flora, and ambient fauna
- Scanner-driven objective loop with four alien fragments to recover
- Oxygen, health, power, sonar, predator patrols, and lifepod return objective

## Project files

- `index.html` - page shell and HUD markup
- `styles.css` - interface styling and glass HUD treatment
- `game.js` - world generation, rendering, movement, scanning, predators, and effects

## How to run

Open `index.html` in a desktop browser.

To serve it locally:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Controls

- `WASD` or arrow keys - swim
- `Shift` - short burst swim
- `Mouse` - aim the scanner
- `Left Click` - hold to scan nearby fragments
- `Space` - sonar pulse
- `Enter` or `Space` - start from the intro screen
- `Enter` - restart after success or failure

## Objective

Scan all four alien fragments, keep your oxygen topped up with bubble vents or the lifepod,
avoid predators in the deeper biomes, and return to the lifepod to uplink the recovered data.
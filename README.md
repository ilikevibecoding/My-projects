# Abyssal Bloom

Abyssal Bloom is a graphics-first, Subnautica-inspired underwater exploration prototype built as a single self-contained HTML file.

The original repository was not a Unity project, so the implementation was created directly in the existing browser-based codebase instead of inside Unity. The focus is on atmosphere and presentation:

- layered underwater gradients and depth fog
- animated caustics and sun shafts
- coral reefs, kelp forests, vents, and landmarks
- glowing fauna with a scan-to-catalog loop
- sonar pulse effects and a cinematic HUD

## How to run

Open `index.html` in a desktop browser.

If you want to serve it locally:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Controls

- `WASD` - swim
- `Shift` - boost using seaglide energy
- `Mouse` - aim the scanner
- `Space` - emit sonar pulse
- `E` - hold to scan nearby fauna
- `Enter` or `Space` - start the dive
- `Enter` - restart after a completed run

## Objective

Scan four unique species, then return to Life Pod 5 to complete the databank uplink.

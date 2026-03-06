# Neon Forecourt

A desktop-ready gas station simulator with stylized 3D arcade visuals, shifting neon lights, and a quick score-chasing management loop.

## Features

- Three playable pump lanes with incoming AI cars
- Walkable station attendant using WASD or arrow keys
- Hold-to-fuel gameplay with combo bonuses and customer patience
- Fuel-stock management with fast tanker refills
- Bloom-heavy dusk lighting, neon signage, and low-poly 3D scenery

## Controls

- `WASD` / arrow keys: move
- Drag mouse: orbit camera
- Mouse wheel: zoom
- `Hold E`: fuel the car at the nearest waiting pump
- `Shift`: sprint
- `R`: buy an instant tanker refill
- `Enter`: restart after the shift ends

## Run in the browser

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

## Run as a desktop app

Launch the standalone Electron version:

```bash
npm install
npm run desktop
```

Create a packaged desktop build for your current OS:

```bash
npm run desktop:pack
```

Create installable output in `release/`:

```bash
npm run desktop:dist
```
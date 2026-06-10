# Test & self-play harness

Headless tooling used to build/tune the game. Requires Node + `npm i` (installs
Playwright), then `npx playwright install chromium`.

| Script | What it does |
| --- | --- |
| `shot.js` | Boots the game in headless Chromium (SwiftShader WebGL) and screenshots title / every station / monster poses / jumpscares / win screen. `node shot.js <scenario>` — scenarios: `title`, `room`, `monsters`, `jumpscare`, `grimm`, `win`. |
| `selfplay-sim.mjs` | Pure-Node simulation that imports the real `ai.js` and plays thousands of nights with a cue-driven bot at several skill levels. Used to tune the per-night difficulty table. `node selfplay-sim.mjs [runsPerNight]`. |
| `selfplay-browser.js` | End-to-end self-play in headless Chromium: hooks the game's audio-cue bus and drives real keyboard/mouse input to play a full night. `node selfplay-browser.js <night> <play\|idle>`. |
| `live-verify.js` | Smoke-tests a deployed URL (handles the githack interstitial): boots, starts night 1, moves to a door, flashes the hall, asserts no console errors. `node live-verify.js <url>`. |

`shot.js` / `selfplay-browser.js` expect the game served at `http://localhost:8765`
(`npm run serve`).

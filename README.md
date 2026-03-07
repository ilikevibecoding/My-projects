# Eva's Phone - Virtual iPhone Surprise

A pixel-perfect virtual iPhone mockup built as a single-page web app. Designed as a
personal gift experience with an interactive surprise inside.

## The Experience

1. **Lock Screen** — A gorgeous gradient wallpaper with live clock. Tap or swipe up to unlock.
2. **Home Screen** — Realistic iOS home screen with app icons and frosted-glass dock.
3. **App Store** — Tap the App Store icon to browse. Find "Eva's Game" featured at the top.
4. **Download** — Tap GET to watch the download animation. Then tap OPEN.
5. **Eva Scratchers** — Three scratch-off lottery tickets with hidden prizes. Scratch each
   one to reveal Amazon codes underneath. When all three are scratched, a special message
   appears.

## How to Open

Open `index.html` in any modern browser — no build step or dependencies required.

You can also serve it locally:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

## Customization

Edit the prize codes and descriptions directly in `index.html`. Search for `prize-code` and
`prize-title` to find the three tickets:

- Ticket 1: Spa & Pamper Package (`AMZN-SPA-2026`)
- Ticket 2: Shopping Spree (`AMZN-SHOP-2026`)
- Ticket 3: Date Night Special (`AMZN-DATE-2026`)

Replace the placeholder codes with real Amazon gift card codes before sending.

## Tech

Pure HTML + CSS + JavaScript in a single file. No frameworks, no dependencies. Features
include:

- Responsive scaling to fit any screen size
- Touch and mouse support for all interactions
- HTML5 Canvas-based scratch-off mechanic
- CSS transitions mimicking iOS animations
- Live clock synced to the viewer's device

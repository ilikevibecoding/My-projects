# Relay

Relay is a polished, dependency-free static website concept for a **continuous learning benchmark**.
It is designed as a research-style launch page for a benchmark that measures how well agents retain,
recover, transfer, and remain robust as tasks and environments shift over time.

## What changed

This repo now ships a complete static benchmark website rather than a game or prototype UI.
The current site includes:

- a new benchmark brand and homepage
- a hero section with benchmark summary metrics
- a benchmark loop section explaining the evaluation cycle
- interactive evaluation-track tabs
- a rendered scoreboard with illustrative submissions
- an FAQ and launch-ready CTA/footer

## File structure

- `index.html` — semantic page structure and site copy
- `styles.css` — layout, visual system, and responsive behavior
- `script.js` — lightweight interactions and data-driven content

## Run locally

Open `index.html` directly in a browser, or serve the repo locally:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Customization

- Update copy and section structure in `index.html`
- Change colors, spacing, and component styling in `styles.css`
- Replace track and scoreboard data in `script.js`

## Notes

The benchmark copy and scores are illustrative, but the site is intentionally structured so it can be
adapted into a real benchmark launch page with minimal effort.

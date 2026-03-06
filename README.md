# Continuum

Continuum is a polished, dependency-free static website concept for a **continuous learning benchmark**.
It presents a fictional benchmark brand, methodology, task suite, and illustrative leaderboard in a
single-page experience designed for research launches, benchmark announcements, or demo microsites.

## What is included

- A premium dark-mode landing page with a strong hero section
- Benchmark positioning focused on retention, adaptation, transfer, and robustness
- Task-suite tabs with domain-specific benchmark descriptions
- An illustrative leaderboard rendered from lightweight client-side data
- FAQ interactions, animated counters, scroll reveals, and section-aware nav highlighting
- Fully static hosting with no framework, no bundler, and no runtime dependencies

## File structure

- `index.html` — semantic page structure and content
- `styles.css` — design system, layout, responsiveness, and visual effects
- `script.js` — lightweight interactions and data-driven rendering

## How to run

Open `index.html` directly in a browser, or serve the directory locally:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Customization notes

- Update the benchmark name, copy, and CTA language in `index.html`
- Replace the illustrative task-suite and leaderboard data in `script.js`
- Adjust colors, spacing, and visual style tokens in `styles.css`

## Notes

The benchmark content and scores are intentionally fictional, but the site structure is designed to be a
practical starting point for a real benchmark launch page.

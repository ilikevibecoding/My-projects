# Owolingo

Owolingo is a self-contained Duolingo-style parody app built in a single `index.html` file with no
dependencies or build step.

## What is included

- A bright mobile-style lesson path with unlockable nodes
- Three playable challenge types:
  - multiple choice translation
  - tap-to-build phrase assembly
  - listen-and-pick prompts using browser speech synthesis
- Hearts, streaks, XP, gems, and reward popups
- Quest and profile screens
- Imported Duolingo-hosted artwork referenced directly from public URLs
- Clear UI labeling that the experience is an unofficial parody

## How to run

Open `index.html` in a browser.

If you want to serve it locally instead of opening the file directly:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Notes

- This project is intentionally labeled as a parody in the interface.
- The artwork used in the page is imported from Duolingo-owned public URLs, per the requested
  permission context for this task.
- Everything lives in `index.html`, so edits are straightforward and there is no asset pipeline.
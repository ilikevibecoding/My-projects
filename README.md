# UnoLingo

UnoLingo is a self-contained browser parody of the Duolingo mobile experience.
The whole prototype lives in `index.html` with no dependencies or build step.

## What is included

- Duolingo-style parody branding and lesson-path layout
- Imported logo and Duo mascot artwork
- Mini translation quiz with choices, hearts, streaks, XP, and progress tracking
- Reward screen flow for lesson completion and friend-energy bonuses
- Side feed with recent achievements and parody status cards

## How to run

Open `index.html` in a browser.

If you want to serve it locally instead of opening the file directly:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Controls

- Click any unlocked lesson node to start the quiz
- Click an answer choice, then press `Check`
- Press `Skip` to auto-fill the correct answer
- Use `Back to path` or `Practice again` on the reward screen to keep exploring

## Disclaimer

This is an unofficial parody/fan-style clone. It clearly labels itself as parody, and the imported Duolingo artwork is used here per the project request.
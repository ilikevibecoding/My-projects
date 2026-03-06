# Owllingo Parody

Owllingo is a self-contained browser parody of the Duolingo lesson flow. The whole app lives in
`index.html` with no framework, no dependency install, and no build step.

## What is included

- A Duolingo-style lesson layout with a course path, answer choices, feedback, and progression
- Reward overlays styled like the familiar energy/celebration cards
- A stats bar with streak, XP, gems, and hearts
- Daily parody quests and a recent activity feed
- Official Duolingo-hosted mascot SVG imports used inside a clearly labeled parody UI
- Local progress persistence via `localStorage`

## Parody note

This project presents itself as a parody/fan-made clone. The UI states that Duolingo mascot art is
being used with permission asserted by the project owner.

## How to run

Open `index.html` in a browser.

If you want to serve it locally:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Controls

- Click lesson nodes in the left path to jump between unlocked lessons
- Click an answer choice, then press **Check**
- Press **Continue** after feedback to move on or retry
- Press `1` through `4` to choose an answer quickly
- Press `Enter` to check or continue
- Press `Escape` to close the reward overlay
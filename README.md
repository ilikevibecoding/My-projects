# Star Wars Lightsaber Battle

A single-page browser game where you duel an AI opponent with lightsabers in a Star Wars-inspired arena.

## Play locally

Open `index.html` in a browser.

If you want to serve it locally instead of opening the file directly:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Controls

- `1` - Quick Strike
- `2` - Heavy Slash
- `3` - Parry Stance
- `4` - Force Surge
- `5` - Saber Throw
- `N` - Start next round after a win
- `R` - Full rematch and reset the scoreboard
- `J` - Switch to the Jedi side
- `S` - Switch to the Sith side

## Features

- Choose between Jedi and Sith play styles
- Turn-based saber combat with health and Force meters
- Enemy AI that adapts to your health, guard, and resources
- Animated duel stage, battle log, and running scoreboard
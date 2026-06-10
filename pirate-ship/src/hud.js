// ---------------------------------------------------------------------------
// hud.js — DOM heads-up display: knots, heading, sail setting, wind, hints.
// ---------------------------------------------------------------------------

import { SAIL_SETTINGS } from './physics.js';
import { WIND } from './waves.js';

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export class Hud {
  constructor() {
    this.elSpeed = document.getElementById('hud-speed');
    this.elHeading = document.getElementById('hud-heading');
    this.elSail = document.getElementById('hud-sail');
    this.elPips = [...document.querySelectorAll('.sail-pip')];
    this.elWindArrow = document.getElementById('wind-arrow');
    this.elAnchor = document.getElementById('hud-anchor');
    this.elAground = document.getElementById('hud-aground');
    this.elHelp = document.getElementById('help-card');
    this.elIntro = document.getElementById('intro');
    this._accum = 0;
    this._sailFlash = 0;
  }

  dismissIntro() {
    if (this.elIntro && !this.elIntro.classList.contains('hidden')) {
      this.elIntro.classList.add('hidden');
    }
  }

  toggleHelp() {
    this.elHelp?.classList.toggle('hidden');
  }

  flashSail() {
    this._sailFlash = 0.8;
    this.elSail?.classList.add('flash');
  }

  update(body, camYaw, dt) {
    this._accum += dt;
    this._sailFlash -= dt;
    if (this._sailFlash < 0) this.elSail?.classList.remove('flash');
    if (this._accum < 0.12) return; // ~8 Hz is plenty for DOM
    this._accum = 0;

    const knots = Math.abs(body.speed) * 1.94384;
    this.elSpeed.textContent = knots.toFixed(1);

    let deg = (body.heading * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    const card = CARDINALS[Math.round(deg / 45) % 8];
    this.elHeading.textContent = `${card} ${deg.toFixed(0).padStart(3, '0')}°`;

    const sail = body.anchored ? SAIL_SETTINGS[0] : body.sail;
    this.elSail.textContent = body.anchored ? '⚓ Anchored' : sail.name;
    this.elPips.forEach((pip, i) => {
      pip.classList.toggle('on', !body.anchored && i < body.sailIndex);
    });

    this.elAnchor.classList.toggle('hidden', !body.anchored);
    this.elAground.classList.toggle('hidden', !body.aground);

    // wind arrow is drawn relative to the camera view direction
    const windAngle = Math.atan2(WIND.dirX, WIND.dirZ);
    const rel = windAngle - camYaw + Math.PI;
    this.elWindArrow.style.transform = `rotate(${(-rel * 180) / Math.PI}deg)`;
  }
}

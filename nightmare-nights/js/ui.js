// HUD, menus, hint zones, the static overlay, and screen routing.
export class UI {
  constructor() {
    this.el = {
      title: document.getElementById('title-screen'),
      intro: document.getElementById('intro-screen'),
      introNight: document.getElementById('intro-night'),
      win: document.getElementById('win-screen'),
      winSub: document.getElementById('win-sub'),
      winNext: document.getElementById('win-next'),
      winMenu: document.getElementById('win-menu'),
      death: document.getElementById('death-screen'),
      deathRetry: document.getElementById('death-retry'),
      deathMenu: document.getElementById('death-menu'),
      hud: document.getElementById('hud'),
      clock: document.getElementById('clock'),
      nightLabel: document.getElementById('night-label'),
      cue: document.getElementById('cue-text'),
      nightRow: document.getElementById('night-row'),
      blackout: document.getElementById('blackout'),
      mute: document.getElementById('mute-btn'),
      zones: {
        left: document.getElementById('zone-left'),
        right: document.getElementById('zone-right'),
        up: document.getElementById('zone-up'),
        down: document.getElementById('zone-down'),
        action: document.getElementById('zone-action'),
      },
    };
    this.fx = document.getElementById('fx');
    this.fxCtx = this.fx.getContext('2d');
    this.staticLevel = 0;
    this._cueTimer = null;
    this.resize();
  }

  resize() {
    this.fx.width = Math.floor(window.innerWidth / 3);
    this.fx.height = Math.floor(window.innerHeight / 3);
  }

  show(name) {
    for (const k of ['title', 'intro', 'win', 'death']) {
      this.el[k].classList.toggle('visible', k === name);
    }
    this.el.hud.classList.toggle('visible', name === null);
  }

  setBlackout(on, instant = false) {
    this.el.blackout.style.transition = instant ? 'none' : 'opacity .25s';
    this.el.blackout.style.opacity = on ? '1' : '0';
  }

  buildNightButtons(unlocked, onPick) {
    this.el.nightRow.innerHTML = '';
    for (let n = 1; n <= 6; n++) {
      const b = document.createElement('button');
      b.className = 'night-btn' + (n > unlocked ? ' locked' : '') + (n >= 5 ? ' boss' : '');
      b.textContent = n === 6 ? 'NIGHT 6 ★' : `NIGHT ${n}`;
      if (n <= unlocked) b.addEventListener('click', () => onPick(n));
      this.el.nightRow.appendChild(b);
    }
  }

  setClock(hour, night) {
    this.el.clock.textContent = hour === 0 ? '12 AM' : `${hour} AM`;
    this.el.nightLabel.textContent = `NIGHT ${night}`;
  }

  cueText(text, ms = 2600) {
    this.el.cue.textContent = text;
    this.el.cue.classList.add('visible');
    if (this._cueTimer) clearTimeout(this._cueTimer);
    this._cueTimer = setTimeout(() => this.el.cue.classList.remove('visible'), ms);
  }

  // ---- movement/hint zones ----
  setZones(config, hinted) {
    // config: { left: 'label'|null, ... }
    for (const k of Object.keys(this.el.zones)) {
      const z = this.el.zones[k];
      const label = config[k];
      z.classList.toggle('visible', label !== null && label !== undefined);
      z.classList.toggle('hinted', !!hinted && !!label);
      z.querySelector('.zone-label').textContent = label || '';
    }
  }

  hideZones() {
    for (const k of Object.keys(this.el.zones)) this.el.zones[k].classList.remove('visible');
  }

  // ---- static overlay ----
  drawStatic(dt) {
    const ctx = this.fxCtx;
    const { width: w, height: h } = this.fx;
    if (this.staticLevel <= 0.004) {
      ctx.clearRect(0, 0, w, h);
      return;
    }
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const lvl = this.staticLevel;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = v; d[i + 1] = v; d[i + 2] = v;
      d[i + 3] = Math.random() < lvl ? Math.floor(120 * lvl + Math.random() * 100 * lvl) : 0;
    }
    ctx.putImageData(img, 0, 0);
  }
}

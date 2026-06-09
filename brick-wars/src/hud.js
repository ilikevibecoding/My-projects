// hud.js — DOM-based HUD: counters, toasts, build prompt and the win screen.

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.studCount = document.getElementById('stud-count');
    this.spiritCount = document.getElementById('spirit-count');
    this.spiritTotal = document.getElementById('spirit-total');
    this.toast = document.getElementById('toast');
    this.hint = document.getElementById('hint');
    this.buildPrompt = document.getElementById('build-prompt');
    this.buildBarFill = document.getElementById('build-bar-fill');
    this.winScreen = document.getElementById('win-screen');
    this.winStuds = document.getElementById('win-studs');
    this.winSmashed = document.getElementById('win-smashed');
    this.winTime = document.getElementById('win-time');
    this._toastTimer = null;
    this._hintTimer = null;
  }

  show() {
    this.root.hidden = false;
  }

  setStuds(n) {
    this.studCount.textContent = String(n);
    this.studCount.parentElement.style.transform = 'scale(1.12)';
    clearTimeout(this._studPop);
    this._studPop = setTimeout(() => {
      this.studCount.parentElement.style.transform = '';
    }, 90);
  }

  setSpirits(n, total) {
    this.spiritCount.textContent = String(n);
    this.spiritTotal.textContent = String(total);
  }

  showToast(text, ms = 2600) {
    this.toast.textContent = text;
    this.toast.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.toast.hidden = true;
    }, ms);
  }

  setHint(text, fadeAfterMs = 0) {
    this.hint.textContent = text;
    this.hint.style.opacity = '1';
    clearTimeout(this._hintTimer);
    if (fadeAfterMs > 0) {
      this._hintTimer = setTimeout(() => {
        this.hint.style.opacity = '0';
      }, fadeAfterMs);
    }
  }

  setBuildPrompt(visible, progress01 = 0) {
    this.buildPrompt.hidden = !visible;
    if (visible) {
      this.buildBarFill.style.width = `${Math.round(progress01 * 100)}%`;
    }
  }

  showWin({ studs, smashed, seconds }) {
    this.winStuds.textContent = String(studs);
    this.winSmashed.textContent = String(smashed);
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    this.winTime.textContent = `${m}:${String(s).padStart(2, '0')}`;
    this.winScreen.hidden = false;
  }
}

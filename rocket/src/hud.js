// hud.js — flight readouts, banners, revert button. DOM is in index.html;
// this module just drives it.

const DEFAULT_FLIGHT_HINT = 'space — ignite / stage&nbsp;&nbsp;·&nbsp;&nbsp;arrows — tilt';

export function createHUD() {
  const el = {
    hud: document.getElementById('hud'),
    builderUI: document.getElementById('builder-ui'),
    alt: document.getElementById('ro-alt'),
    speed: document.getElementById('ro-speed'),
    fuelBar: document.getElementById('fuel-bar'),
    banner: document.getElementById('banner'),
    bannerHead: document.querySelector('#banner .headline'),
    bannerSub: document.querySelector('#banner .subline'),
    revertWrap: document.getElementById('revert-wrap'),
    revertBtn: document.getElementById('revert-btn'),
    stageFlash: document.getElementById('stage-flash'),
    keyHints: document.getElementById('key-hints'),
  };

  let flashTimer = null;
  let suppressFlash = false;

  return {
    onRevert(fn) { el.revertBtn.addEventListener('click', fn); },

    // used by debug warm-up so stray flash text never pollutes screenshots
    setSuppressFlash(v) {
      suppressFlash = v;
      if (v) el.stageFlash.classList.remove('visible');
    },

    showBuilder() {
      el.builderUI.classList.add('visible');
      el.hud.classList.remove('visible');
      this.hideBanner();
    },

    showFlight() {
      el.builderUI.classList.remove('visible');
      el.hud.classList.add('visible');
      this.hideBanner();
      el.revertWrap.classList.remove('visible');
      // reset hint so state never leaks between flights/debug views
      // (e.g. "space reached" lingering into a fresh staging warm-up)
      this.setHint(DEFAULT_FLIGHT_HINT);
    },

    setReadouts(alt, speed, fuelFrac) {
      el.alt.textContent = alt >= 1000
        ? (alt / 1000).toFixed(2) + ' k'
        : Math.max(0, Math.round(alt)).toString();
      el.speed.textContent = Math.round(speed).toString();
      const pct = Math.max(0, Math.min(1, fuelFrac)) * 100;
      el.fuelBar.style.width = pct.toFixed(1) + '%';
      el.fuelBar.classList.toggle('low', pct < 22);
    },

    setHint(text) { el.keyHints.innerHTML = text; },

    banner(kind) {
      el.banner.classList.remove('crash');
      if (kind === 'space') {
        el.bannerHead.textContent = 'SPACE REACHED';
        el.bannerSub.textContent = 'the kármán line salutes you';
      } else if (kind === 'crash') {
        el.bannerHead.textContent = 'RAPID UNSCHEDULED LANDING';
        el.bannerSub.textContent = 'the rocket is now modern art';
        el.banner.classList.add('crash');
      }
      el.banner.classList.add('visible');
      // force opacity inline: CSS transitions stall under heavy frame load
      // (SwiftShader screenshots) and can freeze mid-fade
      el.banner.style.opacity = '1';
      el.revertWrap.classList.add('visible');
    },

    hideBanner() {
      el.banner.classList.remove('visible');
      el.banner.style.opacity = '0';
      el.revertWrap.classList.remove('visible');
    },

    flash(text, ms = 2200) {
      if (suppressFlash) return;
      el.stageFlash.textContent = text;
      el.stageFlash.classList.add('visible');
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(() => el.stageFlash.classList.remove('visible'), ms);
    },
  };
}

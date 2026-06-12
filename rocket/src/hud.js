// hud.js — flight readouts, banners, revert button. DOM is in index.html;
// this module just drives it.

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

  return {
    onRevert(fn) { el.revertBtn.addEventListener('click', fn); },

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
      el.revertWrap.classList.add('visible');
    },

    hideBanner() {
      el.banner.classList.remove('visible');
      el.revertWrap.classList.remove('visible');
    },

    flash(text, ms = 2200) {
      el.stageFlash.textContent = text;
      el.stageFlash.classList.add('visible');
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(() => el.stageFlash.classList.remove('visible'), ms);
    },
  };
}

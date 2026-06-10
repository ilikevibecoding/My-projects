// HUD: loading screen, FPS meter, backend badge, quality switcher, hints.

export function createHud() {
  const loadingEl = document.querySelector('[data-loading]');
  const loadingBar = document.querySelector('[data-loading-bar]');
  const loadingStep = document.querySelector('[data-loading-step]');
  const fatalEl = document.querySelector('[data-fatal]');
  const fatalMessage = document.querySelector('[data-fatal-message]');
  const backendBadge = document.querySelector('[data-backend-badge]');
  const fpsValue = document.querySelector('[data-fps]');
  const qualityBar = document.querySelector('[data-quality-bar]');
  const muteButton = document.querySelector('[data-mute]');
  const hintEl = document.querySelector('[data-hint]');
  const crosshair = document.querySelector('[data-crosshair]');

  let qualityCallback = null;
  let muteCallback = null;
  let hintTimer = 0;

  qualityBar.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-quality]');
    if (!button) {
      return;
    }
    setActiveQuality(button.dataset.quality);
    qualityCallback?.(button.dataset.quality);
  });

  muteButton.addEventListener('click', () => {
    muteCallback?.();
  });

  function setActiveQuality(name) {
    qualityBar.querySelectorAll('button').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.quality === name);
    });
  }

  function setLoading(fraction, step) {
    loadingBar.style.width = `${Math.round(fraction * 100)}%`;
    if (step) {
      loadingStep.textContent = step;
    }
  }

  function finishLoading() {
    setLoading(1, 'ready');
    loadingEl.classList.add('is-done');
  }

  function fatal(message) {
    fatalEl.hidden = false;
    fatalMessage.textContent = message;
    loadingEl.classList.add('is-done');
  }

  function setBackend(isWebGPU) {
    backendBadge.textContent = isWebGPU ? 'WebGPU' : 'WebGL2 fallback';
    backendBadge.classList.toggle('is-webgpu', isWebGPU);
    backendBadge.classList.toggle('is-webgl', !isWebGPU);
  }

  function setFps(fps) {
    fpsValue.textContent = `${Math.round(fps)}`;
  }

  function showHint(text, duration = 6000) {
    hintEl.textContent = text;
    hintEl.classList.add('is-visible');
    window.clearTimeout(hintTimer);
    if (duration > 0) {
      hintTimer = window.setTimeout(() => hintEl.classList.remove('is-visible'), duration);
    }
  }

  function hideHint() {
    window.clearTimeout(hintTimer);
    hintEl.classList.remove('is-visible');
  }

  function setPointerLocked(locked) {
    crosshair.classList.toggle('is-visible', locked);
    if (locked) {
      hideHint();
    }
  }

  function setMuted(muted) {
    muteButton.textContent = muted ? 'sound off' : 'sound on';
    muteButton.classList.toggle('is-on', !muted);
  }

  return {
    setLoading,
    finishLoading,
    fatal,
    setBackend,
    setFps,
    showHint,
    hideHint,
    setPointerLocked,
    setActiveQuality,
    setMuted,
    onQualityChange(callback) {
      qualityCallback = callback;
    },
    onMuteToggle(callback) {
      muteCallback = callback;
    },
  };
}

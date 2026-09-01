// Procedural WebAudio ambience: waterfall rumble, wind bed, bird chirps.
// Everything is synthesized — no audio files.

import { WORLD } from './config.js';

export function createAudio(ctx) {
  let context = null;
  let master = null;
  let underwaterFilter = null;
  let waterfallGain = null;
  let waterfallPan = null;
  let windGain = null;
  let started = false;
  let muted = true;
  let birdTimer = 2.5;

  function makeNoiseBuffer(audioContext, seconds = 2) {
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * seconds, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function start() {
    if (started) {
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }
    started = true;
    context = new AudioContextClass();

    master = context.createGain();
    master.gain.value = 0; // unmuted via toggle
    underwaterFilter = context.createBiquadFilter();
    underwaterFilter.type = 'lowpass';
    underwaterFilter.frequency.value = 20000;
    underwaterFilter.connect(master);
    master.connect(context.destination);

    const noise = makeNoiseBuffer(context);

    // ---- waterfall: brown-ish noise, distance-attenuated, stereo-panned ----
    const fallSource = context.createBufferSource();
    fallSource.buffer = noise;
    fallSource.loop = true;
    const fallLow = context.createBiquadFilter();
    fallLow.type = 'lowpass';
    fallLow.frequency.value = 620;
    const fallPeak = context.createBiquadFilter();
    fallPeak.type = 'peaking';
    fallPeak.frequency.value = 180;
    fallPeak.gain.value = 7;
    waterfallGain = context.createGain();
    waterfallGain.gain.value = 0;
    waterfallPan = context.createStereoPanner();
    fallSource.connect(fallLow);
    fallLow.connect(fallPeak);
    fallPeak.connect(waterfallGain);
    waterfallGain.connect(waterfallPan);
    waterfallPan.connect(underwaterFilter);
    fallSource.start();

    // ---- wind bed: slowly-breathing filtered noise through the canopy ----
    const windSource = context.createBufferSource();
    windSource.buffer = noise;
    windSource.loop = true;
    windSource.playbackRate.value = 0.55;
    const windBand = context.createBiquadFilter();
    windBand.type = 'bandpass';
    windBand.frequency.value = 480;
    windBand.Q.value = 0.6;
    windGain = context.createGain();
    windGain.gain.value = 0.035;
    const windLfo = context.createOscillator();
    windLfo.frequency.value = 0.09;
    const windLfoGain = context.createGain();
    windLfoGain.gain.value = 0.02;
    windLfo.connect(windLfoGain);
    windLfoGain.connect(windGain.gain);
    windSource.connect(windBand);
    windBand.connect(windGain);
    windGain.connect(underwaterFilter);
    windSource.start();
    windLfo.start();
  }

  function chirp() {
    if (!context || muted) {
      return;
    }
    const now = context.currentTime;
    const voice = context.createGain();
    voice.gain.value = 0;
    const pan = context.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    voice.connect(pan);
    pan.connect(underwaterFilter);

    const base = 1800 + Math.random() * 1800;
    const notes = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < notes; i += 1) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const t0 = now + i * (0.09 + Math.random() * 0.07);
      const dur = 0.06 + Math.random() * 0.09;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * (1 + Math.random() * 0.25), t0);
      osc.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.6), t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.05, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(voice);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }
    voice.gain.value = 1;
  }

  function toggle() {
    start();
    muted = !muted;
    if (context) {
      context.resume();
      master.gain.linearRampToValueAtTime(muted ? 0 : 1, context.currentTime + 0.25);
    }
    return muted;
  }

  function update(dt) {
    if (!context || muted) {
      return;
    }

    const player = ctx.player;
    // waterfall loudness by distance, panned by relative direction
    const dx = WORLD.waterfallX - player.position.x;
    const dz = -82 - player.position.z;
    const dist = Math.hypot(dx, dz);
    const loudness = 0.34 / (1 + Math.pow(dist / 26, 1.7));
    waterfallGain.gain.setTargetAtTime(loudness, context.currentTime, 0.2);

    const angleToFalls = Math.atan2(dx, dz);
    const relative = angleToFalls - ctx.player.yawObject.yaw;
    waterfallPan.pan.setTargetAtTime(
      Math.max(-0.9, Math.min(0.9, -Math.sin(relative) * 0.9)),
      context.currentTime,
      0.25
    );

    // muffle underwater
    underwaterFilter.frequency.setTargetAtTime(
      player.headUnderwater ? 340 : 20000,
      context.currentTime,
      0.08
    );

    // random bird chirps
    birdTimer -= dt;
    if (birdTimer <= 0) {
      birdTimer = 2.4 + Math.random() * 6;
      chirp();
    }
  }

  return { start, toggle, update, get muted() { return muted; } };
}

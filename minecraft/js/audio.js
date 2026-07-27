// Tiny procedural sound effects via WebAudio; no audio assets needed.

let ctx = null;

function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(ac, seconds) {
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function playBreak() {
  const ac = audioCtx();
  if (!ac) return;
  const t = ac.currentTime;

  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.14);

  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(900, t);
  filter.frequency.exponentialRampToValueAtTime(220, t + 0.13);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.28, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t);
}

export function playPlace() {
  const ac = audioCtx();
  if (!ac) return;
  const t = ac.currentTime;

  const osc = ac.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(210, t);
  osc.frequency.exponentialRampToValueAtTime(150, t + 0.07);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.09, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.09);
}

export function playSplash() {
  const ac = audioCtx();
  if (!ac) return;
  const t = ac.currentTime;

  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.25);

  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(700, t);
  filter.Q.value = 0.8;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.12, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t);
}

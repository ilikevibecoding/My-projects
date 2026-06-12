// tools/tune.mjs — fast physics tuning in node (no browser).
// Runs the same pure sim the game uses. Usage: node tools/tune.mjs

import { PARTS, stackFromIds, DEFAULT_STACK } from '../src/rocket.js';
import { createSimState, step, ignite, CONST, telemetrySample } from '../src/physics.js';

function fly(stackIds, { fuelFraction = 1, maxT = 300, label = '' } = {}) {
  const st = createSimState(stackFromIds(stackIds), { fuelFraction });
  ignite(st);
  let apogee = 0, spaceT = null, burnoutT = null, crashT = null, liftoffT = null;
  while (st.t < maxT) {
    step(st, { throttle: 1 }, CONST.DT);
    const s = telemetrySample(st);
    apogee = Math.max(apogee, s.alt);
    if (spaceT === null && st.spaceReached) spaceT = st.t;
    if (burnoutT === null && s.fuel <= 0) burnoutT = st.t;
    if (liftoffT === null && s.alt > 1) liftoffT = st.t;
    if (st.phase === 'crashed') { crashT = st.t; break; }
    if (st.spaceReached && st.t > (spaceT ?? 0) + 2) break;
  }
  console.log(
    `${label.padEnd(28)} liftoff=${liftoffT?.toFixed(1) ?? '—'}s ` +
    `burnout=${burnoutT?.toFixed(1) ?? '—'}s space=${spaceT?.toFixed(1) ?? 'NEVER'}s ` +
    `apogee=${apogee.toFixed(0)}m crash=${crashT?.toFixed(1) ?? '—'}s`);
  return { spaceT, apogee, burnoutT, crashT };
}

console.log('--- default rocket (engineLarge thrust sweep) ---');
const baseThrust = PARTS.engineLarge.thrust, baseBurn = PARTS.engineLarge.burn;
for (const [thrust, burn] of [[76000, 24], [72000, 23], [70000, 22], [68000, 21], [66000, 21]]) {
  PARTS.engineLarge.thrust = thrust; PARTS.engineLarge.burn = burn;
  fly(DEFAULT_STACK, { label: `thrust=${thrust / 1000}kN burn=${burn}` });
}
PARTS.engineLarge.thrust = baseThrust; PARTS.engineLarge.burn = baseBurn;

console.log('--- coast scenario (fuelFraction sweep) ---');
for (const ff of [0.30, 0.15, 0.10, 0.08]) {
  fly(['engineSmall', 'fins', 'tankSmall', 'pod'], { fuelFraction: ff, label: `coast ff=${ff}` });
}

console.log('--- lowtwr ---');
fly(['engineSmall', 'tankLarge', 'pod'], { maxT: 45, label: 'lowtwr' });

console.log('--- two-stage ---');
fly(['engineLarge', 'fins', 'tankSmall', 'decoupler', 'engineSmall', 'tankSmall', 'pod'], { label: 'two-stage (no staging)' });

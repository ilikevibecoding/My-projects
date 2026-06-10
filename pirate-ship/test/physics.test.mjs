// Node test for the pure-math core: wave model + ship physics.
// Run: node pirate-ship/test/physics.test.mjs
import {
  GEO_WAVES,
  totalSteepness,
  evaluateAt,
  sampleAt,
  heightAt,
} from '../src/waves.js';
import { ShipPhysics } from '../src/physics.js';
import { terrainHeightAt } from '../src/islandField.js';
import { SPAWN } from '../src/islandField.js';

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name} ${detail}`);
  }
}

console.log('\n[1] Wave model sanity');
const steep = totalSteepness(GEO_WAVES);
check(`total steepness ${steep.toFixed(3)} < 0.9`, steep < 0.9);

console.log('\n[2] Gerstner horizontal-displacement inversion accuracy');
{
  let maxErr = 0;
  let maxHeightDiff = 0;
  const out = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, nx: 0, ny: 1, nz: 0 };
  const s = { height: 0, nx: 0, ny: 1, nz: 0, vx: 0, vy: 0, vz: 0 };
  for (let i = 0; i < 500; i++) {
    const x = (Math.random() - 0.5) * 1600;
    const z = (Math.random() - 0.5) * 1600;
    const t = Math.random() * 120;
    // ground truth: invert with 12 iterations
    let px = x;
    let pz = z;
    for (let k = 0; k < 12; k++) {
      evaluateAt(px, pz, t, out);
      px += x - out.x;
      pz += z - out.z;
    }
    evaluateAt(px, pz, t, out);
    const truth = out.y;
    sampleAt(x, z, t, s);
    maxHeightDiff = Math.max(maxHeightDiff, Math.abs(s.height - truth));
    // also confirm the 12-iter inversion itself converged
    maxErr = Math.max(maxErr, Math.hypot(out.x - x, out.z - z));
  }
  check(`12-iter inversion converges (residual ${maxErr.toExponential(2)} m < 1e-4)`, maxErr < 1e-4);
  check(
    `3-iter sampler matches truth (max diff ${(maxHeightDiff * 100).toFixed(3)} cm < 1 cm)`,
    maxHeightDiff < 0.01
  );
}

console.log('\n[3] Flotation: anchored ship settles into bounded wave-riding');
{
  const ship = new ShipPhysics();
  ship.pos.y = 2.0; // drop from above
  const dt = 1 / 60;
  let t = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  let maxTrackErr = 0;
  for (let i = 0; i < 60 * 60; i++) {
    ship.step(dt, t);
    t += dt;
    if (i > 60 * 20) {
      // after settling, track ship vs local water height
      minY = Math.min(minY, ship.pos.y);
      maxY = Math.max(maxY, ship.pos.y);
      const w = heightAt(ship.pos.x, ship.pos.z, t);
      maxTrackErr = Math.max(maxTrackErr, Math.abs(ship.pos.y - w));
    }
  }
  const ok = Number.isFinite(ship.pos.y);
  check('no NaN/Infinity after 60 s', ok);
  check(`bounded heave (y in [${minY.toFixed(2)}, ${maxY.toFixed(2)}], span < 4 m)`, maxY - minY < 4);
  check(
    `rides the waves (max |shipY - waterY| = ${maxTrackErr.toFixed(2)} m < 2.5 m)`,
    maxTrackErr < 2.5
  );
  check(`stays upright (up.y = ${ship._up.y.toFixed(3)} > 0.95)`, ship._up.y > 0.95);
}

console.log('\n[4] Drive: full sail accelerates to cruise');
{
  const ship = new ShipPhysics();
  ship.setSail(3);
  const dt = 1 / 60;
  let t = 0;
  const x0 = ship.pos.x;
  const z0 = ship.pos.z;
  let speedAt10 = 0;
  for (let i = 0; i < 60 * 20; i++) {
    ship.step(dt, t);
    t += dt;
    if (i === 60 * 10) speedAt10 = ship.speed;
  }
  const dist = Math.hypot(ship.pos.x - x0, ship.pos.z - z0);
  check(`moved ${dist.toFixed(0)} m in 20 s (> 100 m)`, dist > 100);
  check(`speed after 10 s = ${speedAt10.toFixed(1)} m/s (in 5..16)`, speedAt10 > 5 && speedAt10 < 16);
  check(`did not capsize at speed (up.y = ${ship._up.y.toFixed(3)})`, ship._up.y > 0.9);
}

console.log('\n[5] Steering: rudder turns the ship the right way');
{
  const mk = (input) => {
    const ship = new ShipPhysics();
    ship.setSail(3);
    const dt = 1 / 60;
    let t = 0;
    for (let i = 0; i < 60 * 8; i++) {
      ship.step(dt, t); // get up to speed
      t += dt;
    }
    const h0 = ship.heading;
    ship.rudderInput = input;
    for (let i = 0; i < 60 * 8; i++) {
      ship.step(dt, t);
      t += dt;
    }
    // unwrap heading delta to [-pi, pi]
    let dh = ship.heading - h0;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    return (dh * 180) / Math.PI;
  };
  const dRight = mk(+1);
  const dLeft = mk(-1);
  check(`D (input +1) turns starboard: ${dRight.toFixed(0)} deg > +25`, dRight > 25);
  check(`A (input -1) turns port: ${dLeft.toFixed(0)} deg < -25`, dLeft < -25);
}

console.log('\n[6] Grounding: sailing into an island stops the ship (no tunnel)');
{
  const ship = new ShipPhysics();
  // aim straight at the islet at (470, -290) from open water
  ship.pos.x = 470;
  ship.pos.z = -80;
  const heading = Math.PI; // -z direction... heading = atan2(fwd.x, fwd.z); pi -> fwd=(0,0,-1)
  ship.quat.x = 0;
  ship.quat.y = Math.sin(heading / 2);
  ship.quat.z = 0;
  ship.quat.w = Math.cos(heading / 2);
  ship.setSail(3);
  const dt = 1 / 60;
  let t = 0;
  let grounded = false;
  for (let i = 0; i < 60 * 60; i++) {
    ship.step(dt, t);
    t += dt;
    if (ship.aground) grounded = true;
  }
  const terrain = terrainHeightAt(ship.pos.x, ship.pos.z);
  check('ship ran aground at some point', grounded);
  check(
    `ship did not tunnel inland (terrain under ship = ${terrain.toFixed(1)} m < 3 m)`,
    terrain < 3
  );
  check(`no NaN after grounding (${ship.pos.x.toFixed(0)}, ${ship.pos.z.toFixed(0)})`, Number.isFinite(ship.pos.x));
  // reset works
  ship.reset();
  check('reset returns to spawn', Math.abs(ship.pos.x - SPAWN.x) < 1e-6 && ship.speed === 0);
}

console.log('');
if (failures > 0) {
  console.error(`${failures} test(s) FAILED`);
  process.exit(1);
}
console.log('All physics tests passed.');

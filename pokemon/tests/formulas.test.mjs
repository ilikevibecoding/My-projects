import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const F = require("../js/formulas.js");

test("type chart spot checks", () => {
  assert.equal(F.typeEffectiveness("water", ["fire"]), 2);
  assert.equal(F.typeEffectiveness("water", ["fire", "rock"]), 4);
  assert.equal(F.typeEffectiveness("electric", ["ground"]), 0);
  assert.equal(F.typeEffectiveness("normal", ["ghost"]), 0);
  assert.equal(F.typeEffectiveness("fire", ["water"]), 0.5);
  assert.equal(F.typeEffectiveness("grass", ["fire", "flying"]), 0.25);
  assert.equal(F.typeEffectiveness("fighting", ["normal"]), 2);
  assert.equal(F.typeEffectiveness("dragon", ["fairy"]), 0);
});

test("stat stage multipliers", () => {
  assert.equal(F.stageMultiplier(0), 1);
  assert.equal(F.stageMultiplier(2), 2);
  assert.equal(F.stageMultiplier(6), 4);
  assert.equal(F.stageMultiplier(-2), 0.5);
  assert.equal(F.stageMultiplier(-6), 0.25);
  assert.equal(F.accStageMultiplier(-1), 0.75);
});

test("stat calculation at level 50 / 100", () => {
  // Bulbasaur HP base 45, IV 8, level 50 -> floor((45+8)*2*50/100)+50+10 = 113
  assert.equal(F.calcHP(45, 8, 50), 113);
  // Attack base 49, IV 8, level 50 -> floor((49+8)*2*50/100)+5 = 62
  assert.equal(F.calcStat(49, 8, 50), 62);
  assert.ok(F.calcHP(255, 15, 100) > 500); // Chansey is chunky
});

test("damage formula sanity", () => {
  // L50 attacker, 90 power, 100 atk vs 80 def, STAB, neutral, no crit, max roll
  const dmg = F.damage({ level: 50, power: 90, attack: 100, defense: 80, stab: true, typeMult: 1, isCrit: false, random: 1 });
  // base = floor(floor(floor(102/5+2)*90*100/80)/50)+2 = floor(floor(22*90*100/80)/50)+2 = floor(2475 /50)... compute: 22*9000/80=24750/... ok just bounds
  assert.ok(dmg > 50 && dmg < 130, `dmg=${dmg}`);
  // Immunity does zero
  assert.equal(F.damage({ level: 50, power: 90, attack: 100, defense: 80, stab: false, typeMult: 0, random: 1 }), 0);
  // Min damage is 1 when not immune
  assert.equal(F.damage({ level: 2, power: 10, attack: 5, defense: 200, stab: false, typeMult: 0.25, random: 0.85 }), 1);
  // Crit doubles the level term -> strictly more damage
  const noCrit = F.damage({ level: 50, power: 90, attack: 100, defense: 80, stab: false, typeMult: 1, isCrit: false, random: 1 });
  const crit = F.damage({ level: 50, power: 90, attack: 100, defense: 80, stab: false, typeMult: 1, isCrit: true, random: 1 });
  assert.ok(crit > noCrit * 1.5, `crit=${crit} noCrit=${noCrit}`);
  // Burn halves physical damage (roughly)
  const burned = F.damage({ level: 50, power: 90, attack: 100, defense: 80, stab: false, typeMult: 1, random: 1, burned: true });
  assert.ok(burned < noCrit, `burned=${burned}`);
});

test("capture formula", () => {
  // Full-HP Mewtwo-ish (rate 3) with a poke ball: essentially never insta-catches
  const hard = F.captureCheck({ maxHp: 200, hp: 200, catchRate: 3, ballMod: 1, statusMod: 1, rand: () => 0.9999 });
  assert.equal(hard.caught, false);
  // 1 HP sleeping Caterpie (rate 255) with ultra ball: a >= 255 -> guaranteed
  const easy = F.captureCheck({ maxHp: 50, hp: 1, catchRate: 255, ballMod: 2, statusMod: 2 });
  assert.equal(easy.caught, true);
  assert.equal(easy.shakes, 4);
  // Deterministic rand below threshold -> caught
  const det = F.captureCheck({ maxHp: 100, hp: 10, catchRate: 190, ballMod: 1.5, statusMod: 1, rand: () => 0 });
  assert.equal(det.caught, true);
});

test("exp curves", () => {
  assert.equal(F.expForLevel("medium", 10), 1000);
  assert.equal(F.expForLevel("fast", 10), 800);
  assert.equal(F.expForLevel("slow", 10), 1250);
  assert.equal(F.expForLevel("medium-slow", 10), 560); // 1.2*1000-1500+1000-140
  assert.equal(F.levelForExp("medium", 1000), 10);
  assert.equal(F.levelForExp("medium", 999), 9);
  assert.equal(F.levelForExp("medium", 0), 1);
  // round trip for all growths
  for (const g of ["fast", "medium", "medium-slow", "slow"]) {
    for (const lvl of [1, 5, 36, 99, 100]) {
      assert.equal(F.levelForExp(g, F.expForLevel(g, lvl)), lvl, `${g} L${lvl}`);
    }
  }
});

test("exp gain", () => {
  // Pidgey baseExp 50 at L5, wild, solo: floor(50*5/7)=35
  assert.equal(F.expGain(50, 5, false, 1), 35);
  assert.equal(F.expGain(50, 5, true, 1), Math.floor(35 * 1.5));
  assert.equal(F.expGain(50, 5, false, 2), Math.floor(Math.floor(50 * 5 / 7 / 2)));
});

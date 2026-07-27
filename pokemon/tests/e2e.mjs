#!/usr/bin/env node
/**
 * Playwright smoke test for the whole game loop.
 *
 * Usage:
 *   cd pokemon && python3 -m http.server 8400 &          # serve the game
 *   npm i playwright                                      # anywhere node can resolve it
 *   GAME_URL=http://localhost:8400/index.html node tests/e2e.mjs
 *   GAME_URL=file:///abs/path/to/pokemon/index.html node tests/e2e.mjs   # offline mode
 */
import { chromium } from "playwright";

const URL = process.env.GAME_URL || "http://localhost:8400/index.html";
const CHROME = process.env.CHROME_PATH || "/usr/local/bin/google-chrome";

const browser = await chromium.launch({ executablePath: CHROME }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text()); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tap = async (key, n = 1, gap = 160) => {
  for (let i = 0; i < n; i++) { await page.keyboard.press(key); await sleep(gap); }
};
const info = () => page.evaluate(() => {
  const g = window.Game, top = g.topScene();
  return {
    scene: top ? top.constructor.name : null,
    dialog: window.Dialog.active,
    menu: top && top.menu ? top.menu.kind : null,
    map: g.state ? g.state.map : null,
    party: g.state ? g.state.party.map((m) => `${m.name} L${m.level}`) : [],
    balls: g.state ? g.state.bag.pokeball || 0 : 0,
    caught: g.state ? Object.keys(g.state.pokedex.caught).length : 0,
  };
});
const pressUntil = async (pred, max = 50, key = "z", gap = 220) => {
  for (let i = 0; i < max; i++) {
    const s = await info();
    if (pred(s)) return s;
    await tap(key, 1, gap);
  }
  throw new Error("pressUntil timed out");
};

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

await page.goto(URL);
await sleep(1300);

// --- 1. title -> new game -> intro -> name entry ---
await tap("z", 2, 400);
await tap("z", 12, 220);          // professor speech
await page.keyboard.press("Enter"); // accept default player name
await sleep(300);
await tap("z", 6, 220);
await page.keyboard.press("Enter"); // accept default rival name
await sleep(300);
await tap("z", 8, 250);
let s = await pressUntil((st) => st.scene === "OverworldScene", 10);
check("intro completes into overworld", s.map === "player_home");

// --- 2. starter + rival battle (programmatic shortcut to the lab) ---
await page.evaluate(() => window.Game.overworld.loadMap("lab", 5, 5, "up", true));
await sleep(400);
await tap("z", 6, 280);                       // professor speech
await pressUntil((st) => !!st.dialog === true, 5, "z", 250);
// starter menu: pick first option (Bulbasaur), confirm "Take it!"
s = await pressUntil((st) => st.scene === "BattleScene", 40, "z", 300);
check("rival battle starts after starter", s.scene === "BattleScene");
s = await pressUntil((st) => st.scene === "OverworldScene" && !st.dialog, 200, "z", 240);
check("rival battle resolves", s.party.length === 1);

// --- 3. wild catch with a guaranteed ball ---
await page.evaluate(() => {
  const g = window.Game;
  window.Bag.add(g.state, "pokeball", 5);
  window.__origCapture = window.Formulas.captureCheck;
  window.Formulas.captureCheck = () => ({ caught: true, shakes: 4 });
  g.state.party.forEach((m) => window.Mon.fullHeal(m));
  g.startBattle({ kind: "wild", enemyMon: window.Mon.create(16, 3) }, () => {});
});
await sleep(2200);
const before = await info();
await pressUntil((st) => st.menu === "action", 15);
await tap("ArrowRight", 1, 200);
await tap("z", 1, 500);   // open bag
await tap("ArrowDown", 1, 250); // potion -> pokeball? (bag order: potion first if present)
// select ball robustly: find its index
const ballIndex = await page.evaluate(() => window.Bag.list(window.Game.state).findIndex((i) => i.id === "pokeball"));
await page.evaluate(() => {}); // noop
// reset selection to top, then move down to the ball
await tap("ArrowUp", 8, 100);
await tap("ArrowDown", ballIndex, 200);
await tap("z", 1, 400);
s = await pressUntil((st) => st.scene === "OverworldScene" && !st.dialog, 60, "z", 300);
await page.evaluate(() => { window.Formulas.captureCheck = window.__origCapture; });
check("wild Pokémon caught and joined party", s.party.length === 2 && s.balls === before.balls - 1);
check("pokédex registered the catch", s.caught >= 2);

// --- 4. save -> reload -> continue ---
await page.keyboard.press("Enter");
await sleep(400);
await tap("ArrowDown", 4, 180);
await tap("z", 1, 500);
await pressUntil((st) => !st.dialog, 10, "z", 300);
const saved = await page.evaluate(() => {
  try { return !!localStorage.getItem("pokeclone_save_v1"); } catch (e) { return false; }
});
check("game saved", saved);
await page.reload();
await sleep(1500);
await tap("z", 2, 500); // title menu -> CONTINUE
await sleep(900);
s = await info();
check("continue restores party", s.party.length === 2);

console.log(errors.length ? `JS errors: ${JSON.stringify(errors)}` : "no JS errors");
await browser.close();
process.exit(failures || errors.length ? 1 : 0);

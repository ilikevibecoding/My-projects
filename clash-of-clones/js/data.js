/* ============ Clash of Clones — game data ============ */
/* All numbers are parody-tuned: fast timers, generous loot. */

const ASSETS = [
  'town_hall', 'cannon', 'archer_tower', 'mortar', 'wizard_tower',
  'gold_mine', 'elixir_collector', 'gold_storage', 'elixir_storage',
  'barracks', 'army_camp', 'builder_hut', 'laboratory', 'clan_castle', 'wall',
  'troop_barbarian', 'troop_archer', 'troop_giant', 'troop_goblin', 'troop_wizard',
  'troop_balloon', 'troop_dragon', 'troop_hog_rider', 'troop_pekka',
  'icon_barbarian', 'icon_archer', 'icon_giant', 'icon_goblin', 'icon_wizard',
  'icon_balloon', 'icon_dragon', 'icon_hog_rider', 'icon_pekka',
  'res_gold', 'res_elixir', 'res_gem', 'trophy', 'builder',
  'tree_small', 'tree_medium', 'stone_1', 'stone_rare',
];

/*
 Building definition fields:
  name, img, size (grid cells), desc (parody flavor),
  cost {gold|elixir}, upgraded via costMul per level, maxLevel,
  hp (battle), category: 'defense'|'resource'|'army'|'other'|'wall',
  defense: {dps, range, splash, targets: 'ground'|'air'|'both', cooldown}
  production: {res: 'gold'|'elixir', perHour, cap}
  storage: {gold, elixir}
  housing: troop housing space added
  buildTime: seconds at level 1 (scales per level)
  thRequired[level] = min town hall level to build/upgrade
  maxCount(thLevel) -> allowed count
*/
const BUILDINGS = {
  town_hall: {
    name: 'Town Hall', img: 'town_hall', size: 4,
    desc: 'The beating heart of your village. Rumor says the chief hides snacks in the basement.',
    category: 'other', maxLevel: 5, cost: { gold: 0 }, costMul: 5,
    upgradeCostBase: { gold: 1200 }, buildTime: 12, hp: 1500, hpMul: 1.35,
    storage: { gold: 1000, elixir: 1000 },
    maxCount: () => 1,
  },
  gold_mine: {
    name: 'Gold Mine', img: 'gold_mine', size: 3,
    desc: 'Digs shiny rocks out of the ground. The goblins take it very personally.',
    category: 'resource', maxLevel: 8, cost: { elixir: 150 }, costMul: 1.9,
    buildTime: 6, hp: 380, hpMul: 1.22,
    production: { res: 'gold', perHour: 900, perHourMul: 1.45, cap: 500, capMul: 1.5 },
    maxCount: (th) => [0, 2, 3, 4, 5, 6][th] || 6,
  },
  elixir_collector: {
    name: 'Elixir Collector', img: 'elixir_collector', size: 3,
    desc: 'Harvests mysterious pink goo. Do not drink. Seriously. We had an intern try.',
    category: 'resource', maxLevel: 8, cost: { gold: 150 }, costMul: 1.9,
    buildTime: 6, hp: 380, hpMul: 1.22,
    production: { res: 'elixir', perHour: 900, perHourMul: 1.45, cap: 500, capMul: 1.5 },
    maxCount: (th) => [0, 2, 3, 4, 5, 6][th] || 6,
  },
  gold_storage: {
    name: 'Gold Storage', img: 'gold_storage', size: 3,
    desc: 'A big pot of gold with a lid that never quite closes.',
    category: 'resource', maxLevel: 8, cost: { elixir: 300 }, costMul: 2.1,
    buildTime: 10, hp: 900, hpMul: 1.25,
    storage: { gold: 2500, mul: 1.8 },
    maxCount: (th) => [0, 1, 1, 2, 2, 3][th] || 3,
  },
  elixir_storage: {
    name: 'Elixir Storage', img: 'elixir_storage', size: 3,
    desc: 'Industrial-grade goo tank. Slightly sticky to the touch.',
    category: 'resource', maxLevel: 8, cost: { gold: 300 }, costMul: 2.1,
    buildTime: 10, hp: 900, hpMul: 1.25,
    storage: { elixir: 2500, mul: 1.8 },
    maxCount: (th) => [0, 1, 1, 2, 2, 3][th] || 3,
  },
  cannon: {
    name: 'Cannon', img: 'cannon', size: 3,
    desc: 'Point at bad guys. Goes boom. The manual is one page long.',
    category: 'defense', maxLevel: 8, cost: { gold: 250 }, costMul: 1.9,
    buildTime: 8, hp: 620, hpMul: 1.22,
    defense: { dps: 22, dpsMul: 1.28, range: 4.5, targets: 'ground', cooldown: 0.8 },
    maxCount: (th) => [0, 2, 2, 3, 4, 5][th] || 5,
  },
  archer_tower: {
    name: 'Archer Tower', img: 'archer_tower', size: 3,
    desc: 'Archers with unlimited arrows and zero fear of heights.',
    category: 'defense', maxLevel: 8, cost: { gold: 700 }, costMul: 1.9,
    buildTime: 12, hp: 560, hpMul: 1.22,
    defense: { dps: 18, dpsMul: 1.28, range: 6, targets: 'both', cooldown: 0.6 },
    maxCount: (th) => [0, 1, 2, 3, 4, 5][th] || 5,
  },
  mortar: {
    name: 'Mortar', img: 'mortar', size: 3,
    desc: 'Lobs explosive pumpkins at anything that walks funny. Slow but rude.',
    category: 'defense', maxLevel: 6, cost: { gold: 2000 }, costMul: 2.0,
    buildTime: 20, hp: 500, hpMul: 1.22,
    defense: { dps: 30, dpsMul: 1.3, range: 9, minRange: 3, splash: 1.5, targets: 'ground', cooldown: 3.5 },
    maxCount: (th) => [0, 0, 1, 1, 2, 2][th] || 2,
  },
  wizard_tower: {
    name: 'Wizard Tower', img: 'wizard_tower', size: 3,
    desc: 'A wizard sits up there all day zapping things and judging your base layout.',
    category: 'defense', maxLevel: 6, cost: { gold: 4500 }, costMul: 2.0,
    buildTime: 26, hp: 620, hpMul: 1.22,
    defense: { dps: 26, dpsMul: 1.3, range: 5.5, splash: 1.2, targets: 'both', cooldown: 1.4 },
    maxCount: (th) => [0, 0, 0, 1, 2, 3][th] || 3,
  },
  wall: {
    name: 'Wall', img: 'wall', size: 1,
    desc: 'A very confident pile of rocks. Giants disagree with it on principle.',
    category: 'wall', maxLevel: 5, cost: { gold: 40 }, costMul: 2.4,
    buildTime: 0, hp: 280, hpMul: 1.3,
    maxCount: (th) => [0, 40, 60, 85, 110, 140][th] || 140,
  },
  barracks: {
    name: 'Barracks', img: 'barracks', size: 3,
    desc: 'Where villagers walk in and angry mustachioed men walk out.',
    category: 'army', maxLevel: 6, cost: { elixir: 250 }, costMul: 2.2,
    buildTime: 10, hp: 520, hpMul: 1.2,
    maxCount: (th) => [0, 1, 1, 2, 2, 2][th] || 2,
  },
  army_camp: {
    name: 'Army Camp', img: 'army_camp', size: 4,
    desc: 'Troops hang out here rent-free until you fling them at someone\'s cannons.',
    category: 'army', maxLevel: 6, cost: { elixir: 300 }, costMul: 2.2,
    buildTime: 10, hp: 420, hpMul: 1.2,
    housing: 25, housingMul: 1.35,
    maxCount: (th) => [0, 1, 2, 2, 3, 4][th] || 4,
  },
  laboratory: {
    name: 'Laboratory', img: 'laboratory', size: 3,
    desc: 'Purely decorative science. The bubbling is for ambience.',
    category: 'other', maxLevel: 4, cost: { elixir: 1500 }, costMul: 2.2,
    buildTime: 18, hp: 450, hpMul: 1.2,
    maxCount: (th) => (th >= 3 ? 1 : 0),
  },
  clan_castle: {
    name: 'Clone Castle', img: 'clan_castle', size: 3,
    desc: 'Home of the Clan of Clones. Currently clone-free. Very echoey inside.',
    category: 'other', maxLevel: 4, cost: { gold: 3000 }, costMul: 2.4,
    buildTime: 22, hp: 900, hpMul: 1.25,
    maxCount: (th) => (th >= 2 ? 1 : 0),
  },
  builder_hut: {
    name: 'Builder\'s Hut', img: 'builder_hut', size: 2,
    desc: 'Adds one more builder who charges in gems but never takes coffee breaks.',
    category: 'other', maxLevel: 1, cost: { gems: 250 }, costMul: 2,
    buildTime: 2, hp: 260, hpMul: 1.2,
    maxCount: () => 3,
  },
  tree_small: {
    name: 'Pine Friend', img: 'tree_small', size: 1, deco: true,
    desc: 'A tree. It does nothing. It is perfect.',
    category: 'other', maxLevel: 1, cost: { gold: 60 }, costMul: 1,
    buildTime: 0, hp: 1, maxCount: () => 30,
  },
  stone_rare: {
    name: 'Suspicious Rock', img: 'stone_rare', size: 1, deco: true,
    desc: 'Probably just a rock. Probably.',
    category: 'other', maxLevel: 1, cost: { gold: 60 }, costMul: 1,
    buildTime: 0, hp: 1, maxCount: () => 30,
  },
};

/* Troop definitions. housing = camp space, speed in tiles/sec */
const TROOPS = {
  barbarian: {
    name: 'Barbthearian', img: 'troop_barbarian', icon: 'icon_barbarian',
    desc: 'Yells first, thinks never.',
    cost: { elixir: 30 }, housing: 1, trainTime: 3,
    hp: 90, dps: 14, speed: 1.6, range: 0.6, targets: 'any', attacks: 'ground',
    thRequired: 1, scale: 0.62,
  },
  archer: {
    name: 'Arrow McSharp', img: 'troop_archer', icon: 'icon_archer',
    desc: 'Never misses. Except emotionally.',
    cost: { elixir: 50 }, housing: 1, trainTime: 4,
    hp: 55, dps: 11, speed: 1.7, range: 3.5, targets: 'any', attacks: 'both',
    thRequired: 1, scale: 0.58,
  },
  goblin: {
    name: 'Loot Gremlin', img: 'troop_goblin', icon: 'icon_goblin',
    desc: 'Smells gold from three villages away. Terrible at sharing.',
    cost: { elixir: 40 }, housing: 1, trainTime: 4,
    hp: 65, dps: 20, speed: 2.4, range: 0.6, targets: 'resource', attacks: 'ground',
    thRequired: 1, scale: 0.55,
  },
  giant: {
    name: 'Chonk', img: 'troop_giant', icon: 'icon_giant',
    desc: 'Big lad. Punches towers. Cries at weddings.',
    cost: { elixir: 250 }, housing: 5, trainTime: 8,
    hp: 520, dps: 16, speed: 0.9, range: 0.7, targets: 'defense', attacks: 'ground',
    thRequired: 2, scale: 0.85,
  },
  wizard: {
    name: 'Blastlord Kevin', img: 'troop_wizard', icon: 'icon_wizard',
    desc: 'Twelve years of magic school for this. Worth it.',
    cost: { elixir: 350 }, housing: 4, trainTime: 10,
    hp: 130, dps: 42, speed: 1.4, range: 3, splash: 0.8, targets: 'any', attacks: 'both',
    thRequired: 3, scale: 0.68,
  },
  balloon: {
    name: 'Doom Balloon', img: 'troop_balloon', icon: 'icon_balloon',
    desc: 'A skeleton with a balloon and a grudge against architecture.',
    cost: { elixir: 400 }, housing: 5, trainTime: 12,
    hp: 300, dps: 55, speed: 0.85, range: 0.6, targets: 'defense', attacks: 'ground', flying: true,
    thRequired: 3, scale: 0.8,
  },
  hog_rider: {
    name: 'HOG RIDERRR', img: 'troop_hog_rider', icon: 'icon_hog_rider',
    desc: 'You already heard him coming.',
    cost: { elixir: 500 }, housing: 5, trainTime: 12,
    hp: 420, dps: 40, speed: 2.2, range: 0.6, targets: 'defense', attacks: 'ground', jumpsWalls: true,
    thRequired: 4, scale: 0.78,
  },
  dragon: {
    name: 'Expensive Lizard', img: 'troop_dragon', icon: 'icon_dragon',
    desc: 'Breathes fire, hoards elixir, files no taxes.',
    cost: { elixir: 1200 }, housing: 20, trainTime: 20,
    hp: 1300, dps: 70, speed: 1.1, range: 1.2, splash: 0.6, targets: 'any', attacks: 'both', flying: true,
    thRequired: 4, scale: 1.0,
  },
  pekka: {
    name: 'P.A.R.O.D.Y', img: 'troop_pekka', icon: 'icon_pekka',
    desc: 'Nobody knows what it stands for. It doesn\'t either.',
    cost: { elixir: 2000 }, housing: 25, trainTime: 25,
    hp: 2600, dps: 130, speed: 1.0, range: 0.7, targets: 'any', attacks: 'ground',
    thRequired: 5, scale: 0.95,
  },
};

/* Shop order */
const SHOP_ORDER = [
  'gold_mine', 'elixir_collector', 'gold_storage', 'elixir_storage',
  'cannon', 'archer_tower', 'mortar', 'wizard_tower', 'wall',
  'barracks', 'army_camp', 'laboratory', 'clan_castle', 'builder_hut',
  'tree_small', 'stone_rare',
];

const TROOP_ORDER = ['barbarian', 'archer', 'goblin', 'giant', 'wizard', 'balloon', 'hog_rider', 'dragon', 'pekka'];

const LOADER_HINTS = [
  'Loading catapult ammunition…',
  'Bribing goblins with shiny pebbles…',
  'Teaching barbarians to share (failed)…',
  'Inflating doom balloons…',
  'Asking the wizard to please stop…',
  'Polishing 100% authentic parody gems…',
  'Convincing walls to stand still…',
];

const WIN_QUIPS = [
  'The goblins have filed a formal complaint.',
  'Their town hall had one weird trick. You destroyed it.',
  'Somewhere, a goblin accountant is crying.',
  'That base was made of paper and optimism.',
  'You looted responsibly. Ish.',
];

const LOSE_QUIPS = [
  'The enemy village sends a thank-you card.',
  'Your army fought bravely, briefly.',
  'Maybe try attacking with the pointy end?',
  'The mortar would like to apologize. It will not.',
];

const ENEMY_VILLAGE_NAMES = [
  'Gobbo Hollow', 'Snoreville', 'Fort Overconfident', 'Bad Layoutburg',
  'Trophy Farm', 'Rushed TH Ravine', 'Dead Base Depot', 'Loot Lagoon',
];

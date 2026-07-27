/* ============ Clash of Clones — game data ============ */
/* All numbers are parody-tuned: fast timers, generous loot. */

const ASSETS = [
  // buildings
  'town_hall', 'town_hall_1', 'town_hall_2', 'town_hall_3', 'town_hall_4', 'town_hall_5',
  'cannon', 'archer_tower', 'mortar', 'wizard_tower',
  'air_defense', 'hidden_tesla', 'bomb_tower', 'xbow', 'inferno_tower',
  'gold_mine', 'elixir_collector', 'gold_storage', 'elixir_storage',
  'barracks', 'army_camp', 'builder_hut', 'laboratory', 'clan_castle',
  'spell_factory', 'wall',
  // troops
  'troop_barbarian', 'troop_archer', 'troop_giant', 'troop_goblin', 'troop_wizard',
  'troop_balloon', 'troop_dragon', 'troop_hog_rider', 'troop_pekka',
  'troop_wall_breaker', 'troop_healer', 'troop_minion', 'troop_valkyrie',
  'troop_witch', 'troop_golem', 'troop_miner', 'troop_electro_dragon',
  'troop_barbarian_king', 'troop_archer_queen',
  // icons
  'icon_barbarian', 'icon_archer', 'icon_giant', 'icon_goblin', 'icon_wizard',
  'icon_balloon', 'icon_dragon', 'icon_hog_rider', 'icon_pekka',
  'icon_wall_breaker', 'icon_healer', 'icon_minion', 'icon_valkyrie',
  'icon_witch', 'icon_golem', 'icon_miner', 'icon_electro_dragon',
  'icon_barbarian_king', 'icon_archer_queen',
  // ui / resources
  'res_gold', 'res_elixir', 'res_gem', 'trophy', 'builder',
  // obstacles & decor
  'tree_small', 'tree_medium', 'stone_1', 'stone_rare', 'stone_pillar',
  'gem_box', 'trunk_1', 'trunk_2', 'mushroom', 'bush',
  'deco_torch', 'deco_flag',
];

/*
 Building definition fields:
  name, img, size (grid cells), desc (parody flavor), shopTab,
  cost {gold|elixir|gems}, costMul per level, maxLevel,
  hp (battle), category: 'defense'|'resource'|'army'|'other'|'wall',
  defense: {dps, range, splash, targets, cooldown, minRange, zap|beam|missile|bolt}
  production: {res, perHour, cap}
  storage: {gold, elixir}
  housing: troop housing space
  buildTime: seconds at level 1 (scales per level)
  maxCount(thLevel), cheatMax: cap when cheat mode is on
*/
const BUILDINGS = {
  town_hall: {
    name: 'Town Hall', img: 'town_hall', size: 4, shopTab: null,
    desc: 'The beating heart of your village. Rumor says the chief hides snacks in the basement.',
    category: 'other', maxLevel: 5, cost: { gold: 0 }, costMul: 5,
    upgradeCostBase: { gold: 1200 }, buildTime: 12, hp: 1500, hpMul: 1.35,
    storage: { gold: 1000, elixir: 1000 },
    maxCount: () => 1, cheatMax: 1,
  },
  /* ---------- resources ---------- */
  gold_mine: {
    name: 'Gold Mine', img: 'gold_mine', size: 3, shopTab: 'resources',
    desc: 'Digs shiny rocks out of the ground. The goblins take it very personally.',
    category: 'resource', maxLevel: 8, cost: { elixir: 150 }, costMul: 1.9,
    buildTime: 6, hp: 380, hpMul: 1.22,
    production: { res: 'gold', perHour: 900, perHourMul: 1.45, cap: 500, capMul: 1.5 },
    maxCount: (th) => [0, 2, 3, 4, 5, 6][th] || 6, cheatMax: 7,
  },
  elixir_collector: {
    name: 'Elixir Collector', img: 'elixir_collector', size: 3, shopTab: 'resources',
    desc: 'Harvests mysterious pink goo. Do not drink. Seriously. We had an intern try.',
    category: 'resource', maxLevel: 8, cost: { gold: 150 }, costMul: 1.9,
    buildTime: 6, hp: 380, hpMul: 1.22,
    production: { res: 'elixir', perHour: 900, perHourMul: 1.45, cap: 500, capMul: 1.5 },
    maxCount: (th) => [0, 2, 3, 4, 5, 6][th] || 6, cheatMax: 7,
  },
  gold_storage: {
    name: 'Gold Storage', img: 'gold_storage', size: 3, shopTab: 'resources',
    desc: 'A big pot of gold with a lid that never quite closes.',
    category: 'resource', maxLevel: 8, cost: { elixir: 300 }, costMul: 2.1,
    buildTime: 10, hp: 900, hpMul: 1.25,
    storage: { gold: 2500, mul: 1.8 },
    maxCount: (th) => [0, 1, 1, 2, 2, 3][th] || 3, cheatMax: 4,
  },
  elixir_storage: {
    name: 'Elixir Storage', img: 'elixir_storage', size: 3, shopTab: 'resources',
    desc: 'Industrial-grade goo tank. Slightly sticky to the touch.',
    category: 'resource', maxLevel: 8, cost: { gold: 300 }, costMul: 2.1,
    buildTime: 10, hp: 900, hpMul: 1.25,
    storage: { elixir: 2500, mul: 1.8 },
    maxCount: (th) => [0, 1, 1, 2, 2, 3][th] || 3, cheatMax: 4,
  },
  /* ---------- defenses ---------- */
  cannon: {
    name: 'Cannon', img: 'cannon', size: 3, shopTab: 'defenses',
    desc: 'Point at bad guys. Goes boom. The manual is one page long.',
    category: 'defense', maxLevel: 8, cost: { gold: 250 }, costMul: 1.9,
    buildTime: 8, hp: 620, hpMul: 1.22,
    defense: { dps: 22, dpsMul: 1.28, range: 4.5, targets: 'ground', cooldown: 0.8 },
    maxCount: (th) => [0, 2, 2, 3, 4, 5][th] || 5, cheatMax: 8,
  },
  archer_tower: {
    name: 'Archer Tower', img: 'archer_tower', size: 3, shopTab: 'defenses',
    desc: 'Archers with unlimited arrows and zero fear of heights.',
    category: 'defense', maxLevel: 8, cost: { gold: 700 }, costMul: 1.9,
    buildTime: 12, hp: 560, hpMul: 1.22,
    defense: { dps: 18, dpsMul: 1.28, range: 6, targets: 'both', cooldown: 0.6 },
    maxCount: (th) => [0, 1, 2, 3, 4, 5][th] || 5, cheatMax: 8,
  },
  mortar: {
    name: 'Mortar', img: 'mortar', size: 3, shopTab: 'defenses',
    desc: 'Lobs explosive pumpkins at anything that walks funny. Slow but rude.',
    category: 'defense', maxLevel: 6, cost: { gold: 2000 }, costMul: 2.0,
    buildTime: 20, hp: 500, hpMul: 1.22,
    defense: { dps: 30, dpsMul: 1.3, range: 9, minRange: 3, splash: 1.5, targets: 'ground', cooldown: 3.5 },
    maxCount: (th) => [0, 0, 1, 1, 2, 2][th] || 2, cheatMax: 4,
  },
  wizard_tower: {
    name: 'Wizard Tower', img: 'wizard_tower', size: 3, shopTab: 'defenses',
    desc: 'A wizard sits up there all day zapping things and judging your base layout.',
    category: 'defense', maxLevel: 6, cost: { gold: 4500 }, costMul: 2.0,
    buildTime: 26, hp: 620, hpMul: 1.22,
    defense: { dps: 26, dpsMul: 1.3, range: 5.5, splash: 1.2, targets: 'both', cooldown: 1.4 },
    maxCount: (th) => [0, 0, 0, 1, 2, 3][th] || 3, cheatMax: 5,
  },
  air_defense: {
    name: 'Air Defense', img: 'air_defense', size: 3, shopTab: 'defenses',
    desc: 'Hates everything with wings. Writes angry letters to birds.',
    category: 'defense', maxLevel: 6, cost: { gold: 6000 }, costMul: 2.0,
    buildTime: 28, hp: 700, hpMul: 1.22,
    defense: { dps: 80, dpsMul: 1.25, range: 8, targets: 'air', cooldown: 1.2, missile: true },
    maxCount: (th) => [0, 0, 0, 1, 2, 3][th] || 3, cheatMax: 4,
  },
  hidden_tesla: {
    name: 'Hidden Tesla', img: 'hidden_tesla', size: 2, shopTab: 'defenses',
    desc: 'A surprise pylon. Extremely rude to people named after Balkan inventors.',
    category: 'defense', maxLevel: 6, cost: { gold: 8000 }, costMul: 2.0,
    buildTime: 30, hp: 480, hpMul: 1.22,
    defense: { dps: 34, dpsMul: 1.3, range: 5, targets: 'both', cooldown: 0.7, zap: true },
    maxCount: (th) => [0, 0, 0, 1, 2, 3][th] || 3, cheatMax: 5,
  },
  bomb_tower: {
    name: 'Bomb Tower', img: 'bomb_tower', size: 3, shopTab: 'defenses',
    desc: 'Throws bombs at close range. HR called it "a workplace hazard". Correct.',
    category: 'defense', maxLevel: 6, cost: { gold: 9000 }, costMul: 2.0,
    buildTime: 32, hp: 650, hpMul: 1.22,
    defense: { dps: 28, dpsMul: 1.3, range: 5, splash: 1.4, targets: 'ground', cooldown: 2.0 },
    maxCount: (th) => [0, 0, 0, 0, 1, 2][th] || 2, cheatMax: 3,
  },
  xbow: {
    name: 'X-Bow', img: 'xbow', size: 3, shopTab: 'defenses',
    desc: 'A crossbow the size of a shed. Fires faster than your excuses.',
    category: 'defense', maxLevel: 5, cost: { gold: 14000 }, costMul: 2.1,
    buildTime: 40, hp: 900, hpMul: 1.22,
    defense: { dps: 40, dpsMul: 1.25, range: 10, targets: 'both', cooldown: 0.3, bolt: true },
    maxCount: (th) => [0, 0, 0, 0, 1, 2][th] || 2, cheatMax: 4,
  },
  inferno_tower: {
    name: 'Inferno Tower', img: 'inferno_tower', size: 3, shopTab: 'defenses',
    desc: 'A tower that answers every question with a laser. Every question.',
    category: 'defense', maxLevel: 5, cost: { gold: 20000 }, costMul: 2.1,
    buildTime: 45, hp: 1000, hpMul: 1.22,
    defense: { dps: 60, dpsMul: 1.3, range: 6.5, targets: 'both', cooldown: 0.35, beam: true },
    maxCount: (th) => [0, 0, 0, 0, 0, 2][th] || 2, cheatMax: 3,
  },
  wall: {
    name: 'Wall', img: 'wall', size: 1, shopTab: 'defenses',
    desc: 'Drag to draw whole wall lines, then confirm to build them all. Very confident rocks.',
    category: 'wall', maxLevel: 5, cost: { gold: 40 }, costMul: 2.4,
    buildTime: 0, hp: 280, hpMul: 1.3,
    maxCount: (th) => [0, 50, 75, 100, 130, 175][th] || 175, cheatMax: 600,
  },
  /* ---------- army ---------- */
  barracks: {
    name: 'Barracks', img: 'barracks', size: 3, shopTab: 'army',
    desc: 'Where villagers walk in and angry mustachioed men walk out.',
    category: 'army', maxLevel: 6, cost: { elixir: 250 }, costMul: 2.2,
    buildTime: 10, hp: 520, hpMul: 1.2,
    maxCount: (th) => [0, 1, 1, 2, 2, 2][th] || 2, cheatMax: 3,
  },
  army_camp: {
    name: 'Army Camp', img: 'army_camp', size: 4, shopTab: 'army',
    desc: 'Troops hang out here rent-free until you fling them at someone\'s cannons.',
    category: 'army', maxLevel: 6, cost: { elixir: 300 }, costMul: 2.2,
    buildTime: 10, hp: 420, hpMul: 1.2,
    housing: 25, housingMul: 1.35,
    maxCount: (th) => [0, 1, 2, 2, 3, 4][th] || 4, cheatMax: 6,
  },
  spell_factory: {
    name: 'Spell Factory', img: 'spell_factory', size: 3, shopTab: 'army',
    desc: 'Brews spells nobody has learned to cast yet. Smells like grape soda.',
    category: 'other', maxLevel: 4, cost: { elixir: 4000 }, costMul: 2.2,
    buildTime: 24, hp: 500, hpMul: 1.2,
    maxCount: (th) => (th >= 3 ? 1 : 0), cheatMax: 1,
  },
  laboratory: {
    name: 'Laboratory', img: 'laboratory', size: 3, shopTab: 'army',
    desc: 'Purely decorative science. The bubbling is for ambience.',
    category: 'other', maxLevel: 4, cost: { elixir: 1500 }, costMul: 2.2,
    buildTime: 18, hp: 450, hpMul: 1.2,
    maxCount: (th) => (th >= 3 ? 1 : 0), cheatMax: 1,
  },
  clan_castle: {
    name: 'Clone Castle', img: 'clan_castle', size: 3, shopTab: 'army',
    desc: 'Home of the Clan of Clones. Currently clone-free. Very echoey inside.',
    category: 'other', maxLevel: 4, cost: { gold: 3000 }, costMul: 2.4,
    buildTime: 22, hp: 900, hpMul: 1.25,
    maxCount: (th) => (th >= 2 ? 1 : 0), cheatMax: 1,
  },
  builder_hut: {
    name: 'Builder\'s Hut', img: 'builder_hut', size: 2, shopTab: 'resources',
    desc: 'Adds one more builder who charges in gems but never takes coffee breaks.',
    category: 'other', maxLevel: 1, cost: { gems: 250 }, costMul: 2,
    buildTime: 2, hp: 260, hpMul: 1.2,
    maxCount: () => 4, cheatMax: 5,
  },
  /* ---------- decorations ---------- */
  deco_torch: {
    name: 'Torch', img: 'deco_torch', size: 1, deco: true, shopTab: 'deco',
    desc: 'Mood lighting for your fortress of doom.',
    category: 'other', maxLevel: 1, cost: { gold: 100 }, costMul: 1,
    buildTime: 0, hp: 1, maxCount: () => 20, cheatMax: 40,
  },
  deco_flag: {
    name: 'Pirate Flag', img: 'deco_flag', size: 1, deco: true, shopTab: 'deco',
    desc: 'Yarr. That is the whole description.',
    category: 'other', maxLevel: 1, cost: { gold: 150 }, costMul: 1,
    buildTime: 0, hp: 1, maxCount: () => 20, cheatMax: 40,
  },
  tree_small: {
    name: 'Pine Friend', img: 'tree_small', size: 1, deco: true, shopTab: 'deco',
    desc: 'A tree. It does nothing. It is perfect.',
    category: 'other', maxLevel: 1, cost: { gold: 60 }, costMul: 1,
    buildTime: 0, hp: 1, maxCount: () => 30, cheatMax: 60,
  },
  stone_rare: {
    name: 'Suspicious Rock', img: 'stone_rare', size: 1, deco: true, shopTab: 'deco',
    desc: 'Probably just a rock. Probably.',
    category: 'other', maxLevel: 1, cost: { gold: 60 }, costMul: 1,
    buildTime: 0, hp: 1, maxCount: () => 30, cheatMax: 60,
  },
};

/* ---------- obstacles (spawn naturally, removable for rewards) ---------- */
const OBSTACLES = {
  ob_tree_big: {
    name: 'Tree', img: 'tree_medium', size: 2,
    desc: 'It grew here while you were off raiding. Nature is relentless.',
    cost: { gold: 150 }, time: 12, reward: { elixir: [40, 90] }, gemChance: 0.22,
  },
  ob_tree: {
    name: 'Small Tree', img: 'tree_small', size: 1,
    desc: 'A modest tree with big dreams.',
    cost: { gold: 80 }, time: 8, reward: { elixir: [25, 60] }, gemChance: 0.18,
  },
  ob_trunk: {
    name: 'Tree Trunk', img: 'trunk_1', size: 1,
    desc: 'Somebody already chopped the fun part.',
    cost: { elixir: 80 }, time: 8, reward: { gold: [25, 60] }, gemChance: 0.18,
  },
  ob_trunk2: {
    name: 'Fallen Log', img: 'trunk_2', size: 1,
    desc: 'It is doing its best.',
    cost: { elixir: 60 }, time: 6, reward: { gold: [20, 45] }, gemChance: 0.15,
  },
  ob_mushroom: {
    name: 'Mushroom', img: 'mushroom', size: 1,
    desc: 'Do not eat. The wizard did. See: wizard.',
    cost: { elixir: 100 }, time: 9, reward: { gold: [30, 70] }, gemChance: 0.2,
  },
  ob_bush: {
    name: 'Bush', img: 'bush', size: 1,
    desc: 'Could be hiding an archer. Could be a bush. 50/50.',
    cost: { gold: 60 }, time: 6, reward: { elixir: [20, 45] }, gemChance: 0.15,
  },
  ob_stone: {
    name: 'Stone', img: 'stone_1', size: 1,
    desc: 'A rock with tenure.',
    cost: { gold: 120 }, time: 10, reward: { elixir: [30, 60] }, gemChance: 0.15,
  },
  ob_stone_big: {
    name: 'Old Stone', img: 'stone_rare', size: 2,
    desc: 'Ancient. Mossy. In the way.',
    cost: { gold: 220 }, time: 15, reward: { elixir: [60, 120] }, gemChance: 0.28,
  },
  ob_pillar: {
    name: 'Stone Pillar', img: 'stone_pillar', size: 1,
    desc: 'The rest of the ruin is on vacation.',
    cost: { gold: 150 }, time: 10, reward: { elixir: [40, 80] }, gemChance: 0.2,
  },
  gem_box: {
    name: 'Gem Box', img: 'gem_box', size: 2,
    desc: 'A box. Full of gems. Sometimes life is simple.',
    cost: { gold: 200 }, time: 10, reward: {}, gems: 25, gemChance: 1,
  },
};
const OBSTACLE_SPAWN_POOL = [
  'ob_tree_big', 'ob_tree', 'ob_tree', 'ob_trunk', 'ob_trunk2',
  'ob_mushroom', 'ob_bush', 'ob_bush', 'ob_stone', 'ob_stone_big', 'ob_pillar',
];

/* ---------- troops ---------- */
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
  wall_breaker: {
    name: 'Boom Skeleton', img: 'troop_wall_breaker', icon: 'icon_wall_breaker',
    desc: 'Lives for walls. Dies for walls. Literally.',
    cost: { elixir: 150 }, housing: 2, trainTime: 6,
    hp: 45, dps: 400, speed: 2.6, range: 0.5, targets: 'wall', attacks: 'ground', suicide: true, splash: 1.2,
    thRequired: 2, scale: 0.55,
  },
  wizard: {
    name: 'Blastlord Kevin', img: 'troop_wizard', icon: 'icon_wizard',
    desc: 'Twelve years of magic school for this. Worth it.',
    cost: { elixir: 350 }, housing: 4, trainTime: 10,
    hp: 130, dps: 42, speed: 1.4, range: 3, splash: 0.8, targets: 'any', attacks: 'both',
    thRequired: 3, scale: 0.68,
  },
  healer: {
    name: 'Auntie Glow', img: 'troop_healer', icon: 'icon_healer',
    desc: 'Kisses your boo-boos from a safe altitude.',
    cost: { elixir: 600 }, housing: 14, trainTime: 15,
    hp: 400, dps: 0, speed: 1.3, range: 2.5, targets: 'heal', attacks: 'none', flying: true, healPerSec: 35,
    thRequired: 3, scale: 0.85,
  },
  balloon: {
    name: 'Doom Balloon', img: 'troop_balloon', icon: 'icon_balloon',
    desc: 'A skeleton with a balloon and a grudge against architecture.',
    cost: { elixir: 400 }, housing: 5, trainTime: 12,
    hp: 300, dps: 55, speed: 0.85, range: 0.6, targets: 'defense', attacks: 'ground', flying: true,
    thRequired: 3, scale: 0.8,
  },
  minion: {
    name: 'Gargoyle Jr.', img: 'troop_minion', icon: 'icon_minion',
    desc: 'Made of dark elixir and bad decisions.',
    cost: { elixir: 90 }, housing: 2, trainTime: 5,
    hp: 70, dps: 16, speed: 2.0, range: 1.2, targets: 'any', attacks: 'both', flying: true,
    thRequired: 3, scale: 0.5,
  },
  hog_rider: {
    name: 'HOG RIDERRR', img: 'troop_hog_rider', icon: 'icon_hog_rider',
    desc: 'You already heard him coming.',
    cost: { elixir: 500 }, housing: 5, trainTime: 12,
    hp: 420, dps: 40, speed: 2.2, range: 0.6, targets: 'defense', attacks: 'ground', jumpsWalls: true,
    thRequired: 4, scale: 0.78,
  },
  valkyrie: {
    name: 'Spin Doctor', img: 'troop_valkyrie', icon: 'icon_valkyrie',
    desc: 'Her axe has never heard of personal space.',
    cost: { elixir: 700 }, housing: 8, trainTime: 14,
    hp: 750, dps: 48, speed: 1.6, range: 0.7, splash: 1.0, targets: 'any', attacks: 'ground',
    thRequired: 4, scale: 0.72,
  },
  miner: {
    name: 'Dirt Snorkeler', img: 'troop_miner', icon: 'icon_miner',
    desc: 'Commutes underground. Walls are a rumor to him.',
    cost: { elixir: 600 }, housing: 6, trainTime: 13,
    hp: 550, dps: 35, speed: 1.8, range: 0.6, targets: 'any', attacks: 'ground', jumpsWalls: true,
    thRequired: 4, scale: 0.66,
  },
  dragon: {
    name: 'Expensive Lizard', img: 'troop_dragon', icon: 'icon_dragon',
    desc: 'Breathes fire, hoards elixir, files no taxes.',
    cost: { elixir: 1200 }, housing: 20, trainTime: 20,
    hp: 1300, dps: 70, speed: 1.1, range: 1.2, splash: 0.6, targets: 'any', attacks: 'both', flying: true,
    thRequired: 4, scale: 1.0,
  },
  witch: {
    name: 'Bone Mommy', img: 'troop_witch', icon: 'icon_witch',
    desc: 'Raises skeletons, standards, and eyebrows.',
    cost: { elixir: 900 }, housing: 12, trainTime: 16,
    hp: 320, dps: 38, speed: 1.2, range: 3.5, splash: 0.5, targets: 'any', attacks: 'both',
    thRequired: 5, scale: 0.7,
  },
  golem: {
    name: 'Gravel Dad', img: 'troop_golem', icon: 'icon_golem',
    desc: 'A landslide with feelings. Mostly patience.',
    cost: { elixir: 1800 }, housing: 30, trainTime: 24,
    hp: 4200, dps: 30, speed: 0.7, range: 0.8, targets: 'defense', attacks: 'ground',
    thRequired: 5, scale: 0.95,
  },
  pekka: {
    name: 'P.A.R.O.D.Y', img: 'troop_pekka', icon: 'icon_pekka',
    desc: 'Nobody knows what it stands for. It doesn\'t either.',
    cost: { elixir: 2000 }, housing: 25, trainTime: 25,
    hp: 2600, dps: 130, speed: 1.0, range: 0.7, targets: 'any', attacks: 'ground',
    thRequired: 5, scale: 0.95,
  },
  electro_dragon: {
    name: 'Static Noodle', img: 'troop_electro_dragon', icon: 'icon_electro_dragon',
    desc: 'Do not pet after shuffling on carpet.',
    cost: { elixir: 2600 }, housing: 30, trainTime: 28,
    hp: 2500, dps: 90, speed: 0.9, range: 2.5, splash: 1.0, targets: 'any', attacks: 'both', flying: true, zap: true,
    thRequired: 5, scale: 1.05,
  },
  barbarian_king: {
    name: 'The Big Guy', img: 'troop_barbarian_king', icon: 'icon_barbarian_king',
    desc: 'A barbarian who found a crown and immediately unionized.',
    cost: { elixir: 3000 }, housing: 25, trainTime: 30,
    hp: 3800, dps: 120, speed: 1.3, range: 0.8, targets: 'any', attacks: 'ground',
    thRequired: 5, scale: 1.0, hero: true,
  },
  archer_queen: {
    name: 'Her Sharpness', img: 'troop_archer_queen', icon: 'icon_archer_queen',
    desc: 'Rules the realm at 4x zoom. Never blinks.',
    cost: { elixir: 3000 }, housing: 25, trainTime: 30,
    hp: 2400, dps: 160, speed: 1.4, range: 3.5, targets: 'any', attacks: 'both',
    thRequired: 5, scale: 0.9, hero: true,
  },
};

/* Shop tabs & order */
const SHOP_TABS = [
  { id: 'defenses', label: 'Defenses' },
  { id: 'resources', label: 'Resources' },
  { id: 'army', label: 'Army' },
  { id: 'deco', label: 'Decorations' },
];
const SHOP_ORDER = [
  'cannon', 'archer_tower', 'mortar', 'wizard_tower', 'air_defense',
  'hidden_tesla', 'bomb_tower', 'xbow', 'inferno_tower', 'wall',
  'gold_mine', 'elixir_collector', 'gold_storage', 'elixir_storage', 'builder_hut',
  'barracks', 'army_camp', 'laboratory', 'spell_factory', 'clan_castle',
  'deco_torch', 'deco_flag', 'tree_small', 'stone_rare',
];

const TROOP_ORDER = [
  'barbarian', 'archer', 'goblin', 'giant', 'wall_breaker', 'wizard',
  'healer', 'balloon', 'minion', 'hog_rider', 'valkyrie', 'miner',
  'dragon', 'witch', 'golem', 'pekka', 'electro_dragon',
  'barbarian_king', 'archer_queen',
];

const CHEAT_RESOURCES = 99999999;

const LOADER_HINTS = [
  'Loading catapult ammunition…',
  'Bribing goblins with shiny pebbles…',
  'Teaching barbarians to share (failed)…',
  'Inflating doom balloons…',
  'Asking the wizard to please stop…',
  'Polishing 100% authentic parody gems…',
  'Convincing walls to stand still…',
  'Watering the gem boxes…',
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

const CHOP_QUIPS = [
  'The tree had it coming.',
  'Nature: 0, Chief: 1.',
  'Lumber acquired responsibly.',
  'That stump talked back.',
];

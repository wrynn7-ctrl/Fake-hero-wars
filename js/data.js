/*
 * data.js — static game data: the hero, his skills, enemy archetypes, the ten
 * campaign stages, gear/loot definitions and promotion ranks. Pure data plus a
 * few tiny formula helpers; no DOM access. All balance knobs live here.
 */
(function (root) {
  'use strict';

  var HERO = {
    name: 'Aldric',
    title: 'Knight of the Dawn',
    base: { hp: 900, atk: 70, armor: 30, mres: 20, aspd: 1.0, crit: 0.10, critMult: 1.5, speed: 140, range: 70 },
    perLevel: { hp: 60, atk: 5, armor: 2, mres: 1.5 },
    levelCap: 30,
    energyMax: 1000
  };

  // Energy gains (Hero Wars style).
  var ENERGY = { perAttack: 100, perHitMax: 60, perHitMin: 20, hitFrac: 0.03, perKill: 200 };

  var SKILLS = [
    { id: 'ult', name: 'Judgement Slam', unlock: 1, kind: 'ultimate',
      desc: function (l) { return 'Leap at the nearest foe and slam: ' + 'AoE 3.0×ATK +' + (40 * l) + ' physical in 180 px, stun 1.5 s.'; } },
    { id: 'bash', name: 'Shield Bash', unlock: 2, kind: 'auto',
      desc: function (l) { return 'Every 7 s: hit the front enemy for 1.4×ATK +' + (20 * l) + ', stun 1 s.'; } },
    { id: 'vigor', name: 'Holy Vigor', unlock: 4, kind: 'auto',
      desc: function (l) { return 'Below 50% HP (12 s cd): heal 12% max HP +' + (25 * l) + ' over 3 s.'; } },
    { id: 'stalwart', name: 'Stalwart', unlock: 6, kind: 'passive',
      desc: function (l) { return '+' + (3 * l) + ' armor & magic resist. −25% damage taken below 30% HP.'; } }
  ];

  var RANKS = [
    { name: 'White', color: '#e8e8e8' },
    { name: 'Green', color: '#4fd16a' },
    { name: 'Blue', color: '#4aa3ff' },
    { name: 'Violet', color: '#b46cff' }
  ];
  var RANK_BONUS = 0.12;

  /*
   * Enemy archetypes, stats at level 1. Scaled by stage level in sim.js via
   * SCALE. ai: melee | ranged | healer. xpw/gw weight the per-kill rewards.
   */
  var ENEMIES = {
    goblin:   { name: 'Goblin', ai: 'melee', hp: 145, atk: 40, armor: 5, mres: 5, speed: 120, range: 58, period: 1.1, xpw: 1.0, gw: 1.0 },
    archer:   { name: 'Goblin Archer', ai: 'ranged', hp: 115, atk: 38, armor: 3, mres: 5, speed: 105, range: 320, period: 1.6, proj: 'arrow', projSpeed: 560, xpw: 1.0, gw: 1.1 },
    wolf:     { name: 'Dire Wolf', ai: 'melee', hp: 160, atk: 33, armor: 6, mres: 4, speed: 175, range: 55, period: 0.9, bleed: 0.5, xpw: 1.0, gw: 0.9 },
    skeleton: { name: 'Skeleton Warrior', ai: 'melee', hp: 210, atk: 42, armor: 28, mres: 8, speed: 90, range: 62, period: 1.3, xpw: 1.2, gw: 1.1 },
    skmage:   { name: 'Skeleton Mage', ai: 'ranged', hp: 140, atk: 50, armor: 6, mres: 22, speed: 90, range: 300, period: 1.9, magic: true, proj: 'bolt', projSpeed: 430, xpw: 1.2, gw: 1.2 },
    brute:    { name: 'Orc Brute', ai: 'melee', hp: 440, atk: 87, armor: 14, mres: 6, speed: 65, range: 72, period: 2.2, knockback: 40, xpw: 1.6, gw: 1.6 },
    cultist:  { name: 'Dark Cultist', ai: 'healer', hp: 180, atk: 27, armor: 6, mres: 18, speed: 85, range: 260, period: 1.8, magic: true, proj: 'curse', projSpeed: 380, heal: 0.14, healCd: 5, xpw: 1.3, gw: 1.3 },
    assassin: { name: 'Bandit Assassin', ai: 'melee', hp: 210, atk: 57, armor: 10, mres: 10, speed: 130, range: 58, period: 1.0, crit: 0.35, critMult: 2.0, dash: 6, xpw: 1.3, gw: 1.5 },
    troll:    { name: 'Cave Troll', ai: 'melee', hp: 680, atk: 69, armor: 18, mres: 10, speed: 60, range: 75, period: 1.8, regen: 0.015, xpw: 2.0, gw: 2.0 },
    harpy:    { name: 'Harpy', ai: 'melee', hp: 185, atk: 44, armor: 6, mres: 12, speed: 150, range: 85, period: 1.2, flying: true, xpw: 1.2, gw: 1.2 },
    gorruk:   { name: 'Gorruk the Warchief', ai: 'melee', hp: 2300, atk: 82, armor: 30, mres: 20, speed: 70, range: 85, period: 1.7, boss: true, knockback: 30, cleave: 6, warcry: 12, xpw: 3, gw: 3 },
    morvane:  { name: 'Lady Morvane, Lich Queen', ai: 'ranged', hp: 3000, atk: 70, armor: 24, mres: 40, speed: 50, range: 360, period: 1.6, boss: true, magic: true, proj: 'lich', projSpeed: 470, summon: 10, barrage: 8, shield: 0.3, enterX: 740, xpw: 4, gw: 4 }
  };

  // Per-level enemy growth (multiplicative on base, linear in level).
  var SCALE = { hp: 0.16, atk: 0.12, armor: 1.6, mres: 1.4 };

  /*
   * Ten stages × three waves. `pow` is a per-stage difficulty multiplier on
   * enemy HP/attack used for tuning. Enemy level = 1 + 2.4 × (stage − 1).
   * `loot` lists the slots a stage drops; the first is its signature slot,
   * always the first item of a first clear.
   */
  var STAGES = [
    { name: 'Goblin Road', theme: 'forest', pow: 0.991,
      waves: [['goblin', 'goblin'], ['goblin', 'goblin', 'goblin'], ['goblin', 'goblin', 'archer']],
      loot: ['helmet', 'weapon', 'chest', 'boots'] },
    { name: 'Wolfwood Crossing', theme: 'forest', pow: 1.144,
      waves: [['goblin', 'goblin', 'goblin'], ['wolf', 'wolf', 'archer'], ['archer', 'archer', 'skeleton']],
      loot: ['boots', 'gloves', 'helmet', 'amulet'] },
    { name: 'Old Watchtower', theme: 'forest', pow: 1.488,
      waves: [['wolf', 'wolf', 'wolf'], ['skeleton', 'skeleton', 'archer'], ['brute', 'goblin', 'goblin']],
      loot: ['gloves', 'weapon', 'chest', 'amulet'] },
    { name: 'Ashen Hamlet', theme: 'village', pow: 1.156,
      waves: [['skeleton', 'skeleton', 'skmage'], ['brute', 'cultist'], ['skeleton', 'skeleton', 'skmage', 'cultist']],
      loot: ['amulet', 'helmet', 'chest', 'boots'] },
    { name: "Warchief's Pyre", theme: 'village', pow: 0.737, boss: 'gorruk',
      waves: [['goblin', 'goblin', 'brute'], ['goblin', 'archer', 'brute', 'cultist'], ['gorruk', 'goblin', 'goblin']],
      loot: ['weapon', 'helmet', 'chest', 'gloves', 'boots', 'amulet'] },
    { name: 'Hollow Crypt', theme: 'crypt', pow: 1.131,
      waves: [['assassin', 'assassin'], ['skeleton', 'skeleton', 'skeleton', 'skmage'], ['troll', 'archer']],
      loot: ['chest', 'weapon', 'gloves', 'boots'] },
    { name: 'Echoing Caverns', theme: 'crypt', pow: 1.093,
      waves: [['harpy', 'harpy', 'archer'], ['skmage', 'skmage', 'cultist'], ['troll', 'brute']],
      loot: ['helmet', 'chest', 'gloves', 'amulet'] },
    { name: 'Frostfang Pass', theme: 'frozen', pow: 0.966,
      waves: [['assassin', 'assassin', 'harpy'], ['skeleton', 'skeleton', 'skeleton', 'skmage', 'skmage'], ['troll', 'troll', 'cultist']],
      loot: ['boots', 'weapon', 'chest', 'amulet'] },
    { name: 'Rimeveil Summit', theme: 'frozen', pow: 0.986,
      waves: [['harpy', 'harpy', 'harpy'], ['brute', 'brute', 'skmage', 'skmage', 'cultist'], ['troll', 'assassin', 'assassin', 'skmage']],
      loot: ['gloves', 'helmet', 'boots', 'weapon'] },
    { name: 'Citadel of Morvane', theme: 'citadel', pow: 0.944, boss: 'morvane',
      waves: [['skeleton', 'skeleton', 'skeleton', 'skeleton'], ['skmage', 'skmage', 'cultist', 'skeleton'], ['morvane', 'skeleton', 'skeleton']],
      loot: ['amulet', 'weapon', 'helmet', 'chest', 'gloves', 'boots'] }
  ];
  STAGES.forEach(function (s, i) {
    s.id = i + 1;
    s.level = 1 + 2.4 * i;
    s.rec = Math.round(s.level);
  });

  var THEMES = {
    forest: { name: 'Forest Road' },
    village: { name: 'Ruined Village' },
    crypt: { name: 'Crypt Caves' },
    frozen: { name: 'Frozen Pass' },
    citadel: { name: 'Lich Citadel' }
  };

  // ---- Gear ----
  var SLOTS = ['weapon', 'helmet', 'chest', 'gloves', 'boots', 'amulet'];
  var SLOT_STATS = {
    weapon: { primary: 'atk', extra: ['crit', 'lifesteal', 'atkspeed'] },
    helmet: { primary: 'hp', extra: ['mres', 'armor', 'crit'] },
    chest:  { primary: 'armor', extra: ['hp', 'mres', 'lifesteal'] },
    gloves: { primary: 'atk', extra: ['crit', 'atkspeed', 'hp'] },
    boots:  { primary: 'hp', extra: ['armor', 'atkspeed', 'mres'] },
    amulet: { primary: 'mres', extra: ['hp', 'crit', 'lifesteal'] }
  };
  // Stat value for an item level: a + b × ilvl, times rarity multiplier.
  var STAT_CURVE = {
    hp: [50, 22], atk: [5, 1.6], armor: [4, 1.1], mres: [4, 1.0],
    crit: [0.02, 0.0015], atkspeed: [0.04, 0.003], lifesteal: [0.02, 0.0015]
  };
  var STAT_NAMES = { hp: 'HP', atk: 'Attack', armor: 'Armor', mres: 'Magic Res', crit: 'Crit', atkspeed: 'Atk Speed', lifesteal: 'Lifesteal' };
  var PCT_STATS = { crit: 1, atkspeed: 1, lifesteal: 1 };
  // Weights used to rank items for "Equip best".
  var STAT_WEIGHT = { hp: 1, atk: 9, armor: 7, mres: 6, crit: 1800, atkspeed: 1500, lifesteal: 1600 };

  var RARITIES = {
    common: { name: 'Common', mult: 1.0, stats: 1, color: '#c9c9c9' },
    rare:   { name: 'Rare', mult: 1.3, stats: 2, color: '#4aa3ff' },
    epic:   { name: 'Epic', mult: 1.7, stats: 3, color: '#c070ff' }
  };
  var ITEM_NOUNS = {
    weapon: ['Longsword', 'Blade', 'Greatsword'], helmet: ['Helm', 'Visor', 'Crest Helm'],
    chest: ['Breastplate', 'Hauberk', 'Cuirass'], gloves: ['Gauntlets', 'Grips', 'Vambraces'],
    boots: ['Greaves', 'Sabatons', 'Treads'], amulet: ['Amulet', 'Talisman', 'Pendant']
  };
  var ITEM_PREFIX = {
    common: ['Iron', "Squire's", 'Sturdy'],
    rare: ['Steel', "Knight's", 'Silvered'],
    epic: ['Dawnforged', 'Sunsteel', 'Oathbound']
  };
  // Rarity weights [common, rare, epic] for a stage's drops.
  function rarityWeights(stage) {
    if (stage <= 3) return [80, 20, 0];
    if (stage <= 5) return [55, 40, 5];
    if (stage <= 7) return [35, 50, 15];
    if (stage <= 9) return [20, 55, 25];
    return [5, 55, 40];
  }
  function itemLevel(stage) { return STAGES[stage - 1].rec + 1; }
  function itemReq(stage) { return Math.max(1, STAGES[stage - 1].rec - 1); }

  // Starter gear given on a new game.
  var STARTER = [
    { slot: 'weapon', rarity: 'common', name: 'Rusty Longsword', ilvl: 1, req: 1, stats: { atk: 6 } },
    { slot: 'chest', rarity: 'common', name: 'Padded Tunic', ilvl: 1, req: 1, stats: { hp: 60 } }
  ];

  // ---- Rewards / progression formulas ----
  var REWARDS = {
    stageGold: function (s) { return 60 + 35 * s; },
    stageXp: function (s) { return 80 + 45 * s; },
    // Kill rewards per unit of enemy weight (xpw / gw) for a stage; see stage setup below.
    enemyXp: function (stage, w) { return Math.round(w * stage.xpPerW); },
    enemyGold: function (stage, w) { return Math.round(w * stage.goldPerW); },
    // A first-clear-only run gains this fraction of the XP needed to follow the
    // recommended-level curve, so losses/replays are what keep the hero on it.
    curveXp: 0.92,
    replayMult: 0.6,
    lossXpMult: 0.4,
    replayDropChance: 0.5
  };
  function xpToNext(l) { return Math.round(100 + 55 * Math.pow(l, 1.6)); }
  // Total XP to reach a (fractional) level.
  function xpAtLevel(level) {
    var t = 0, l = 1;
    for (; l + 1 <= level; l++) t += xpToNext(l);
    return t + (level - l) * xpToNext(l);
  }
  // Per-stage kill-reward rates: XP follows the level curve, gold grows ~level^1.4.
  STAGES.forEach(function (s) {
    var w = 0, gw = 0;
    s.waves.forEach(function (wave) { wave.forEach(function (t) { w += ENEMIES[t].xpw; gw += ENEMIES[t].gw; }); });
    var target = (xpAtLevel(s.level + 2.4) - xpAtLevel(s.level)) * REWARDS.curveXp - REWARDS.stageXp(s.id);
    s.xpPerW = Math.max(10, target / w);
    s.goldPerW = (40 + 22 * Math.pow(s.level, 1.4)) * 10 / gw;
  });
  function skillCost(level) { return Math.round(120 * Math.pow(level, 1.4)); }
  var POTION = { cost: 250, heal: 0.35, max: 3 };

  var BATTLE = {
    dt: 1 / 60,
    stalemate: 20,
    timeLimit: 240,
    waveGap: 800,
    heroStartX: 200,
    arenaW: 1200,
    enemyBound: 890
  };

  root.HWData = {
    HERO: HERO, ENERGY: ENERGY, SKILLS: SKILLS, RANKS: RANKS, RANK_BONUS: RANK_BONUS,
    ENEMIES: ENEMIES, SCALE: SCALE, STAGES: STAGES, THEMES: THEMES,
    SLOTS: SLOTS, SLOT_STATS: SLOT_STATS, STAT_CURVE: STAT_CURVE, STAT_NAMES: STAT_NAMES,
    PCT_STATS: PCT_STATS, STAT_WEIGHT: STAT_WEIGHT, RARITIES: RARITIES,
    ITEM_NOUNS: ITEM_NOUNS, ITEM_PREFIX: ITEM_PREFIX, rarityWeights: rarityWeights,
    itemLevel: itemLevel, itemReq: itemReq, STARTER: STARTER,
    REWARDS: REWARDS, xpToNext: xpToNext, skillCost: skillCost, POTION: POTION, BATTLE: BATTLE
  };
})(typeof window !== 'undefined' ? window : globalThis);

/*
 * meta.js — progression outside of battle: XP and levels, gold, skill
 * upgrades, gear (generation, equip, sell, promote), rewards, the localStorage
 * save, and the headless helpers (simulateBattle / simulateCampaign) used by
 * the balance tests. No DOM except the guarded localStorage access.
 */
(function (root) {
  'use strict';
  var D = root.HWData, RNG = root.HWRng, SIM = root.HWSim;
  var SAVE_KEY = 'hwlc.save', VERSION = 1;

  // ---------------------------------------------------------------- levels
  function levelFor(xp) {
    var l = 1;
    while (l < D.HERO.levelCap && xp >= D.xpToNext(l)) { xp -= D.xpToNext(l); l++; }
    return l;
  }
  function levelInfo(xp) {
    var l = 1;
    while (l < D.HERO.levelCap && xp >= D.xpToNext(l)) { xp -= D.xpToNext(l); l++; }
    return { level: l, into: l >= D.HERO.levelCap ? 0 : xp, need: l >= D.HERO.levelCap ? 0 : D.xpToNext(l) };
  }
  function totalXpFor(level) {
    var t = 0;
    for (var l = 1; l < level; l++) t += D.xpToNext(l);
    return t;
  }

  // ---------------------------------------------------------------- stats
  function gearList(build) {
    return D.SLOTS.map(function (s) { return build.gear[s]; }).filter(Boolean);
  }
  function gearStats(build) {
    var sum = {};
    gearList(build).forEach(function (it) {
      for (var k in it.stats) sum[k] = (sum[k] || 0) + it.stats[k];
    });
    return sum;
  }
  function heroStats(build) {
    var b = D.HERO.base, p = D.HERO.perLevel, L = build.level - 1;
    var rm = 1 + D.RANK_BONUS * (build.rank || 0);
    var g = gearStats(build);
    return {
      maxHp: Math.round((b.hp + p.hp * L) * rm + (g.hp || 0)),
      atk: Math.round((b.atk + p.atk * L) * rm + (g.atk || 0)),
      armor: Math.round((b.armor + p.armor * L) * rm + (g.armor || 0)),
      mres: Math.round((b.mres + p.mres * L) * rm + (g.mres || 0)),
      aspd: b.aspd * (1 + (g.atkspeed || 0)),
      crit: Math.min(0.6, b.crit + (g.crit || 0)),
      critMult: b.critMult,
      lifesteal: Math.min(0.3, g.lifesteal || 0),
      speed: b.speed,
      range: b.range
    };
  }
  function heroSpec(build) {
    return { stats: heroStats(build), skills: skillLevels(build), rank: build.rank || 0, potions: build.potions || 0 };
  }
  // Skill levels as used in battle (0 = locked).
  function skillLevels(build) {
    var out = {};
    D.SKILLS.forEach(function (s) {
      out[s.id] = build.level >= s.unlock ? Math.max(1, build.skills[s.id] || 0) : 0;
    });
    return out;
  }
  // Rough "power" number shown on the hero screen and used by the AI strategy.
  function power(build) {
    var s = heroStats(build), sk = skillLevels(build);
    var ehp = s.maxHp * (1 + (s.armor + 3 * sk.stalwart) / 120);
    var dps = s.atk * s.aspd * (1 + s.crit * (s.critMult - 1)) * (1 + s.lifesteal);
    return Math.round(Math.sqrt(ehp * dps * (1 + 0.04 * (sk.ult + sk.bash + sk.vigor))) );
  }

  // ---------------------------------------------------------------- items
  function statValue(stat, ilvl, mult) {
    var c = D.STAT_CURVE[stat], v = (c[0] + c[1] * ilvl) * mult;
    return D.PCT_STATS[stat] ? Math.round(v * 1000) / 1000 : Math.round(v);
  }
  function makeItem(slot, rarity, ilvl, req, rng, id) {
    var r = D.RARITIES[rarity], ss = D.SLOT_STATS[slot];
    var stats = {};
    stats[ss.primary] = statValue(ss.primary, ilvl, r.mult);
    var extras = ss.extra.slice();
    for (var i = 1; i < r.stats; i++) {
      var k = extras.splice(Math.floor(rng.next() * extras.length), 1)[0];
      stats[k] = statValue(k, ilvl, r.mult * 0.6);
    }
    var name = rng.pick(D.ITEM_PREFIX[rarity]) + ' ' + rng.pick(D.ITEM_NOUNS[slot]);
    return { id: id, slot: slot, rarity: rarity, name: name, ilvl: ilvl, req: req, stats: stats };
  }
  function itemScore(it) {
    if (!it) return 0;
    var s = 0;
    for (var k in it.stats) s += it.stats[k] * D.STAT_WEIGHT[k];
    return s;
  }
  function sellValue(it) {
    return Math.round((20 + it.ilvl * 8) * D.RARITIES[it.rarity].mult);
  }
  function rollRarity(stage, rng) {
    var w = D.rarityWeights(stage), tot = w[0] + w[1] + w[2], r = rng.next() * tot;
    return r < w[0] ? 'common' : r < w[0] + w[1] ? 'rare' : 'epic';
  }
  // Deterministic drops for a battle seed.
  function rollDrops(stageId, seed, firstClear) {
    var rng = RNG.create((seed * 2654435761) ^ 0x5bd1e995);
    var stage = D.STAGES[stageId - 1];
    var n;
    if (firstClear) n = stage.boss ? 2 : (rng.chance(0.5) ? 2 : 1);
    else n = rng.chance(D.REWARDS.replayDropChance) ? 1 : 0;
    var out = [];
    for (var i = 0; i < n; i++) {
      var slot = firstClear && i === 0 ? stage.loot[0] : rng.pick(stage.loot);
      var rar = rollRarity(stageId, rng);
      if (stage.boss && i === 0 && rar === 'common') rar = 'rare';
      out.push(makeItem(slot, rar, D.itemLevel(stageId), D.itemReq(stageId), rng, 'i' + seed + '_' + i));
    }
    return out;
  }

  // ---------------------------------------------------------------- rewards
  function computeRewards(stageId, battle, firstClear, seed) {
    var stage = D.STAGES[stageId - 1];
    var fullKillXp = 0, fullKillGold = 0;
    stage.waves.forEach(function (w) {
      w.forEach(function (t) {
        fullKillXp += D.REWARDS.enemyXp(stage, D.ENEMIES[t].xpw);
        fullKillGold += D.REWARDS.enemyGold(stage, D.ENEMIES[t].gw);
      });
    });
    var mult = firstClear ? 1 : D.REWARDS.replayMult;
    var winXp = Math.round((D.REWARDS.stageXp(stageId) + fullKillXp) * mult);
    var winGold = Math.round((D.REWARDS.stageGold(stageId) + fullKillGold) * mult);
    if (!battle.won) {
      // A loss pays 40 % of the XP actually earned: kills plus cleared waves.
      var earned = (battle.killXp || 0) + D.REWARDS.stageXp(stageId) * (battle.wave || 0) / stage.waves.length;
      return { gold: 0, xp: Math.round(earned * mult * D.REWARDS.lossXpMult), items: [], firstClear: false };
    }
    return { gold: winGold, xp: winXp, items: rollDrops(stageId, seed, firstClear), firstClear: firstClear };
  }

  // ---------------------------------------------------------------- save
  function newSave() {
    var s = {
      version: VERSION, xp: 0, level: 1, gold: 0, rank: 0, potions: 0,
      gear: {}, inventory: [], skills: { ult: 1, bash: 0, vigor: 0, stalwart: 0 },
      stars: {}, attempts: {}, cleared: 0, battles: 0, settings: { speed: 1, auto: false }
    };
    D.SLOTS.forEach(function (sl) { s.gear[sl] = null; });
    D.STARTER.forEach(function (it, i) {
      var c = JSON.parse(JSON.stringify(it));
      c.id = 'start' + i;
      s.gear[c.slot] = c;
    });
    syncSkills(s);
    return s;
  }
  function syncSkills(s) {
    D.SKILLS.forEach(function (sk) {
      if (s.level >= sk.unlock && !(s.skills[sk.id] > 0)) s.skills[sk.id] = 1;
    });
  }
  function validSave(o) {
    return o && o.version === VERSION && typeof o.xp === 'number' && o.gear && o.skills && Array.isArray(o.inventory);
  }
  function storage() {
    try { return root.localStorage || null; } catch (e) { return null; }
  }
  function persist(s) {
    var st = storage();
    if (!st) return;
    try { st.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* storage full or blocked */ }
  }
  function loadStored() {
    var st = storage();
    if (!st) return null;
    try {
      var o = JSON.parse(st.getItem(SAVE_KEY));
      return validSave(o) ? o : null;
    } catch (e) { return null; }
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------------------------------------------------------------- actions
  function stageUnlocked(s, stageId) { return stageId <= s.cleared + 1 && stageId <= D.STAGES.length; }

  function nextSeed(s, stageId) {
    var a = s.attempts[stageId] || 0;
    s.attempts[stageId] = a + 1;
    return stageId * 1000 + a;
  }

  // Apply a battle result to the save. Returns a summary used by the UI.
  function applyRewards(s, stageId, battle, seed) {
    var firstClear = !(s.stars[stageId] > 0);
    var r = computeRewards(stageId, battle, firstClear, seed);
    var before = s.level;
    s.battles++;
    // A potion drunk in battle is gone from the bag.
    if (battle.potionsUsed) s.potions = Math.max(0, (s.potions || 0) - battle.potionsUsed);
    s.gold += r.gold;
    s.xp += r.xp;
    s.level = levelFor(s.xp);
    syncSkills(s);
    var sold = 0, soldIds = [];
    r.items.forEach(function (it) {
      if (s.inventory.length >= 20) { sold += sellValue(it); soldIds.push(it.id); }
      else s.inventory.push(it);
    });
    s.gold += sold;
    if (battle.won) {
      s.stars[stageId] = Math.max(s.stars[stageId] || 0, battle.stars);
      s.cleared = Math.max(s.cleared, stageId);
    }
    return { gold: r.gold + sold, xp: r.xp, items: r.items, autoSold: sold, soldIds: soldIds, levelBefore: before, levelAfter: s.level,
      firstClear: r.firstClear, stars: battle.stars, won: battle.won, potionsUsed: battle.potionsUsed || 0 };
  }

  function findInv(s, id) {
    for (var i = 0; i < s.inventory.length; i++) if (s.inventory[i].id === id) return i;
    return -1;
  }
  function equipItem(s, id) {
    var i = findInv(s, id);
    if (i < 0) return false;
    var it = s.inventory[i];
    if (it.req > s.level) return false;
    s.inventory.splice(i, 1);
    var old = s.gear[it.slot];
    s.gear[it.slot] = it;
    if (old) s.inventory.push(old);
    return true;
  }
  function bestFor(s, slot) {
    var best = s.gear[slot], bs = itemScore(best);
    s.inventory.forEach(function (it) {
      if (it.slot === slot && it.req <= s.level && itemScore(it) > bs) { best = it; bs = itemScore(it); }
    });
    return best;
  }
  function equipBest(s) {
    var changed = 0;
    D.SLOTS.forEach(function (slot) {
      var b = bestFor(s, slot);
      if (b && b !== s.gear[slot]) { equipItem(s, b.id); changed++; }
    });
    return changed;
  }
  function sellItem(s, id) {
    var i = findInv(s, id);
    if (i < 0) return 0;
    var v = sellValue(s.inventory[i]);
    s.inventory.splice(i, 1);
    s.gold += v;
    return v;
  }
  function canPromote(s) {
    return (s.rank || 0) < D.RANKS.length - 1 && D.SLOTS.every(function (sl) { return !!s.gear[sl]; });
  }
  function promote(s) {
    if (!canPromote(s)) return false;
    D.SLOTS.forEach(function (sl) { s.gear[sl] = null; });
    s.rank++;
    return true;
  }
  function upgradeCost(s, id) { return D.skillCost(Math.max(1, s.skills[id] || 1)); }
  function canUpgrade(s, id) {
    var sk = D.SKILLS.filter(function (k) { return k.id === id; })[0];
    return !!sk && s.level >= sk.unlock && s.skills[id] < s.level && s.gold >= upgradeCost(s, id);
  }
  function upgradeSkill(s, id) {
    if (!canUpgrade(s, id)) return false;
    s.gold -= upgradeCost(s, id);
    s.skills[id]++;
    return true;
  }
  function buyPotion(s) {
    if (s.gold < D.POTION.cost || (s.potions || 0) >= D.POTION.max) return false;
    s.gold -= D.POTION.cost;
    s.potions = (s.potions || 0) + 1;
    return true;
  }

  // ---------------------------------------------------------------- headless
  function simulateBattle(stageId, build, opts) {
    opts = opts || {};
    var seed = opts.seed != null ? opts.seed : stageId * 1000;
    var r = SIM.run(stageId, heroSpec(build), {
      seed: seed, autoUlt: opts.autoUlt !== false, neverUlt: opts.autoUlt === false, validate: true
    });
    r.rewards = computeRewards(stageId, r, opts.firstClear !== false, seed);
    return r;
  }

  // The greedy "reasonable player": equip best, promote unless it costs more
  // than 10 % power right now, sell surplus, buy the cheapest skill upgrades.
  function manage(s) {
    equipBest(s);
    if (canPromote(s)) {
      var trial = clone(s);
      promote(trial);
      equipBest(trial);
      if (power(trial) >= 0.9 * power(s)) { promote(s); equipBest(s); }
    }
    // Sell items that are worse than what is worn in the same slot, keep a few spares.
    s.inventory.slice().forEach(function (it) {
      var spares = s.inventory.filter(function (o) { return o.slot === it.slot; }).length;
      if (itemScore(it) <= itemScore(s.gear[it.slot]) && spares > 1) sellItem(s, it.id);
    });
    for (;;) {
      var opts = D.SKILLS.filter(function (k) { return canUpgrade(s, k.id); });
      if (!opts.length) break;
      opts.sort(function (a, b) { return upgradeCost(s, a.id) - upgradeCost(s, b.id); });
      upgradeSkill(s, opts[0].id);
    }
  }

  function simulateCampaign(opts) {
    opts = opts || {};
    var maxRetries = opts.maxRetriesPerStage != null ? opts.maxRetriesPerStage : 3;
    var s = newSave(), log = [], extra = 0, stalemates = 0, timeouts = 0, invalid = 0, firstTryPushback = 0;
    var snapshots = {};
    function fight(stageId) {
      var seed = nextSeed(s, stageId);
      var r = simulateBattle(stageId, s, { seed: seed, firstClear: !(s.stars[stageId] > 0) });
      if (r.stalemate) stalemates++;
      if (r.timeout) timeouts++;
      invalid += r.invalid;
      applyRewards(s, stageId, r, seed);
      manage(s);
      return r;
    }
    for (var st = 1; st <= D.STAGES.length; st++) {
      snapshots[st] = clone(s);
      var entry = { stage: st, rec: D.STAGES[st - 1].rec, levelAtFirstTry: s.level, rankAtFirstTry: s.rank,
        powerAtFirstTry: power(s), attempts: 0, replays: 0, first: null, finalStars: 0 };
      var tries = 0, won = false;
      while (!won && extra <= 40) {
        var r = fight(st);
        entry.attempts++;
        if (!entry.first) entry.first = { won: r.won, stars: r.stars, hp: Math.round(r.heroHpFrac * 100), time: Math.round(r.time) };
        if (r.won) { won = true; entry.finalStars = r.stars; break; }
        extra++;
        tries++;
        if (tries > maxRetries && st > 1) {
          fight(st - 1);
          entry.replays++;
          extra++;
          tries = 0;
        }
      }
      if (entry.first && (!entry.first.won || entry.first.stars <= 2)) firstTryPushback++;
      entry.levelAfter = s.level;
      entry.gold = s.gold;
      entry.skills = clone(s.skills);
      log.push(entry);
      if (!won) break;
    }
    return {
      log: log, extraBattles: extra, wonAll: s.cleared >= D.STAGES.length, stalemates: stalemates,
      timeouts: timeouts, invalid: invalid, pushback: firstTryPushback, finalLevel: s.level, save: s,
      snapshots: snapshots
    };
  }

  // The reasonable player's build at the first attempt of a stage (the
  // "recommended build" used by the balance checks), from a cached campaign run.
  var campaignCache = null;
  function recommendedBuild(stageId) {
    if (!campaignCache) campaignCache = simulateCampaign({ maxRetriesPerStage: 3 });
    var snap = campaignCache.snapshots[stageId];
    return snap ? clone(snap) : null;
  }

  // Level 30, Violet, maxed skills, best possible epic gear.
  function maxBuild() {
    var s = newSave();
    s.level = D.HERO.levelCap;
    s.xp = totalXpFor(s.level);
    s.rank = D.RANKS.length - 1;
    D.SKILLS.forEach(function (k) { s.skills[k.id] = s.level; });
    var top = D.STAGES.length;
    D.SLOTS.forEach(function (slot) {
      var ss = D.SLOT_STATS[slot], st = {};
      st[ss.primary] = statValue(ss.primary, D.itemLevel(top), D.RARITIES.epic.mult);
      ss.extra.slice(0, 2).forEach(function (k) { st[k] = statValue(k, D.itemLevel(top), D.RARITIES.epic.mult * 0.6); });
      s.gear[slot] = { id: 'max_' + slot, slot: slot, rarity: 'epic', name: 'Sunsteel ' + D.ITEM_NOUNS[slot][0],
        ilvl: D.itemLevel(top), req: D.itemReq(top), stats: st };
    });
    return s;
  }
  function starterBuild() { return newSave(); }

  root.HWMeta = {
    levelFor: levelFor, levelInfo: levelInfo,
    heroStats: heroStats, heroSpec: heroSpec, skillLevels: skillLevels, power: power,
    sellValue: sellValue, computeRewards: computeRewards,
    newSave: newSave, validSave: validSave, persist: persist, loadStored: loadStored, clone: clone,
    stageUnlocked: stageUnlocked, nextSeed: nextSeed, applyRewards: applyRewards,
    equipItem: equipItem, equipBest: equipBest, sellItem: sellItem, canPromote: canPromote, promote: promote,
    upgradeCost: upgradeCost, upgradeSkill: upgradeSkill, buyPotion: buyPotion,
    simulateBattle: simulateBattle, simulateCampaign: simulateCampaign,
    recommendedBuild: recommendedBuild, maxBuild: maxBuild, starterBuild: starterBuild
  };
})(typeof window !== 'undefined' ? window : globalThis);

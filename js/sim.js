/*
 * sim.js — pure, deterministic battle simulation. No DOM, no canvas, no
 * Math.random: every roll comes from the battle's seeded HWRng stream and the
 * world advances in fixed 1/60 s steps, so a (stage, hero, seed, inputs) tuple
 * always produces the same battle. The renderer only reads this state and the
 * `events` queue it fills.
 */
(function (root) {
  'use strict';
  var D = root.HWData, RNG = root.HWRng, B = D.BATTLE, DT = B.dt;
  var EMAX = D.HERO.energyMax, EN = D.ENERGY;
  var LEAP_TIME = 0.45, SLAM_RADIUS = 180, RUN_SPEED = 380, ULT_REACH = 320, ADVANCE_X = 380;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function emit(b, ev) { if (b.collect) b.events.push(ev); }

  // ---------------------------------------------------------------- setup
  function makeHero(spec) {
    var s = spec.stats, sk = spec.skills, bonus = sk.stalwart ? 3 * sk.stalwart : 0;
    return {
      kind: 'hero', x: B.heroStartX, depth: 0.5, hp: s.maxHp, maxHp: s.maxHp,
      atk: s.atk, armor: s.armor + bonus, mres: s.mres + bonus, aspd: s.aspd,
      crit: s.crit, critMult: s.critMult, lifesteal: s.lifesteal, speed: s.speed, range: s.range,
      skills: sk, rank: spec.rank || 0, potions: spec.potions || 0, potionUsed: false,
      energy: 0, atkCd: 0, wind: 0, target: null, bashCd: 2.5, vigorCd: 0,
      hot: 0, hotRate: 0, hotShown: 0, bleeds: [], kbT: 0, kbV: 0,
      leapT: -1, leapFrom: 0, leapTo: 0, state: 'walk', anim: 0, swingT: 0, swingKind: '',
      hurtT: 0, dead: false, deathT: 0
    };
  }

  function makeEnemy(b, type, x, depth, summoned) {
    var d = D.ENEMIES[type], m = b.stage.level - 1, pow = b.stage.pow;
    var hp = Math.round(d.hp * (1 + D.SCALE.hp * m) * pow);
    var e = {
      kind: 'enemy', id: b.nextId++, type: type, def: d, x: x, depth: depth,
      hp: hp, maxHp: hp, atk: d.atk * (1 + D.SCALE.atk * m) * pow,
      armor: d.armor + D.SCALE.armor * m, mres: d.mres + D.SCALE.mres * m,
      speed: d.speed, period: d.period,
      range: d.ai === 'melee' && !d.boss ? d.range + b.rng.range(-4, 10) : d.range,
      atkCd: b.rng.range(0.2, 0.9), wind: 0, strike: 'basic', stun: 0, entered: false,
      backCd: 0, backT: 0, dashCd: 1.5, dashT: 0, nextCrit: false,
      cleaveCd: 4, warcryCd: 2.5, buffT: 0, healCd: 3, summonCd: 6, barrageCd: 4,
      barrageLeft: 0, barrageT: 0, shield: 0, shieldMax: 0, phase: 1,
      summoned: !!summoned, xp: summoned ? 0 : D.REWARDS.enemyXp(b.stage, d.xpw),
      gold: summoned ? 0 : D.REWARDS.enemyGold(b.stage, d.gw),
      state: 'walk', anim: b.rng.range(0, 3), swingT: 0, hurtT: 0, dead: false, deathT: 0
    };
    return e;
  }

  function spawnWave(b, w) {
    b.wave = w;
    b.waveBase = w * B.waveGap;
    b.camX = b.waveBase;
    b.phase = 'fight';
    b.phaseT = 0;
    b.lastDamageT = b.t;
    var list = b.stage.waves[w], melee = 0, ranged = 0;
    for (var i = 0; i < list.length; i++) {
      var d = D.ENEMIES[list[i]], x;
      if (d.ai === 'melee') x = b.waveBase + 990 + (melee++) * 30;
      else x = b.waveBase + 1050 + (ranged++) * 30;
      b.enemies.push(makeEnemy(b, list[i], x, [0.5, 0.1, 0.9, 0.3, 0.7][i % 5], false));
    }
    emit(b, { t: 'wave', wave: w });
  }

  function create(stageId, heroSpec, opts) {
    opts = opts || {};
    var stage = D.STAGES[stageId - 1];
    var seed = opts.seed != null ? opts.seed : stageId * 1000;
    var b = {
      stageId: stageId, stage: stage, seed: seed, rng: RNG.create(seed), t: 0, steps: 0,
      wave: 0, waves: stage.waves.length, phase: 'fight', phaseT: 0,
      over: false, won: false, stalemate: false, timeout: false, postT: 0,
      auto: !!(opts.auto || opts.autoUlt), neverUlt: !!opts.neverUlt, ultRequest: false,
      hero: makeHero(heroSpec), enemies: [], projectiles: [], events: [],
      collect: !!opts.collectEvents, validate: !!opts.validate, invalid: 0,
      camX: 0, waveBase: 0, lastDamageT: 0, nextId: 1, acc: 0,
      stats: { dealt: 0, taken: 0, healed: 0, ults: 0, ultDamage: 0, kills: 0, xp: 0, gold: 0, bossKilled: false }
    };
    spawnWave(b, 0);
    return b;
  }

  // ---------------------------------------------------------------- helpers
  function alive(b) {
    var out = [];
    for (var i = 0; i < b.enemies.length; i++) if (!b.enemies[i].dead) out.push(b.enemies[i]);
    return out;
  }
  // Nearest living enemy that has walked onto the screen.
  function nearest(b) {
    var h = b.hero, best = null, bd = 1e9;
    for (var i = 0; i < b.enemies.length; i++) {
      var e = b.enemies[i];
      if (e.dead || !e.entered) continue;
      var d = Math.abs(e.x - h.x);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  function heroBounds(b) { return [b.waveBase + 20, b.waveBase + 900]; }

  function healUnit(b, u, amount, show) {
    var real = Math.min(amount, u.maxHp - u.hp);
    if (real <= 0) return 0;
    u.hp += real;
    if (u.kind === 'hero') b.stats.healed += real;
    if (show) emit(b, { t: 'num', who: u.kind, id: u.id, x: u.x, depth: u.depth, v: Math.round(real), k: 'heal' });
    return real;
  }

  // Core damage: raw × A/(A+def) (= atk²/(atk+def) for a basic attack), ±8 % roll, crit.
  function damage(b, src, tgt, raw, magic, critChance, critMult, kindOverride) {
    if (tgt.dead) return 0;
    var def = magic ? tgt.mres : tgt.armor;
    var dmg = raw * src.atk / (src.atk + Math.max(0, def));
    dmg *= b.rng.range(0.92, 1.08);
    var crit = critChance > 0 && b.rng.chance(critChance);
    if (crit) dmg *= critMult;
    if (tgt.kind === 'hero') {
      if (tgt.skills.stalwart && tgt.hp < 0.3 * tgt.maxHp) dmg *= 0.75;
    }
    dmg = Math.max(1, Math.round(dmg));
    b.lastDamageT = b.t;
    var shown = dmg;
    if (tgt.shield > 0) {
      var absorbed = Math.min(tgt.shield, dmg);
      tgt.shield -= absorbed;
      dmg -= absorbed;
      if (tgt.shield <= 0) {
        tgt.shield = 0;
        tgt.stun = Math.max(tgt.stun, 2);
        emit(b, { t: 'shieldbreak', id: tgt.id, x: tgt.x, depth: tgt.depth });
      }
    }
    tgt.hp -= dmg;
    tgt.hurtT = 0.15;
    var k = kindOverride || (crit ? 'crit' : magic ? 'magic' : 'phys');
    emit(b, { t: 'num', who: tgt.kind, id: tgt.id, x: tgt.x, depth: tgt.depth, v: shown, k: dmg < shown ? 'shield' : k });
    emit(b, { t: 'hit', x: tgt.x, depth: tgt.depth, magic: magic, big: crit, who: tgt.kind });
    if (tgt.kind === 'hero') {
      b.stats.taken += dmg;
      var gain = clamp(Math.round(EN.perHitMax * dmg / (EN.hitFrac * tgt.maxHp)), EN.perHitMin, EN.perHitMax);
      tgt.energy = Math.min(EMAX, tgt.energy + gain);
      if (tgt.hp <= 0) {
        tgt.hp = 0; tgt.dead = true; tgt.state = 'dead';
        emit(b, { t: 'herodeath' });
      }
    } else {
      b.stats.dealt += dmg;
      if (tgt.def.shield && tgt.phase === 1 && tgt.hp <= tgt.maxHp * 0.5) {
        tgt.phase = 2;
        tgt.hp = Math.max(tgt.hp, 1);
        tgt.shieldMax = tgt.shield = Math.round(tgt.maxHp * tgt.def.shield);
        tgt.summonCd = Math.min(tgt.summonCd, 1);
        emit(b, { t: 'shield', id: tgt.id, x: tgt.x, depth: tgt.depth });
      }
      if (tgt.hp <= 0) killEnemy(b, tgt);
    }
    return dmg;
  }

  function killEnemy(b, e) {
    e.hp = 0; e.dead = true; e.deathT = 0; e.state = 'dead'; e.shield = 0;
    var h = b.hero;
    h.energy = Math.min(EMAX, h.energy + EN.perKill);
    b.stats.kills++;
    b.stats.xp += e.xp;
    b.stats.gold += e.gold;
    emit(b, { t: 'kill', id: e.id, x: e.x, depth: e.depth, gold: e.gold });
    if (e.def.boss) {
      b.stats.bossKilled = true;
      emit(b, { t: 'bosskill', id: e.id, x: e.x, depth: e.depth });
      // The boss's summoned minions crumble with her.
      for (var i = 0; i < b.enemies.length; i++) {
        var m = b.enemies[i];
        if (!m.dead && m.summoned) { m.hp = 0; m.dead = true; m.deathT = 0; m.state = 'dead'; }
      }
    }
  }

  function stunUnit(e, dur) {
    if (e.def.flying) return;
    if (e.def.boss) dur *= 0.5;
    e.stun = Math.max(e.stun, dur);
    e.wind = 0;
    e.barrageLeft = 0;
    e.dashT = 0;
  }

  // ---------------------------------------------------------------- hero
  function heroStrike(b, h) {
    var t = h.target;
    h.target = null;
    if (!t || t.dead || Math.abs(t.x - h.x) > h.range + 30) return;
    var dmg = damage(b, h, t, h.atk, false, h.crit, h.critMult);
    h.energy = Math.min(EMAX, h.energy + EN.perAttack);
    if (h.lifesteal > 0) healUnit(b, h, dmg * h.lifesteal, false);
  }

  function startUlt(b, h) {
    var t = nearest(b);
    var hb = heroBounds(b);
    h.energy = 0;
    h.leapT = 0;
    h.leapFrom = h.x;
    h.leapTo = clamp(t.x - 45, hb[0], hb[1]);
    h.wind = 0; h.target = null; h.kbT = 0;
    h.state = 'leap';
    b.stats.ults++;
    emit(b, { t: 'ult', x: h.x });
  }

  function slam(b, h) {
    var lvl = h.skills.ult || 1;
    var raw = 3.0 * h.atk + 40 * lvl, hits = 0;
    for (var i = 0; i < b.enemies.length; i++) {
      var e = b.enemies[i];
      if (e.dead || Math.abs(e.x - h.x) > SLAM_RADIUS) continue;
      b.stats.ultDamage += damage(b, h, e, raw, false, h.crit, h.critMult);
      if (!e.dead) stunUnit(e, 1.5);
      hits++;
    }
    h.swingT = 0.45; h.swingKind = 'slam';
    h.atkCd = Math.max(h.atkCd, 0.35);
    emit(b, { t: 'slam', x: h.x, depth: h.depth, hits: hits });
  }

  function updateHero(b) {
    var h = b.hero, i;
    h.anim += DT;
    if (h.swingT > 0) h.swingT -= DT;
    if (h.hurtT > 0) h.hurtT -= DT;
    if (h.dead) { h.deathT += DT; return; }

    for (i = h.bleeds.length - 1; i >= 0; i--) {
      var bl = h.bleeds[i];
      bl.t -= DT; bl.tick -= DT;
      if (bl.tick <= 0) {
        bl.tick += 0.5;
        damage(b, bl.src, h, bl.per, false, 0, 1, 'bleed');
        if (h.dead) return;
      }
      if (bl.t <= 0) h.bleeds.splice(i, 1);
    }
    if (h.hot > 0) {
      var amt = Math.min(h.hot, h.hotRate * DT);
      h.hot -= amt;
      h.hotShown += healUnit(b, h, amt, false);
      if (h.hotShown >= h.hotRate * 0.5 || (h.hot <= 0 && h.hotShown > 0)) {
        emit(b, { t: 'num', who: 'hero', x: h.x, depth: h.depth, v: Math.round(h.hotShown), k: 'heal' });
        h.hotShown = 0;
      }
    }
    h.bashCd -= DT; h.vigorCd -= DT; h.atkCd -= DT;

    if (!h.potionUsed && h.potions > 0 && h.hp < 0.25 * h.maxHp) {
      h.potionUsed = true; h.potions--;
      healUnit(b, h, h.maxHp * D.POTION.heal, true);
      emit(b, { t: 'potion', x: h.x });
    }
    if (h.skills.vigor > 0 && h.vigorCd <= 0 && h.hp < 0.5 * h.maxHp) {
      h.hot = 0.12 * h.maxHp + 25 * h.skills.vigor;
      h.hotRate = h.hot / 3;
      h.vigorCd = 12;
      emit(b, { t: 'vigor', x: h.x });
    }

    if (b.phase === 'transition') { updateTransition(b, h); return; }

    if (h.kbT > 0) {
      h.kbT -= DT;
      var hb = heroBounds(b);
      h.x = clamp(h.x + h.kbV * DT, hb[0], hb[1]);
    }
    if (h.leapT >= 0) {
      h.leapT += DT;
      var p = Math.min(1, h.leapT / LEAP_TIME);
      h.x = h.leapFrom + (h.leapTo - h.leapFrom) * p;
      if (p >= 1) { h.leapT = -1; slam(b, h); }
      return;
    }

    // The ultimate fires when ready (Auto) or once tapped, as soon as a foe is in leap reach.
    var t = nearest(b);
    if (h.energy < EMAX) b.ultRequest = false;
    if (h.energy >= EMAX && t && !b.neverUlt && (b.auto || b.ultRequest) && Math.abs(t.x - h.x) <= ULT_REACH) {
      b.ultRequest = false;
      startUlt(b, h);
      return;
    }
    if (!t) {
      // Enemies still walking in: advance to the middle of the arena.
      var goal = b.waveBase + ADVANCE_X;
      if (alive(b).length && h.x < goal) { h.x = Math.min(goal, h.x + h.speed * DT); h.state = 'walk'; }
      else h.state = 'idle';
      return;
    }
    if (h.wind > 0) {
      h.wind -= DT;
      if (h.wind <= 0) heroStrike(b, h);
      return;
    }
    var dist = Math.abs(t.x - h.x);
    if (dist > h.range) {
      h.x += (t.x > h.x ? 1 : -1) * Math.min(h.speed * DT, dist - h.range + 0.01);
      h.state = 'walk';
      return;
    }
    h.state = 'fight';
    if (h.skills.bash > 0 && h.bashCd <= 0) {
      h.bashCd = 7;
      h.swingT = 0.35; h.swingKind = 'bash';
      damage(b, h, t, 1.4 * h.atk + 20 * h.skills.bash, false, h.crit, h.critMult);
      if (!t.dead) stunUnit(t, 1);
      emit(b, { t: 'bash', x: t.x, depth: t.depth });
      return;
    }
    if (h.atkCd <= 0) {
      h.atkCd = 1 / h.aspd;
      h.wind = 0.14;
      h.target = t;
      h.swingT = 0.32; h.swingKind = 'slash';
    }
  }

  function updateTransition(b, h) {
    b.phaseT += DT;
    var goal = (b.wave + 1) * B.waveGap + B.heroStartX;
    if (b.phaseT < 0.7) { h.state = 'idle'; return; }
    if (b.transFrom == null) b.transFrom = h.x;
    h.state = 'run';
    h.x = Math.min(goal, h.x + RUN_SPEED * DT);
    var span = goal - b.transFrom;
    b.camX = b.waveBase + B.waveGap * (span > 0 ? (h.x - b.transFrom) / span : 1);
    if (h.x >= goal) {
      b.transFrom = null;
      b.enemies = b.enemies.filter(function (e) { return !e.dead || e.deathT < 1; });
      spawnWave(b, b.wave + 1);
    }
  }

  // ---------------------------------------------------------------- enemies
  function enemyStrike(b, e) {
    var h = b.hero, d = e.def;
    var buff = e.buffT > 0 ? 1.35 : 1;
    var raw = e.atk * buff;
    if (d.proj && e.strike === 'basic') {
      fireProjectile(b, e, raw, d.proj);
      return;
    }
    if (h.leapT >= 0 || Math.abs(h.x - e.x) > e.range + 25) return;
    var crit = d.crit || 0, cm = d.critMult || 1.5;
    if (e.nextCrit) { crit = 1; e.nextCrit = false; }
    var kb = d.knockback || 0;
    if (e.strike === 'cleave') { raw *= 2.2; kb = 60; emit(b, { t: 'cleave', x: e.x, depth: e.depth }); }
    var dmg = damage(b, e, h, raw, !!d.magic, crit, cm);
    if (h.dead) return;
    if (d.bleed) h.bleeds.push({ src: e, t: 3, tick: 0.5, per: Math.max(1, dmg * d.bleed / 6) });
    if (kb) { h.kbT = 0.2; h.kbV = -kb / 0.2; }
  }

  function fireProjectile(b, e, raw, kind) {
    var h = b.hero, d = e.def;
    b.projectiles.push({
      kind: kind, src: e, x: e.x - 18 * (e.x > h.x ? 1 : -1), tx: h.x, sx: e.x,
      speed: d.projSpeed, raw: raw, magic: !!d.magic, depth: e.depth, h: d.boss ? 80 : 46, done: false
    });
  }

  function updateProjectiles(b) {
    var h = b.hero;
    for (var i = b.projectiles.length - 1; i >= 0; i--) {
      var p = b.projectiles[i];
      var dir = p.tx > p.x ? 1 : -1, stepLen = p.speed * DT;
      if (Math.abs(p.tx - p.x) <= stepLen) {
        b.projectiles.splice(i, 1);
        if (!h.dead && h.leapT < 0 && Math.abs(h.x - p.tx) < 40) damage(b, p.src, h, p.raw, p.magic, 0, 1);
        else emit(b, { t: 'miss', x: p.tx, depth: p.depth });
      } else {
        p.x += dir * stepLen;
      }
    }
  }

  function updateEnemy(b, e) {
    var d = e.def, h = b.hero;
    e.anim += DT;
    if (e.hurtT > 0) e.hurtT -= DT;
    if (e.swingT > 0) e.swingT -= DT;
    if (e.dead) { e.deathT += DT; return; }
    if (d.regen && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + d.regen * e.maxHp * DT);
    if (e.buffT > 0) e.buffT -= DT;
    e.atkCd -= DT; e.backCd -= DT; e.dashCd -= DT; e.cleaveCd -= DT; e.warcryCd -= DT;
    e.healCd -= DT; e.summonCd -= DT; e.barrageCd -= DT;
    if (b.phase !== 'fight' || h.dead) { e.state = 'idle'; return; }

    var bound = b.waveBase + B.enemyBound;
    if (!e.entered) {
      // Walk on screen; bosses make an entrance further in.
      e.x -= e.speed * 1.3 * DT;
      e.state = 'walk';
      if (e.x <= b.waveBase + (d.enterX || B.enemyBound)) e.entered = true;
      return;
    }
    if (e.stun > 0) { e.stun -= DT; e.state = 'stun'; return; }
    if (e.backT > 0) {
      e.backT -= DT;
      e.x = Math.min(bound, e.x + 200 * DT);
      e.state = 'walk';
      return;
    }
    var dist = e.x - h.x, ad = Math.abs(dist), dir = dist > 0 ? -1 : 1;
    if (e.dashT > 0) {
      e.dashT -= DT;
      e.x += dir * Math.min(700 * DT, Math.max(0, ad - e.range + 5));
      e.state = 'dash';
      return;
    }
    if (e.wind > 0) {
      e.wind -= DT;
      if (e.wind <= 0) enemyStrike(b, e);
      return;
    }
    if (e.barrageLeft > 0) {
      e.barrageT -= DT;
      if (e.barrageT <= 0) {
        fireProjectile(b, e, e.atk * 0.9, 'lich');
        e.barrageLeft--; e.barrageT = 0.18;
        e.swingT = 0.3;
      }
      return;
    }

    // Specials.
    if (d.summon && e.summonCd <= 0) {
      e.summonCd = e.phase === 2 ? 8 : d.summon;
      var adds = alive(b).filter(function (u) { return u.summoned; }).length;
      for (var k = 0; k < 2 && adds + k < 4; k++) {
        var s = makeEnemy(b, 'skeleton', Math.min(bound, e.x + 20 + 30 * k), k ? 0.15 : 0.85, true);
        s.entered = true;
        b.enemies.push(s);
      }
      e.swingT = 0.6;
      emit(b, { t: 'summon', x: e.x, depth: e.depth });
      return;
    }
    if (d.barrage && e.barrageCd <= 0 && ad <= e.range) {
      e.barrageCd = e.phase === 2 ? 6 : d.barrage;
      e.barrageLeft = 3; e.barrageT = 0.25;
      emit(b, { t: 'barrage', x: e.x, depth: e.depth });
      return;
    }
    if (d.warcry && e.warcryCd <= 0) {
      e.warcryCd = d.warcry;
      alive(b).forEach(function (u) { u.buffT = 6; });
      e.swingT = 0.6;
      emit(b, { t: 'warcry', x: e.x, depth: e.depth });
      return;
    }
    if (d.heal && e.healCd <= 0) {
      var best = null, bf = 0.85;
      alive(b).forEach(function (u) { var f = u.hp / u.maxHp; if (f < bf) { bf = f; best = u; } });
      if (best) {
        e.healCd = d.healCd;
        healUnit(b, best, best.maxHp * (best.def.boss ? 0.04 : d.heal), true);
        e.swingT = 0.5;
        emit(b, { t: 'healbeam', from: e.id, to: best.id });
        return;
      }
    }
    if (d.dash && e.dashCd <= 0 && ad > e.range + 40 && ad < 520) {
      e.dashCd = d.dash;
      e.dashT = 0.6;
      e.nextCrit = true;
      emit(b, { t: 'dash', x: e.x, depth: e.depth });
      return;
    }

    if (ad > e.range) {
      e.x += dir * Math.min(e.speed * DT, ad - e.range + 0.01);
      e.x = Math.min(bound, e.x);
      e.state = 'walk';
      return;
    }
    if (d.ai !== 'melee' && !d.boss && ad < 0.6 * e.range && e.backCd <= 0 && e.x < bound - 20) {
      e.backT = 0.5; e.backCd = 2;
      return;
    }
    e.state = 'fight';
    if (d.cleave && e.cleaveCd <= 0) {
      e.cleaveCd = d.cleave;
      e.strike = 'cleave'; e.wind = 0.45; e.swingT = 0.65;
      return;
    }
    if (e.atkCd <= 0) {
      e.atkCd = e.period;
      e.strike = 'basic';
      e.wind = d.proj ? 0.25 : 0.2;
      e.swingT = 0.4;
    }
  }

  // ---------------------------------------------------------------- step
  function finish(b, won) {
    b.over = true;
    b.won = won;
    b.hero.state = won ? 'victory' : b.hero.state;
    emit(b, { t: 'over', won: won });
  }

  function step(b) {
    if (b.over) {
      b.postT += DT;
      b.hero.anim += DT;
      if (b.hero.dead) b.hero.deathT += DT;
      for (var j = 0; j < b.enemies.length; j++) { var u = b.enemies[j]; u.anim += DT; if (u.dead) u.deathT += DT; }
      return;
    }
    b.t += DT;
    b.steps++;
    updateHero(b);
    for (var i = 0; i < b.enemies.length; i++) updateEnemy(b, b.enemies[i]);
    updateProjectiles(b);
    if (b.validate) validate(b);

    if (b.hero.dead) { finish(b, false); return; }
    if (b.phase === 'fight') {
      if (alive(b).length === 0) {
        b.projectiles.length = 0;
        if (b.wave >= b.waves - 1) { finish(b, true); return; }
        b.phase = 'transition'; b.phaseT = 0;
        emit(b, { t: 'cleared', wave: b.wave });
      } else if (b.t - b.lastDamageT > B.stalemate) {
        b.stalemate = true; finish(b, false); return;
      }
    }
    if (b.t >= B.timeLimit) { b.timeout = true; finish(b, false); }
  }

  function validate(b) {
    var lo = b.waveBase - 1, hi = b.waveBase + B.waveGap + B.arenaW;
    var h = b.hero;
    var units = [h].concat(b.enemies);
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (!isFinite(u.x) || !isFinite(u.hp) || u.x < lo || u.x > hi || u.hp < 0 || u.hp > u.maxHp + 1e-6) b.invalid++;
    }
    if (!isFinite(h.energy) || h.energy < 0 || h.energy > EMAX) b.invalid++;
  }

  // Advance by real (scaled) time using an accumulator of fixed steps.
  function advance(b, dt, maxSteps) {
    b.acc += dt;
    var n = 0, cap = maxSteps || 1e9;
    while (b.acc >= DT - 1e-9 && n < cap) { step(b); b.acc -= DT; n++; }
    if (n >= cap) b.acc = 0;
    return n;
  }

  function fireUltimate(b) {
    if (b.over || b.hero.dead || b.hero.energy < EMAX || b.neverUlt) return false;
    b.ultRequest = true;
    return true;
  }

  function stars(won, frac) { return !won ? 0 : frac >= 0.6 ? 3 : frac >= 0.25 ? 2 : 1; }

  function result(b) {
    var frac = b.hero.hp / b.hero.maxHp;
    return {
      won: b.won, heroHpFrac: frac, time: b.t, stars: stars(b.won, frac),
      stalemate: b.stalemate, timeout: b.timeout, invalid: b.invalid,
      ults: b.stats.ults, kills: b.stats.kills, dealt: b.stats.dealt, taken: b.stats.taken,
      killXp: b.stats.xp, killGold: b.stats.gold, wave: b.wave,
      potionsUsed: b.hero.potionUsed ? 1 : 0
    };
  }

  // Run a battle to completion without rendering.
  function run(stageId, heroSpec, opts) {
    var b = create(stageId, heroSpec, opts);
    var guard = Math.ceil(B.timeLimit / DT) + 10;
    while (!b.over && guard-- > 0) step(b);
    return result(b);
  }

  root.HWSim = {
    DT: DT, create: create, step: step, advance: advance, fireUltimate: fireUltimate,
    result: result, run: run, stars: stars
  };
})(typeof window !== 'undefined' ? window : globalThis);

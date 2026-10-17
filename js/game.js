/*
 * Hero Pins — game.js
 * Game core: builds a level into a physics world, slides pins out, applies the
 * gameplay rules (treasure, lava, water, monsters, hero power) and decides
 * victory / defeat. Pure logic, no DOM access, fully deterministic.
 * Exposes window.HeroPins (loadLevel, pullPin, step, getState, simulateSolution,
 * simulateOrder, setHeadless) for the UI and for automated tests.
 */
(function (root) {
  'use strict';

  var P = root.HPPhysics;
  var FIXED_DT = 1 / 120;
  var VIEW_W = 420, VIEW_H = 760, FRAME = 20;
  var PIN_R = 6, WALL_R = 7, HERO_R = 24;
  var PIN_SLIDE_TIME = 0.35;
  var WARMUP_TIME = 0.8;
  var RADIUS = { coin: 9, gem: 10, lava: 7, water: 7, monster: 17 };
  var FRICTION = { coin: 0.0015, gem: 0.0015, lava: 0.0008, water: 0.0005, monster: 0.003 };
  var TREASURE_POWER = { coin: 1, gem: 3 };

  var game = null;          // current level state
  var headless = false;
  var acc = 0;

  function isTreasure(t) { return t === 'coin' || t === 'gem'; }

  function inRect(b, r) {
    return b.x > r.x && b.x < r.x + r.w && b.y > r.y && b.y < r.y + r.h;
  }

  // Fill a spawn rectangle with a jittered grid of particles (bottom row first).
  function spawnRegion(world, sp, rng) {
    var r = RADIUS[sp.type];
    if (sp.type === 'monster') {
      world.addBody('monster', sp.x, sp.y, r, { power: sp.power, friction: FRICTION.monster });
      return;
    }
    var gap = 2 * r + 0.6;
    var cols = Math.max(1, Math.floor((sp.w - 0.6) / gap));
    var rows = Math.max(1, Math.floor((sp.h - 0.6) / gap));
    var total = sp.count || cols * rows;
    var x0 = sp.x + (sp.w - cols * gap) / 2 + gap / 2;
    var placed = 0;
    for (var row = 0; placed < total; row++) {
      var y = sp.y + sp.h - gap / 2 - row * gap;
      for (var c = 0; c < cols && placed < total; c++) {
        var jx = (rng() - 0.5) * 0.3 * r, jy = (rng() - 0.5) * 0.3 * r;
        world.addBody(sp.type, x0 + c * gap + jx, y + jy, r, { friction: FRICTION[sp.type] });
        placed++;
      }
    }
  }

  function pinDirection(p) {
    var ex = p.x2 - p.x1, ey = p.y2 - p.y1;
    var len = Math.sqrt(ex * ex + ey * ey);
    var dx = ex / len, dy = ey / len;
    if ((p.outDir === 'left') === (dx > 0)) { dx = -dx; dy = -dy; }
    return { x: dx, y: dy, len: len };
  }

  function loadLevel(n) {
    var def = root.HPLevels[n - 1];
    if (!def) throw new Error('No level ' + n);
    var world = new P.World();
    world.addBox(0, 0, VIEW_W, FRAME);
    world.addBox(0, VIEW_H - FRAME, VIEW_W, FRAME);
    world.addBox(0, 0, FRAME, VIEW_H);
    world.addBox(VIEW_W - FRAME, 0, FRAME, VIEW_H);
    def.walls.forEach(function (w) { world.addSegment(w[0], w[1], w[2], w[3], WALL_R, 'wall'); });
    world.addSegment(def.hero.x, def.hero.y, def.hero.x, def.hero.y, HERO_R, 'hero');
    var pins = def.pins.map(function (p) {
      var d = pinDirection(p);
      var pin = {
        id: p.id, x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, dir: d,
        pulled: false, slide: 0, gone: false
      };
      pin.seg = world.addSegment(p.x1, p.y1, p.x2, p.y2, PIN_R, 'pin', pin);
      return pin;
    });
    var rng = P.makeRng(1000 + def.id * 7919);
    def.spawns.forEach(function (sp) { spawnRegion(world, sp, rng); });

    var totalTreasure = world.bodies.filter(function (b) { return isTreasure(b.type); }).length;
    game = {
      n: n, def: def, world: world, pins: pins,
      hero: { x: def.hero.x, y: def.hero.y, r: HERO_R, power: def.heroPower, alive: true },
      status: 'playing', reason: '', coins: 0, pulls: 0, time: 0,
      required: def.requiredTreasure, totalTreasure: totalTreasure,
      hintUsed: false, stars: 0, escaped: false, fx: [], fxSeed: P.makeRng(42 + n)
    };
    // let the piles come to rest on their pins before the player sees them
    var steps = Math.round(WARMUP_TIME / FIXED_DT);
    for (var i = 0; i < steps; i++) fixedStep(true);
    game.fx.length = 0;
    game.time = 0;
    acc = 0;
    return getState();
  }

  function addFx(kind, x, y, text, color) {
    game.fx.push({ kind: kind, x: x, y: y, text: text || '', color: color || '#fff', age: 0, seed: game.fxSeed() });
  }

  function kill(b, fxKind) {
    if (!b.alive) return;
    b.alive = false;
    if (fxKind) addFx(fxKind, b.x, b.y);
  }

  function lose(reason) {
    if (game.status !== 'playing') return;
    game.status = 'lost';
    game.reason = reason;
  }

  // Pairwise gameplay interactions, called for every touching pair.
  function onTouch(a, b) {
    var ta = a.type, tb = b.type;
    if (ta === 'lava' || tb === 'lava') {
      var lava = ta === 'lava' ? a : b, other = lava === a ? b : a;
      if (isTreasure(other.type)) kill(other, 'burn');
      else if (other.type === 'monster') kill(other, 'puff');
      else if (other.type === 'water') { kill(other, null); kill(lava, 'steam'); }
    }
  }

  function heroRules() {
    var def = game.def, hero = game.hero, room = def.heroRoom;
    var bodies = game.world.bodies;
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      if (!b.alive) continue;
      var dx = b.x - hero.x, dy = b.y - hero.y;
      var near = dx * dx + dy * dy < (b.r + hero.r + 3) * (b.r + hero.r + 3);
      if (!near && !inRect(b, room)) continue;
      if (isTreasure(b.type)) {
        b.alive = false;
        game.coins++;
        var gain = TREASURE_POWER[b.type];
        hero.power += gain;
        addFx('float', b.x, b.y, '+' + gain, b.type === 'gem' ? '#7ff' : '#ffd84a');
      } else if (b.type === 'lava') {
        if (hero.alive) { hero.alive = false; addFx('burnHero', hero.x, hero.y); }
        lose('The hero was burned!');
      } else if (b.type === 'monster') {
        if (hero.alive && hero.power >= b.power) {
          kill(b, 'puff');
          addFx('float', b.x, b.y - 20, 'Defeated!', '#ff8');
        } else if (hero.alive) {
          hero.alive = false;
          addFx('slain', hero.x, hero.y);
          lose('The monster was too strong!');
        }
      }
    }
  }

  function goalMet() {
    if (game.coins < game.required) return false;
    if (game.def.winWhen === 'allMonstersDead') {
      var bodies = game.world.bodies;
      for (var i = 0; i < bodies.length; i++) {
        if (bodies[i].alive && bodies[i].type === 'monster') return false;
      }
    }
    return true;
  }

  function updatePins(dt) {
    game.pins.forEach(function (p) {
      if (!p.pulled || p.gone) return;
      p.slide += dt / PIN_SLIDE_TIME;
      var off = Math.min(1, p.slide) * (p.dir.len + 60);
      p.seg.x1 = p.x1 + p.dir.x * off; p.seg.y1 = p.y1 + p.dir.y * off;
      p.seg.x2 = p.x2 + p.dir.x * off; p.seg.y2 = p.y2 + p.dir.y * off;
      if (p.slide >= 1) { p.gone = true; p.seg.active = false; }
    });
  }

  function fixedStep(warmup) {
    var g = game;
    updatePins(FIXED_DT);
    g.world.step(FIXED_DT, onTouch);
    heroRules();
    g.world.removeDead();
    g.time += FIXED_DT;
    var bodies = g.world.bodies, treasureLeft = 0;
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      if (isTreasure(b.type)) treasureLeft++;
      if (!(b.x >= 0 && b.x <= VIEW_W && b.y >= 0 && b.y <= VIEW_H)) g.escaped = true;
    }
    for (i = g.fx.length - 1; i >= 0; i--) {
      g.fx[i].age += FIXED_DT;
      if (g.fx[i].age > 1.2) g.fx.splice(i, 1);
    }
    if (warmup || g.status !== 'playing') return;
    if (g.coins + treasureLeft < g.required) { lose('Treasure lost!'); return; }
    var moving = g.pins.some(function (p) { return p.pulled && !p.gone; });
    if (moving || !g.world.isSettled()) return;
    if (goalMet()) win();
    else if (!g.pins.some(function (p) { return !p.pulled; })) lose('Treasure lost!');
  }

  function win() {
    var g = game;
    g.status = 'won';
    var all = g.coins >= g.totalTreasure;
    g.stars = all ? (g.pulls <= g.def.minPulls && !g.hintUsed ? 3 : 2) : 1;
  }

  function pullPin(id) {
    if (!game || game.status !== 'playing') return false;
    var pin = null;
    game.pins.forEach(function (p) { if (p.id === id) pin = p; });
    if (!pin || pin.pulled) return false;
    pin.pulled = true;
    game.pulls++;
    // wake everything so the settle check restarts
    game.world.bodies.forEach(function (b) { b.sleepTimer = 0; b.asleep = false; });
    return true;
  }

  // Advance real time (seconds); runs as many fixed steps as fit.
  function step(dt) {
    if (!game) return;
    acc += Math.min(dt, 0.1);
    while (acc >= FIXED_DT - 1e-9) { fixedStep(false); acc -= FIXED_DT; }
  }

  function getState() {
    if (!game) return null;
    return {
      level: game.n, status: game.status, reason: game.reason, coins: game.coins,
      required: game.required, totalTreasure: game.totalTreasure, pulls: game.pulls,
      heroPower: game.hero.power, heroAlive: game.hero.alive, stars: game.stars,
      time: game.time, escaped: game.escaped,
      bodies: game.world.bodies.map(function (b) {
        return { id: b.id, type: b.type, x: b.x, y: b.y, r: b.r, power: b.power };
      }),
      pinsLeft: game.pins.filter(function (p) { return !p.pulled; }).map(function (p) { return p.id; })
    };
  }

  function scenePending() {
    return !game.world.isSettled() || game.pins.some(function (p) { return p.pulled && !p.gone; });
  }

  // Pull pins in the given order like a careful player: after each pull wait at
  // least `gap` seconds (default 0.6) and then until the scene calms down (max 5 s).
  // After the last pull run until the level resolves (max 12 s).
  function simulateOrder(n, ids, gap) {
    loadLevel(n);
    setHeadless(true);
    var minSteps = Math.round((gap === undefined ? 0.6 : gap) / FIXED_DT);
    var maxSteps = Math.round(5 / FIXED_DT), i, k;
    for (i = 0; i < ids.length - 1 && game.status === 'playing'; i++) {
      pullPin(ids[i]);
      for (k = 0; k < maxSteps && game.status === 'playing' && (k < minSteps || scenePending()); k++) {
        fixedStep(false);
      }
    }
    if (ids.length) pullPin(ids[ids.length - 1]);
    var limit = Math.round(12 / FIXED_DT);
    for (k = 0; k < limit && game.status === 'playing'; k++) fixedStep(false);
    return getState();
  }

  // Pull pins with a strict fixed gap (no waiting for rest), like a fast player;
  // after the last pull run until the level resolves (max 14 s).
  function simulateStrict(n, ids, gap) {
    loadLevel(n);
    setHeadless(true);
    var between = Math.round(gap / FIXED_DT), i, k;
    for (i = 0; i < ids.length; i++) {
      pullPin(ids[i]);
      var steps = i < ids.length - 1 ? between : Math.round(14 / FIXED_DT);
      for (k = 0; k < steps && game.status === 'playing'; k++) fixedStep(false);
    }
    return getState();
  }

  function simulateSolution(n) {
    return simulateOrder(n, root.HPLevels[n - 1].solution);
  }

  function setHeadless(v) { headless = !!v; }

  function hintPin() {
    if (!game || game.status !== 'playing') return null;
    game.hintUsed = true;
    var sol = game.def.solution;
    for (var i = 0; i < sol.length; i++) {
      for (var j = 0; j < game.pins.length; j++) {
        if (game.pins[j].id === sol[i] && !game.pins[j].pulled) return sol[i];
      }
    }
    return null;
  }

  root.HeroPins = {
    VIEW_W: VIEW_W, VIEW_H: VIEW_H, WALL_R: WALL_R,
    loadLevel: loadLevel, pullPin: pullPin, step: step, getState: getState,
    simulateSolution: simulateSolution, simulateOrder: simulateOrder, simulateStrict: simulateStrict,
    setHeadless: setHeadless,
    isHeadless: function () { return headless; },
    levelCount: function () { return root.HPLevels.length; },
    hint: hintPin,
    current: function () { return game; }
  };
})(typeof window !== 'undefined' ? window : this);

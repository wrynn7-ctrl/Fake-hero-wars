/*
 * Hero Pins — physics.js
 * A tiny deterministic 2D circle physics engine (position-based dynamics).
 *  - dynamic circles (coins, gems, lava, water, monsters)
 *  - static capsules (walls, pins, the hero) and axis-aligned boxes (frame)
 *  - fixed sub-steps, iterative position correction, speed clamp (no tunnelling)
 *  - sleep detection so the game can tell when the scene has settled
 * Exposes window.HPPhysics.
 */
(function (root) {
  'use strict';

  var GRAVITY = 1400;        // px/s^2
  var MAX_SPEED = 900;       // px/s -> < 2 px per sub-step, far below pin half-thickness
  var SUBSTEPS = 4;          // per fixed step of 1/120 s  => 1/480 s sub-steps
  var ITERATIONS = 2;        // position-correction passes per sub-step
  var DAMPING = 0.35;        // linear velocity damping per second
  var SLEEP_SPEED = 14;      // px/s
  var SLEEP_TIME = 0.5;      // s below SLEEP_SPEED before a body counts as asleep
  var CELL = 40;             // broad-phase grid cell (>= largest diameter)
  var GRID_W = 12;           // 420 / 40 rounded up, plus margin
  var GRID_H = 21;           // 760 / 40 rounded up, plus margin

  function World() {
    this.bodies = [];
    this.segments = [];
    this.boxes = [];
    this.nextId = 1;
    this.grid = [];
    for (var i = 0; i < GRID_W * GRID_H; i++) this.grid.push([]);
    this.touching = [];       // body pairs touching during the last sub-step
  }

  World.prototype.addBody = function (type, x, y, r, opts) {
    opts = opts || {};
    var b = {
      id: this.nextId++, type: type, x: x, y: y, px: x, py: y, vx: 0, vy: 0,
      r: r, invMass: 1 / (r * r), friction: opts.friction || 0.003,
      power: opts.power || 0, alive: true, sleepTimer: 0, asleep: false
    };
    this.bodies.push(b);
    return b;
  };

  World.prototype.addSegment = function (x1, y1, x2, y2, r, kind, ref) {
    var s = { x1: x1, y1: y1, x2: x2, y2: y2, r: r, kind: kind, ref: ref || null, active: true };
    this.segments.push(s);
    return s;
  };

  World.prototype.addBox = function (x, y, w, h) {
    var bx = { x: x, y: y, w: w, h: h };
    this.boxes.push(bx);
    return bx;
  };

  World.prototype.removeDead = function () {
    this.bodies = this.bodies.filter(function (b) { return b.alive; });
  };

  function cellIndex(x, y) {
    var cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    if (cx < 0) cx = 0; else if (cx >= GRID_W) cx = GRID_W - 1;
    if (cy < 0) cy = 0; else if (cy >= GRID_H) cy = GRID_H - 1;
    return cy * GRID_W + cx;
  }

  World.prototype.buildGrid = function () {
    var g = this.grid, i;
    for (i = 0; i < g.length; i++) g[i].length = 0;
    for (i = 0; i < this.bodies.length; i++) {
      var b = this.bodies[i];
      if (b.alive) g[cellIndex(b.x, b.y)].push(b);
    }
  };

  // Push two overlapping circles apart in proportion to their inverse masses.
  function solvePair(a, b, record) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var rr = a.r + b.r;
    var d2 = dx * dx + dy * dy;
    if (d2 >= (rr + 0.75) * (rr + 0.75)) return;
    if (record) record.push(a, b);
    if (d2 >= rr * rr) return;
    var d = Math.sqrt(d2);
    var nx, ny;
    if (d < 1e-6) { nx = 0; ny = 1; d = 0; } else { nx = dx / d; ny = dy / d; }
    var pen = rr - d;
    var w = a.invMass + b.invMass;
    var ka = pen * a.invMass / w, kb = pen * b.invMass / w;
    a.x -= nx * ka; a.y -= ny * ka;
    b.x += nx * kb; b.y += ny * kb;
  }

  // Resolve a circle against a static contact with outward normal (nx, ny).
  function pushOut(b, nx, ny, pen) {
    b.x += nx * pen; b.y += ny * pen;
    // friction: remove a little of the tangential displacement of this sub-step
    var mx = b.x - b.px, my = b.y - b.py;
    var dn = mx * nx + my * ny;
    var tx = mx - dn * nx, ty = my - dn * ny;
    b.x -= tx * b.friction; b.y -= ty * b.friction;
  }

  function solveSegment(b, s) {
    var ex = s.x2 - s.x1, ey = s.y2 - s.y1;
    var len2 = ex * ex + ey * ey;
    var t = len2 > 0 ? ((b.x - s.x1) * ex + (b.y - s.y1) * ey) / len2 : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var cx = s.x1 + ex * t, cy = s.y1 + ey * t;
    var dx = b.x - cx, dy = b.y - cy;
    var rr = b.r + s.r;
    var d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return false;
    var d = Math.sqrt(d2), nx, ny;
    if (d < 1e-6) {           // centre exactly on the axis: push along the segment normal
      var l = Math.sqrt(len2) || 1;
      nx = -ey / l; ny = ex / l;
      if (ny > 0) { nx = -nx; ny = -ny; }
      d = 0;
    } else { nx = dx / d; ny = dy / d; }
    pushOut(b, nx, ny, rr - d);
    return true;
  }

  function solveBox(b, bx) {
    var cx = Math.max(bx.x, Math.min(b.x, bx.x + bx.w));
    var cy = Math.max(bx.y, Math.min(b.y, bx.y + bx.h));
    var dx = b.x - cx, dy = b.y - cy;
    var d2 = dx * dx + dy * dy;
    if (d2 > 1e-9) {
      if (d2 >= b.r * b.r) return;
      var d = Math.sqrt(d2);
      pushOut(b, dx / d, dy / d, b.r - d);
      return;
    }
    // centre inside the box: leave through the nearest face
    var left = b.x - bx.x, right = bx.x + bx.w - b.x, top = b.y - bx.y, bottom = bx.y + bx.h - b.y;
    var m = Math.min(left, right, top, bottom);
    if (m === left) pushOut(b, -1, 0, left + b.r);
    else if (m === right) pushOut(b, 1, 0, right + b.r);
    else if (m === top) pushOut(b, 0, -1, top + b.r);
    else pushOut(b, 0, 1, bottom + b.r);
  }

  World.prototype.substep = function (h) {
    var bodies = this.bodies, i, j, k, b;
    var damp = Math.max(0, 1 - DAMPING * h);
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      if (!b.alive) continue;
      b.vy += GRAVITY * h;
      b.vx *= damp; b.vy *= damp;
      var sp2 = b.vx * b.vx + b.vy * b.vy;
      if (sp2 > MAX_SPEED * MAX_SPEED) {
        var f = MAX_SPEED / Math.sqrt(sp2);
        b.vx *= f; b.vy *= f;
      }
      b.px = b.x; b.py = b.y;
      b.x += b.vx * h; b.y += b.vy * h;
    }
    this.touching.length = 0;
    for (k = 0; k < ITERATIONS; k++) {
      var record = k === 0 ? this.touching : null;
      this.buildGrid();
      var g = this.grid;
      for (var cy = 0; cy < GRID_H; cy++) {
        for (var cx = 0; cx < GRID_W; cx++) {
          var cell = g[cy * GRID_W + cx];
          if (!cell.length) continue;
          for (i = 0; i < cell.length; i++) {
            var a = cell[i];
            for (j = i + 1; j < cell.length; j++) solvePair(a, cell[j], record);
            // neighbours: right, and the three cells below
            for (var n = 0; n < 4; n++) {
              var nx = cx + (n === 0 ? 1 : n - 2), ny = cy + (n === 0 ? 0 : 1);
              if (nx < 0 || nx >= GRID_W || ny >= GRID_H) continue;
              var other = g[ny * GRID_W + nx];
              for (j = 0; j < other.length; j++) solvePair(a, other[j], record);
            }
          }
        }
      }
      for (i = 0; i < bodies.length; i++) {
        b = bodies[i];
        if (!b.alive) continue;
        for (j = 0; j < this.segments.length; j++) {
          var s = this.segments[j];
          if (s.active) solveSegment(b, s);
        }
        for (j = 0; j < this.boxes.length; j++) solveBox(b, this.boxes[j]);
      }
    }
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      if (!b.alive) continue;
      b.vx = (b.x - b.px) / h; b.vy = (b.y - b.py) / h;
      var speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (speed < SLEEP_SPEED) b.sleepTimer += h; else b.sleepTimer = 0;
      b.asleep = b.sleepTimer > SLEEP_TIME;
    }
  };

  // Advance one fixed step; onTouch(a, b) is called for every touching pair per sub-step.
  World.prototype.step = function (dt, onTouch) {
    var h = dt / SUBSTEPS;
    for (var s = 0; s < SUBSTEPS; s++) {
      this.substep(h);
      if (onTouch) {
        var t = this.touching;
        for (var i = 0; i < t.length; i += 2) {
          if (t[i].alive && t[i + 1].alive) onTouch(t[i], t[i + 1]);
        }
      }
    }
  };

  World.prototype.isSettled = function () {
    for (var i = 0; i < this.bodies.length; i++) {
      var b = this.bodies[i];
      if (b.alive && !b.asleep) return false;
    }
    return true;
  };

  // Deterministic PRNG (mulberry32) for reproducible spawn jitter.
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  root.HPPhysics = { World: World, makeRng: makeRng };
})(typeof window !== 'undefined' ? window : this);

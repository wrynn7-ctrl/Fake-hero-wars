/*
 * render.js — all procedural Canvas 2D drawing: the hero and every enemy,
 * parallax battle backgrounds per theme, projectiles, particles, floating
 * numbers, the battle HUD (portrait, energy, boss bar), the map parchment,
 * title/hero/result/final backdrops, and small icons for items and skills.
 * Reads simulation state only; decorative randomness uses its own PRNG.
 */
(function (root) {
  'use strict';
  var D = root.HWData;
  var W = 960, H = 540, GROUND = 388, DEPTH = 40;
  var cv = null, ctx = null, res = 1;
  var deco = root.HWRng.create(0xdec0);

  // ---------------------------------------------------------------- utils
  var tint = 0, tintCache = {};
  function hexToRgb(h) {
    var n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    var x = hexToRgb(a), y = hexToRgb(b);
    return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * t) + ',' + Math.round(x[1] + (y[1] - x[1]) * t) + ',' + Math.round(x[2] + (y[2] - x[2]) * t) + ')';
  }
  // Colour through the current hurt-flash tint.
  function C(hex) {
    if (tint <= 0) return hex;
    var k = hex + (Math.round(tint * 10));
    return tintCache[k] || (tintCache[k] = mix(hex, '#ffffff', Math.round(tint * 10) / 10));
  }
  function hash(n) {
    n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4);
    n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15);
    return (n >>> 0) / 4294967296;
  }
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }
  function circle(c, x, y, r, fill) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); }
  function ellipse(c, x, y, rx, ry, fill) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); }
  function line(c, x1, y1, x2, y2, w, col) {
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineWidth = w; c.strokeStyle = col; c.lineCap = 'round'; c.stroke();
  }
  function poly(c, pts, fill, stroke, lw) {
    c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.lineWidth = lw || 1; c.strokeStyle = stroke; c.stroke(); }
  }
  // A limb from (x,y) at angle a with length l; returns the end point.
  function limb(c, x, y, a, l, w, col) {
    var ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l;
    line(c, x, y, ex, ey, w, col);
    return [ex, ey];
  }
  function text(c, s, x, y, size, col, align, weight, stroke) {
    c.font = (weight || 'bold') + ' ' + size + 'px "Trebuchet MS", "DejaVu Sans", sans-serif';
    c.textAlign = align || 'center';
    c.textBaseline = 'middle';
    if (stroke) { c.lineWidth = stroke; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.lineJoin = 'round'; c.strokeText(s, x, y); }
    c.fillStyle = col;
    c.fillText(s, x, y);
  }
  function feetY(depth) { return GROUND + depth * DEPTH; }
  function depthScale(depth) { return 0.94 + depth * 0.1; }

  // ---------------------------------------------------------------- hero
  /*
   * Aldric, facing right, origin at his feet, ~105 px tall at scale 1.
   * pose: { t, walk, moving, swing (0..1 or -1), kind, leap (0..1 or -1),
   *         hurt, dead (0..1), victory, rank }
   */
  function drawHero(c, pose) {
    var t = pose.t || 0, mv = pose.moving || 0, ph = pose.walk || 0;
    var rankCol = D.RANKS[pose.rank || 0].color;
    tint = pose.hurt || 0;
    c.save();
    if (pose.dead > 0) {
      c.rotate(-Math.min(1, pose.dead) * 1.42);
      c.globalAlpha *= 1 - Math.min(1, pose.dead) * 0.25;
    }
    var bob = -Math.abs(Math.sin(ph)) * 2.5 * mv + Math.sin(t * 2.2) * 0.8 * (1 - mv);
    var leaping = pose.leap >= 0;
    var legA = Math.sin(ph) * 0.55 * mv, tuck = leaping ? 0.7 : 0;
    c.translate(0, bob);

    // Cape (behind everything).
    var wave = mv * 7 + Math.sin(t * 4.3) * 3 + (leaping ? 12 : 0);
    var cg = c.createLinearGradient(-10, -78, -30, -12);
    cg.addColorStop(0, C('#b3242c')); cg.addColorStop(1, C('#5e0f16'));
    c.beginPath();
    c.moveTo(-13, -77);
    c.quadraticCurveTo(-26 - wave * 0.6, -50, -36 - wave, -14 + Math.sin(t * 5) * 2);
    c.quadraticCurveTo(-22 - wave * 0.6, -6, -8, -16);
    c.lineTo(6, -76);
    c.closePath();
    c.fillStyle = cg; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = C('#3a070c'); c.stroke();

    // Legs: back then front.
    function leg(hx, a, dark) {
      var knee = limb(c, hx, -42, Math.PI / 2 + a - tuck * 0.6, 21, 10, C(dark ? '#7b8592' : '#aab4c0'));
      var foot = limb(c, knee[0], knee[1], Math.PI / 2 + a * 0.6 + tuck, 19, 9, C(dark ? '#6a7480' : '#97a2ae'));
      rr(c, foot[0] - 5, foot[1] - 5, 15, 7, 3);
      c.fillStyle = C(dark ? '#3b2a1e' : '#4e3726'); c.fill();
    }
    leg(-4, legA, true);
    leg(5, -legA, false);

    // Torso: steel cuirass + tabard.
    var tg = c.createLinearGradient(-16, -80, 16, -38);
    tg.addColorStop(0, C('#e6ebf1')); tg.addColorStop(0.5, C('#a9b3bf')); tg.addColorStop(1, C('#6c7684'));
    poly(c, [-17, -79, 17, -79, 13, -40, -13, -40], tg, C('#454c57'), 1.5);
    poly(c, [-8, -72, 8, -72, 9, -30, 0, -25, -9, -30], C('#2a4fa0'), C('#16285a'), 1);
    line(c, -8, -72, 8, -72, 2, C('#e8c25a'));
    circle(c, 0, -60, 5.5, C('#e8c25a'));
    circle(c, 0, -60, 3, C(rankCol));
    rr(c, -14, -44, 28, 5, 2); c.fillStyle = C('#5a3b22'); c.fill();
    circle(c, 0, -41.5, 2.4, C('#e8c25a'));
    // Pauldrons.
    circle(c, -13, -76, 7, C('#c4ccd6'));
    circle(c, 14, -76, 7.5, C('#d7dde5'));
    c.beginPath(); c.arc(14, -76, 7.5, Math.PI, 0); c.lineWidth = 2; c.strokeStyle = C('#e8c25a'); c.stroke();

    // Shield arm (front).
    var sw = pose.swing >= 0 ? pose.swing : -1;
    var bashOff = pose.kind === 'bash' && sw >= 0 ? Math.sin(sw * Math.PI) * 16 : 0;
    var shieldLow = pose.victory ? 8 : 0;
    var sx = 17 + bashOff, sy = -58 + shieldLow;
    line(c, 12, -72, sx - 2, sy, 8, C('#9aa5b2'));
    c.save();
    c.translate(sx, sy);
    c.rotate(-0.08 + bashOff * 0.01);
    var sg = c.createLinearGradient(-12, -18, 12, 18);
    sg.addColorStop(0, C('#3f6fd0')); sg.addColorStop(1, C('#1d3778'));
    c.beginPath();
    c.moveTo(-12, -17); c.lineTo(12, -17); c.quadraticCurveTo(13, 6, 0, 20); c.quadraticCurveTo(-13, 6, -12, -17);
    c.closePath(); c.fillStyle = sg; c.fill();
    c.lineWidth = 3; c.strokeStyle = C('#e1b84a'); c.stroke();
    line(c, 0, -13, 0, 13, 3.5, C('#f3efe2'));
    line(c, -8, -4, 8, -4, 3.5, C('#f3efe2'));
    circle(c, 0, -4, 2.5, C('#e1b84a'));
    c.restore();

    // Head: great helm with gold band, visor and plume.
    var hx = 3, hy = -91;
    var plumeWave = Math.sin(t * 6) * 2 + mv * 3 + (leaping ? 5 : 0);
    for (var p = 0; p < 4; p++) {
      c.beginPath();
      c.moveTo(hx - 1, hy - 12);
      c.quadraticCurveTo(hx - 12 - p * 2, hy - 26 + p * 3, hx - 26 - plumeWave - p * 2, hy - 12 + p * 4);
      c.lineWidth = 5 - p; c.lineCap = 'round';
      c.strokeStyle = C(p % 2 ? '#f2f2f2' : '#d22b33'); c.stroke();
    }
    var hg = c.createLinearGradient(hx - 12, hy - 12, hx + 12, hy + 12);
    hg.addColorStop(0, C('#f0f3f7')); hg.addColorStop(1, C('#7e8896'));
    c.beginPath();
    c.moveTo(hx - 11, hy + 10); c.lineTo(hx - 12, hy - 4); c.quadraticCurveTo(hx - 10, hy - 14, hx, hy - 14);
    c.quadraticCurveTo(hx + 12, hy - 13, hx + 13, hy - 2); c.lineTo(hx + 12, hy + 10); c.closePath();
    c.fillStyle = hg; c.fill(); c.lineWidth = 1.5; c.strokeStyle = C('#454c57'); c.stroke();
    line(c, hx - 12, hy - 5, hx + 13, hy - 5, 2.5, C('#e1b84a'));
    line(c, hx + 2, hy - 1, hx + 13, hy - 1, 2.5, C('#1b1f27'));
    line(c, hx + 8, hy - 3, hx + 8, hy + 8, 2, C('#1b1f27'));

    // Sword arm (drawn last so swings read clearly).
    var a = -0.95, k = pose.kind;
    if (pose.victory) a = -1.62 + Math.sin(t * 3) * 0.05;
    else if (leaping) a = -2.0 - pose.leap * 0.9;
    else if (sw >= 0 && k === 'slam') a = sw < 0.25 ? -2.9 : sw < 0.55 ? -2.9 + (sw - 0.25) / 0.3 * 4.2 : 1.3 - (sw - 0.55) / 0.45 * 2.25;
    else if (sw >= 0 && k === 'slash') a = sw < 0.3 ? -0.95 - sw / 0.3 * 1.6 : sw < 0.6 ? -2.55 + (sw - 0.3) / 0.3 * 3.3 : 0.75 - (sw - 0.6) / 0.4 * 1.7;
    else a += Math.sin(t * 2.2) * 0.04;
    var shx = -3, shy = -73;
    var hand = limb(c, shx, shy, a + 0.9, 13, 8, C('#9aa5b2'));
    hand = limb(c, hand[0], hand[1], a, 11, 7, C('#b7c0cb'));
    c.save();
    c.translate(hand[0], hand[1]);
    c.rotate(a);
    rr(c, -7, -2.5, 10, 5, 2); c.fillStyle = C('#5a3b22'); c.fill();
    circle(c, -8, 0, 3, C('#e1b84a'));
    rr(c, 2, -8, 4, 16, 1.5); c.fillStyle = C('#e1b84a'); c.fill();
    var bg = c.createLinearGradient(0, -3, 0, 3);
    bg.addColorStop(0, C('#ffffff')); bg.addColorStop(1, C('#9aa6b4'));
    poly(c, [6, -3.2, 52, -2.2, 58, 0, 52, 2.2, 6, 3.2], bg, C('#5d6672'), 1);
    line(c, 8, 0, 48, 0, 1, C('#7b8794'));
    c.restore();
    if (sw >= 0 && (k === 'slash' || k === 'slam') && sw > 0.28 && sw < 0.62) {
      // Swing arc trail.
      c.beginPath();
      c.arc(shx, shy, 64, -2.4, a + 0.1);
      c.lineWidth = k === 'slam' ? 8 : 5;
      c.strokeStyle = k === 'slam' ? 'rgba(255,220,120,0.55)' : 'rgba(255,255,255,0.45)';
      c.stroke();
    }
    c.restore();
    tint = 0;
  }

  // ---------------------------------------------------------------- enemies
  // All enemies are drawn facing right around their feet; drawUnit mirrors them.
  function swingAngle(sw, rest, back, fwd) {
    if (sw < 0) return rest;
    if (sw < 0.35) return rest + (back - rest) * (sw / 0.35);
    if (sw < 0.6) return back + (fwd - back) * ((sw - 0.35) / 0.25);
    return fwd + (rest - fwd) * ((sw - 0.6) / 0.4);
  }
  function simpleLegs(c, hip, len, w, colA, colB, ph, mv, spread) {
    var a = Math.sin(ph) * 0.6 * mv;
    var k1 = limb(c, -spread, hip, Math.PI / 2 + a, len * 0.55, w, colA);
    limb(c, k1[0], k1[1], Math.PI / 2 + a * 0.5, len * 0.5, w * 0.9, colA);
    var k2 = limb(c, spread, hip, Math.PI / 2 - a, len * 0.55, w, colB);
    limb(c, k2[0], k2[1], Math.PI / 2 - a * 0.5, len * 0.5, w * 0.9, colB);
  }
  function eyes(c, x, y, col, r) {
    circle(c, x, y, r || 2, col);
    c.save(); c.globalAlpha *= 0.35; circle(c, x, y, (r || 2) * 2.4, col); c.restore();
  }

  var ENEMY_ART = {
    goblin: { h: 58, draw: function (c, p) {
      simpleLegs(c, -20, 22, 6, C('#3f7a2a'), C('#4f9234'), p.walk, p.moving, 5);
      poly(c, [-12, -40, 12, -40, 10, -18, -10, -18], C('#7a5530'), C('#4a321b'), 1);
      line(c, -10, -24, 10, -24, 3, C('#5a3b22'));
      var a = swingAngle(p.swing, -0.3, -1.9, 0.9);
      var h = limb(c, 8, -36, a + 0.6, 12, 5, C('#5fae3e'));
      c.save(); c.translate(h[0], h[1]); c.rotate(a);
      poly(c, [0, -2, 18, 0, 0, 2], C('#d9dde3'), C('#7b828c'), 1);
      rr(c, -4, -2, 5, 4, 1); c.fillStyle = C('#4a321b'); c.fill();
      c.restore();
      limb(c, -9, -36, 2.2, 13, 5, C('#4f9234'));
      // Head with long ears.
      poly(c, [-6, -50, -24, -60, -8, -44], C('#5fae3e'), C('#2f5d1e'), 1);
      poly(c, [8, -50, 22, -62, 10, -44], C('#6fbe4c'), C('#2f5d1e'), 1);
      circle(c, 1, -48, 11, C('#6fbe4c'));
      poly(c, [8, -48, 15, -45, 8, -43], C('#5fae3e'));
      eyes(c, 5, -51, '#ffe14a', 2);
      line(c, 1, -43, 8, -42, 1.5, C('#2f5d1e'));
    } },
    archer: { h: 60, draw: function (c, p) {
      simpleLegs(c, -20, 22, 6, C('#3f7a2a'), C('#4f9234'), p.walk, p.moving, 5);
      poly(c, [-12, -42, 12, -42, 10, -18, -10, -18], C('#3e5a2a'), C('#22331a'), 1);
      // Quiver.
      rr(c, -17, -46, 7, 22, 2); c.fillStyle = C('#6b4527'); c.fill();
      line(c, -15, -46, -18, -54, 2, C('#e8e0c8')); line(c, -12, -46, -12, -55, 2, C('#e8e0c8'));
      // Bow, drawn back during the shot.
      var draw = p.swing >= 0 ? Math.sin(Math.min(1, p.swing * 1.6) * Math.PI) : 0;
      c.beginPath(); c.arc(12, -34, 17, -1.25, 1.25); c.lineWidth = 3; c.strokeStyle = C('#8a5a2b'); c.stroke();
      line(c, 12 + Math.cos(-1.25) * 17, -34 + Math.sin(-1.25) * 17, 4 - draw * 8, -34, 1, C('#eeeeee'));
      line(c, 4 - draw * 8, -34, 12 + Math.cos(1.25) * 17, -34 + Math.sin(1.25) * 17, 1, C('#eeeeee'));
      if (draw > 0.2) line(c, 4 - draw * 8, -34, 26, -34, 1.5, C('#c9b48a'));
      limb(c, 6, -38, 0.1, 18, 4.5, C('#5fae3e'));
      limb(c, -4, -38, 0.2, 10 - draw * 6, 4.5, C('#4f9234'));
      // Hooded head.
      circle(c, 1, -50, 11, C('#2f4a22'));
      circle(c, 4, -49, 7.5, C('#6fbe4c'));
      poly(c, [-8, -58, 2, -66, 8, -56], C('#2f4a22'));
      eyes(c, 7, -51, '#ffe14a', 1.8);
    } },
    wolf: { h: 46, draw: function (c, p) {
      var ph = p.walk, mv = p.moving, lunge = p.swing >= 0 ? Math.sin(p.swing * Math.PI) * 10 : 0;
      c.save(); c.translate(lunge * 0.5, 0);
      // Tail.
      c.beginPath(); c.moveTo(-28, -30); c.quadraticCurveTo(-46, -36 + Math.sin(p.t * 6) * 4, -50, -22);
      c.lineWidth = 7; c.lineCap = 'round'; c.strokeStyle = C('#5a616c'); c.stroke();
      // Legs (four, alternating).
      [[-20, 1], [-14, -1], [16, -1], [22, 1]].forEach(function (lg, i) {
        var a = Math.sin(ph + (i % 2 ? Math.PI : 0)) * 0.55 * mv;
        var k = limb(c, lg[0], -24, Math.PI / 2 + a, 12, 6, C(i < 2 ? '#5a616c' : '#6d7480'));
        limb(c, k[0], k[1], Math.PI / 2 - a * 0.4, 12, 5, C(i < 2 ? '#4a5059' : '#5a616c'));
      });
      var bg = c.createLinearGradient(0, -40, 0, -18);
      bg.addColorStop(0, C('#8a919b')); bg.addColorStop(1, C('#565c66'));
      ellipse(c, 0, -30, 31, 12, bg);
      // Mane + head.
      ellipse(c, 22, -36, 12, 13, C('#7b828c'));
      c.save(); c.translate(30 + lunge * 0.4, -38); c.rotate(p.swing >= 0 ? 0.25 : 0.05);
      poly(c, [-6, -8, 22, -2, 22, 4, -6, 8], C('#8a919b'), C('#3d424a'), 1);
      poly(c, [-4, -8, 0, -18, 5, -8], C('#6d7480'));
      if (p.swing >= 0) { poly(c, [8, 4, 22, 4, 18, 9], C('#3a0d10')); line(c, 12, 4, 13, 7, 1.5, '#fff'); }
      eyes(c, 6, -2, '#ff3b30', 1.8);
      circle(c, 22, 0, 2.2, C('#1b1f27'));
      c.restore();
      c.restore();
    } },
    skeleton: { h: 92, draw: function (c, p) {
      var bone = C('#e9e3cf'), dark = C('#8c8572');
      simpleLegs(c, -42, 40, 4, dark, bone, p.walk, p.moving, 5);
      line(c, -8, -42, 8, -42, 4, bone);
      line(c, 0, -44, 0, -72, 3.5, bone);
      for (var r = 0; r < 4; r++) {
        c.beginPath(); c.ellipse(0, -66 + r * 6, 11 - r, 3, 0, Math.PI * 0.05, Math.PI * 0.95);
        c.lineWidth = 2.2; c.strokeStyle = bone; c.stroke();
      }
      // Round shield (front arm).
      limb(c, 6, -70, 1.0, 14, 3.5, bone);
      var sg = c.createRadialGradient(17, -55, 2, 17, -55, 15);
      sg.addColorStop(0, C('#9c7a4a')); sg.addColorStop(1, C('#5a4026'));
      circle(c, 17, -55, 15, sg);
      c.beginPath(); c.arc(17, -55, 15, 0, Math.PI * 2); c.lineWidth = 3; c.strokeStyle = C('#8f969e'); c.stroke();
      circle(c, 17, -55, 4, C('#b9c0c8'));
      // Head.
      circle(c, 2, -82, 10.5, bone);
      rr(c, -2, -76, 11, 6, 2); c.fillStyle = bone; c.fill();
      circle(c, 5, -83, 3, C('#1b1b1b')); circle(c, -2, -83, 2.5, C('#1b1b1b'));
      eyes(c, 5, -83, '#7af0ff', 1.2);
      line(c, 0, -74, 8, -74, 1, C('#555'));
      // Sword arm.
      var a = swingAngle(p.swing, -1.1, -2.4, 0.7);
      var h = limb(c, -6, -70, a + 0.8, 13, 3.5, bone);
      c.save(); c.translate(h[0], h[1]); c.rotate(a);
      rr(c, -3, -6, 3, 12, 1); c.fillStyle = C('#6b5a3a'); c.fill();
      poly(c, [0, -2.5, 36, -1.5, 40, 0, 36, 1.5, 0, 2.5], C('#a7a08e'), C('#5d584c'), 1);
      c.restore();
    } },
    skmage: { h: 94, draw: function (c, p) {
      var bone = C('#e9e3cf');
      var sway = Math.sin(p.walk) * 2 * p.moving;
      var rg = c.createLinearGradient(0, -74, 0, 0);
      rg.addColorStop(0, C('#6a3fa0')); rg.addColorStop(1, C('#2c1648'));
      poly(c, [-9, -72, 9, -72, 18 + sway, 0, -18 + sway, 0], rg, C('#1d0e30'), 1.5);
      line(c, -10, -60, 10, -60, 2, C('#c9a640'));
      // Staff with orb.
      var a = p.swing >= 0 ? -0.4 - Math.sin(p.swing * Math.PI) * 0.6 : -0.15;
      c.save(); c.translate(14, -54); c.rotate(a);
      line(c, 0, 30, 0, -34, 3, C('#5a3b22'));
      var glow = 0.6 + 0.4 * Math.sin(p.t * 5);
      c.save(); c.globalAlpha *= 0.4 * glow; circle(c, 0, -38, 12, '#c58bff'); c.restore();
      circle(c, 0, -38, 6, C('#e2c4ff'));
      c.restore();
      limb(c, 6, -66, 0.9, 16, 3.5, bone);
      // Hooded skull.
      circle(c, 1, -82, 13, C('#3a1f5c'));
      circle(c, 3, -81, 9, bone);
      circle(c, 6, -82, 2.6, C('#1b1b1b')); circle(c, 0, -82, 2.3, C('#1b1b1b'));
      eyes(c, 6, -82, '#d78bff', 1.3);
      poly(c, [-10, -88, 0, -100, 12, -88], C('#3a1f5c'));
    } },
    brute: { h: 104, draw: function (c, p) {
      var skin = C('#6f7f3a'), skinD = C('#566430');
      simpleLegs(c, -40, 40, 11, skinD, skin, p.walk, p.moving, 9);
      rr(c, -16, -46, 32, 12, 4); c.fillStyle = C('#4b3420'); c.fill();
      var tg = c.createLinearGradient(-22, -92, 22, -40);
      tg.addColorStop(0, C('#83943f')); tg.addColorStop(1, C('#55632c'));
      c.beginPath(); c.ellipse(0, -66, 23, 27, 0, 0, Math.PI * 2); c.fillStyle = tg; c.fill();
      line(c, -18, -86, 16, -48, 4, C('#5a3b22'));
      // Shoulder pads with spikes.
      circle(c, -16, -84, 10, C('#6b6f78'));
      circle(c, 18, -84, 11, C('#7d828c'));
      poly(c, [14, -94, 18, -106, 22, -94], C('#c9ccd2'));
      // Head.
      circle(c, 4, -96, 12, skin);
      eyes(c, 9, -99, '#ff5a2a', 1.8);
      poly(c, [8, -88, 10, -82, 12, -88], C('#f3ead2'));
      poly(c, [14, -88, 16, -83, 17, -89], C('#f3ead2'));
      line(c, -6, -104, 12, -104, 3, C('#3a2a1a'));
      // Spiked club.
      var a = swingAngle(p.swing, -1.2, -2.6, 0.9);
      var h = limb(c, 14, -80, a + 0.7, 20, 9, skin);
      c.save(); c.translate(h[0], h[1]); c.rotate(a);
      poly(c, [-2, -3, 40, -8, 44, 0, 40, 8, -2, 3], C('#7a5530'), C('#3e2a16'), 1.5);
      [12, 22, 32, 40].forEach(function (x, i) { poly(c, [x, i % 2 ? 7 : -7, x + 3, i % 2 ? 13 : -13, x + 6, i % 2 ? 7 : -7], C('#c9ccd2')); });
      c.restore();
      limb(c, -14, -80, 2.0, 24, 9, skinD);
    } },
    cultist: { h: 90, draw: function (c, p) {
      var sway = Math.sin(p.walk) * 2 * p.moving;
      var rg = c.createLinearGradient(0, -78, 0, 0);
      rg.addColorStop(0, C('#7a1426')); rg.addColorStop(1, C('#2e0610'));
      poly(c, [-10, -76, 10, -76, 19 + sway, 0, -19 + sway, 0], rg, C('#1a0308'), 1.5);
      line(c, 0, -70, 0, -6, 2, C('#c9a640'));
      var a = p.swing >= 0 ? -0.5 - Math.sin(p.swing * Math.PI) * 0.7 : -0.1;
      c.save(); c.translate(15, -56); c.rotate(a);
      line(c, 0, 34, 0, -32, 3, C('#2e1a10'));
      poly(c, [0, -46, 6, -36, 0, -28, -6, -36], C('#ff3355'), C('#7a0a1c'), 1);
      c.save(); c.globalAlpha *= 0.35 + 0.25 * Math.sin(p.t * 4); circle(c, 0, -37, 11, '#ff3355'); c.restore();
      c.restore();
      limb(c, 6, -68, 1.0, 16, 4, C('#5a0f1c'));
      // Hood with glowing eyes in the dark.
      c.beginPath(); c.moveTo(-12, -72); c.quadraticCurveTo(-12, -100, 4, -102); c.quadraticCurveTo(15, -96, 13, -72); c.closePath();
      c.fillStyle = C('#5a0f1c'); c.fill();
      ellipse(c, 4, -84, 7, 9, '#0d0204');
      eyes(c, 2, -85, '#ff2a2a', 1.5); eyes(c, 7, -85, '#ff2a2a', 1.5);
    } },
    assassin: { h: 86, draw: function (c, p) {
      var cloth = C('#22283d'), clothD = C('#171b2b');
      simpleLegs(c, -38, 38, 6, clothD, cloth, p.walk, p.moving, 4);
      poly(c, [-10, -70, 11, -70, 9, -36, -9, -36], cloth, C('#0b0d16'), 1);
      line(c, -9, -40, 9, -40, 3, C('#5a3b22'));
      // Scarf trailing behind.
      var sw2 = Math.sin(p.t * 7) * 3 + p.moving * 6;
      poly(c, [-6, -74, -30 - sw2, -70 + sw2 * 0.4, -26 - sw2, -64, -4, -68], C('#c4202e'));
      // Daggers.
      var a = swingAngle(p.swing, -0.4, -1.8, 1.0);
      [[8, a], [-6, a + 0.8]].forEach(function (d, i) {
        var h = limb(c, d[0], -66, d[1] + 0.6, 14, 4.5, i ? clothD : cloth);
        c.save(); c.translate(h[0], h[1]); c.rotate(d[1]);
        poly(c, [0, -2, 16, 0, 0, 2], C('#e6eaf0'), C('#6f7680'), 1);
        c.restore();
      });
      // Masked head.
      circle(c, 2, -80, 10, cloth);
      rr(c, -6, -84, 17, 5, 2); c.fillStyle = C('#d9b38c'); c.fill();
      eyes(c, 7, -82, '#ffd84a', 1.5);
      poly(c, [-7, -86, 10, -92, 12, -86], C('#c4202e'));
    } },
    troll: { h: 128, draw: function (c, p) {
      var skin = C('#6f8a8f'), skinD = C('#55696d');
      simpleLegs(c, -44, 44, 15, skinD, skin, p.walk, p.moving, 12);
      rr(c, -18, -52, 36, 16, 5); c.fillStyle = C('#5b4630'); c.fill();
      var tg = c.createRadialGradient(-4, -86, 8, 0, -76, 40);
      tg.addColorStop(0, C('#86a3a8')); tg.addColorStop(1, C('#4e6266'));
      c.beginPath(); c.ellipse(0, -78, 30, 34, -0.2, 0, Math.PI * 2); c.fillStyle = tg; c.fill();
      // Small head low on the shoulders.
      circle(c, 18, -102, 13, skin);
      eyes(c, 24, -105, '#ffe14a', 2);
      poly(c, [22, -94, 24, -86, 27, -95], C('#f3ead2'));
      // Long arms with a log club.
      var a = swingAngle(p.swing, 1.1, -1.6, 1.4);
      var h = limb(c, 22, -94, a + 0.2, 30, 13, skin);
      c.save(); c.translate(h[0], h[1]); c.rotate(a);
      rr(c, -4, -7, 44, 14, 6); c.fillStyle = C('#6b4a2a'); c.fill();
      circle(c, 40, 0, 9, C('#7a5530'));
      c.restore();
      limb(c, -22, -92, 1.9, 40, 13, skinD);
    } },
    harpy: { h: 64, fly: 78, draw: function (c, p) {
      var flap = Math.sin(p.t * 11) * 0.7;
      function wing(dir, col) {
        c.save(); c.translate(-2, -46); c.rotate(-0.4 * dir + flap * dir);
        poly(c, [0, 0, -46, -18, -52, -6, -40, 4, -26, 6, -8, 8], col, C('#3c1530'), 1);
        c.restore();
      }
      wing(1, C('#7d3768'));
      // Talons swing forward when attacking.
      var a = p.swing >= 0 ? 0.6 - Math.sin(p.swing * Math.PI) * 1.2 : 0.9;
      var k = limb(c, -2, -30, a + 0.6, 14, 4, C('#d6a640'));
      limb(c, k[0], k[1], a, 10, 3, C('#d6a640'));
      var bg = c.createLinearGradient(0, -60, 0, -26);
      bg.addColorStop(0, C('#c2669c')); bg.addColorStop(1, C('#7d3768'));
      ellipse(c, 0, -44, 12, 18, bg);
      circle(c, 6, -64, 9, C('#e3a6c4'));
      poly(c, [12, -66, 22, -62, 12, -60], C('#e8b040'));
      eyes(c, 9, -66, '#ff3b30', 1.5);
      poly(c, [-2, -72, -18, -82 + flap * 4, -6, -66], C('#4a1d3c'));
      wing(-1, C('#a14a84'));
    } },
    gorruk: { h: 150, scale: 1.0, draw: function (c, p) {
      var skin = C('#557034'), skinD = C('#42582a');
      simpleLegs(c, -56, 56, 15, skinD, skin, p.walk, p.moving, 12);
      // Fur cape.
      poly(c, [-26, -126, -46 - p.moving * 6, -40, -14, -50], C('#6b4a2a'), C('#3b2814'), 1.5);
      rr(c, -22, -66, 44, 16, 5); c.fillStyle = C('#4b3420'); c.fill();
      circle(c, 0, -58, 6, C('#d0a43a'));
      var tg = c.createLinearGradient(-30, -130, 30, -60);
      tg.addColorStop(0, C('#6c8a40')); tg.addColorStop(1, C('#435a28'));
      c.beginPath(); c.ellipse(0, -92, 30, 36, 0, 0, Math.PI * 2); c.fillStyle = tg; c.fill();
      // War paint.
      line(c, -12, -104, 6, -84, 4, C('#c2262e')); line(c, -2, -110, 16, -90, 4, C('#c2262e'));
      // Iron pauldrons with spikes.
      circle(c, -22, -118, 14, C('#5d626b'));
      circle(c, 24, -118, 15, C('#737985'));
      [[16, -130], [26, -134], [34, -128]].forEach(function (s) { poly(c, [s[0] - 3, s[1] + 4, s[0], s[1] - 10, s[0] + 3, s[1] + 4], C('#d8dbe0')); });
      // Head with horned helmet.
      circle(c, 6, -134, 15, skin);
      eyes(c, 12, -137, '#ff3b1a', 2.4);
      poly(c, [12, -124, 14, -116, 17, -125], C('#f3ead2'));
      c.beginPath(); c.arc(6, -138, 15, Math.PI, 0); c.fillStyle = C('#5d626b'); c.fill();
      poly(c, [-8, -142, -26, -164, -12, -146], C('#e8dfc6'));
      poly(c, [18, -142, 34, -166, 24, -146], C('#e8dfc6'));
      // Great axe.
      var a = swingAngle(p.swing, -1.3, -2.8, 1.0);
      var h = limb(c, 18, -112, a + 0.7, 26, 12, skin);
      c.save(); c.translate(h[0], h[1]); c.rotate(a);
      line(c, -10, 0, 58, 0, 5, C('#5a3b22'));
      c.beginPath(); c.moveTo(42, -2); c.quadraticCurveTo(52, -30, 66, -26); c.lineTo(66, 26); c.quadraticCurveTo(52, 30, 42, 2); c.closePath();
      var ag = c.createLinearGradient(42, -26, 66, 26); ag.addColorStop(0, C('#e6eaf0')); ag.addColorStop(1, C('#7c8590'));
      c.fillStyle = ag; c.fill(); c.lineWidth = 2; c.strokeStyle = C('#4a4f57'); c.stroke();
      c.restore();
      limb(c, -20, -112, 2.1, 30, 12, skinD);
    } },
    morvane: { h: 160, fly: 14, draw: function (c, p) {
      var t = p.t, hover = Math.sin(t * 2) * 4;
      c.translate(0, hover);
      // Flowing robe.
      var rg = c.createLinearGradient(0, -130, 0, 0);
      rg.addColorStop(0, C('#1f5f63')); rg.addColorStop(1, C('#0b1f24'));
      c.beginPath();
      c.moveTo(-14, -126); c.lineTo(14, -126);
      c.quadraticCurveTo(30, -60, 34 + Math.sin(t * 3) * 4, 0);
      for (var i = 0; i < 5; i++) c.lineTo(26 - i * 15, (i % 2 ? -12 : 0) + Math.sin(t * 4 + i) * 2);
      c.quadraticCurveTo(-30, -60, -14, -126);
      c.closePath(); c.fillStyle = rg; c.fill(); c.lineWidth = 2; c.strokeStyle = C('#0a1416'); c.stroke();
      line(c, -12, -120, 12, -120, 3, C('#7cf0b0'));
      poly(c, [-6, -114, 6, -114, 0, -60], C('#123a3e'));
      // Bony arms and staff.
      var a = p.swing >= 0 ? -0.5 - Math.sin(p.swing * Math.PI) * 0.8 : -0.2;
      c.save(); c.translate(26, -96); c.rotate(a);
      line(c, 0, 50, 0, -50, 4, C('#2c2430'));
      circle(c, 0, -56, 9, C('#e9e3cf'));
      circle(c, 3, -57, 2, '#111'); circle(c, -3, -57, 2, '#111');
      c.save(); c.globalAlpha *= 0.45 + 0.25 * Math.sin(t * 6); circle(c, 0, -60, 17, '#59ff9c'); c.restore();
      c.restore();
      limb(c, 8, -116, 0.7, 26, 4, C('#d8d2bf'));
      limb(c, -8, -116, 2.2, 22, 4, C('#c8c2af'));
      // Skull face, glowing eyes, spiked crown.
      circle(c, 2, -138, 14, C('#ece6d4'));
      rr(c, -5, -130, 14, 7, 2); c.fillStyle = C('#ece6d4'); c.fill();
      eyes(c, 7, -140, '#59ff9c', 2.6); eyes(c, -2, -140, '#59ff9c', 2.2);
      poly(c, [-12, -148, -12, -170, -6, -154, 0, -176, 6, -154, 12, -172, 15, -148], C('#9ad8c0'), C('#2a5a50'), 1.5);
      circle(c, 0, -156, 2.6, '#59ff9c');
      // Phase 2 shield bubble.
      if (p.shield > 0) {
        var sa = 0.25 + 0.2 * p.shield + 0.08 * Math.sin(t * 8);
        var g = c.createRadialGradient(0, -80, 30, 0, -80, 96);
        g.addColorStop(0, 'rgba(120,240,255,0)'); g.addColorStop(1, 'rgba(120,240,255,' + sa + ')');
        ellipse(c, 0, -80, 70, 96, g);
        c.beginPath(); c.ellipse(0, -80, 70, 96, 0, 0, Math.PI * 2); c.lineWidth = 2; c.strokeStyle = 'rgba(190,250,255,' + (sa + 0.3) + ')'; c.stroke();
      }
    } }
  };

  function enemyHeight(type) { return ENEMY_ART[type].h + (ENEMY_ART[type].fly || 0); }

  // Draw one enemy (facing left toward the hero) at a screen position.
  function drawEnemyAt(c, type, x, y, s, pose) {
    var art = ENEMY_ART[type];
    c.save();
    c.translate(x, y - (art.fly || 0) * s);
    c.scale(-s, s);
    if (pose.dead > 0) {
      c.globalAlpha *= Math.max(0, 1 - pose.dead);
      c.translate(0, pose.dead * 8);
      c.rotate(pose.dead * 0.5);
    }
    tint = pose.hurt || 0;
    art.draw(c, pose);
    tint = 0;
    c.restore();
  }

  // ---------------------------------------------------------------- backgrounds
  function skyGrad(c, stops) {
    var g = c.createLinearGradient(0, 0, 0, GROUND);
    stops.forEach(function (s, i) { g.addColorStop(i / (stops.length - 1), s); });
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  // Repeat fn over a parallax layer: one element per `sp` pixels of world.
  function tile(c, off, sp, seed, fn) {
    var k0 = Math.floor(off / sp) - 1, k1 = Math.floor((off + W) / sp) + 1;
    for (var k = k0; k <= k1; k++) fn(c, k * sp - off, k, hash(k * 7919 + seed), hash(k * 104729 + seed * 3));
  }
  function pine(c, x, base, h, col, snow) {
    line(c, x, base, x, base - h * 0.25, h * 0.08, '#4a3020');
    for (var i = 0; i < 3; i++) {
      var y = base - h * 0.2 - i * h * 0.24, w = h * (0.34 - i * 0.08);
      poly(c, [x - w, y, x, y - h * 0.42, x + w, y], col);
      if (snow) poly(c, [x - w * 0.45, y - h * 0.22, x, y - h * 0.42, x + w * 0.45, y - h * 0.22], snow);
    }
  }
  function groundFill(c, top, cols) {
    var g = c.createLinearGradient(0, top, 0, H);
    cols.forEach(function (s, i) { g.addColorStop(i / (cols.length - 1), s); });
    c.fillStyle = g; c.fillRect(0, top, W, H - top);
  }

  var THEME_ART = {
    forest: function (c, cam, t) {
      skyGrad(c, ['#7cc4f5', '#cdeeff', '#fdf0c4']);
      circle(c, 160, 90, 34, 'rgba(255,250,220,0.9)');
      tile(c, cam * 0.05, 260, 1, function (c, x, k, r) { ellipse(c, x + r * 80, 60 + r * 50, 60 + r * 30, 14, 'rgba(255,255,255,0.75)'); });
      tile(c, cam * 0.15, 300, 2, function (c, x, k, r, q) {
        ellipse(c, x + 150, 345, 220, 90 + r * 50, '#8fb6c9');
        if (k % 4 === 0) {
          var cx = x + 120, cy = 300 - r * 40;
          poly(c, [cx - 30, cy + 40, cx - 30, cy, cx + 30, cy, cx + 30, cy + 40], '#6e93a8');
          [-30, 18].forEach(function (o) { poly(c, [cx + o, cy, cx + o, cy - 34, cx + o + 12, cy - 34, cx + o + 12, cy], '#6e93a8'); poly(c, [cx + o - 3, cy - 34, cx + o + 6, cy - 50, cx + o + 15, cy - 34], '#5a7d92'); });
        }
      });
      tile(c, cam * 0.45, 70, 3, function (c, x, k, r, q) {
        if (r < 0.55) pine(c, x + q * 30, 356, 90 + r * 100, r < 0.3 ? '#2f6b3a' : '#3b7d44');
        else { line(c, x + 20, 356, x + 20, 320, 7, '#5a3b22'); circle(c, x + 20, 300 - q * 30, 30 + q * 14, '#3f8a46'); circle(c, x + 6, 312 - q * 30, 20, '#4b9a50'); }
      });
      groundFill(c, 350, ['#7fbf55', '#5a9a3a', '#3f7a2a']);
      c.fillStyle = '#b48d5c'; c.fillRect(0, 372, W, 66);
      c.fillStyle = '#9c7748'; c.fillRect(0, 372, W, 4); c.fillRect(0, 434, W, 4);
      tile(c, cam, 46, 4, function (c, x, k, r, q) {
        if (r < 0.5) { line(c, x, 368, x - 3, 358, 2, '#4f8a34'); line(c, x + 3, 368, x + 5, 357, 2, '#5fa03e'); }
        if (q < 0.25) circle(c, x + 10, 362, 3, q < 0.12 ? '#ff6b8a' : '#ffe14a');
        if (r > 0.85) ellipse(c, x + 20, 404 + q * 20, 6, 3, '#8e6c42');
        if (q > 0.8) { ellipse(c, x, 470, 34, 16, '#356b26'); ellipse(c, x + 22, 476, 26, 12, '#2f6122'); }
      });
    },
    village: function (c, cam, t) {
      skyGrad(c, ['#2a1f4a', '#8a3f6a', '#f0934a']);
      var sg = c.createRadialGradient(700, 300, 10, 700, 300, 120);
      sg.addColorStop(0, 'rgba(255,200,120,0.95)'); sg.addColorStop(1, 'rgba(255,140,80,0)');
      c.fillStyle = sg; c.fillRect(560, 160, 280, 280);
      tile(c, cam * 0.15, 280, 5, function (c, x, k, r) {
        ellipse(c, x + 140, 350, 200, 70 + r * 40, '#4a3560');
        if (k % 3 === 0) {
          poly(c, [x + 90, 330, x + 96, 250, x + 116, 250, x + 122, 330], '#2e2140');
          for (var i = 0; i < 4; i++) {
            var sy = 240 - i * 30 - ((t * 12) % 30);
            c.save(); c.globalAlpha = 0.25 - i * 0.05; circle(c, x + 106 + Math.sin(t + i) * 8 + i * 6, sy, 12 + i * 5, '#2a2030'); c.restore();
          }
        }
      });
      tile(c, cam * 0.45, 190, 6, function (c, x, k, r, q) {
        var w = 110 + r * 40, hgt = 70 + q * 40, b = 360;
        poly(c, [x, b, x, b - hgt, x + w, b - hgt, x + w, b], '#5a4636');
        line(c, x, b - hgt, x + w, b - hgt, 5, '#2e2218');
        line(c, x + w * 0.5, b, x + w * 0.5, b - hgt, 5, '#2e2218');
        line(c, x, b - hgt * 0.5, x + w, b - hgt * 0.5, 4, '#2e2218');
        // Broken roof.
        poly(c, [x - 10, b - hgt, x + w * 0.45, b - hgt - 50, x + w * 0.6, b - hgt - 30, x + w * 0.7, b - hgt - 42, x + w + 10, b - hgt], '#3a2a3a');
        var fl = 0.6 + 0.4 * Math.sin(t * 7 + k);
        rr(c, x + 16, b - hgt + 12, 16, 16, 2); c.fillStyle = 'rgba(255,' + Math.round(150 + 60 * fl) + ',60,0.9)'; c.fill();
        if (q > 0.5) { rr(c, x + w - 34, b - hgt + 12, 16, 16, 2); c.fill(); }
        line(c, x + w + 20, b, x + w + 20, b - 26, 3, '#3a2a20'); line(c, x + w + 50, b, x + w + 50, b - 24, 3, '#3a2a20');
        line(c, x + w + 14, b - 18, x + w + 58, b - 20, 3, '#3a2a20');
      });
      groundFill(c, 352, ['#6a5240', '#4a3a2c', '#2e241c']);
      c.fillStyle = '#7a6450'; c.fillRect(0, 374, W, 62);
      tile(c, cam, 34, 7, function (c, x, k, r, q) {
        rr(c, x, 380 + (k % 2) * 26, 26, 18, 5); c.fillStyle = r < 0.5 ? '#86705a' : '#6e5a46'; c.fill();
        if (q > 0.9) { c.save(); c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 5 + k); circle(c, x + 10, 350 - ((t * 30 + k * 40) % 200), 2, '#ffb040'); c.restore(); }
        if (r > 0.92) { c.beginPath(); c.arc(x + 12, 456, 14, 0, Math.PI * 2); c.lineWidth = 3; c.strokeStyle = '#3a2a1a'; c.stroke(); }
      });
    },
    crypt: function (c, cam, t) {
      skyGrad(c, ['#07080d', '#141824', '#232a38']);
      tile(c, cam * 0.15, 120, 8, function (c, x, k, r, q) {
        ellipse(c, x + 60, 120 + r * 160, 90, 120, '#1b2030');
        if (q > 0.6) { c.save(); c.globalAlpha = 0.5 + 0.3 * Math.sin(t * 2 + k); poly(c, [x + 40, 300, x + 48, 270, x + 56, 300], '#58e0ff'); poly(c, [x + 54, 304, x + 60, 284, x + 66, 304], '#3ab0d8'); c.restore(); }
      });
      tile(c, cam * 0.45, 150, 9, function (c, x, k, r, q) {
        poly(c, [x, 0, x + 14 + r * 10, 60 + q * 70, x + 30, 0], '#2a3040');
        poly(c, [x + 60, 0, x + 70, 30 + r * 40, x + 82, 0], '#262b3a');
        if (k % 2 === 0) {
          rr(c, x + 90, 120, 34, 240, 4); c.fillStyle = '#3a4052'; c.fill();
          rr(c, x + 84, 112, 46, 14, 3); c.fillStyle = '#4a5064'; c.fill();
          // Torch.
          line(c, x + 107, 220, x + 107, 238, 4, '#5a3b22');
          var f = Math.sin(t * 13 + k) * 2;
          poly(c, [x + 100, 220, x + 107, 200 + f, x + 114, 220], '#ff9a2a');
          poly(c, [x + 103, 220, x + 107, 208 + f, x + 111, 220], '#ffe14a');
          c.save(); c.globalAlpha = 0.18; circle(c, x + 107, 212, 46, '#ff9a2a'); c.restore();
        } else {
          rr(c, x + 70, 320, 70, 38, 4); c.fillStyle = '#353a48'; c.fill();
          line(c, x + 105, 324, x + 105, 346, 3, '#4c5264'); line(c, x + 96, 332, x + 114, 332, 3, '#4c5264');
        }
      });
      groundFill(c, 356, ['#3b4050', '#2a2e3a', '#1a1d26']);
      tile(c, cam, 64, 10, function (c, x, k, r, q) {
        c.strokeStyle = '#22252f'; c.lineWidth = 2;
        c.strokeRect(x, 370 + (k % 2) * 30, 64, 30);
        if (q > 0.85) { line(c, x + 20, 418, x + 36, 412, 3, '#d8d0bc'); circle(c, x + 16, 418, 3, '#d8d0bc'); circle(c, x + 40, 412, 3, '#d8d0bc'); }
      });
    },
    frozen: function (c, cam, t) {
      skyGrad(c, ['#8fb6d8', '#cfe3f4', '#f0f7ff']);
      tile(c, cam * 0.15, 240, 11, function (c, x, k, r) {
        var top = 140 + r * 80;
        poly(c, [x - 60, 350, x + 110, top, x + 280, 350], '#a9c2da');
        poly(c, [x + 110, top, x + 80, top + 60, x + 100, top + 50, x + 120, top + 70, x + 140, top + 46, x + 110, top], '#f4f9ff');
      });
      tile(c, cam * 0.45, 64, 12, function (c, x, k, r, q) { if (r < 0.7) pine(c, x + q * 20, 360, 80 + r * 90, '#2e5a5e', '#f4f9ff'); });
      groundFill(c, 352, ['#f4f9ff', '#dbeaf6', '#b9d2e6']);
      c.fillStyle = '#cfe2f1'; c.fillRect(0, 374, W, 62);
      tile(c, cam, 52, 13, function (c, x, k, r, q) {
        if (r > 0.75) poly(c, [x, 372, x + 8, 356, x + 18, 372], '#bcd8ec');
        if (q > 0.8) ellipse(c, x + 14, 470, 30, 12, '#e6f1fa');
      });
      // Falling snow (decorative, deterministic in time).
      c.fillStyle = 'rgba(255,255,255,0.85)';
      for (var i = 0; i < 60; i++) {
        var sx = ((hash(i * 31) * W + t * (20 + hash(i) * 30) - cam * 0.6) % W + W) % W;
        var sy = (hash(i * 17) * H + t * (30 + hash(i * 7) * 40)) % H;
        c.fillRect(sx, sy, 2.5, 2.5);
      }
    },
    citadel: function (c, cam, t) {
      skyGrad(c, ['#08040f', '#2a0f3a', '#1f3a2c']);
      var mg = c.createRadialGradient(760, 110, 10, 760, 110, 90);
      mg.addColorStop(0, 'rgba(200,255,210,0.95)'); mg.addColorStop(0.5, 'rgba(120,255,170,0.35)'); mg.addColorStop(1, 'rgba(80,255,150,0)');
      c.fillStyle = mg; c.fillRect(660, 10, 200, 200);
      circle(c, 760, 110, 38, '#d8ffe0');
      tile(c, cam * 0.15, 130, 14, function (c, x, k, r, q) {
        var top = 150 + r * 110, w = 26 + q * 20;
        poly(c, [x, 360, x, top, x + w / 2, top - 50 - r * 30, x + w, top, x + w, 360], '#140a1e');
        c.save(); c.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3 + k); rr(c, x + w / 2 - 3, top + 20, 6, 10, 2); c.fillStyle = '#59ff9c'; c.fill(); c.restore();
      });
      tile(c, cam * 0.45, 170, 15, function (c, x, k, r, q) {
        rr(c, x, 130, 30, 230, 3); c.fillStyle = '#2a2033'; c.fill();
        c.beginPath(); c.moveTo(x + 30, 170); c.quadraticCurveTo(x + 85, 90, x + 140, 170); c.lineWidth = 12; c.strokeStyle = '#2a2033'; c.stroke();
        line(c, x + 15, 300, x + 15, 316, 4, '#4a3a50');
        var f = Math.sin(t * 11 + k) * 2;
        poly(c, [x + 6, 300, x + 15, 280 + f, x + 24, 300], '#59ff9c');
        c.save(); c.globalAlpha = 0.18; circle(c, x + 15, 292, 40, '#59ff9c'); c.restore();
      });
      groundFill(c, 356, ['#2e2438', '#221a2a', '#140e1a']);
      tile(c, cam, 150, 16, function (c, x, k, r) {
        c.save(); c.globalAlpha = 0.25 + 0.15 * Math.sin(t * 2 + k);
        c.beginPath(); c.ellipse(x + 60, 408, 46, 12, 0, 0, Math.PI * 2); c.lineWidth = 2; c.strokeStyle = '#59ff9c'; c.stroke();
        c.restore();
      });
      for (var i = 0; i < 24; i++) {
        var mx = ((hash(i * 13) * W - cam * 0.3 + Math.sin(t + i) * 20) % W + W) % W;
        var my = 360 - ((t * (10 + hash(i) * 20) + hash(i * 3) * 300) % 300);
        c.save(); c.globalAlpha = 0.5; circle(c, mx, my, 2, '#8dffb8'); c.restore();
      }
    }
  };

  // ---------------------------------------------------------------- effects
  var MAX_PARTS = 320, MAX_NUMS = 70;
  var fx = null;
  function resetFx() {
    fx = { parts: [], nums: [], rings: [], beams: [], texts: [], banner: null, flash: 0, flashCol: '#ffffff',
      shake: 0, slowmo: 0, swingMax: {}, lastSwing: {}, dashTrail: {}, callout: null };
  }
  resetFx();
  function addPart(p) { if (fx.parts.length < MAX_PARTS) fx.parts.push(p); }
  function burst(x, y, n, col, speed, life, size, grav) {
    for (var i = 0; i < n; i++) {
      var a = deco.range(0, Math.PI * 2), s = deco.range(0.3, 1) * speed;
      addPart({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.3, life: 0, max: life * deco.range(0.6, 1),
        col: col, size: size * deco.range(0.6, 1.2), grav: grav == null ? 300 : grav, kind: 'dot' });
    }
  }
  function sparks(x, y, n, col) {
    for (var i = 0; i < n; i++) {
      var a = deco.range(0, Math.PI * 2), s = deco.range(120, 320);
      addPart({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: deco.range(0.15, 0.3), col: col, size: 2, grav: 0, kind: 'spark' });
    }
  }
  function unitById(b, id) {
    for (var i = 0; i < b.enemies.length; i++) if (b.enemies[i].id === id) return b.enemies[i];
    return null;
  }
  function unitTop(b, u) {
    if (!u || u.kind === 'hero') return feetY(b.hero.depth) - 112;
    return feetY(u.depth) - enemyHeight(u.type) * depthScale(u.depth) - 6;
  }
  function bannerText(s, sub, col) { fx.banner = { s: s, sub: sub || '', col: col || '#ffe58a', life: 0, max: 1.7 }; }
  function floatText(x, y, s, col, size) {
    if (fx.texts.length >= 6) fx.texts.shift();
    fx.texts.push({ x: x, y: y, s: s, col: col, size: size || 18, life: 0, max: 1.1 });
  }
  function ring(r) { if (fx.rings.length < 24) fx.rings.push(r); }

  var NUM_COL = { phys: '#ffffff', magic: '#d7a6ff', crit: '#ffd84a', heal: '#6dff8a', bleed: '#ff6b6b', shield: '#9ee8ff' };

  function handleEvents(b, evs) {
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i], u, y;
      switch (e.t) {
        case 'num':
          u = e.who === 'hero' ? b.hero : unitById(b, e.id);
          if (fx.nums.length >= MAX_NUMS) fx.nums.shift();
          fx.nums.push({ x: e.x + deco.range(-14, 14), y: unitTop(b, u) - 4, v: e.v, k: e.k, hero: e.who === 'hero', life: 0, max: e.k === 'crit' ? 1.1 : 0.9 });
          break;
        case 'hit':
          y = feetY(e.depth) - (e.who === 'hero' ? 60 : 42);
          sparks(e.x, y, e.big ? 10 : 6, e.magic ? '#d7a6ff' : e.who === 'hero' ? '#ffb0a0' : '#fff2b0');
          break;
        case 'slam':
          y = feetY(e.depth);
          ring({ x: e.x, y: y, r: 10, max: 190, life: 0, dur: 0.45, col: '255,215,110', w: 10 });
          ring({ x: e.x, y: y, r: 10, max: 120, life: 0, dur: 0.3, col: '255,255,255', w: 5 });
          burst(e.x, y - 4, 26, '#c9a36a', 260, 0.7, 5, 500);
          sparks(e.x, y - 30, 18, '#ffe58a');
          fx.shake = Math.max(fx.shake, 12); fx.flash = 0.55; fx.flashCol = '#fff6d0';
          fx.callout = { s: 'Judgement Slam!', life: 0, max: 1.2 };
          break;
        case 'ult':
          fx.flash = Math.max(fx.flash, 0.2); fx.flashCol = '#fff6d0';
          break;
        case 'bash':
          ring({ x: e.x, y: feetY(e.depth) - 50, r: 6, max: 44, life: 0, dur: 0.25, col: '170,210,255', w: 4 });
          fx.shake = Math.max(fx.shake, 4);
          break;
        case 'vigor':
          floatText(e.x, feetY(b.hero.depth) - 140, 'Holy Vigor', '#8dff9e', 16);
          for (var k = 0; k < 18; k++) addPart({ x: e.x + deco.range(-26, 26), y: feetY(b.hero.depth) - deco.range(0, 90), vx: 0, vy: -deco.range(30, 70), life: 0, max: deco.range(0.8, 1.4), col: '#8dff9e', size: 3, grav: 0, kind: 'plus' });
          break;
        case 'potion':
          floatText(e.x, feetY(b.hero.depth) - 140, 'Potion!', '#ff8da0', 16);
          burst(e.x, feetY(b.hero.depth) - 60, 14, '#ff6b8a', 120, 0.8, 3, -40);
          break;
        case 'kill':
          y = feetY(e.depth) - 30;
          burst(e.x, y, 12, 'rgba(60,50,60,0.6)', 70, 0.8, 9, -30);
          for (var g = 0; g < Math.min(6, 2 + Math.floor((e.gold || 0) / 400)); g++)
            addPart({ x: e.x, y: y, vx: deco.range(-80, 80), vy: deco.range(-260, -160), life: 0, max: 0.9, col: '#ffd84a', size: 4, grav: 700, kind: 'coin' });
          break;
        case 'bosskill':
          fx.slowmo = 0.6; fx.flash = 0.7; fx.flashCol = '#ffffff'; fx.shake = 16;
          burst(e.x, feetY(e.depth) - 80, 40, '#ffe58a', 300, 1.2, 4, 200);
          bannerText(e.x > 0 && unitById(b, e.id) ? unitById(b, e.id).def.name.split(',')[0] + ' falls!' : 'Boss defeated!', '', '#ffe58a');
          break;
        case 'wave':
          var bossT = b.stage.waves[e.wave].filter(function (t) { return D.ENEMIES[t].boss; })[0];
          if (bossT) bannerText('BOSS', D.ENEMIES[bossT].name, '#ff7a6a');
          else bannerText('Wave ' + (e.wave + 1) + '/' + b.waves, b.stage.name, '#ffe58a');
          break;
        case 'healbeam':
          if (fx.beams.length < 8) fx.beams.push({ from: e.from, to: e.to, life: 0, max: 0.5 });
          break;
        case 'warcry':
          ring({ x: e.x, y: feetY(e.depth) - 60, r: 20, max: 260, life: 0, dur: 0.7, col: '255,80,60', w: 8 });
          floatText(e.x, feetY(e.depth) - 190, 'WAR CRY!', '#ff7a6a', 22);
          fx.shake = Math.max(fx.shake, 6);
          break;
        case 'cleave':
          ring({ x: e.x - 60, y: feetY(e.depth) - 40, r: 10, max: 70, life: 0, dur: 0.3, col: '255,120,80', w: 6 });
          fx.shake = Math.max(fx.shake, 8);
          break;
        case 'summon':
          for (var s = 0; s < 22; s++) addPart({ x: e.x + deco.range(-10, 70), y: feetY(e.depth) - deco.range(0, 20), vx: deco.range(-20, 20), vy: -deco.range(40, 120), life: 0, max: deco.range(0.6, 1.1), col: '#59ff9c', size: 4, grav: 0, kind: 'dot' });
          floatText(e.x, feetY(e.depth) - 200, 'Rise, my servants!', '#8dffb8', 16);
          break;
        case 'barrage':
          floatText(e.x, feetY(e.depth) - 200, 'Barrage!', '#8dffb8', 16);
          break;
        case 'shield':
          ring({ x: e.x, y: feetY(e.depth) - 80, r: 20, max: 140, life: 0, dur: 0.6, col: '150,240,255', w: 6 });
          bannerText('PHASE 2', 'Break her shield!', '#9ee8ff');
          break;
        case 'shieldbreak':
          for (var j = 0; j < 26; j++) addPart({ x: e.x + deco.range(-60, 60), y: feetY(e.depth) - deco.range(20, 170), vx: deco.range(-200, 200), vy: deco.range(-200, 60), life: 0, max: 0.9, col: '#bff4ff', size: 5, grav: 500, kind: 'shard' });
          floatText(e.x, feetY(e.depth) - 200, 'SHIELD BROKEN!', '#bff4ff', 20);
          fx.shake = Math.max(fx.shake, 10);
          break;
        case 'dash':
          fx.dashTrail[e.id] = 0.6;
          break;
        case 'miss':
          floatText(e.x, feetY(e.depth) - 80, 'miss', '#c8c8c8', 13);
          break;
        case 'herodeath':
          fx.flash = 0.6; fx.flashCol = '#ff3030'; fx.shake = 10;
          break;
      }
    }
  }

  function updateFx(dt) {
    var i;
    for (i = fx.parts.length - 1; i >= 0; i--) {
      var p = fx.parts[i];
      p.life += dt;
      if (p.life >= p.max) { fx.parts.splice(i, 1); continue; }
      p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
    [fx.nums, fx.rings, fx.beams, fx.texts].forEach(function (arr) {
      for (var j = arr.length - 1; j >= 0; j--) {
        arr[j].life += dt;
        if (arr[j].life >= (arr[j].max || arr[j].dur)) arr.splice(j, 1);
      }
    });
    if (fx.banner) { fx.banner.life += dt; if (fx.banner.life > fx.banner.max) fx.banner = null; }
    if (fx.callout) { fx.callout.life += dt; if (fx.callout.life > fx.callout.max) fx.callout = null; }
    fx.flash = Math.max(0, fx.flash - dt * 2.2);
    fx.shake = Math.max(0, fx.shake - dt * 40);
    fx.slowmo = Math.max(0, fx.slowmo - dt);
    for (var id in fx.dashTrail) { fx.dashTrail[id] -= dt; if (fx.dashTrail[id] <= 0) delete fx.dashTrail[id]; }
  }

  // ---------------------------------------------------------------- battle
  function heroPose(b, rank) {
    var h = b.hero, sw = -1, dur = { slash: 0.32, bash: 0.35, slam: 0.45 }[h.swingKind] || 0.3;
    if (h.swingT > 0) sw = 1 - h.swingT / dur;
    var mv = h.state === 'walk' || h.state === 'run' ? 1 : 0;
    return {
      t: h.anim, walk: h.anim * (h.state === 'run' ? 15 : 10), moving: mv, swing: sw, kind: h.swingKind,
      leap: h.leapT >= 0 ? Math.min(1, h.leapT / 0.45) : -1, hurt: h.hurtT > 0 ? h.hurtT / 0.15 * 0.45 : 0,
      dead: h.dead ? h.deathT / 0.6 : 0, victory: b.over && b.won, rank: rank
    };
  }
  // Swing progress: remember each swing's starting duration when a new one begins.
  function enemyPose(e) {
    if (e.swingT > (fx.lastSwing[e.id] || 0) + 0.001) fx.swingMax[e.id] = e.swingT;
    fx.lastSwing[e.id] = e.swingT;
    var last = fx.swingMax[e.id] || 0;
    var mv = e.state === 'walk' || e.state === 'dash' ? 1 : 0;
    return {
      t: e.anim, walk: e.anim * (6 + e.speed / 14), moving: mv,
      swing: e.swingT > 0 && last > 0 ? 1 - e.swingT / last : -1,
      hurt: e.hurtT > 0 ? e.hurtT / 0.15 * 0.6 : 0, dead: e.dead ? e.deathT / 0.9 : 0,
      shield: e.shieldMax ? e.shield / e.shieldMax : 0
    };
  }
  function stunStars(c, x, y, t) {
    for (var i = 0; i < 3; i++) {
      var a = t * 5 + i * 2.1;
      var sx = x + Math.cos(a) * 16, sy = y + Math.sin(a) * 5;
      c.save(); c.translate(sx, sy); c.rotate(t * 4);
      poly(c, [0, -5, 1.5, -1.5, 5, 0, 1.5, 1.5, 0, 5, -1.5, 1.5, -5, 0, -1.5, -1.5], '#ffe14a', '#a07a10', 1);
      c.restore();
    }
  }
  function bar(c, x, y, w, h, frac, col, back) {
    rr(c, x - 1, y - 1, w + 2, h + 2, 3); c.fillStyle = 'rgba(0,0,0,0.75)'; c.fill();
    rr(c, x, y, w, h, 2); c.fillStyle = back || '#3a1416'; c.fill();
    if (frac > 0) { rr(c, x, y, Math.max(2, w * Math.min(1, frac)), h, 2); c.fillStyle = col; c.fill(); }
  }

  function drawProjectile(c, p, cam) {
    var span = p.tx - p.sx, prog = span ? Math.min(1, Math.max(0, (p.x - p.sx) / span)) : 1;
    var x = p.x - cam, y = feetY(p.depth) - p.h - Math.sin(prog * Math.PI) * (p.kind === 'arrow' ? 26 : 8);
    if (p.kind === 'arrow') {
      var dir = span < 0 ? -1 : 1, ang = Math.atan2(Math.cos(prog * Math.PI) * -26 * Math.PI / Math.max(60, Math.abs(span)), 1);
      c.save(); c.translate(x, y); c.scale(dir, 1); c.rotate(-ang);
      line(c, -16, 0, 10, 0, 2, '#c9a46a');
      poly(c, [10, -3, 17, 0, 10, 3], '#d8dde3');
      poly(c, [-16, 0, -20, -4, -12, 0, -20, 4], '#f0f0f0');
      c.restore();
    } else {
      var col = { bolt: '#c58bff', curse: '#ff3355', lich: '#59ff9c' }[p.kind];
      c.save(); c.globalAlpha = 0.35; circle(c, x, y, p.kind === 'lich' ? 15 : 11, col); c.restore();
      var dir2 = span < 0 ? 1 : -1;
      for (var i = 1; i <= 3; i++) { c.save(); c.globalAlpha = 0.3 - i * 0.07; circle(c, x + dir2 * i * 9, y, 6 - i, col); c.restore(); }
      circle(c, x, y, p.kind === 'lich' ? 7 : 5, '#ffffff');
      circle(c, x, y, p.kind === 'lich' ? 5 : 3.5, col);
    }
  }

  function drawPortrait(c, x, y, sz, rank, t, glow) {
    c.save();
    if (glow > 0) { c.shadowColor = 'rgba(255,215,80,' + glow + ')'; c.shadowBlur = 24; }
    rr(c, x - 4, y - 4, sz + 8, sz + 8, 12); c.fillStyle = glow > 0 ? '#ffd650' : D.RANKS[rank].color; c.fill();
    c.restore();
    rr(c, x, y, sz, sz, 9);
    var g = c.createLinearGradient(x, y, x, y + sz);
    g.addColorStop(0, '#3c5ea8'); g.addColorStop(1, '#152447');
    c.fillStyle = g; c.fill();
    c.save();
    rr(c, x, y, sz, sz, 9); c.clip();
    c.translate(x + sz * 0.4, y + sz * 2.0);
    var s = sz / 55;
    c.scale(s, s);
    drawHero(c, { t: t, rank: rank });
    c.restore();
  }

  var PORTRAIT = { x: 22, y: 452, s: 78 };

  function drawBattle(b, info) {
    var c = ctx, cam = b.camX, t = info.t;
    c.save();
    c.setTransform(res, 0, 0, res, 0, 0);
    var sx = fx.shake > 0 ? deco.range(-fx.shake, fx.shake) : 0, sy = fx.shake > 0 ? deco.range(-fx.shake, fx.shake) * 0.6 : 0;
    c.translate(sx, sy);
    THEME_ART[b.stage.theme](c, cam, t);

    // Units sorted by depth (far first).
    var units = b.enemies.filter(function (e) { return !e.dead || e.deathT < 1; });
    var list = units.map(function (e) { return { d: e.depth, e: e }; });
    list.push({ d: b.hero.depth + 0.001, e: b.hero });
    list.sort(function (a, z) { return a.d - z.d; });
    list.forEach(function (it) {
      var u = it.e, s = depthScale(u.depth), fy = feetY(u.depth), x = u.x - cam;
      var flyH = u.kind === 'enemy' ? (ENEMY_ART[u.type].fly || 0) : 0;
      var shW = u.kind === 'hero' ? 26 : u.def.boss ? 46 : u.type === 'troll' || u.type === 'brute' ? 34 : u.type === 'wolf' ? 30 : 20;
      var lift = u.kind === 'hero' && u.leapT >= 0 ? Math.sin(Math.min(1, u.leapT / 0.45) * Math.PI) * 110 : 0;
      c.save(); c.globalAlpha = (u.dead ? Math.max(0, 1 - u.deathT) : 1) * (flyH ? 0.18 : 0.3) * (1 - lift / 220);
      ellipse(c, x, fy + 2, shW * s, 7 * s, '#000'); c.restore();
      if (u.kind === 'hero') {
        c.save(); c.translate(x, fy - lift); c.scale(s, s);
        drawHero(c, heroPose(b, info.rank));
        c.restore();
      } else {
        if (fx.dashTrail[u.id]) {
          for (var k = 1; k <= 3; k++) { c.save(); c.globalAlpha = 0.18 * fx.dashTrail[u.id] * (4 - k); drawEnemyAt(c, u.type, x + k * 18, fy, s, enemyPose(u)); c.restore(); }
        }
        if (u.buffT > 0 && !u.dead) { c.save(); c.globalAlpha = 0.25 + 0.1 * Math.sin(t * 10); ellipse(c, x, fy - enemyHeight(u.type) * s * 0.45, 30 * s, enemyHeight(u.type) * s * 0.5, '#ff4a30'); c.restore(); }
        if (u.def.regen && !u.dead && u.hp < u.maxHp && Math.floor(t * 6 + u.id) % 3 === 0) addPart({ x: u.x + deco.range(-20, 20), y: fy - deco.range(20, 100), vx: 0, vy: -40, life: 0, max: 0.6, col: '#7dff8a', size: 3, grav: 0, kind: 'plus' });
        drawEnemyAt(c, u.type, x, fy, s * (u.def.boss ? 1.05 : 1), enemyPose(u));
      }
    });

    // Cultist heal beams.
    fx.beams.forEach(function (bm) {
      var a = unitById(b, bm.from), z = unitById(b, bm.to);
      if (!a || !z) return;
      var ax = a.x - cam, ay = feetY(a.depth) - 80, zx = z.x - cam, zy = feetY(z.depth) - enemyHeight(z.type) * 0.5;
      c.save(); c.globalAlpha = 1 - bm.life / bm.max;
      line(c, ax, ay, zx, zy, 6, 'rgba(255,60,90,0.45)'); line(c, ax, ay, zx, zy, 2, '#ffd0d8');
      c.restore();
    });
    b.projectiles.forEach(function (p) { drawProjectile(c, p, cam); });

    fx.rings.forEach(function (r) {
      var k = r.life / r.dur, rad = r.r + (r.max - r.r) * Math.sqrt(k);
      c.beginPath(); c.ellipse(r.x - cam, r.y, rad, rad * 0.32, 0, 0, Math.PI * 2);
      c.lineWidth = r.w * (1 - k); c.strokeStyle = 'rgba(' + r.col + ',' + (1 - k) + ')'; c.stroke();
    });
    fx.parts.forEach(function (p) {
      var a = 1 - p.life / p.max, px = p.x - cam;
      c.save(); c.globalAlpha = Math.max(0, a);
      if (p.kind === 'spark') line(c, px, p.y, px - p.vx * 0.03, p.y - p.vy * 0.03, p.size, p.col);
      else if (p.kind === 'plus') { line(c, px - p.size, p.y, px + p.size, p.y, 2, p.col); line(c, px, p.y - p.size, px, p.y + p.size, 2, p.col); }
      else if (p.kind === 'coin') { ellipse(c, px, p.y, p.size * Math.abs(Math.cos(p.life * 12)) + 1, p.size, p.col); }
      else if (p.kind === 'shard') poly(c, [px, p.y - p.size, px + p.size * 0.6, p.y, px, p.y + p.size, px - p.size * 0.6, p.y], p.col);
      else circle(c, px, p.y, p.size * (p.grav < 0 ? 1 + p.life : 1), p.col);
      c.restore();
    });

    // Bars and stun markers above units.
    units.forEach(function (e) {
      if (e.dead) return;
      var s = depthScale(e.depth), x = e.x - cam, top = feetY(e.depth) - enemyHeight(e.type) * s - 12;
      if (e.stun > 0) stunStars(c, x, top - 6, t);
      if (e.def.boss) return;
      bar(c, x - 22, top, 44, 6, e.hp / e.maxHp, '#e8423a');
    });
    if (!b.hero.dead) {
      var hx = b.hero.x - cam, ht = feetY(b.hero.depth) - 122;
      bar(c, hx - 22, ht, 44, 6, b.hero.hp / b.hero.maxHp, '#53d65a', '#16361a');
    }

    // Floating numbers and texts.
    fx.nums.forEach(function (n) {
      var k = n.life / n.max, size = n.k === 'crit' ? 26 : 19;
      c.save(); c.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      var pop = k < 0.12 ? 1 + (0.12 - k) * 4 : 1;
      var label = (n.k === 'heal' ? '+' : n.hero ? '-' : '') + n.v + (n.k === 'crit' ? '!' : '');
      text(c, label, n.x - cam, n.y - k * 46, Math.round(size * pop), NUM_COL[n.k], 'center', 'bold', 4);
      c.restore();
    });
    fx.texts.forEach(function (tx) {
      var k = tx.life / tx.max;
      c.save(); c.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      text(c, tx.s, tx.x - cam, tx.y - k * 24, tx.size, tx.col, 'center', 'bold', 4);
      c.restore();
    });
    c.restore();

    c.save();
    c.setTransform(res, 0, 0, res, 0, 0);
    drawHud(c, b, info);
    if (fx.flash > 0) { c.globalAlpha = Math.min(0.85, fx.flash); c.fillStyle = fx.flashCol; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
    c.restore();
  }

  function drawHud(c, b, info) {
    var t = info.t, h = b.hero;
    var tg = c.createLinearGradient(0, 0, 0, 50);
    tg.addColorStop(0, 'rgba(10,8,20,0.75)'); tg.addColorStop(1, 'rgba(10,8,20,0)');
    c.fillStyle = tg; c.fillRect(0, 0, W, 50);
    var bg = c.createLinearGradient(0, 440, 0, H);
    bg.addColorStop(0, 'rgba(10,8,20,0)'); bg.addColorStop(0.35, 'rgba(10,8,20,0.8)'); bg.addColorStop(1, 'rgba(10,8,20,0.92)');
    c.fillStyle = bg; c.fillRect(0, 440, W, H - 440);

    // Boss bar.
    var boss = b.enemies.filter(function (e) { return e.def.boss && !e.dead; })[0];
    if (boss) {
      var bx = 250, by = 58, bw = 460;
      text(c, boss.def.name, W / 2, by - 4, 17, '#ffd7c8', 'center', 'bold', 4);
      bar(c, bx, by + 8, bw, 18, boss.hp / boss.maxHp, '#d9302c', '#2a0a0c');
      if (boss.shield > 0) { rr(c, bx, by + 8, bw * boss.shield / boss.maxHp, 18, 2); c.fillStyle = 'rgba(140,235,255,0.75)'; c.fill(); }
      text(c, Math.ceil(boss.hp) + (boss.shield > 0 ? ' +' + Math.ceil(boss.shield) + ' shield' : '') + ' / ' + boss.maxHp, W / 2, by + 17, 12, '#ffffff', 'center', 'bold', 3);
    }

    // Portrait with energy-ready glow.
    var ready = h.energy >= D.HERO.energyMax && !h.dead && !b.over;
    var pulse = ready ? 0.6 + 0.4 * Math.sin(t * 8) : 0;
    drawPortrait(c, PORTRAIT.x, PORTRAIT.y, PORTRAIT.s, info.rank, t, pulse);
    if (ready) {
      var bounce = Math.abs(Math.sin(t * 5)) * 6;
      text(c, 'TAP!', PORTRAIT.x + PORTRAIT.s / 2, PORTRAIT.y - 14 - bounce, 24 + pulse * 3, '#ffe14a', 'center', 'bold', 5);
    }
    text(c, D.HERO.name, 116, 462, 16, '#ffffff', 'left', 'bold', 3);
    text(c, 'Lv ' + info.level, 186, 462, 14, '#ffe58a', 'left', 'bold', 3);
    bar(c, 116, 474, 230, 16, h.hp / h.maxHp, '#4fd15a', '#16361a');
    text(c, Math.ceil(h.hp) + ' / ' + h.maxHp, 231, 482.5, 12, '#ffffff', 'center', 'bold', 3);
    var ef = h.energy / D.HERO.energyMax;
    bar(c, 116, 496, 230, 11, ef, ready ? (Math.floor(t * 8) % 2 ? '#ffe14a' : '#fff3a0') : '#e3b82a', '#3a300c');
    text(c, ready ? (info.auto ? 'Ultimate ready (Auto)' : 'READY! Tap portrait / Space') : 'Energy ' + Math.floor(h.energy), 116, 518, 12, ready ? '#ffe14a' : '#d8d0b0', 'left', 'bold', 3);

    // Auto-skill cooldown icons.
    var icons = [['bash', h.bashCd, 7], ['vigor', h.vigorCd, 12], ['stalwart', 0, 1]];
    icons.forEach(function (ic, i) {
      var x = 372 + i * 46, y = 470, lvl = h.skills[ic[0]];
      c.save();
      c.translate(x, y);
      drawSkillIcon(c, ic[0], 38, !lvl);
      if (lvl && ic[1] > 0) {
        c.beginPath(); c.moveTo(19, 19); c.arc(19, 19, 19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (ic[1] / ic[2])); c.closePath();
        c.fillStyle = 'rgba(0,0,0,0.6)'; c.fill();
      }
      c.restore();
      text(c, lvl ? 'Lv' + lvl : 'Lv ' + D.SKILLS.filter(function (s) { return s.id === ic[0]; })[0].unlock, x + 19, y + 50, 11, lvl ? '#e8e0c8' : '#888', 'center', 'bold', 3);
    });

    if (fx.banner) {
      var bn = fx.banner, k = bn.life / bn.max;
      var a = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1;
      c.save(); c.globalAlpha = a;
      var gy = 196;
      var gr = c.createLinearGradient(0, gy - 40, 0, gy + 40);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr; c.fillRect(0, gy - 44, W, 88);
      text(c, bn.s, W / 2 + (1 - a) * 40, gy - 6, 46, bn.col, 'center', 'bold', 6);
      if (bn.sub) text(c, bn.sub, W / 2, gy + 30, 18, '#ffffff', 'center', 'bold', 4);
      c.restore();
    }
    if (fx.callout) {
      var co = fx.callout, ck = co.life / co.max;
      c.save(); c.globalAlpha = ck > 0.7 ? (1 - ck) / 0.3 : 1;
      text(c, co.s, W / 2, 112 - ck * 10, Math.round(32 * (ck < 0.1 ? 1.3 - ck * 3 : 1)), '#ffe58a', 'center', 'bold', 6);
      c.restore();
    }
    if (info.slowmo) { c.save(); c.globalAlpha = 0.18; c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.restore(); }
  }

  // Screen rectangle of the hero (for tapping him to fire the ultimate).
  function heroRect(b) {
    var x = b.hero.x - b.camX, fy = feetY(b.hero.depth);
    return { x: x - 34, y: fy - 120, w: 68, h: 124 };
  }

  // ---------------------------------------------------------------- icons
  function drawItemIcon(c, item, sz) {
    var r = D.RARITIES[item.rarity];
    c.save();
    c.scale(sz / 48, sz / 48);
    var g = c.createRadialGradient(24, 20, 4, 24, 24, 34);
    g.addColorStop(0, item.rarity === 'epic' ? '#5a2a7a' : item.rarity === 'rare' ? '#1f3f70' : '#3a3f48');
    g.addColorStop(1, '#14161c');
    rr(c, 1, 1, 46, 46, 8); c.fillStyle = g; c.fill();
    c.lineWidth = 2.5; c.strokeStyle = r.color; c.stroke();
    var steel = item.rarity === 'epic' ? '#ffe7a0' : '#dfe5ec', trim = item.rarity === 'common' ? '#a08a60' : '#e1b84a';
    switch (item.slot) {
      case 'weapon':
        c.save(); c.translate(24, 24); c.rotate(-Math.PI / 4);
        poly(c, [-3, -4, 18, -3, 22, 0, 18, 3, -3, 4], steel, '#4a525c', 1);
        rr(c, -6, -9, 4, 18, 1); c.fillStyle = trim; c.fill();
        rr(c, -16, -2.5, 10, 5, 2); c.fillStyle = '#5a3b22'; c.fill();
        circle(c, -17, 0, 3, trim);
        c.restore(); break;
      case 'helmet':
        c.beginPath(); c.moveTo(12, 36); c.lineTo(11, 22); c.quadraticCurveTo(13, 9, 24, 9); c.quadraticCurveTo(36, 9, 37, 22); c.lineTo(36, 36); c.closePath();
        c.fillStyle = steel; c.fill(); c.strokeStyle = '#4a525c'; c.lineWidth = 1.5; c.stroke();
        line(c, 11, 21, 37, 21, 3, trim); line(c, 24, 25, 36, 25, 2.5, '#1b1f27');
        c.beginPath(); c.moveTo(24, 9); c.quadraticCurveTo(14, 2, 8, 12); c.lineWidth = 4; c.strokeStyle = '#d22b33'; c.stroke();
        break;
      case 'chest':
        poly(c, [11, 12, 19, 9, 24, 13, 29, 9, 37, 12, 35, 38, 13, 38], steel, '#4a525c', 1.5);
        poly(c, [20, 16, 28, 16, 27, 34, 21, 34], '#2a4fa0');
        circle(c, 24, 22, 3, trim);
        break;
      case 'gloves':
        rr(c, 14, 16, 18, 20, 5); c.fillStyle = steel; c.fill();
        [15, 20, 25].forEach(function (x) { rr(c, x, 9, 4.5, 10, 2); c.fill(); });
        rr(c, 29, 18, 6, 10, 3); c.fill();
        rr(c, 13, 32, 20, 7, 2); c.fillStyle = trim; c.fill();
        break;
      case 'boots':
        poly(c, [16, 9, 27, 9, 27, 30, 38, 33, 38, 39, 14, 39], steel, '#4a525c', 1.5);
        line(c, 15, 14, 27, 14, 3, trim);
        rr(c, 14, 36, 24, 4, 1.5); c.fillStyle = '#3b2a1e'; c.fill();
        break;
      case 'amulet':
        c.beginPath(); c.arc(24, 15, 11, 0.15 * Math.PI, 0.85 * Math.PI, true); c.lineWidth = 2; c.strokeStyle = trim; c.stroke();
        poly(c, [24, 22, 32, 30, 24, 40, 16, 30], trim);
        poly(c, [24, 25, 29, 30, 24, 36, 19, 30], item.rarity === 'epic' ? '#c070ff' : item.rarity === 'rare' ? '#4aa3ff' : '#e04848');
        break;
    }
    c.restore();
  }

  function drawSkillIcon(c, id, sz, locked) {
    c.save();
    c.scale(sz / 48, sz / 48);
    var base = { ult: ['#8a5a10', '#3a2208'], bash: ['#2a4fa0', '#101e44'], vigor: ['#2a8a40', '#0c3016'], stalwart: ['#6a6f7a', '#24272e'] }[id];
    var g = c.createLinearGradient(0, 0, 0, 48);
    g.addColorStop(0, base[0]); g.addColorStop(1, base[1]);
    circle(c, 24, 24, 23, g);
    c.beginPath(); c.arc(24, 24, 22, 0, Math.PI * 2); c.lineWidth = 2.5; c.strokeStyle = '#e1b84a'; c.stroke();
    if (id === 'ult') {
      for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; line(c, 24 + Math.cos(a) * 8, 24 + Math.sin(a) * 8, 24 + Math.cos(a) * 18, 24 + Math.sin(a) * 18, 2.5, '#ffe58a'); }
      c.save(); c.translate(24, 24); c.rotate(Math.PI / 2);
      poly(c, [-14, -2.5, 12, -2, 16, 0, 12, 2, -14, 2.5], '#ffffff', '#5d6672', 1);
      rr(c, -16, -7, 3, 14, 1); c.fillStyle = '#e1b84a'; c.fill();
      c.restore();
    } else if (id === 'bash') {
      c.beginPath(); c.moveTo(14, 12); c.lineTo(34, 12); c.quadraticCurveTo(35, 30, 24, 39); c.quadraticCurveTo(13, 30, 14, 12); c.closePath();
      c.fillStyle = '#3f6fd0'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#e1b84a'; c.stroke();
      line(c, 37, 16, 43, 13, 2.5, '#fff'); line(c, 38, 24, 45, 24, 2.5, '#fff'); line(c, 37, 32, 43, 35, 2.5, '#fff');
    } else if (id === 'vigor') {
      rr(c, 20, 10, 8, 28, 2); c.fillStyle = '#d8ffd8'; c.fill();
      rr(c, 10, 20, 28, 8, 2); c.fill();
      c.save(); c.globalAlpha = 0.4; circle(c, 24, 24, 16, '#8dff9e'); c.restore();
    } else {
      poly(c, [12, 38, 12, 16, 17, 16, 17, 11, 22, 11, 22, 16, 26, 16, 26, 11, 31, 11, 31, 16, 36, 16, 36, 38], '#c4ccd6', '#3a3f48', 1.5);
      rr(c, 20, 26, 8, 12, 3); c.fillStyle = '#2a2e36'; c.fill();
    }
    if (locked) { circle(c, 24, 24, 23, 'rgba(0,0,0,0.6)'); text(c, '🔒', 24, 25, 18, '#fff'); }
    c.restore();
  }

  function drawEnemyIcon(c, type, sz) {
    var g = c.createLinearGradient(0, 0, 0, sz);
    g.addColorStop(0, '#4a3a2a'); g.addColorStop(1, '#1e160e');
    rr(c, 1, 1, sz - 2, sz - 2, 8); c.fillStyle = g; c.fill();
    c.lineWidth = 2; c.strokeStyle = D.ENEMIES[type].boss ? '#ff6a4a' : '#a08a60'; c.stroke();
    var hgt = enemyHeight(type), s = (sz * 0.8) / Math.max(hgt, 60);
    c.save(); rr(c, 1, 1, sz - 2, sz - 2, 8); c.clip();
    drawEnemyAt(c, type, sz / 2 + 2, sz * 0.92, s, { t: 0.4, walk: 0, moving: 0, swing: -1, hurt: 0, dead: 0, shield: 0 });
    c.restore();
  }

  // ---------------------------------------------------------------- menus
  function begin() { ctx.setTransform(res, 0, 0, res, 0, 0); }

  function drawTitle(t) {
    begin();
    var c = ctx;
    skyGrad(c, ['#120c2a', '#5a2a5a', '#e8784a']);
    for (var i = 0; i < 40; i++) { c.globalAlpha = 0.3 + 0.5 * hash(i * 9); circle(c, hash(i) * W, hash(i * 3) * 220, 1.2, '#fff'); }
    c.globalAlpha = 1;
    poly(c, [0, 360, 120, 250, 260, 320, 420, 200, 560, 300, 700, 230, 960, 330, 960, 540, 0, 540], '#3a2448');
    // Lich citadel on the horizon.
    var gx = 870;
    c.save(); c.globalAlpha = 0.3 + 0.1 * Math.sin(t * 2); circle(c, gx, 300, 80, '#59ff9c'); c.restore();
    poly(c, [gx - 60, 380, gx - 60, 300, gx - 46, 262, gx - 32, 300, gx - 32, 380], '#160c22');
    poly(c, [gx - 20, 380, gx - 20, 270, gx, 214, gx + 20, 270, gx + 20, 380], '#160c22');
    poly(c, [gx + 32, 380, gx + 32, 296, gx + 48, 256, gx + 62, 296, gx + 62, 380], '#160c22');
    [[gx, 284], [gx - 46, 318], [gx + 47, 310]].forEach(function (w) { rr(c, w[0] - 3, w[1], 6, 10, 2); c.fillStyle = '#59ff9c'; c.fill(); });
    poly(c, [0, 470, 140, 430, 380, 446, 520, 480, 540, 540, 0, 540], '#1e1424');
    for (var e = 0; e < 26; e++) {
      var ex = (hash(e * 5) * W + t * 30 * (0.5 + hash(e))) % W, ey = H - ((t * (30 + hash(e * 2) * 40) + hash(e * 7) * H) % H);
      c.globalAlpha = 0.6; circle(c, ex, ey, 2, '#ffb040'); c.globalAlpha = 1;
    }
    c.save(); c.translate(300, 452); c.scale(2.5, 2.5);
    drawHero(c, { t: t, moving: 0, swing: -1, victory: true, rank: 3 });
    c.restore();
  }

  var MAP_W = 1600;
  var MAP_NODES = [[130, 400], [285, 290], [430, 410], [575, 270], [715, 390], [865, 250], [1005, 385], [1150, 265], [1300, 390], [1460, 250]];
  var REGIONS = [
    { from: 0, to: 500, col: 'rgba(90,150,60,0.18)', name: 'Greenmarch Woods' },
    { from: 500, to: 790, col: 'rgba(200,120,50,0.18)', name: 'Ashen Vale' },
    { from: 790, to: 1075, col: 'rgba(60,60,80,0.2)', name: 'Hollow Deep' },
    { from: 1075, to: 1375, col: 'rgba(120,180,230,0.22)', name: 'Rimeveil Peaks' },
    { from: 1375, to: 1600, col: 'rgba(110,50,140,0.22)', name: 'Lich Citadel' }
  ];
  var mapCache = null;
  function buildMap() {
    var m = document.createElement('canvas');
    m.width = MAP_W * res; m.height = H * res;
    var c = m.getContext('2d');
    c.scale(res, res);
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#ecd9a8'); g.addColorStop(1, '#d9bf86');
    c.fillStyle = g; c.fillRect(0, 0, MAP_W, H);
    var r = root.HWRng.create(77);
    for (var i = 0; i < 260; i++) { c.globalAlpha = r.range(0.03, 0.09); circle(c, r.range(0, MAP_W), r.range(0, H), r.range(10, 60), r.chance(0.5) ? '#a07840' : '#fff4d0'); }
    c.globalAlpha = 1;
    REGIONS.forEach(function (rg) {
      c.fillStyle = rg.col;
      c.beginPath(); c.ellipse((rg.from + rg.to) / 2, 330, (rg.to - rg.from) * 0.62, 210, 0, 0, Math.PI * 2); c.fill();
      c.font = 'italic bold 20px Georgia, "DejaVu Serif", serif'; c.textAlign = 'center'; c.fillStyle = 'rgba(80,50,20,0.65)';
      c.fillText(rg.name, (rg.from + rg.to) / 2, 96);
    });
    // River.
    c.beginPath(); c.moveTo(470, 540);
    c.bezierCurveTo(520, 420, 450, 330, 520, 230); c.bezierCurveTo(560, 160, 540, 100, 600, 60);
    c.lineWidth = 14; c.strokeStyle = 'rgba(80,140,180,0.45)'; c.stroke();
    // Region doodles.
    for (var k = 0; k < 70; k++) {
      var x = r.range(20, MAP_W - 20), y = r.range(130, 520);
      var near = MAP_NODES.some(function (n) { return Math.abs(n[0] - x) < 60 && Math.abs(n[1] - y) < 50; });
      if (near) continue;
      c.globalAlpha = 0.75;
      if (x < 500) { line(c, x, y, x, y - 10, 2, '#6a4a2a'); circle(c, x, y - 16, 8, '#5a8a3a'); }
      else if (x < 790) { poly(c, [x - 8, y, x - 8, y - 10, x, y - 18, x + 8, y - 10, x + 8, y], '#a07a50', '#5a3a20', 1); }
      else if (x < 1075) { rr(c, x - 7, y - 16, 14, 16, 6); c.fillStyle = '#8a8a90'; c.fill(); line(c, x, y - 13, x, y - 4, 2, '#4a4a50'); line(c, x - 4, y - 10, x + 4, y - 10, 2, '#4a4a50'); }
      else if (x < 1375) { poly(c, [x - 16, y, x, y - 26, x + 16, y], '#8aa6c0', '#4a6680', 1); poly(c, [x - 6, y - 15, x, y - 26, x + 6, y - 15], '#ffffff'); }
      else { poly(c, [x - 5, y, x - 5, y - 18, x, y - 28, x + 5, y - 18, x + 5, y], '#3a2448'); }
      c.globalAlpha = 1;
    }
    // Path between nodes.
    c.beginPath(); c.moveTo(MAP_NODES[0][0], MAP_NODES[0][1]);
    for (var n = 1; n < MAP_NODES.length; n++) {
      var a = MAP_NODES[n - 1], bnode = MAP_NODES[n];
      c.quadraticCurveTo((a[0] + bnode[0]) / 2, (a[1] + bnode[1]) / 2 + (n % 2 ? -50 : 50), bnode[0], bnode[1]);
    }
    c.setLineDash([10, 9]); c.lineWidth = 6; c.strokeStyle = 'rgba(110,70,30,0.75)'; c.stroke(); c.setLineDash([]);
    // Compass rose.
    c.save(); c.translate(60, 140);
    poly(c, [0, -34, 7, 0, 0, 34, -7, 0], '#7a5228'); poly(c, [-34, 0, 0, -7, 34, 0, 0, 7], '#a07848');
    c.font = 'bold 14px Georgia, serif'; c.fillStyle = '#5a3a18'; c.textAlign = 'center'; c.fillText('N', 0, -40);
    c.restore();
    // Burnt edges.
    var v = c.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, 'rgba(90,50,10,0.45)'); v.addColorStop(0.12, 'rgba(90,50,10,0)'); v.addColorStop(0.9, 'rgba(90,50,10,0)'); v.addColorStop(1, 'rgba(90,50,10,0.5)');
    c.fillStyle = v; c.fillRect(0, 0, MAP_W, H);
    var hz = c.createLinearGradient(0, 0, MAP_W, 0);
    hz.addColorStop(0, 'rgba(90,50,10,0.5)'); hz.addColorStop(0.04, 'rgba(90,50,10,0)'); hz.addColorStop(0.96, 'rgba(90,50,10,0)'); hz.addColorStop(1, 'rgba(90,50,10,0.5)');
    c.fillStyle = hz; c.fillRect(0, 0, MAP_W, H);
    return m;
  }
  function drawMap(scroll, t, cleared) {
    begin();
    if (!mapCache || mapCache.res !== res) { mapCache = { img: buildMap(), res: res }; }
    var c = ctx;
    c.drawImage(mapCache.img, scroll * res, 0, W * res, H * res, 0, 0, W, H);
    // Hero token bobbing at the frontier node.
    var n = MAP_NODES[Math.min(cleared, MAP_NODES.length - 1)];
    c.save(); c.translate(n[0] - scroll - 44, n[1] + 14 + Math.sin(t * 3) * 2); c.scale(0.55, 0.55);
    c.globalAlpha = 0.3; ellipse(c, 0, 2, 26, 7, '#000'); c.globalAlpha = 1;
    drawHero(c, { t: t, rank: 0 });
    c.restore();
  }

  function drawHeroBackdrop(t, rank) {
    begin();
    var c = ctx;
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a2140'); g.addColorStop(1, '#0b0e1c');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    var col = D.RANKS[rank].color;
    var rg = c.createRadialGradient(226, 300, 20, 226, 300, 220);
    rg.addColorStop(0, 'rgba(255,230,160,0.25)'); rg.addColorStop(1, 'rgba(255,230,160,0)');
    c.fillStyle = rg; c.fillRect(0, 60, 452, 420);
    c.save(); c.shadowColor = col; c.shadowBlur = 22;
    rr(c, 120, 92, 212, 300, 18); c.lineWidth = 5; c.strokeStyle = col; c.stroke();
    c.restore();
    rr(c, 124, 96, 204, 292, 15);
    var pg = c.createLinearGradient(0, 96, 0, 388);
    pg.addColorStop(0, '#2c4680'); pg.addColorStop(1, '#141e3a');
    c.fillStyle = pg; c.fill();
    c.save(); rr(c, 124, 96, 204, 292, 15); c.clip();
    c.save(); c.globalAlpha = 0.3; ellipse(c, 226, 372, 60, 12, '#000'); c.restore();
    c.translate(232, 370); c.scale(2.45, 2.45);
    drawHero(c, { t: t, moving: 0, swing: -1, rank: rank });
    c.restore();
    text(c, D.RANKS[rank].name + ' rank', 226, 380, 14, col, 'center', 'bold', 3);
  }

  function drawChest(c, cx, cy, t) {
    var drop = Math.min(1, t / 0.35);
    var y = cy - (1 - drop * drop) * 260 + (t > 0.35 && t < 0.5 ? Math.sin((t - 0.35) / 0.15 * Math.PI) * -12 : 0);
    var shake = t > 0.5 && t < 1.15 ? Math.sin(t * 60) * 4 * (t - 0.5) : 0;
    var open = Math.max(0, Math.min(1, (t - 1.15) / 0.25));
    if (open > 0) {
      c.save(); c.translate(cx, y - 30);
      for (var i = 0; i < 12; i++) {
        c.save(); c.rotate(t * 0.6 + i * Math.PI / 6); c.globalAlpha = 0.22 * open;
        poly(c, [0, 0, -18, -260, 18, -260], '#ffe58a'); c.restore();
      }
      var gg = c.createRadialGradient(0, 0, 5, 0, 0, 120);
      gg.addColorStop(0, 'rgba(255,240,180,' + 0.85 * open + ')'); gg.addColorStop(1, 'rgba(255,240,180,0)');
      c.fillStyle = gg; c.fillRect(-120, -120, 240, 240);
      c.restore();
    }
    c.save(); c.translate(cx + shake, y);
    ellipse(c, 0, 4, 70, 12, 'rgba(0,0,0,0.4)');
    var bg = c.createLinearGradient(0, -60, 0, 0);
    bg.addColorStop(0, '#9a5a2a'); bg.addColorStop(1, '#5a3014');
    rr(c, -62, -58, 124, 58, 6); c.fillStyle = bg; c.fill(); c.lineWidth = 3; c.strokeStyle = '#3a1e0a'; c.stroke();
    [-40, 40].forEach(function (x) { rr(c, x - 6, -58, 12, 58, 2); c.fillStyle = '#e1b84a'; c.fill(); });
    rr(c, -62, -34, 124, 7, 2); c.fillStyle = '#c99a30'; c.fill();
    rr(c, -10, -44, 20, 22, 4); c.fillStyle = '#ffd650'; c.fill(); circle(c, 0, -33, 3, '#5a3014');
    if (open > 0) { c.save(); c.globalAlpha = open; ellipse(c, 0, -58, 58, 10, '#fff6c8'); c.restore(); }
    // Lid hinged at the back.
    c.save(); c.translate(0, -58); c.scale(1, 1 - open * 1.7);
    c.beginPath(); c.moveTo(-62, 0); c.quadraticCurveTo(-60, -34, 0, -38); c.quadraticCurveTo(60, -34, 62, 0); c.closePath();
    var lg = c.createLinearGradient(0, -38, 0, 0); lg.addColorStop(0, '#b06a32'); lg.addColorStop(1, '#6a3a18');
    c.fillStyle = lg; c.fill(); c.lineWidth = 3; c.strokeStyle = '#3a1e0a'; c.stroke();
    [-40, 40].forEach(function (x) { rr(c, x - 6, -34, 12, 34, 2); c.fillStyle = '#e1b84a'; c.fill(); });
    c.restore();
    c.restore();
  }

  function drawResult(b, info, t, won) {
    drawBattle(b, info);
    begin();
    var c = ctx;
    c.fillStyle = won ? 'rgba(8,6,20,0.62)' : 'rgba(30,0,0,0.66)';
    c.fillRect(0, 0, W, H);
    if (won) drawChest(c, W / 2, 292, t);
  }

  function drawFinal(t, rank) {
    begin();
    var c = ctx;
    skyGrad(c, ['#0a0820', '#2a1a50', '#6a3a6a']);
    for (var i = 0; i < 6; i++) {
      var ft = (t + i * 0.7) % 2.4, fx0 = 120 + hash(i * 11 + Math.floor((t + i * 0.7) / 2.4)) * 720, fy0 = 80 + hash(i * 5) * 160;
      if (ft < 1.4) for (var k = 0; k < 18; k++) {
        var a = k / 18 * Math.PI * 2, rad = ft * 70;
        c.globalAlpha = Math.max(0, 1 - ft / 1.4);
        circle(c, fx0 + Math.cos(a) * rad, fy0 + Math.sin(a) * rad + ft * ft * 20, 2.5, ['#ffe14a', '#ff6b8a', '#6dff8a', '#8ad0ff'][i % 4]);
      }
    }
    c.globalAlpha = 1;
    poly(c, [0, 430, 300, 400, 660, 410, 960, 430, 960, 540, 0, 540], '#1a1224');
    c.save(); c.translate(210, 440); c.scale(2.2, 2.2);
    drawHero(c, { t: t, victory: true, rank: rank });
    c.restore();
  }

  // ---------------------------------------------------------------- setup
  function init(canvas) { cv = canvas; ctx = cv.getContext('2d'); }
  function setResolution(r) {
    r = Math.max(1, Math.min(2, r));
    if (r === res && cv.width === W * r) return;
    res = r;
    cv.width = W * r; cv.height = H * r;
  }

  root.HWRender = {
    MAP_W: MAP_W, MAP_NODES: MAP_NODES,
    init: init, setResolution: setResolution, resetFx: resetFx, handleEvents: handleEvents, updateFx: updateFx,
    fx: function () { return fx; }, drawBattle: drawBattle, drawResult: drawResult, heroRect: heroRect,
    drawTitle: drawTitle, drawMap: drawMap, drawHeroBackdrop: drawHeroBackdrop,
    drawFinal: drawFinal,
    drawItemIcon: drawItemIcon, drawSkillIcon: drawSkillIcon, drawEnemyIcon: drawEnemyIcon
  };
})(window);

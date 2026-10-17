/*
 * Hero Pins — render.js
 * Procedural Canvas 2D drawing of a level: stone tower, walls, metal pins,
 * coins, gems, lava, water, monsters, the knight hero and effects.
 * No images: everything is built from paths and gradients.
 * Exposes window.HPRender.draw(ctx, game, ui).
 */
(function (root) {
  'use strict';

  var W = 420, H = 760, FRAME = 20;
  var backdrop = null;   // cached tower background (offscreen canvas)

  function capsulePath(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Bricks for the frame and a dim wall texture for the interior; drawn once.
  function buildBackdrop() {
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');
    var bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2a2140');
    bg.addColorStop(0.55, '#1d1830');
    bg.addColorStop(1, '#141020');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    // faint interior bricks
    g.strokeStyle = 'rgba(255,255,255,0.035)';
    g.lineWidth = 1;
    for (var y = FRAME, row = 0; y < H; y += 26, row++) {
      g.beginPath(); g.moveTo(FRAME, y); g.lineTo(W - FRAME, y); g.stroke();
      for (var x = FRAME + (row % 2) * 24; x < W - FRAME; x += 48) {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 26); g.stroke();
      }
    }
    // vignette
    var v = g.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 520);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
    // frame stones
    function stoneBand(x0, y0, w, h, horizontal) {
      var sg = horizontal ? g.createLinearGradient(0, y0, 0, y0 + h) : g.createLinearGradient(x0, 0, x0 + w, 0);
      sg.addColorStop(0, '#8a7a66');
      sg.addColorStop(0.5, '#6b5d4d');
      sg.addColorStop(1, '#4a3f34');
      g.fillStyle = sg;
      g.fillRect(x0, y0, w, h);
      g.strokeStyle = 'rgba(30,22,16,0.7)';
      g.lineWidth = 1.5;
      var len = horizontal ? w : h, step = 30;
      for (var t = 0; t < len; t += step) {
        var jitter = Math.floor(rnd() * 8);
        g.beginPath();
        if (horizontal) { g.moveTo(x0 + t + jitter, y0); g.lineTo(x0 + t + jitter, y0 + h); }
        else { g.moveTo(x0, y0 + t + jitter); g.lineTo(x0 + w, y0 + t + jitter); }
        g.stroke();
      }
    }
    stoneBand(0, 0, W, FRAME, true);
    stoneBand(0, H - FRAME, W, FRAME, true);
    stoneBand(0, 0, FRAME, H, false);
    stoneBand(W - FRAME, 0, FRAME, H, false);
    // bevel
    g.strokeStyle = 'rgba(255,230,190,0.25)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, W - 2, H - 2);
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.strokeRect(FRAME - 1, FRAME - 1, W - 2 * FRAME + 2, H - 2 * FRAME + 2);
    return c;
  }

  function drawWalls(ctx, walls, r) {
    ctx.lineCap = 'round';
    walls.forEach(function (w) {
      capsulePath(ctx, w[0], w[1], w[2], w[3]);
      ctx.strokeStyle = '#3b3129'; ctx.lineWidth = r * 2 + 2; ctx.stroke();
      ctx.strokeStyle = '#7d6c58'; ctx.lineWidth = r * 2 - 1; ctx.stroke();
      ctx.save();
      ctx.translate(-1.2, -1.6);
      capsulePath(ctx, w[0], w[1], w[2], w[3]);
      ctx.strokeStyle = 'rgba(255,235,200,0.28)'; ctx.lineWidth = r * 0.7; ctx.stroke();
      ctx.restore();
    });
  }

  function drawPin(ctx, pin, hover, hint, t) {
    var s = pin.seg, d = pin.dir;
    // the out end carries the pull knob
    var outEnd = (d.x * (s.x2 - s.x1) + d.y * (s.y2 - s.y1)) > 0 ? { x: s.x2, y: s.y2 } : { x: s.x1, y: s.y1 };
    var inEnd = outEnd.x === s.x2 && outEnd.y === s.y2 ? { x: s.x1, y: s.y1 } : { x: s.x2, y: s.y2 };
    ctx.lineCap = 'round';
    if (hint) {
      var pulse = 0.5 + 0.5 * Math.sin(t * 8);
      capsulePath(ctx, inEnd.x, inEnd.y, outEnd.x, outEnd.y);
      ctx.strokeStyle = 'rgba(255,215,64,' + (0.35 + 0.5 * pulse) + ')';
      ctx.lineWidth = 22 + 6 * pulse;
      ctx.stroke();
    }
    if (hover) {
      capsulePath(ctx, inEnd.x, inEnd.y, outEnd.x, outEnd.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 20;
      ctx.stroke();
    }
    capsulePath(ctx, inEnd.x, inEnd.y, outEnd.x, outEnd.y);
    ctx.strokeStyle = '#2b2f36'; ctx.lineWidth = 14; ctx.stroke();
    var nx = -d.y, ny = d.x;
    var grad = ctx.createLinearGradient(inEnd.x + nx * 6, inEnd.y + ny * 6, inEnd.x - nx * 6, inEnd.y - ny * 6);
    grad.addColorStop(0, '#5d6670');
    grad.addColorStop(0.45, '#e9eef3');
    grad.addColorStop(0.6, '#b7c0ca');
    grad.addColorStop(1, '#6c7480');
    capsulePath(ctx, inEnd.x, inEnd.y, outEnd.x, outEnd.y);
    ctx.strokeStyle = grad; ctx.lineWidth = 11; ctx.stroke();
    // knob (ring handle) at the out end
    var kx = outEnd.x, ky = outEnd.y;
    var kg = ctx.createRadialGradient(kx - 3, ky - 3, 1, kx, ky, 11);
    kg.addColorStop(0, '#fff6c8');
    kg.addColorStop(0.5, '#e0b440');
    kg.addColorStop(1, '#8a5f12');
    ctx.beginPath(); ctx.arc(kx, ky, 10.5, 0, Math.PI * 2);
    ctx.fillStyle = kg; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#5a3c08'; ctx.stroke();
    ctx.beginPath(); ctx.arc(kx, ky, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = '#3a2706'; ctx.fill();
  }

  function drawCoin(ctx, b) {
    var g = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, b.r);
    g.addColorStop(0, '#fff8c4');
    g.addColorStop(0.35, '#ffd84a');
    g.addColorStop(1, '#b97a0c');
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1.4; ctx.strokeStyle = '#7a4c05'; ctx.stroke();
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.58, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(140,90,10,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.arc(b.x - 3, b.y - 3.5, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
  }

  function drawGem(ctx, b) {
    var r = b.r + 1;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y - r);
    ctx.lineTo(b.x + r * 0.85, b.y - r * 0.2);
    ctx.lineTo(b.x, b.y + r);
    ctx.lineTo(b.x - r * 0.85, b.y - r * 0.2);
    ctx.closePath();
    var g = ctx.createLinearGradient(b.x - r, b.y - r, b.x + r, b.y + r);
    g.addColorStop(0, '#d6fbff');
    g.addColorStop(0.4, '#3fd9f0');
    g.addColorStop(1, '#155e9e');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1.3; ctx.strokeStyle = '#0b3558'; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b.x - r * 0.85, b.y - r * 0.2); ctx.lineTo(b.x + r * 0.85, b.y - r * 0.2);
    ctx.moveTo(b.x, b.y - r); ctx.lineTo(b.x - r * 0.3, b.y - r * 0.2); ctx.lineTo(b.x, b.y + r);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.stroke();
  }

  function blobs(ctx, list, k, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      ctx.moveTo(b.x + b.r * k, b.y);
      ctx.arc(b.x, b.y, b.r * k, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  function drawLiquid(ctx, list, glow, edge, outer, inner, t) {
    if (!list.length) return;
    var i, b;
    if (glow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < list.length; i++) {
        b = list[i];
        var gg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 3.2);
        gg.addColorStop(0, glow);
        gg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gg;
        ctx.fillRect(b.x - b.r * 3.2, b.y - b.r * 3.2, b.r * 6.4, b.r * 6.4);
      }
      ctx.restore();
    }
    blobs(ctx, list, 1.45, edge);
    blobs(ctx, list, 1.22, outer);
    ctx.fillStyle = inner;
    ctx.beginPath();
    for (i = 0; i < list.length; i++) {
      b = list[i];
      var wob = Math.sin(t * 5 + b.id * 1.7) * 1.2;
      ctx.moveTo(b.x + b.r * 0.75 + wob, b.y - 1);
      ctx.arc(b.x + wob * 0.5, b.y - 1, b.r * 0.75, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  function powerBadge(ctx, x, y, value, fill, edge) {
    var text = String(value);
    ctx.font = 'bold 14px Georgia, "Times New Roman", serif';
    var w = Math.max(26, ctx.measureText(text).width + 14);
    roundRect(ctx, x - w / 2, y - 10, w, 20, 8);
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = edge; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }

  function drawMonster(ctx, b, t) {
    var x = b.x, y = b.y, r = b.r;
    // horns
    ctx.fillStyle = '#e8dcc0';
    ctx.beginPath(); ctx.moveTo(x - r * 0.8, y - r * 0.5); ctx.lineTo(x - r * 1.25, y - r * 1.25); ctx.lineTo(x - r * 0.35, y - r * 0.85); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + r * 0.8, y - r * 0.5); ctx.lineTo(x + r * 1.25, y - r * 1.25); ctx.lineTo(x + r * 0.35, y - r * 0.85); ctx.fill();
    var g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 2, x, y, r * 1.1);
    g.addColorStop(0, '#9fe06a');
    g.addColorStop(0.7, '#4f9a2c');
    g.addColorStop(1, '#2c5a17');
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#1c3a0e'; ctx.stroke();
    // angry eyes
    var blink = Math.sin(t * 1.3 + b.id) > 0.97 ? 0.2 : 1;
    [-1, 1].forEach(function (s) {
      ctx.beginPath(); ctx.ellipse(x + s * r * 0.38, y - r * 0.12, r * 0.24, r * 0.2 * blink, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#fff6a0'; ctx.fill();
      ctx.beginPath(); ctx.arc(x + s * r * 0.33, y - r * 0.08, r * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = '#c00'; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + s * r * 0.12, y - r * 0.3);
      ctx.lineTo(x + s * r * 0.68, y - r * 0.48);
      ctx.lineWidth = 3; ctx.strokeStyle = '#1c3a0e'; ctx.lineCap = 'round'; ctx.stroke();
    });
    // mouth and tusks
    ctx.beginPath(); ctx.arc(x, y + r * 0.55, r * 0.38, Math.PI * 1.1, Math.PI * 1.9);
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#1c3a0e'; ctx.stroke();
    ctx.fillStyle = '#fffbe8';
    ctx.beginPath(); ctx.moveTo(x - r * 0.3, y + r * 0.32); ctx.lineTo(x - r * 0.22, y + r * 0.05); ctx.lineTo(x - r * 0.12, y + r * 0.3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + r * 0.3, y + r * 0.32); ctx.lineTo(x + r * 0.22, y + r * 0.05); ctx.lineTo(x + r * 0.12, y + r * 0.3); ctx.fill();
  }

  function drawMonsterBadge(ctx, b, heroPower) {
    var weaker = heroPower >= b.power;
    powerBadge(ctx, b.x, b.y - b.r - 14, b.power, weaker ? '#3a7d2a' : '#a3201b', weaker ? '#b8f08a' : '#ffb0a0');
  }

  function drawHero(ctx, hero, t, room) {
    var x = hero.x, y = hero.y;
    // torch light in the hero's chamber
    var lg = ctx.createRadialGradient(x, y - 10, 10, x, y - 10, 130);
    lg.addColorStop(0, 'rgba(255,200,120,0.18)');
    lg.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(room.x, room.y - 60, room.w, room.h + 60);
    var bob = hero.alive ? Math.sin(t * 3) * 1.2 : 0;
    ctx.save();
    ctx.translate(x, y + bob);
    if (!hero.alive) ctx.filter = 'grayscale(1) brightness(0.45)';
    // cape
    ctx.fillStyle = '#9b1c22';
    ctx.beginPath(); ctx.moveTo(-12, -12); ctx.lineTo(12, -12); ctx.lineTo(16, 22); ctx.lineTo(-16, 22); ctx.closePath(); ctx.fill();
    // legs
    ctx.fillStyle = '#4a4f5c';
    ctx.fillRect(-9, 12, 7, 12); ctx.fillRect(2, 12, 7, 12);
    // body armour
    var ag = ctx.createLinearGradient(-12, 0, 12, 0);
    ag.addColorStop(0, '#8b95a3'); ag.addColorStop(0.5, '#eef2f6'); ag.addColorStop(1, '#7a8492');
    roundRect(ctx, -12, -10, 24, 24, 6);
    ctx.fillStyle = ag; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#3a404a'; ctx.stroke();
    ctx.fillStyle = '#d4a52c'; ctx.fillRect(-12, 6, 24, 3);
    // sword (right hand, raised)
    ctx.save();
    ctx.translate(15, -2);
    ctx.rotate(-0.5 + (hero.alive ? Math.sin(t * 3) * 0.05 : 0.6));
    ctx.fillStyle = '#e8edf2';
    ctx.beginPath(); ctx.moveTo(-2.5, 0); ctx.lineTo(2.5, 0); ctx.lineTo(2.5, -30); ctx.lineTo(0, -36); ctx.lineTo(-2.5, -30); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#6d7682'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#d4a52c'; ctx.fillRect(-7, -1, 14, 3.5);
    ctx.fillStyle = '#5b3a1a'; ctx.fillRect(-1.8, 2.5, 3.6, 7);
    ctx.restore();
    // helmet
    var hg = ctx.createRadialGradient(-4, -27, 2, 0, -22, 14);
    hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.5, '#c7ced8'); hg.addColorStop(1, '#69717d');
    ctx.beginPath(); ctx.arc(0, -22, 12, 0, Math.PI * 2);
    ctx.fillStyle = hg; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#3a404a'; ctx.stroke();
    ctx.fillStyle = '#1c2028';
    ctx.fillRect(-8, -24, 16, 3.2);
    ctx.fillRect(-1.2, -24, 2.4, 9);
    // plume
    ctx.fillStyle = '#d8262e';
    ctx.beginPath(); ctx.moveTo(-2, -33); ctx.quadraticCurveTo(10, -46, 16, -32); ctx.quadraticCurveTo(8, -38, 2, -32); ctx.closePath(); ctx.fill();
    // shield (left)
    ctx.save();
    ctx.translate(-15, 2);
    ctx.beginPath(); ctx.moveTo(-9, -11); ctx.lineTo(9, -11); ctx.lineTo(9, 1); ctx.quadraticCurveTo(9, 10, 0, 14); ctx.quadraticCurveTo(-9, 10, -9, 1); ctx.closePath();
    var sg = ctx.createLinearGradient(-9, -11, 9, 14);
    sg.addColorStop(0, '#3d6fd8'); sg.addColorStop(1, '#173a8a');
    ctx.fillStyle = sg; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#d4a52c'; ctx.stroke();
    ctx.fillStyle = '#ffd84a';
    ctx.fillRect(-1.5, -8, 3, 18); ctx.fillRect(-6, -3, 12, 3);
    ctx.restore();
    ctx.restore();
    powerBadge(ctx, x, y - 58, hero.power, '#1f4fa8', '#ffd84a');
  }

  function drawFx(ctx, fx) {
    fx.forEach(function (f) {
      var a = Math.max(0, 1 - f.age / 1.2);
      if (f.kind === 'float') {
        ctx.font = 'bold 16px Georgia, serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = a;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(f.text, f.x, f.y - f.age * 50);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y - f.age * 50);
        ctx.globalAlpha = 1;
      } else {
        var color = f.kind === 'steam' ? '220,228,235' : f.kind === 'burn' ? '255,150,40' : f.kind === 'puff' ? '170,200,140' : '255,90,40';
        var n = f.kind === 'burnHero' || f.kind === 'slain' ? 10 : 5;
        var spread = f.kind === 'burnHero' || f.kind === 'slain' ? 40 : 18;
        for (var i = 0; i < n; i++) {
          var ang = (i / n) * Math.PI * 2 + f.seed * 6.28;
          var dist = spread * Math.min(1, f.age * 2.5);
          ctx.beginPath();
          ctx.arc(f.x + Math.cos(ang) * dist, f.y + Math.sin(ang) * dist - f.age * 25, (4 + f.seed * 4) * (1 - a * 0.3), 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(' + color + ',' + (a * 0.75) + ')';
          ctx.fill();
        }
      }
    });
  }

  // ui: { hoverPin, hintPin, time }
  function draw(ctx, game, ui) {
    if (!backdrop) backdrop = buildBackdrop();
    var t = ui.time;
    ctx.drawImage(backdrop, 0, 0);
    var def = game.def;
    drawWalls(ctx, def.walls, root.HeroPins.WALL_R);
    drawHero(ctx, game.hero, t, def.heroRoom);

    var lava = [], water = [];
    game.world.bodies.forEach(function (b) {
      if (b.type === 'lava') lava.push(b);
      else if (b.type === 'water') water.push(b);
    });
    drawLiquid(ctx, water, null, '#174a92', '#2d7fd6', '#7cc4ff', t);
    drawLiquid(ctx, lava, 'rgba(255,110,20,0.25)', '#8e1a06', '#e2410f', '#ffb21f', t);
    game.world.bodies.forEach(function (b) {
      if (b.type === 'coin') drawCoin(ctx, b);
      else if (b.type === 'gem') drawGem(ctx, b);
      else if (b.type === 'monster') drawMonster(ctx, b, t);
    });
    game.pins.forEach(function (p) {
      if (!p.gone) drawPin(ctx, p, ui.hoverPin === p.id, ui.hintPin === p.id, t);
    });
    // power numbers always on top so nothing hides them
    game.world.bodies.forEach(function (b) {
      if (b.type === 'monster') drawMonsterBadge(ctx, b, game.hero.power);
    });
    drawFx(ctx, game.fx);
  }

  root.HPRender = { draw: draw };
})(window);

/*
 * Hero Pins — ui.js
 * Browser glue: responsive canvas scaling, the 60 Hz render loop, pointer input
 * (click / tap / drag pins), DOM screens (title, level select, HUD, victory,
 * defeat, final) and progress saved in localStorage ("heroPins.progress").
 */
(function () {
  'use strict';

  var HP = window.HeroPins;
  var W = HP.VIEW_W, H = HP.VIEW_H, HUD_H = 48;
  var STORE_KEY = 'heroPins.progress';
  var $ = function (id) { return document.getElementById(id); };

  var canvas = $('game'), ctx = canvas.getContext('2d');
  var scale = 1, dpr = 1;
  var seenGame = null, shownGame = null, resolvedAt = 0, overlayShown = false;
  var ui = { hoverPin: null, hintPin: null, time: 0 };
  var drag = null;
  var hudCache = '';

  // ---------- progress ----------
  function loadProgress() {
    try {
      var p = JSON.parse(localStorage.getItem(STORE_KEY));
      if (p && typeof p.unlocked === 'number' && p.stars) return p;
    } catch (e) { /* storage unavailable: start fresh */ }
    return { unlocked: 1, stars: {} };
  }
  var progress = loadProgress();
  function saveProgress() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (e) { /* ignore */ }
  }

  // ---------- layout ----------
  function layout() {
    dpr = window.devicePixelRatio || 1;
    var availW = window.innerWidth - 12, availH = window.innerHeight - HUD_H - 12;
    scale = Math.max(0.3, Math.min(availW / W, availH / H));
    canvas.style.width = Math.round(W * scale) + 'px';
    canvas.style.height = Math.round(H * scale) + 'px';
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
    $('hud').style.width = Math.round(W * scale) + 'px';
    var k = Math.min(1, scale * 1.1);
    document.querySelectorAll('.screen').forEach(function (s) { s.style.fontSize = (16 * k) + 'px'; });
    render();
  }

  // ---------- screens ----------
  var screens = ['scrTitle', 'scrLevels', 'scrWin', 'scrLose', 'scrFinal'];
  function show(id) {
    screens.forEach(function (s) { $(s).classList.toggle('show', s === id); });
    $('hud').classList.toggle('show', id === null || id === 'scrWin' || id === 'scrLose');
  }

  function starsHtml(n) {
    var s = '';
    for (var i = 1; i <= 3; i++) s += '<span class="' + (i <= n ? 'on' : '') + '">&#9733;</span>';
    return s;
  }

  function buildLevelGrid() {
    var grid = $('levelGrid');
    grid.innerHTML = '';
    for (var n = 1; n <= HP.levelCount(); n++) {
      var b = document.createElement('button');
      var locked = n > progress.unlocked;
      b.className = 'tile' + (locked ? ' locked' : '');
      b.innerHTML = '<span class="num">' + (locked ? '&#128274;' : n) + '</span>' +
        '<span class="tstars">' + starsHtml(progress.stars[n] || 0) + '</span>';
      b.title = locked ? 'Locked' : window.HPLevels[n - 1].name;
      if (!locked) b.addEventListener('click', startLevel.bind(null, n));
      grid.appendChild(b);
    }
  }

  function startLevel(n) {
    HP.setHeadless(false);
    HP.loadLevel(n);
  }

  function onNewGame(g) {
    shownGame = g;
    overlayShown = false;
    resolvedAt = 0;
    ui.hintPin = null;
    ui.hoverPin = null;
    drag = null;
    hudCache = '';
    show(null);
  }

  function onResolved(g) {
    overlayShown = true;
    if (g.status === 'won') {
      var n = g.n;
      progress.stars[n] = Math.max(progress.stars[n] || 0, g.stars);
      progress.unlocked = Math.max(progress.unlocked, Math.min(HP.levelCount(), n + 1));
      saveProgress();
      $('winStars').innerHTML = starsHtml(g.stars);
      $('winText').textContent = g.stars === 3 ? 'Flawless! Minimum pulls, all treasure.' :
        g.stars === 2 ? 'All treasure secured. Try fewer pulls (no hints) for 3 stars.' : 'The hero survives!';
      $('btnNext').textContent = n >= HP.levelCount() ? 'Finish' : 'Next level';
      show('scrWin');
    } else {
      $('loseReason').textContent = g.reason;
      show('scrLose');
    }
  }

  // ---------- input ----------
  function toLogical(e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }

  function pinAt(pt) {
    var g = HP.current();
    if (!g || g.status !== 'playing') return null;
    var best = null, bestD = 16;
    g.pins.forEach(function (p) {
      if (p.pulled) return;
      var s = p.seg, ex = s.x2 - s.x1, ey = s.y2 - s.y1;
      var t = ((pt.x - s.x1) * ex + (pt.y - s.y1) * ey) / (ex * ex + ey * ey);
      t = Math.max(0, Math.min(1, t));
      var dx = pt.x - (s.x1 + ex * t), dy = pt.y - (s.y1 + ey * t);
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = p; }
    });
    return best;
  }

  function pull(p) {
    if (HP.pullPin(p.id) && ui.hintPin === p.id) ui.hintPin = null;
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (shownGame === null || overlayShown) return;
    var pt = toLogical(e), p = pinAt(pt);
    if (!p) return;
    drag = { pin: p, x: pt.x, y: pt.y };
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', function (e) {
    var pt = toLogical(e);
    if (drag) {
      var along = (pt.x - drag.x) * drag.pin.dir.x + (pt.y - drag.y) * drag.pin.dir.y;
      if (along > 18) { pull(drag.pin); drag = null; }
      return;
    }
    var p = pinAt(pt);
    ui.hoverPin = p ? p.id : null;
    canvas.classList.toggle('pointer', !!p);
  });
  canvas.addEventListener('pointerup', function (e) {
    if (!drag) return;
    var pt = toLogical(e);
    if (pinAt(pt) === drag.pin) pull(drag.pin);   // a click / tap on the pin
    drag = null;
  });
  canvas.addEventListener('pointercancel', function () { drag = null; });
  canvas.addEventListener('pointerleave', function () { ui.hoverPin = null; canvas.classList.remove('pointer'); });

  // ---------- buttons ----------
  function goMenu() { shownGame = null; show('scrTitle'); }
  function restart() { if (shownGame) startLevel(shownGame.n); }
  $('btnPlay').addEventListener('click', function () { startLevel(Math.min(progress.unlocked, HP.levelCount())); });
  $('btnSelect').addEventListener('click', function () { buildLevelGrid(); show('scrLevels'); });
  $('btnLevelsBack').addEventListener('click', function () { show('scrTitle'); });
  $('btnHint').addEventListener('click', function () { if (shownGame && !overlayShown) ui.hintPin = HP.hint(); });
  $('btnRestart').addEventListener('click', restart);
  $('btnMenu').addEventListener('click', goMenu);
  $('btnReplay').addEventListener('click', restart);
  $('btnRetry').addEventListener('click', restart);
  $('btnWinMenu').addEventListener('click', goMenu);
  $('btnLoseMenu').addEventListener('click', goMenu);
  $('btnNext').addEventListener('click', function () {
    var n = shownGame.n;
    if (n >= HP.levelCount()) {
      var total = 0;
      for (var i = 1; i <= HP.levelCount(); i++) total += progress.stars[i] || 0;
      $('finalStars').innerHTML = '&#9733; ' + total + ' / ' + (HP.levelCount() * 3);
      shownGame = null;
      show('scrFinal');
    } else startLevel(n + 1);
  });
  $('btnFinalLevels').addEventListener('click', function () { buildLevelGrid(); show('scrLevels'); });
  $('btnFinalMenu').addEventListener('click', goMenu);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'r' || e.key === 'R') restart();
    else if (e.key === 'Escape') goMenu();
  });
  window.addEventListener('resize', layout);

  // ---------- loop ----------
  function updateHud(g) {
    var level = 'Level ' + g.n + ' \u00b7 ' + g.def.name;
    var stats = 'Pulls ' + g.pulls + ' \u00b7 Treasure ' + g.coins + '/' + g.required + ' \u00b7 Power ' + g.hero.power;
    if (level + stats === hudCache) return;
    hudCache = level + stats;
    $('hudLevel').textContent = level;
    $('hudStats').textContent = stats;
  }

  function render() {
    var g = HP.current();
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    if (g) window.HPRender.draw(ctx, g, ui);
    else { ctx.fillStyle = '#141020'; ctx.fillRect(0, 0, W, H); }
  }
  HP.render = render;

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!HP.isHeadless()) {
      var g = HP.current();
      if (g && g !== seenGame) { seenGame = g; onNewGame(g); }
      if (shownGame) {
        ui.time += dt;
        HP.step(dt);
        updateHud(shownGame);
        if (shownGame.status !== 'playing' && !overlayShown) {
          if (!resolvedAt) resolvedAt = now;
          else if (now - resolvedAt > 900) onResolved(shownGame);
        }
      }
      render();
    }
    requestAnimationFrame(frame);
  }

  layout();
  show('scrTitle');
  requestAnimationFrame(frame);
})();

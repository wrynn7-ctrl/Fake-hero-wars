/*
 * ui.js — screens, input and the main loop. Owns the current save and the
 * live battle; turns real time into fixed simulation steps (so x1/x2 and the
 * frame rate never change an outcome), feeds sim events to the renderer and
 * keeps the DOM overlays in sync. Also assembles the public window.HW API.
 */
(function (root) {
  'use strict';
  var D = root.HWData, M = root.HWMeta, SIM = root.HWSim, R = root.HWRender;
  var $ = function (id) { return document.getElementById(id); };

  var S = {
    screen: 'title', save: M.loadStored() || M.newSave(), t: 0, last: 0,
    battle: null, stageId: 1, seed: 0, speed: 1, auto: false, paused: false,
    resultShown: false, result: null, resultT: 0, newItems: {},
    mapScroll: 0, drag: null, previewStage: 0, selItem: null, prevStats: null, statFlash: 0
  };
  if (!S.save.settings) S.save.settings = { speed: 1, auto: false };

  function save() { M.persist(S.save); }

  // ---------------------------------------------------------------- layout
  function layout() {
    var w = root.innerWidth, h = root.innerHeight;
    var s = Math.min(w / 960, h / 540);
    var g = $('game');
    g.style.transform = 'translate(' + Math.round((w - 960 * s) / 2) + 'px,' + Math.round((h - 540 * s) / 2) + 'px) scale(' + s + ')';
    g.style.left = '0px'; g.style.top = '0px';
    R.setResolution(Math.ceil(s * (root.devicePixelRatio || 1) * 4) / 4);
  }

  function show(name) {
    ['title', 'map', 'hero', 'battle', 'result', 'final'].forEach(function (n) {
      $('scr-' + n).classList.toggle('active', n === name);
    });
    S.screen = name;
    if (name !== 'map') $('preview').classList.add('hidden');
    if (name === 'map') refreshMap(true);
    if (name === 'hero') refreshHero();
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function iconCanvas(px, draw) {
    var c = document.createElement('canvas');
    var r = 2;
    c.width = px * r; c.height = px * r;
    var x = c.getContext('2d');
    x.scale(r, r);
    draw(x, px);
    return c;
  }
  function starHtml(n) {
    var s = '';
    for (var i = 0; i < 3; i++) s += '<span class="' + (i < n ? 'on' : 'off') + '">★</span>';
    return s;
  }
  function fmtStat(k, v) {
    if (D.PCT_STATS[k]) return (Math.round(v * 1000) / 10) + '%';
    return String(Math.round(v));
  }

  // ---------------------------------------------------------------- title
  function onPlay() { show('map'); }
  function onNewGame() {
    if (S.save.battles > 0) $('confirmNew').classList.remove('hidden');
    else resetGame();
  }
  function resetGame() {
    S.save = M.newSave();
    S.newItems = {};
    save();
    $('confirmNew').classList.add('hidden');
    show('map');
  }

  // ---------------------------------------------------------------- map
  function clampScroll(x) { return Math.max(0, Math.min(R.MAP_W - 960, x)); }
  function refreshMap(recenter) {
    var s = S.save;
    var frontier = Math.min(s.cleared + 1, D.STAGES.length);
    if (recenter) S.mapScroll = clampScroll(R.MAP_NODES[frontier - 1][0] - 400);
    $('mapLevel').textContent = 'Lv ' + s.level;
    $('mapGold').textContent = s.gold + ' gold';
    var total = 0;
    for (var k in s.stars) total += s.stars[k];
    $('mapStars').innerHTML = '<span style="color:#ffd23a">★</span> ' + total + '/' + D.STAGES.length * 3;
    var box = $('mapNodes');
    box.innerHTML = '';
    D.STAGES.forEach(function (st, i) {
      var n = el('button', 'node' + (st.boss ? ' boss' : ''));
      var unlocked = M.stageUnlocked(s, st.id);
      n.id = 'node-' + st.id;
      n.dataset.stage = st.id;
      n.style.left = R.MAP_NODES[i][0] + 'px';
      n.style.top = R.MAP_NODES[i][1] + 'px';
      if (!unlocked) { n.classList.add('locked'); n.innerHTML = '<span class="lock">🔒</span>'; }
      else {
        n.innerHTML = st.boss ? '☠' : String(st.id);
        if (st.id === frontier && !(s.stars[st.id] > 0)) n.classList.add('current');
        n.innerHTML += '<div class="stars">' + starHtml(s.stars[st.id] || 0) + '</div>';
      }
      n.setAttribute('aria-label', 'Stage ' + st.id + (unlocked ? '' : ' (locked)'));
      n.addEventListener('click', function () { if (!S.drag || !S.drag.moved) if (unlocked) openPreview(st.id); });
      box.appendChild(n);
    });
    applyMapScroll();
  }
  function applyMapScroll() {
    $('mapNodes').style.transform = 'translateX(' + (-S.mapScroll) + 'px)';
    $('mapLeft').disabled = S.mapScroll <= 0;
    $('mapRight').disabled = S.mapScroll >= R.MAP_W - 960;
  }
  function openPreview(id) {
    var st = D.STAGES[id - 1], s = S.save;
    S.previewStage = id;
    $('pvName').textContent = id + '. ' + st.name + (st.boss ? ' — Boss' : '');
    $('pvSub').textContent = D.THEMES[st.theme].name + ' · ' + st.waves.length + ' waves';
    $('pvRec').textContent = st.rec;
    $('pvLvl').textContent = s.level;
    $('pvLvl').className = s.level < st.rec ? 'warn' : 'ok';
    $('pvPow').textContent = M.power(s);
    var first = !(s.stars[id] > 0), r = M.computeRewards(id, { won: true }, first, 0);
    $('pvRewardKind').textContent = first ? 'First clear' : 'Replay';
    $('pvGold').textContent = r.gold;
    $('pvXp').textContent = r.xp;
    $('pvStars').innerHTML = s.stars[id] ? '<span style="color:#ffd23a">' + '★'.repeat(s.stars[id]) + '</span>' : 'none yet';
    var row = $('pvEnemies');
    row.innerHTML = '';
    var seen = {};
    st.waves.forEach(function (w) { w.forEach(function (t) { seen[t] = (seen[t] || 0) + 1; }); });
    Object.keys(seen).forEach(function (t) {
      var f = el('figure');
      f.appendChild(iconCanvas(62, function (x, px) { R.drawEnemyIcon(x, t, px); }));
      f.appendChild(el('div', null, D.ENEMIES[t].name + (seen[t] > 1 ? ' ×' + seen[t] : '')));
      row.appendChild(f);
    });
    $('preview').classList.remove('hidden');
  }
  function mapPointer() {
    var layer = $('mapLayer');
    layer.addEventListener('pointerdown', function (e) { S.drag = { x: e.clientX, s: S.mapScroll, moved: false }; });
    root.addEventListener('pointermove', function (e) {
      if (!S.drag || S.screen !== 'map') return;
      var scale = $('game').getBoundingClientRect().width / 960;
      var dx = (e.clientX - S.drag.x) / scale;
      if (Math.abs(dx) > 6) S.drag.moved = true;
      if (S.drag.moved) { S.mapScroll = clampScroll(S.drag.s - dx); applyMapScroll(); }
    });
    root.addEventListener('pointerup', function () { setTimeout(function () { S.drag = null; }, 0); });
    layer.addEventListener('wheel', function (e) { S.mapScroll = clampScroll(S.mapScroll + e.deltaY + e.deltaX); applyMapScroll(); }, { passive: true });
  }

  // ---------------------------------------------------------------- hero screen
  function refreshHero() {
    var s = S.save, st = M.heroStats(s), sk = M.skillLevels(s), info = M.levelInfo(s.xp);
    $('heroGold').textContent = s.gold + ' gold';
    $('heroPower').textContent = M.power(s);
    $('heroLevel').textContent = s.level;
    var rk = D.RANKS[s.rank];
    $('heroRank').innerHTML = '<span style="color:' + rk.color + '">◆ ' + rk.name + '</span>';
    $('heroXpFill').style.width = (info.need ? Math.round(info.into / info.need * 100) : 100) + '%';
    $('heroXp').textContent = info.need ? 'XP ' + info.into + ' / ' + info.need : 'MAX LEVEL';

    D.SLOTS.forEach(function (slot) {
      var box = $('slot-' + slot), it = s.gear[slot];
      box.innerHTML = '';
      box.className = 'slot' + (it ? ' filled' : '');
      if (it) {
        box.appendChild(iconCanvas(74, function (x, px) { R.drawItemIcon(x, it, px); }));
        box.title = it.name;
        box.onclick = function (e) { showTip(it, true, e.currentTarget); };
      } else {
        box.textContent = slot;
        box.title = 'Empty ' + slot + ' slot';
        box.onclick = null;
      }
    });

    var prev = S.prevStats, rows = [
      ['hp', 'HP', st.maxHp], ['atk', 'Attack', st.atk], ['armor', 'Armor', st.armor + 3 * sk.stalwart],
      ['mres', 'Magic Res', st.mres + 3 * sk.stalwart], ['aspd', 'Atk Speed', st.aspd.toFixed(2) + '/s'],
      ['crit', 'Crit', Math.round(st.crit * 100) + '%'], ['lifesteal', 'Lifesteal', Math.round(st.lifesteal * 100) + '%'],
      ['potions', 'Potions', (s.potions || 0) + '/' + D.POTION.max], ['skills', 'Skill pts', D.SKILLS.reduce(function (a, k) { return a + sk[k.id]; }, 0)]
    ];
    var raw = { hp: st.maxHp, atk: st.atk, armor: st.armor, mres: st.mres };
    $('stats').innerHTML = rows.map(function (r) {
      var cls = '';
      if (prev && S.statFlash > 0 && prev[r[0]] != null && raw[r[0]] != null) cls = raw[r[0]] > prev[r[0]] ? 'up' : raw[r[0]] < prev[r[0]] ? 'down' : '';
      return '<div><span>' + r[1] + '</span><b id="stat-' + r[0] + '" class="' + cls + '">' + r[2] + '</b></div>';
    }).join('');

    var box = $('skills');
    box.innerHTML = '';
    D.SKILLS.forEach(function (k) {
      var lvl = sk[k.id], row = el('div', 'skill');
      row.appendChild(iconCanvas(34, function (x, px) { R.drawSkillIcon(x, k.id, px, !lvl); }));
      var txt = el('div', 'txt');
      txt.appendChild(el('div', 'nm', k.name + (lvl ? '<em>Lv ' + lvl + '</em>' : '<em style="color:#999">Unlocks at Lv ' + k.unlock + '</em>')));
      txt.appendChild(el('div', 'ds', k.desc(Math.max(1, lvl))));
      txt.title = k.desc(Math.max(1, lvl));
      row.appendChild(txt);
      var b = el('button', 'btn small gold');
      b.id = 'up-' + k.id;
      if (!lvl) { b.textContent = 'Locked'; b.disabled = true; }
      else if (s.skills[k.id] >= s.level) { b.textContent = 'Max (Lv ' + s.level + ')'; b.disabled = true; }
      else { b.textContent = '▲ ' + M.upgradeCost(s, k.id) + 'g'; b.disabled = s.gold < M.upgradeCost(s, k.id); }
      b.onclick = function () { if (M.upgradeSkill(S.save, k.id)) { save(); refreshHero(); } };
      row.appendChild(b);
      box.appendChild(row);
    });

    var inv = $('inv');
    inv.innerHTML = '';
    $('invCount').textContent = '(' + s.inventory.length + '/20)';
    for (var i = 0; i < 20; i++) {
      var it = s.inventory[i], cell = el('div', 'cell live');
      if (it) {
        cell.dataset.id = it.id;
        cell.appendChild(iconCanvas(44, (function (item) { return function (x, px) { R.drawItemIcon(x, item, px); }; })(it)));
        cell.appendChild(el('span', 'lv', 'Lv' + it.req));
        if (it.req > s.level) cell.classList.add('toohigh');
        if (S.newItems[it.id]) cell.classList.add('new');
        if (S.selItem === it.id) cell.classList.add('sel');
        cell.title = it.name;
        cell.addEventListener('click', (function (item) { return function (e) { S.selItem = item.id; refreshHero(); showTip(item, false, e.currentTarget); }; })(it));
      }
      inv.appendChild(cell);
    }
    $('btnPromote').disabled = !M.canPromote(s);
    $('btnPromote').textContent = s.rank >= D.RANKS.length - 1 ? 'Max rank' : 'Promote → ' + D.RANKS[s.rank + 1].name;
    $('btnPotion').textContent = 'Buy potion ' + D.POTION.cost + 'g';
    $('btnPotion').disabled = s.gold < D.POTION.cost || (s.potions || 0) >= D.POTION.max;
    if (S.selItem && !s.inventory.some(function (x) { return x.id === S.selItem; })) hideTip();
  }

  function showTip(it, equipped, anchor) {
    var s = S.save, cur = s.gear[it.slot], tip = $('itemTip');
    var keys = {};
    Object.keys(it.stats).forEach(function (k) { keys[k] = 1; });
    if (cur && !equipped) Object.keys(cur.stats).forEach(function (k) { keys[k] = 1; });
    var html = '<div class="nm" style="color:' + D.RARITIES[it.rarity].color + '">' + it.name + '</div>' +
      '<div class="meta">' + D.RARITIES[it.rarity].name + ' ' + it.slot + ' · item lv ' + it.ilvl + ' · requires Lv ' + it.req + '</div>';
    Object.keys(keys).forEach(function (k) {
      var v = it.stats[k] || 0, diff = '';
      if (!equipped) {
        var d = v - (cur && cur.stats[k] || 0);
        if (Math.abs(d) > 1e-9) diff = ' <span class="' + (d > 0 ? 'ok' : 'warn') + '">(' + (d > 0 ? '+' : '−') + fmtStat(k, Math.abs(d)) + ')</span>';
      }
      html += '<div class="st"><span>' + D.STAT_NAMES[k] + '</span><span>' + (v ? '+' + fmtStat(k, v) : '—') + diff + '</span></div>';
    });
    if (!equipped) html += '<div class="meta" style="margin:4px 0 0">' + (cur ? 'Compared with ' + cur.name : 'Slot is empty') + '</div>';
    html += '<div class="row">' + (equipped ? '<span class="meta">Equipped</span>' :
      '<button id="tipEquip" class="btn small green"' + (it.req > s.level ? ' disabled' : '') + '>Equip</button>' +
      '<button id="tipSell" class="btn small">Sell +' + M.sellValue(it) + 'g</button>') +
      '<button id="tipClose" class="btn small">✕</button></div>';
    tip.innerHTML = html;
    tip.classList.remove('hidden');
    var g = $('game').getBoundingClientRect(), a = anchor.getBoundingClientRect(), sc = g.width / 960;
    var x = (a.left - g.left) / sc, y = (a.top - g.top) / sc;
    var left = equipped ? (x < 200 ? x + 84 : x - 240) : Math.min(720, Math.max(452, x - 90));
    var top = equipped ? Math.max(56, y - 10) : Math.max(56, y - tip.offsetHeight - 8);
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
    if (!equipped) {
      $('tipEquip').onclick = function () { withStatFlash(function () { M.equipItem(S.save, it.id); }); hideTip(); };
      $('tipSell').onclick = function () { M.sellItem(S.save, it.id); save(); hideTip(); refreshHero(); };
    }
    $('tipClose').onclick = hideTip;
  }
  function hideTip() { $('itemTip').classList.add('hidden'); S.selItem = null; }
  function withStatFlash(fn) {
    var st = M.heroStats(S.save);
    S.prevStats = { hp: st.maxHp, atk: st.atk, armor: st.armor, mres: st.mres };
    fn();
    S.statFlash = 2.5;
    D.SLOTS.forEach(function (sl) { if (S.save.gear[sl]) delete S.newItems[S.save.gear[sl].id]; });
    save();
    refreshHero();
  }

  // ---------------------------------------------------------------- battle
  function startBattle(stageId, opts) {
    opts = opts || {};
    var s = S.save;
    S.stageId = stageId;
    S.seed = opts.seed != null ? opts.seed : M.nextSeed(s, stageId);
    S.speed = opts.speed || s.settings.speed || 1;
    S.auto = opts.auto != null ? !!opts.auto : !!s.settings.auto;
    S.battle = SIM.create(stageId, M.heroSpec(s), { seed: S.seed, auto: S.auto, collectEvents: true, validate: true });
    S.battleLevel = s.level;
    S.paused = false;
    S.resultShown = false;
    S.result = null;
    R.resetFx();
    save();
    $('pause').classList.add('hidden');
    $('preview').classList.add('hidden');
    show('battle');
    syncBattleHud();
    return battleState();
  }
  function syncBattleHud() {
    var b = S.battle;
    $('bStage').textContent = b.stageId + '. ' + b.stage.name;
    $('bWave').textContent = 'Wave ' + (b.wave + 1) + '/' + b.waves;
    $('btnSpeed').textContent = 'x' + S.speed;
    $('btnSpeed').classList.toggle('on', S.speed > 1);
    $('btnAuto').classList.toggle('on', S.auto);
  }
  function drain() {
    var b = S.battle;
    if (!b.events.length) return;
    var waveChanged = b.events.some(function (e) { return e.t === 'wave'; });
    R.handleEvents(b, b.events);
    b.events.length = 0;
    if (waveChanged) syncBattleHud();
  }
  function stepBattle(dt) {
    if (!S.battle) return null;
    SIM.advance(S.battle, dt);
    drain();
    R.updateFx(dt);
    return battleState();
  }
  function fireUltimate() {
    if (!S.battle || S.paused) return false;
    return SIM.fireUltimate(S.battle);
  }
  function setSpeed(v) { S.speed = v; S.save.settings.speed = v; save(); if (S.battle) syncBattleHud(); }
  function setAuto(v) { S.auto = v; S.save.settings.auto = v; if (S.battle) S.battle.auto = v; save(); if (S.battle) syncBattleHud(); }
  function pause(on) {
    if (!S.battle || S.battle.over) return;
    S.paused = on;
    $('pause').classList.toggle('hidden', !on);
  }

  // Restart / Leave: a potion already drunk in the abandoned battle is still used up.
  function abandonBattle() {
    if (S.battle && !S.resultShown && S.battle.hero.potionUsed) {
      S.save.potions = Math.max(0, (S.save.potions || 0) - 1);
      save();
    }
  }

  function finishBattle() {
    var b = S.battle, r = SIM.result(b);
    var sum = M.applyRewards(S.save, b.stageId, r, S.seed);
    sum.items.forEach(function (it) { S.newItems[it.id] = 1; });
    save();
    S.result = { r: r, sum: sum, stageId: b.stageId };
    S.resultShown = true;
    S.resultT = 0;
    buildResult();
    show('result');
  }

  function buildResult() {
    var res = S.result, r = res.r, sum = res.sum, won = r.won;
    $('resTitle').textContent = won ? 'VICTORY' : 'DEFEAT';
    $('resTitle').className = won ? '' : 'lose';
    $('resStars').innerHTML = '';
    for (var i = 0; i < (won ? 3 : 0); i++) {
      var sp = el('span', i < r.stars ? 'on' : '', '★');
      sp.style.animationDelay = (0.3 + i * 0.25) + 's';
      $('resStars').appendChild(sp);
    }
    var lv = sum.levelAfter > sum.levelBefore ? '<span class="lvl">Level up! ' + sum.levelBefore + ' → ' + sum.levelAfter + '</span>' : '';
    $('resRewards').innerHTML = (won ? '<span class="g">+' + sum.gold + ' gold</span> · ' : '') + '<span class="x">+' + sum.xp + ' XP</span>' +
      (won ? '' : ' <span style="color:#d8c8a8">(partial)</span>') +
      (sum.potionsUsed ? ' · <span style="color:#ff8da0">−' + sum.potionsUsed + ' potion</span>' : '') + lv;
    $('resTips').innerHTML = won ? '' : [
      'Level up — replay earlier stages for XP and gold.',
      'Equip better gear on the Hero screen (try “Equip best”).',
      'Upgrade skills with gold; fill all 6 slots to Promote.',
      'Save the ultimate for clustered enemies (turn Auto off).'
    ].map(function (t) { return '<li>' + t + '</li>'; }).join('');
    var items = $('resItems');
    items.innerHTML = '';
    sum.items.forEach(function (it, k) {
      var card = el('div', 'panel card');
      card.style.animationDelay = (1.45 + k * 0.25) + 's';
      card.appendChild(iconCanvas(52, function (x, px) { R.drawItemIcon(x, it, px); }));
      card.appendChild(el('div', 'nm', '<span style="color:' + D.RARITIES[it.rarity].color + '">' + it.name + '</span>'));
      card.appendChild(el('div', null, '<span style="font-size:11px;color:#cbbd9e">' + D.RARITIES[it.rarity].name + ' ' + it.slot + ' · Lv ' + it.req + '</span>'));
      if (sum.soldIds.indexOf(it.id) >= 0) card.appendChild(el('div', null, '<span style="font-size:11px;color:#ff9a7a">Bag full · sold +' + M.sellValue(it) + 'g</span>'));
      items.appendChild(card);
    });
    if (won && !sum.items.length) items.appendChild(el('div', 'panel card', '<div class="nm">No item this time</div>'));
    var btns = $('resBtns');
    btns.innerHTML = '';
    function add(id, label, cls, fn) { var b = el('button', 'btn ' + cls, label); b.id = id; b.onclick = fn; btns.appendChild(b); }
    if (won) {
      add('resContinue', 'Continue', 'gold big', function () {
        if (res.stageId === D.STAGES.length && sum.firstClear) { showFinal(); return; }
        show(sum.items.length > sum.soldIds.length || sum.levelAfter > sum.levelBefore ? 'hero' : 'map');
      });
      add('resReplay', 'Replay', '', function () { startBattle(res.stageId); });
    } else {
      add('resRetry', 'Retry', 'gold big', function () { startBattle(res.stageId); });
      add('resHero', 'Hero', 'blue', function () { show('hero'); });
      add('resMap', 'Map', '', function () { show('map'); });
    }
  }
  function showFinal() {
    var total = 0;
    for (var k in S.save.stars) total += S.save.stars[k];
    $('finalText').textContent = 'Aldric has freed the realm at level ' + S.save.level + ' with ' + total + ' of ' + D.STAGES.length * 3 + ' stars.';
    show('final');
  }

  function battleState() {
    var b = S.battle;
    if (!b) return null;
    var h = b.hero;
    return {
      stage: b.stageId, seed: b.seed, wave: b.wave + 1, waves: b.waves, time: b.t, phase: b.phase,
      over: b.over, won: b.won, stalemate: b.stalemate, timeout: b.timeout, stars: SIM.stars(b.won, h.hp / h.maxHp),
      paused: S.paused, speed: S.speed, auto: S.auto, resultShown: S.resultShown, invalid: b.invalid,
      ults: b.stats.ults, ultDamage: b.stats.ultDamage, dealt: b.stats.dealt, taken: b.stats.taken, kills: b.stats.kills, steps: b.steps,
      hero: { x: h.x, depth: h.depth, hp: h.hp, maxHp: h.maxHp, energy: h.energy, state: h.state, dead: h.dead },
      enemies: b.enemies.filter(function (e) { return !e.dead; }).map(function (e) {
        return { type: e.type, x: e.x, depth: e.depth, hp: e.hp, maxHp: e.maxHp, shield: e.shield, stun: e.stun };
      })
    };
  }

  // ---------------------------------------------------------------- input
  function logicalPoint(e) {
    var r = $('cv').getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * 960, y: (e.clientY - r.top) / r.height * 540 };
  }
  function bindInput() {
    $('btnPlay').onclick = onPlay;
    $('btnNew').onclick = onNewGame;
    $('btnNewYes').onclick = resetGame;
    $('btnNewNo').onclick = function () { $('confirmNew').classList.add('hidden'); };
    $('mapMenu').onclick = function () { show('title'); };
    $('mapHero').onclick = function () { show('hero'); };
    $('mapLeft').onclick = function () { S.mapScroll = clampScroll(S.mapScroll - 400); applyMapScroll(); };
    $('mapRight').onclick = function () { S.mapScroll = clampScroll(S.mapScroll + 400); applyMapScroll(); };
    $('pvClose').onclick = function () { $('preview').classList.add('hidden'); };
    $('btnFight').onclick = function () { startBattle(S.previewStage); };
    $('heroBack').onclick = function () { hideTip(); show('map'); };
    $('btnEquipBest').onclick = function () { withStatFlash(function () { M.equipBest(S.save); }); };
    $('btnPromote').onclick = function () {
      $('promoteText').textContent = 'Consume all 6 equipped items to reach ' + D.RANKS[S.save.rank + 1].name + ' rank (+' + Math.round(D.RANK_BONUS * 100) + '% to all base stats).';
      $('confirmPromote').classList.remove('hidden');
    };
    $('btnPromoteYes').onclick = function () {
      withStatFlash(function () { M.promote(S.save); M.equipBest(S.save); });
      $('confirmPromote').classList.add('hidden');
    };
    $('btnPromoteNo').onclick = function () { $('confirmPromote').classList.add('hidden'); };
    $('btnPotion').onclick = function () { if (M.buyPotion(S.save)) { save(); refreshHero(); } };
    $('btnPause').onclick = function () { pause(true); };
    $('btnResume').onclick = function () { pause(false); };
    $('btnRestart').onclick = function () { abandonBattle(); startBattle(S.stageId); };
    $('btnLeave').onclick = function () { abandonBattle(); S.battle = null; S.paused = false; $('pause').classList.add('hidden'); show('map'); };
    $('btnSpeed').onclick = function () { setSpeed(S.speed === 1 ? 2 : 1); };
    $('btnAuto').onclick = function () { setAuto(!S.auto); };
    $('ultBtn').onclick = fireUltimate;
    $('finalMap').onclick = function () { show('map'); };
    $('cv').addEventListener('pointerdown', function (e) {
      if (S.screen !== 'battle' || !S.battle) return;
      var p = logicalPoint(e), hr = R.heroRect(S.battle);
      if (p.x >= hr.x && p.x <= hr.x + hr.w && p.y >= hr.y && p.y <= hr.y + hr.h) fireUltimate();
    });
    root.addEventListener('keydown', function (e) {
      if (S.screen !== 'battle') return;
      if (e.code === 'Space') { e.preventDefault(); fireUltimate(); }
      else if (e.code === 'Escape') pause(!S.paused);
    });
    root.addEventListener('resize', layout);
    mapPointer();
  }

  // ---------------------------------------------------------------- loop
  function frame(now) {
    var dt = S.last ? Math.min(0.1, (now - S.last) / 1000) : 0;
    S.last = now;
    S.t += dt;
    if (S.statFlash > 0) { S.statFlash -= dt; if (S.statFlash <= 0 && S.screen === 'hero') refreshHero(); }
    var b = S.battle, fxs = R.fx();
    if (S.screen === 'battle' && b) {
      if (!S.paused) {
        var slow = fxs.slowmo > 0 ? 0.3 : 1;
        SIM.advance(b, dt * S.speed * slow, 60);
        drain();
        R.updateFx(dt * Math.min(S.speed, 2) * slow);
        if (b.over && b.postT >= 1.3 && !S.resultShown) finishBattle();
      }
      if (S.screen === 'battle') R.drawBattle(b, hudInfo());
    }
    if (S.screen === 'result' && b) {
      S.resultT += dt;
      SIM.advance(b, dt);
      R.updateFx(dt);
      b.events.length = 0;
      R.drawResult(b, hudInfo(), S.resultT, S.result.r.won);
    } else if (S.screen === 'title') R.drawTitle(S.t);
    else if (S.screen === 'map') R.drawMap(S.mapScroll, S.t, S.save.cleared, S.save.rank);
    else if (S.screen === 'hero') R.drawHeroBackdrop(S.t, S.save.rank);
    else if (S.screen === 'final') R.drawFinal(S.t, S.save.rank);
    root.requestAnimationFrame(frame);
  }
  function hudInfo() {
    return { t: S.t, rank: S.save.rank, level: S.battle ? S.battleLevel : S.save.level, auto: S.auto, slowmo: R.fx().slowmo > 0 };
  }

  // ---------------------------------------------------------------- API
  function afterSaveChange() {
    save();
    if (S.screen === 'map') refreshMap(false);
    if (S.screen === 'hero') refreshHero();
  }
  root.HW = {
    stages: D.STAGES, data: D,
    newGame: function () { S.save = M.newSave(); S.newItems = {}; save(); show('title'); return M.clone(S.save); },
    getSave: function () { return M.clone(S.save); },
    loadSave: function (o) { if (!M.validSave(o)) return false; S.save = M.clone(o); if (!S.save.settings) S.save.settings = { speed: 1, auto: false }; afterSaveChange(); return true; },
    startBattle: startBattle, stepBattle: stepBattle, fireUltimate: fireUltimate, getBattleState: battleState,
    pause: pause, setSpeed: setSpeed, setAuto: setAuto, screen: function () { return S.screen; },
    simulateBattle: function (stage, build, opts) { return M.simulateBattle(stage, build || S.save, opts); },
    simulateCampaign: M.simulateCampaign,
    applyRewards: function (stage, result, seed) { var r = M.applyRewards(S.save, stage, result, seed || 0); afterSaveChange(); return r; },
    equipItem: function (id) { var ok = M.equipItem(S.save, id); afterSaveChange(); return ok; },
    equipBest: function () { var n = M.equipBest(S.save); afterSaveChange(); return n; },
    upgradeSkill: function (id) { var ok = M.upgradeSkill(S.save, id); afterSaveChange(); return ok; },
    levelFor: M.levelFor,
    recommendedBuild: M.recommendedBuild, maxBuild: M.maxBuild, starterBuild: M.starterBuild
  };

  R.init($('cv'));
  bindInput();
  layout();
  show('title');
  root.requestAnimationFrame(frame);
})(window);

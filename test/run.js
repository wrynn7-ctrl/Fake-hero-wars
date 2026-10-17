/*
 * test/run.js — end-to-end checks for Hero Wars: Lone Champion.
 * Plain Node + the globally installed Playwright (Chromium). Loads index.html
 * over file:// and verifies: clean load, every balance requirement through the
 * headless HW API (printing the campaign log), the real-click UI flow with save
 * persistence, manual ultimate, pause/resume, new game, the real-time loop
 * (x2 wall-clock budget and x1 == x2 outcome), and writes screenshots to
 * $SHOTS_DIR (default test/shots/). Exit code 0 only if everything passes.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html');
const SHOTS = path.resolve(process.env.SHOTS_DIR || path.join(__dirname, 'shots'));
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
function check(cond, msg) {
  console.log((cond ? '  ok    ' : '  FAIL  ') + msg);
  if (!cond) failures++;
}
function section(name) { console.log('\n== ' + name); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  const file = path.join(SHOTS, name + '.png');
  await page.screenshot({ path: file });
  console.log('  shot  ' + file);
}

// Fast-forward the live battle (headless steps) until a predicate holds, then
// let the real requestAnimationFrame loop run briefly so effects look natural.
async function fastForward(page, fnSrc, extraSteps) {
  await page.evaluate(([src, extra]) => {
    const pred = new Function('s', 'return ' + src);
    let guard = 0;
    while (!pred(HW.getBattleState()) && !HW.getBattleState().over && guard++ < 30000) HW.stepBattle(1 / 60);
    for (let i = 0; i < extra && !HW.getBattleState().over; i++) HW.stepBattle(1 / 60);
  }, [fnSrc, extraSteps || 0]);
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));

  // ------------------------------------------------------------ 1. load
  section('1. Page load');
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.HW && HW.screen() === 'title');
  await sleep(600);
  check(errors.length === 0, 'no console errors / failed requests on load');
  const info = await page.evaluate(() => ({
    hw: typeof window.HW, stages: HW.stages.length,
    api: ['newGame', 'getSave', 'loadSave', 'startBattle', 'stepBattle', 'fireUltimate', 'getBattleState',
      'simulateBattle', 'simulateCampaign', 'applyRewards', 'equipItem', 'upgradeSkill', 'levelFor'].filter((k) => typeof HW[k] !== 'function')
  }));
  check(info.hw === 'object', 'window.HW exists');
  check(info.stages === 10, 'HW exposes 10 stages');
  check(info.api.length === 0, 'HW API complete' + (info.api.length ? ' (missing ' + info.api.join(',') + ')' : ''));
  await shot(page, 'title');

  // ------------------------------------------------------------ 2. balance
  section('2. Balance (headless simulator)');
  const bal = await page.evaluate(() => {
    const out = {};
    out.rec = HW.stages.map((s) => s.rec);
    const c = HW.simulateCampaign({ strategy: 'reasonable', maxRetriesPerStage: 3 });
    out.campaign = {
      log: c.log, extra: c.extraBattles, wonAll: c.wonAll, stalemates: c.stalemates, timeouts: c.timeouts,
      invalid: c.invalid, pushback: c.pushback, finalLevel: c.finalLevel
    };
    const starter = HW.starterBuild(), max = HW.maxBuild();
    out.starter = [], out.max = [], out.ult = [], out.invalid = 0, out.nan = 0;
    for (let s = 1; s <= 10; s++) {
      const st = [], mx = [], u = { stage: s, withUlt: [], noUlt: [] };
      const rb = HW.recommendedBuild(s);
      for (let k = 0; k < 3; k++) {
        const a = HW.simulateBattle(s, starter, { seed: s * 1000 + k });
        const b = HW.simulateBattle(s, max, { seed: s * 1000 + k });
        st.push(a); mx.push(b);
      }
      for (let k = 0; k < 5; k++) {
        u.withUlt.push(HW.simulateBattle(s, rb, { seed: s * 1000 + 50 + k }));
        u.noUlt.push(HW.simulateBattle(s, rb, { seed: s * 1000 + 50 + k, autoUlt: false }));
      }
      [].concat(st, mx, u.withUlt, u.noUlt).forEach((r) => {
        out.invalid += r.invalid;
        if (!isFinite(r.heroHpFrac) || !isFinite(r.time) || !isFinite(r.rewards.gold) || !isFinite(r.rewards.xp)) out.nan++;
        if (r.stalemate || r.timeout) out.invalid += 1000;
      });
      const brief = (r) => ({ won: r.won, stars: r.stars, hp: Math.round(r.heroHpFrac * 100), time: Math.round(r.time), ults: r.ults });
      out.starter.push(st.map(brief)); out.max.push(mx.map(brief));
      out.ult.push({ stage: s, level: rb.level, withUlt: u.withUlt.map(brief), noUlt: u.noUlt.map(brief) });
    }
    const d1 = HW.simulateBattle(7, HW.recommendedBuild(7), { seed: 7123 }), d2 = HW.simulateBattle(7, HW.recommendedBuild(7), { seed: 7123 });
    out.deterministic = JSON.stringify(d1) === JSON.stringify(d2);
    out.levelFor = [HW.levelFor(0), HW.levelFor(155), HW.levelFor(10 ** 9)];
    return out;
  });

  console.log('\n  Campaign log (strategy "reasonable", maxRetriesPerStage 3):');
  console.log('  stage  rec  lvl@1st  rank  first try           attempts  replays  stars  lvl after  gold');
  bal.campaign.log.forEach((e) => {
    const f = e.first;
    console.log('  ' + String(e.stage).padStart(5) + String(e.rec).padStart(5) + String(e.levelAtFirstTry).padStart(9) +
      String(e.rankAtFirstTry).padStart(6) + '  ' + ((f.won ? 'WIN ' + f.stars + '*' : 'LOSS  ') + ' hp ' + f.hp + '% ' + f.time + 's').padEnd(19) +
      String(e.attempts).padStart(9) + String(e.replays).padStart(9) + String(e.finalStars).padStart(7) + String(e.levelAfter).padStart(11) + String(e.gold).padStart(6));
  });
  console.log('  extra battles: ' + bal.campaign.extra + ', first-try pushback stages: ' + bal.campaign.pushback + ', final level: ' + bal.campaign.finalLevel + '\n');

  const recOk = bal.rec.every((r, i) => r === Math.round(1 + 2.4 * i));
  check(recOk && bal.rec[9] === 23, 'recommended level = round(1 + 2.4 (stage-1)) [' + bal.rec.join(' ') + ']');
  const offCurve = bal.campaign.log.filter((e) => Math.abs(e.levelAtFirstTry - e.rec) > 2.5);
  check(offCurve.length === 0, 'campaign hero level at each first try is within ±2.5 of recommended' + (offCurve.length ? ' (off: ' + offCurve.map((e) => e.stage).join(',') + ')' : ''));
  check(bal.campaign.wonAll, 'reasonable campaign reaches and wins stage 10');
  check(bal.campaign.extra <= 10, 'reasonable campaign uses <= 10 extra battles (' + bal.campaign.extra + ')');
  const all3 = bal.campaign.extra === 0 && bal.campaign.log.every((e) => e.first.won && e.first.stars === 3);
  check(!all3 && bal.campaign.pushback >= 3, 'campaign pushes back: >= 3 stages lost first try or <= 2 stars (' + bal.campaign.pushback + ')');
  check(bal.campaign.stalemates === 0 && bal.campaign.timeouts === 0, 'no stalemates / timeouts in the campaign');
  check(bal.campaign.invalid === 0, 'no NaN / out-of-arena positions in the campaign');

  const s1 = bal.starter[0];
  check(s1.every((r) => r.won && r.stars >= 2), 'level-1 starter hero wins stage 1 with >= 2 stars ' + JSON.stringify(s1.map((r) => r.stars)));
  const loses = bal.starter.slice(3).every((rs) => rs.every((r) => !r.won));
  check(loses, 'level-1 starter hero loses stages 4..10 (3 seeds each)');
  const max3 = bal.max.every((rs) => rs.every((r) => r.won && r.stars === 3));
  check(max3, 'max hero (Lv30, Violet, epic gear, maxed skills) 3-stars every stage: ' + bal.max.map((rs) => Math.min.apply(null, rs.map((r) => r.hp)) + '%').join(' '));

  const stars = (rs) => rs.reduce((a, r) => a + (r.won ? r.stars : 0), 0);
  bal.ult.forEach((u) => {
    if (u.stage < 3) return;
    check(stars(u.withUlt) > stars(u.noUlt), 'stage ' + u.stage + ' (rec build Lv' + u.level + '): ultimate changes outcome — stars with ult ' +
      stars(u.withUlt) + ' / wins ' + u.withUlt.filter((r) => r.won).length + ' vs never-ult stars ' + stars(u.noUlt) + ' / wins ' + u.noUlt.filter((r) => r.won).length);
  });
  check(bal.ult[4].noUlt.every((r) => !r.won), 'never firing the ultimate loses stage 5 with the recommended build');
  check(bal.ult[4].withUlt.some((r) => r.won), 'firing the ultimate can win stage 5 with the recommended build');
  check(bal.invalid === 0 && bal.nan === 0, 'no stalemate/timeout/NaN/out-of-arena in any balance battle');
  check(bal.deterministic, 'same seed + build => identical battle result');
  check(bal.levelFor[0] === 1 && bal.levelFor[1] === 2 && bal.levelFor[2] === 30, 'levelFor(xp) follows the XP curve and caps at 30');

  // ------------------------------------------------------------ 3. UI flow
  section('3. UI flow with real clicks');
  await page.click('#btnPlay');
  await page.waitForFunction(() => HW.screen() === 'map');
  await sleep(300);
  check(await page.$eval('#node-2', (n) => n.classList.contains('locked')), 'stage 2 starts locked');
  await shot(page, 'map');
  await page.click('#node-1');
  await page.waitForSelector('#preview:not(.hidden)');
  check((await page.textContent('#pvRec')) === '1', 'stage preview shows recommended level');
  check((await page.$$('#pvEnemies figure')).length >= 2, 'stage preview shows enemy icons');
  await page.click('#btnFight');
  await page.waitForFunction(() => HW.screen() === 'battle');
  const t0 = Date.now();
  await page.click('#btnSpeed');
  await page.click('#btnAuto');
  let st = await page.evaluate(() => HW.getBattleState());
  check(st.speed === 2 && st.auto === true, 'speed x2 and Auto enabled via buttons');
  await sleep(3500);
  await shot(page, 'battle_stage1');
  await page.waitForFunction(() => HW.screen() === 'result', null, { timeout: 120000, polling: 250 });
  const wall2 = (Date.now() - t0) / 1000;
  const realX2 = await page.evaluate(() => HW.getBattleState());
  check(realX2.won, 'stage 1 battle (real rAF loop, x2 + Auto) ends in victory');
  check(wall2 < 90, 'stage 1 at x2 reaches the result screen in ' + wall2.toFixed(1) + ' s wall-clock (< 90 s; sim time ' + realX2.time.toFixed(1) + ' s)');
  check(realX2.invalid === 0, 'no invalid sim state during the real-time battle');
  await sleep(2600);
  await shot(page, 'victory');
  check((await page.textContent('#resTitle')) === 'VICTORY', 'result screen shows VICTORY');
  const rewardsText = await page.textContent('#resRewards');
  check(/\+\d+ gold/.test(rewardsText) && /\+\d+ XP/.test(rewardsText), 'result shows gold and XP rewards: "' + rewardsText.trim() + '"');
  const cards = await page.$$('#resItems .card');
  check(cards.length >= 1, 'chest reveals ' + cards.length + ' item card(s)');
  const after1 = await page.evaluate(() => HW.getSave());
  check(after1.stars[1] >= 1 && after1.cleared === 1, 'save records stage 1 stars (' + after1.stars[1] + ')');

  await page.click('#resContinue');
  await page.waitForFunction(() => HW.screen() === 'hero');
  await sleep(300);
  const goldTxt = await page.textContent('#heroGold');
  check(goldTxt === after1.gold + ' gold', 'hero screen shows new gold (' + goldTxt + ')');
  const xpTxt = await page.textContent('#heroXp');
  check((await page.textContent('#heroLevel')) === String(after1.level) && /XP \d+ \/ \d+/.test(xpTxt), 'hero screen shows level ' + after1.level + ' and ' + xpTxt);
  const dropId = after1.inventory[0] && after1.inventory[0].id;
  check(!!dropId && !!(await page.$('#inv .cell[data-id="' + dropId + '"]')), 'dropped item is in the inventory grid');
  await page.click('#inv .cell[data-id="' + dropId + '"]');
  await page.waitForSelector('#itemTip:not(.hidden)');
  check(/HP|Attack|Armor|Magic|Crit|Speed|Lifesteal/.test(await page.textContent('#itemTip')), 'item tooltip shows stats with comparison');
  await page.click('#tipClose');
  await shot(page, 'hero');
  const statsBefore = await page.$$eval('#stats b', (bs) => bs.map((b) => b.textContent).join('|'));
  await page.click('#btnEquipBest');
  await sleep(200);
  const statsAfter = await page.$$eval('#stats b', (bs) => bs.map((b) => b.textContent).join('|'));
  check(statsBefore !== statsAfter, 'Equip best changes the stats (' + statsBefore.split('|').slice(0, 2).join(',') + ' -> ' + statsAfter.split('|').slice(0, 2).join(',') + ')');
  const equipped = await page.evaluate(() => HW.getSave().gear);
  check(Object.values(equipped).some((it) => it && it.id === dropId) || Object.values(equipped).filter(Boolean).length > 2, 'dropped gear is now equipped');

  await page.click('#heroBack');
  await page.waitForFunction(() => HW.screen() === 'map');
  check(!(await page.$eval('#node-2', (n) => n.classList.contains('locked'))), 'stage 2 is unlocked on the map');
  check((await page.$$('#node-1 .stars .on')).length === after1.stars[1], 'stage 1 node shows its stars');

  section('3b. Save persistence');
  await page.reload();
  await page.waitForFunction(() => window.HW && HW.screen() === 'title');
  const reloaded = await page.evaluate(() => HW.getSave());
  check(reloaded.cleared === 1 && reloaded.stars[1] === after1.stars[1] && reloaded.xp === after1.xp, 'save (stars, xp) persisted across reload');
  check(Object.values(reloaded.gear).filter(Boolean).length === Object.values(equipped).filter(Boolean).length, 'equipped gear persisted across reload');
  await page.click('#btnPlay');
  await page.waitForFunction(() => HW.screen() === 'map');
  check(!(await page.$eval('#node-2', (n) => n.classList.contains('locked'))), 'stage 2 still unlocked after reload');

  section('3c. Manual ultimate (Auto off)');
  await page.click('#node-2');
  await page.waitForSelector('#preview:not(.hidden)');
  await page.click('#btnFight');
  await page.waitForFunction(() => HW.screen() === 'battle');
  if ((await page.evaluate(() => HW.getBattleState().auto))) await page.click('#btnAuto');
  check((await page.evaluate(() => HW.getBattleState().auto)) === false, 'Auto is off');
  await page.waitForFunction(() => { const s = HW.getBattleState(); return s.hero.energy >= 1000 || s.over; }, null, { timeout: 60000, polling: 50 });
  await sleep(1200);
  const pre = await page.evaluate(() => HW.getBattleState());
  check(pre.hero.energy >= 1000 && pre.ults === 0, 'energy fills to 1000 and waits for the player (ults fired: ' + pre.ults + ')');
  await shot(page, 'ultimate_ready');
  // A tap is queued until a foe is within leap reach (e.g. during a wave change).
  await page.click('#ultBtn');
  await page.waitForFunction(() => { const s = HW.getBattleState(); return s.ultDamage > 0 || s.over; }, null, { timeout: 10000, polling: 30 });
  const post = await page.evaluate(() => HW.getBattleState());
  check(post.ults === 1, 'clicking the portrait fired the ultimate');
  check(post.hero.energy < 1000, 'energy reset after the ultimate (now ' + Math.round(post.hero.energy) + ')');
  check(post.ultDamage > 0 && post.dealt > pre.dealt, 'ultimate dealt damage (' + post.ultDamage + ' from the slam)');

  section('3d. Pause / Resume');
  await page.click('#btnPause');
  await page.waitForSelector('#pause:not(.hidden)');
  const p1 = await page.evaluate(() => HW.getBattleState().time);
  await sleep(800);
  const p2 = await page.evaluate(() => HW.getBattleState());
  check(p2.paused && p2.time === p1, 'pause freezes the battle');
  await page.click('#btnResume');
  await sleep(600);
  const p3 = await page.evaluate(() => HW.getBattleState());
  check(!p3.paused && p3.time > p1, 'resume continues the battle');
  await page.click('#btnPause');
  await page.click('#btnLeave');
  await page.waitForFunction(() => HW.screen() === 'map');
  check(true, 'Leave returns to the map');

  section('3e. Boss screenshots');
  for (const [stage, tag] of [[5, 'stage5_boss'], [10, 'stage10_boss']]) {
    await page.evaluate((s) => {
      const b = HW.recommendedBuild(s);
      b.cleared = 9;
      HW.loadSave(b);
      HW.startBattle(s, { auto: true, speed: 1, seed: s * 1000 + 3 });
    }, stage);
    await fastForward(page, 's.wave === 3', stage === 10 ? 900 : 360);
    await sleep(900);
    const bs = await page.evaluate(() => HW.getBattleState());
    check(bs.wave === 3 && !bs.over && bs.enemies.some((e) => ['gorruk', 'morvane'].includes(e.type)), 'stage ' + stage + ' boss is on screen (wave ' + bs.wave + ')');
    await shot(page, tag);
  }
  await page.evaluate(() => HW.pause(true));

  section('3f. Defeat screen');
  await page.evaluate(() => { const s = HW.starterBuild(); s.cleared = 4; HW.loadSave(s); HW.startBattle(4, { auto: true, speed: 2, seed: 4000 }); });
  await fastForward(page, 'false', 0);
  await page.waitForFunction(() => HW.screen() === 'result', null, { timeout: 15000 });
  await sleep(800);
  check((await page.textContent('#resTitle')) === 'DEFEAT' && (await page.$$('#resTips li')).length >= 3, 'defeat overlay with tips');
  check(!!(await page.$('#resRetry')) && !!(await page.$('#resHero')), 'defeat offers Retry and Hero buttons');
  await shot(page, 'defeat');
  await page.click('#resMap');

  section('3g. New Game resets');
  await page.click('#mapMenu');
  await page.waitForFunction(() => HW.screen() === 'title');
  await page.click('#btnNew');
  await page.waitForSelector('#confirmNew:not(.hidden)');
  await page.click('#btnNewYes');
  await page.waitForFunction(() => HW.screen() === 'map');
  const fresh = await page.evaluate(() => HW.getSave());
  check(fresh.cleared === 0 && Object.keys(fresh.stars).length === 0 && fresh.level === 1 && fresh.gold === 0, 'New Game resets progress');
  check(await page.$eval('#node-2', (n) => n.classList.contains('locked')), 'stage 2 locked again after New Game');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('hwlc.save')));
  check(stored && stored.version === 1 && stored.cleared === 0, 'localStorage "hwlc.save" holds the reset save');

  // ------------------------------------------------------------ 4. real-time determinism
  section('4. Real-time loop: x1 vs x2 give the same outcome');
  const t1 = Date.now();
  await page.evaluate(() => HW.startBattle(1, { auto: true, speed: 1, seed: 1000 }));
  await page.waitForFunction(() => HW.screen() === 'result', null, { timeout: 150000, polling: 250 });
  const wall1 = (Date.now() - t1) / 1000;
  const realX1 = await page.evaluate(() => HW.getBattleState());
  const sig = (s) => JSON.stringify({ won: s.won, time: s.time.toFixed(4), hp: s.hero.hp, steps: s.steps, ults: s.ults, dealt: s.dealt, taken: s.taken });
  console.log('  x2: ' + sig(realX2) + ' in ' + wall2.toFixed(1) + ' s');
  console.log('  x1: ' + sig(realX1) + ' in ' + wall1.toFixed(1) + ' s');
  check(sig(realX1) === sig(realX2), 'same seed at x1 and x2 => identical battle (frame-rate independent)');
  check(wall1 > wall2 * 1.4, 'x1 takes longer in wall-clock than x2 (' + wall1.toFixed(1) + ' vs ' + wall2.toFixed(1) + ' s)');
  const headless = await page.evaluate(() => { const r = HW.simulateBattle(1, HW.starterBuild(), { seed: 1000 }); return r; });
  check(headless.won === realX1.won && Math.abs(headless.time - realX1.time) < 1e-6, 'headless simulateBattle matches the real-time battle');

  section('5. Errors');
  check(errors.length === 0, 'no console errors, page errors or failed requests during the run' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));

  await browser.close();
  console.log('\n' + (failures ? failures + ' check(s) FAILED' : 'ALL CHECKS PASSED'));
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

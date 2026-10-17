/*
 * Hero Pins — test/run.js
 * End-to-end checks with the globally installed Playwright (Chromium):
 *  - page loads over file:// with no console errors, page errors or failed requests
 *  - every level's recorded solution wins with the real physics, nothing escapes the frame
 *  - levels 2-10 are NOT won when the solution is pulled in reverse order
 *  - mouse interaction: clicking a pin pulls it, victory / defeat overlays appear
 *  - screenshots of levels 1, 5 and 10 at start (dir: $SHOTS_DIR or test/shots)
 * Usage: node test/run.js   (exit code 0 when everything passes)
 */
'use strict';
const path = require('path');
const fs = require('fs');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) {
    return require('/opt/node22/lib/node_modules/playwright');
  }
}
const { chromium } = loadPlaywright();

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html');
const SHOTS = process.env.SHOTS_DIR || path.join(__dirname, 'shots');

let failures = 0, passes = 0;
function check(cond, msg) {
  if (cond) { passes++; console.log('  ok   ' + msg); }
  else { failures++; console.log('  FAIL ' + msg); }
}

async function clickPin(page, id) {
  const pt = await page.evaluate((id) => {
    const g = HeroPins.current();
    const p = g.pins.find((q) => q.id === id);
    const r = document.getElementById('game').getBoundingClientRect();
    // a point 35% along the visible part of the pin
    const x = p.seg.x1 + (p.seg.x2 - p.seg.x1) * 0.35, y = p.seg.y1 + (p.seg.y2 - p.seg.y1) * 0.35;
    return { x: r.left + x / HeroPins.VIEW_W * r.width, y: r.top + y / HeroPins.VIEW_H * r.height };
  }, id);
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await page.mouse.up();
}

async function waitVisible(page, sel, ms) {
  try { await page.waitForSelector(sel, { state: 'visible', timeout: ms }); return true; } catch (e) { return false; }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 480, height: 860 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });

  await page.goto(URL);
  await page.evaluate(() => localStorage.removeItem('heroPins.progress'));
  await page.reload();
  check(await page.evaluate(() => typeof window.HeroPins === 'object' && HeroPins.levelCount() === 10), 'HeroPins API present with 10 levels');

  console.log('Solutions:');
  for (let n = 1; n <= 10; n++) {
    const s = await page.evaluate((n) => {
      const st = HeroPins.simulateSolution(n);
      const finite = st.bodies.every((b) => Number.isFinite(b.x) && Number.isFinite(b.y));
      return { status: st.status, reason: st.reason, coins: st.coins, required: st.required, power: st.heroPower, escaped: st.escaped, finite };
    }, n);
    check(s.status === 'won', `level ${n} solution wins (${s.status} ${s.reason} coins ${s.coins}/${s.required}, power ${s.power})`);
    check(!s.escaped && s.finite, `level ${n} no body escaped the frame / no NaN`);
  }

  console.log('Reverse order must not win:');
  for (let n = 2; n <= 10; n++) {
    const s = await page.evaluate((n) => {
      const sol = window.HPLevels[n - 1].solution.slice().reverse();
      const st = HeroPins.simulateOrder(n, sol);
      return { status: st.status, reason: st.reason, order: sol.join('') };
    }, n);
    check(s.status !== 'won', `level ${n} reverse order ${s.order} -> ${s.status} (${s.reason || 'waiting'})`);
  }

  console.log('Screenshots:');
  for (const n of [1, 5, 10]) {
    await page.evaluate((n) => { HeroPins.setHeadless(false); HeroPins.loadLevel(n); }, n);
    await page.waitForTimeout(400);
    const file = path.join(SHOTS, `level${n}.png`);
    await page.screenshot({ path: file });
    const nonBlank = await page.evaluate(() => {
      const c = document.getElementById('game');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const colours = new Set();
      for (let i = 0; i < d.length; i += 4 * 97) colours.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
      return colours.size;
    });
    check(nonBlank > 40, `level ${n} screenshot ${file} is not blank (${nonBlank} colour buckets)`);
  }

  console.log('Mouse interaction:');
  await page.evaluate(() => { HeroPins.setHeadless(false); HeroPins.loadLevel(1); });
  await page.waitForTimeout(300);
  await clickPin(page, 'A');
  await page.waitForTimeout(200);
  check(await page.evaluate(() => HeroPins.getState().pinsLeft.length === 0), 'clicking level 1 pin pulls it');
  check(await waitVisible(page, '#scrWin', 8000), 'victory overlay appears on level 1');
  await page.screenshot({ path: path.join(SHOTS, 'victory.png') });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('heroPins.progress') || 'null'));
  check(saved && saved.unlocked >= 2 && saved.stars[1] === 3, 'progress saved to localStorage (level 2 unlocked, 3 stars)');
  await page.click('#btnNext');
  await page.waitForTimeout(300);
  check(await page.evaluate(() => HeroPins.getState().level === 2), 'Next level button loads level 2');
  await clickPin(page, 'A');   // wrong first pin: coins roll into the lava
  check(await waitVisible(page, '#scrLose', 8000), 'defeat overlay appears after a wrong pull on level 2');
  check((await page.textContent('#loseReason')).length > 0, 'defeat reason shown: ' + await page.textContent('#loseReason'));
  await page.screenshot({ path: path.join(SHOTS, 'defeat.png') });
  await page.click('#btnRetry');
  await page.waitForTimeout(200);
  check(await page.evaluate(() => HeroPins.getState().status === 'playing' && HeroPins.getState().pulls === 0), 'Retry restarts the level');
  await page.click('#btnMenu');
  check(await waitVisible(page, '#scrTitle', 1000), 'Menu button returns to the title screen');
  await page.click('#btnSelect');
  check(await page.evaluate(() => document.querySelectorAll('#levelGrid .tile:not(.locked)').length === 2), 'level select shows 2 unlocked tiles');

  check(errors.length === 0, 'no console errors / failed requests' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

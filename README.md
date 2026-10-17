# Hero Wars: Lone Champion

A fan-made, offline, ad-free tribute to the Hero Wars campaign loop: a side-scrolling
fantasy auto-battler where **one** knight, Aldric, fights through ten stages of three waves
each, levels up, collects gear, upgrades skills and is promoted through ranks until he
topples Lady Morvane, the Lich Queen.

Pure HTML5 Canvas + vanilla JavaScript. No libraries, images, sounds, network or build step.

## How to play

Open `index.html` in a browser (double-clicking it works, since `file://` is supported) or
serve the folder with any static server. Progress saves automatically in `localStorage`
(key `hwlc.save`). **New Game** on the title screen wipes it.

### Controls

| Action | Mouse / touch | Keyboard |
| --- | --- | --- |
| Fire the ultimate when the energy bar is full ("TAP!") | Tap the hero's portrait (bottom-left) or tap Aldric | Space |
| Pause / resume | ❚❚ button (Resume, Restart, Leave) | Esc |
| Battle speed | x1 / x2 button | |
| Auto (fire the ultimate as soon as it is ready) | AUTO button | |
| Scroll the campaign map | Drag, mouse wheel, or the ‹ › buttons | |

Everything else, including movement, targeting, attacks and auto-skills, happens automatically.

## The battle

* Aldric walks to the nearest enemy and attacks once per second (crits, lifesteal from gear).
* **Energy** (0–1000): +100 per attack landed, +20–60 per hit taken, +200 per kill. When full,
  the portrait glows and pulses "TAP!". **Judgement Slam** leaps at the nearest foe within
  reach and deals 3×ATK + 40×level physical damage to every enemy within 180 px, stunning them
  for 1.5 s. Saving it for a cluster is the one decision that is yours. Never firing it loses
  the boss stages.
* Auto-skills unlock with hero level: **Shield Bash** (Lv 2, every 7 s, stun),
  **Holy Vigor** (Lv 4, heal over time below 50 % HP) and **Stalwart** (Lv 6, passive armor
  and magic resist, −25 % damage taken below 30 % HP).
* Each wave's enemies walk in from the right. Clear all three waves to win. Stars depend on
  remaining HP: ★★★ ≥ 60 %, ★★ ≥ 25 %, ★ otherwise.
* Enemies: goblins, goblin archers (arrows you can dodge only by moving), dire wolves (bleed),
  skeleton warriors (armored), skeleton mages (magic bolts), orc brutes (knockback), dark
  cultists (heal allies), bandit assassins (dash + crits), cave trolls (regenerate) and
  harpies (fly, cannot be stunned). Bosses: **Gorruk the Warchief** (cleave, war cry that
  enrages his allies) and **Lady Morvane** (raises skeletons, three-bolt barrage, and a
  shield in phase 2 that must be broken).

## The progression loop

1. **Win** → gold, XP and a chest with 1–2 items (first clear; replays pay 60 % and sometimes
   one item). **Lose** → 40 % of the XP you earned, plus tips. Then come back stronger.
2. **Level up** (cap 30): +60 HP, +5 attack, +2 armor, +1.5 magic resist per level.
3. **Gear**: six slots (weapon, helmet, chest, gloves, boots, amulet). Items are Common, Rare
   or Epic with 1–3 stats and a level requirement. On the Hero screen you can tap an item to
   compare it (+/− per stat), then **Equip** or **Sell** it. **Equip best** picks the strongest
   item for every slot.
4. **Skills**: spend gold to upgrade (cost `120 × level^1.4`, skill level ≤ hero level).
5. **Promotion**: with all six slots filled, **Promote** consumes the six items for a permanent
   +12 % to all base stats: White → Green → Blue → Violet, shown by the portrait frame color.
6. **Potions** (250 gold, carry up to 3): one is drunk automatically per battle below 25 % HP.

## Stages

| # | Stage | Theme | Waves | Rec. level |
| --- | --- | --- | --- | --- |
| 1 | Goblin Road | Forest road | 2 goblins · 3 goblins · 2 goblins + archer | 1 |
| 2 | Wolfwood Crossing | Forest road | 3 goblins · 2 wolves + archer · 2 archers + skeleton | 3 |
| 3 | Old Watchtower | Forest road | 3 wolves · 2 skeletons + archer · brute + 2 goblins | 6 |
| 4 | Ashen Hamlet | Ruined village at dusk | 2 skeletons + mage · brute + cultist · 2 skeletons + mage + cultist | 8 |
| 5 | Warchief's Pyre (boss) | Ruined village at dusk | 2 goblins + brute · goblin, archer, brute, cultist · **Gorruk** + 2 goblins | 11 |
| 6 | Hollow Crypt | Crypt | 2 assassins · 3 skeletons + mage · troll + archer | 13 |
| 7 | Echoing Caverns | Caves | 2 harpies + archer · 2 mages + cultist · troll + brute | 15 |
| 8 | Frostfang Pass | Frozen pass | 2 assassins + harpy · 3 skeletons + 2 mages · 2 trolls + cultist | 18 |
| 9 | Rimeveil Summit | Frozen pass | 3 harpies · 2 brutes + 2 mages + cultist · troll + 2 assassins + mage | 20 |
| 10 | Citadel of Morvane (boss) | Lich citadel | 4 skeletons · 2 mages + cultist + skeleton · **Lady Morvane** + 2 skeletons | 23 |

## Code layout

| File | Role |
| --- | --- |
| `index.html` | Page shell, CSS and the DOM overlays for every screen |
| `js/rng.js` | Seeded PRNG (mulberry32) |
| `js/data.js` | Hero, skills, enemies, stages, loot, reward formulas and every balance knob |
| `js/sim.js` | Pure deterministic battle simulation (fixed 1/60 s steps, no DOM) |
| `js/meta.js` | XP and levels, gear, skills, promotion, rewards, save/load, headless campaign |
| `js/render.js` | All procedural Canvas drawing: units, backgrounds, effects, HUD, map, icons |
| `js/ui.js` | Screens, input, the real-time loop and the `window.HW` API |
| `test/run.js` | Playwright end-to-end and balance tests |

Battles are reproducible: the seed is `stage × 1000 + attempt`, and the real-time loop adds
elapsed time × speed into fixed simulation steps, so x1, x2 and any frame rate give the same
fight. `window.HW` exposes `newGame`, `getSave`, `loadSave`, `startBattle`, `stepBattle`,
`fireUltimate`, `getBattleState`, `simulateBattle`, `simulateCampaign`, `applyRewards`,
`equipItem`, `upgradeSkill` and `levelFor` for scripting and balance checks.

## Tests

```
node test/run.js            # screenshots go to test/shots/ (or $SHOTS_DIR)
```

The suite needs Playwright and Chromium, and covers:
* a clean page load
* every balance rule, through the headless simulator: the recommended-level curve, the
  "reasonable player" campaign (its log is printed), level-1 and max-level heroes, and the
  ultimate on/off comparison
* the real-click flow from title to victory, the Hero screen, Equip best, persistence across
  a reload, the manual ultimate, pause, defeat and New Game
* the real-time loop at x2 (wall-clock budget) and x1 = x2 determinism

It exits 0 only when everything passes.

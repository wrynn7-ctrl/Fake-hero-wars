# Hero Pins

A small, ad-free "pull the pin" puzzle game in the style of the famous Hero Wars
advertisements. Pull the metal pins in the right order so the gold reaches the
knight while lava and monsters stay away from him.

Pure HTML5 Canvas + vanilla JavaScript: no libraries, no build step, no network,
no images (everything is drawn procedurally) and no sound.

## How to play

Open `index.html` in any modern browser — double-clicking the file works
(`file://`), or serve the folder with any static file server.

- **Pull a pin**: click / tap it, or drag it along its own axis towards its knob.
- **Treasure**: coins (+1 power) and gems (+3 power) that reach the knight's
  chamber are collected.
- **Lava** burns the knight, melts treasure and destroys monsters.
- **Water** and lava cancel each other out in a puff of steam.
- **Monsters** fight the knight when they reach him: he wins only if his power is
  at least the monster's number (green badge = he can win, red = he would lose).
- A level is won when all of its treasure is collected (and, where stated, every
  monster is defeated) and everything has come to rest.

### Controls

| Action | Input |
| --- | --- |
| Pull pin | click / tap, or drag along the pin |
| Hint (shows the next pin; limits you to 2 stars) | **Hint** button |
| Restart level | **Restart** button or `R` |
| Back to menu | **Menu** button or `Esc` |

Stars: 3 for winning with the minimum number of pulls and no hint, 2 for
collecting all treasure, 1 otherwise. Progress (unlocked levels and stars) is
saved in `localStorage` under `heroPins.progress`.

## Levels

1. **First Pull** — one pin, a pile of gold. Pull it.
2. **Think First** — gold above a ramp that leads into lava: drain the lava first.
3. **Divert the Flow** — let the lava slide down the diagonal pin into the pit,
   remove the ramp, then drop the gold.
4. **Gold Before Glory** — an orc (8) waits above the knight (5): collect the
   gold from the side channel first. Don't touch the lava pin.
5. **Burn the Brute** — a power-40 brute plugs the funnel; burn it with lava,
   send the lava to the pit, then let the gold through.
6. **Water Works** — pour water onto the lava, then bring the gold in and open
   the floor.
7. **Two Brutes** — gold to beat the small orc, gems behind him to beat the big one.
8. **Switchback** — a zig-zag course: empty the lava cup into the pit, remove
   the diagonal ramp, then roll the gold and gems down.
9. **Steam and Fury** — burn the orc with lava, cool the lava with water, then
   bring in the gold. One pin is a trap.
10. **The Dragon's Hoard** — gold, an orc, water, lava, gems and a power-28 boss.
    Seven pins, one of them a trap.

## Project layout

```
index.html      page shell, styles and DOM overlays
js/physics.js   deterministic circle physics (fixed sub-steps, capsules, sleep detection)
js/levels.js    level data (walls, pins, spawns, recorded solutions)
js/game.js      rules, win / defeat logic and the window.HeroPins API
js/render.js    procedural canvas drawing
js/ui.js        screens, input, render loop, saved progress
test/run.js     Playwright end-to-end test
```

## Testing

```
node test/run.js
```

Uses the globally installed Playwright with Chromium. It plays every level's
recorded solution with the real physics (must win), plays levels 2–10 in reverse
pin order (must not win), checks that nothing escapes the frame, that there are no
console errors, exercises the mouse controls and overlays, and saves screenshots
of levels 1, 5 and 10 to `test/shots/` (or `$SHOTS_DIR`).

The engine is exposed as `window.HeroPins`:
`loadLevel(n)`, `pullPin(id)`, `step(dt)`, `getState()`, `setHeadless(bool)`,
`simulateSolution(n)` and `simulateOrder(n, ids)`. The simulations pull each pin,
wait at least 0.6 s and until the scene comes to rest (at most 5 s), like a
careful player, then run up to 12 s after the last pull.

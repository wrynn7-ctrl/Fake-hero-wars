/*
 * rng.js — seeded pseudo-random number generator (mulberry32).
 * Every source of randomness in the battle simulation and the loot rolls goes
 * through one of these streams, so a battle is fully reproducible from its seed.
 */
(function (root) {
  'use strict';

  function create(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    function next() {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      next: next,
      range: function (a, b) { return a + (b - a) * next(); },
      int: function (a, b) { return a + Math.floor(next() * (b - a + 1)); },
      chance: function (p) { return next() < p; },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; }
    };
  }

  root.HWRng = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);

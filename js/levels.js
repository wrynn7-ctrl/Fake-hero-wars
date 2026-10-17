/*
 * Hero Pins — levels.js
 * Hand-designed level data. Playfield is 420 x 760, inner frame 20..400 / 20..740.
 * walls: [x1, y1, x2, y2] stone capsules (radius 7).
 * pins: capsules (radius 6) that slide out along their axis towards outDir.
 * heroRoom: entering it means touching the hero (treasure collected, lava burns,
 * monsters fight). solution: the intended pin order (tests + Hint button only).
 */
(function (root) {
  'use strict';

  root.HPLevels = [
    {
      id: 1, name: 'First Pull', heroPower: 10,
      hero: { x: 210, y: 716 }, heroRoom: { x: 20, y: 640, w: 380, h: 100 },
      walls: [[110, 150, 110, 374], [310, 150, 310, 374]],
      pins: [{ id: 'A', x1: 100, y1: 382, x2: 414, y2: 382, outDir: 'right' }],
      spawns: [{ type: 'coin', x: 118, y: 260, w: 184, h: 116, count: 15 }],
      solution: ['A'], requiredTreasure: 15, minPulls: 1
    },
    {
      id: 2, name: 'Think First', heroPower: 10,
      hero: { x: 306, y: 716 }, heroRoom: { x: 205, y: 640, w: 195, h: 100 },
      walls: [[205, 20, 205, 207], [198, 480, 198, 740]],
      pins: [
        { id: 'A', x1: 196, y1: 215, x2: 414, y2: 215, outDir: 'right' },
        { id: 'B', x1: 14, y1: 470, x2: 414, y2: 280, outDir: 'right' }
      ],
      spawns: [
        { type: 'coin', x: 214, y: 120, w: 184, h: 88, count: 12 },
        { type: 'lava', x: 28, y: 300, w: 148, h: 72, count: 30 }
      ],
      solution: ['B', 'A'], requiredTreasure: 12, minPulls: 2
    },
    {
      id: 3, name: 'Divert the Flow', heroPower: 10,
      hero: { x: 210, y: 716 }, heroRoom: { x: 157, y: 640, w: 106, h: 100 },
      walls: [[160, 40, 160, 200], [260, 40, 260, 200], [150, 470, 150, 740], [270, 520, 270, 740]],
      pins: [
        { id: 'A', x1: 6, y1: 400, x2: 300, y2: 260, outDir: 'left' },
        { id: 'B', x1: 150, y1: 430, x2: 414, y2: 553, outDir: 'right' },
        { id: 'C', x1: 154, y1: 208, x2: 414, y2: 208, outDir: 'right' }
      ],
      spawns: [
        { type: 'coin', x: 168, y: 130, w: 84, h: 70, count: 10 },
        { type: 'lava', x: 24, y: 310, w: 74, h: 30, count: 10 },
        { type: 'lava', x: 300, y: 455, w: 98, h: 35, count: 10 }
      ],
      solution: ['A', 'B', 'C'], requiredTreasure: 10, minPulls: 3
    },
    {
      id: 4, name: 'Gold Before Glory', heroPower: 5, winWhen: 'allMonstersDead',
      hero: { x: 230, y: 716 }, heroRoom: { x: 20, y: 640, w: 380, h: 100 },
      walls: [[137, 40, 137, 600], [323, 40, 323, 600]],
      pins: [
        { id: 'A', x1: 6, y1: 214, x2: 146, y2: 214, outDir: 'left' },
        { id: 'B', x1: 130, y1: 340, x2: 414, y2: 340, outDir: 'right' },
        { id: 'C', x1: 316, y1: 510, x2: 414, y2: 510, outDir: 'right' }
      ],
      spawns: [
        { type: 'coin', x: 24, y: 110, w: 106, h: 98, count: 6 },
        { type: 'monster', x: 230, y: 315, power: 8 },
        { type: 'lava', x: 332, y: 430, w: 66, h: 73, count: 16 }
      ],
      solution: ['A', 'B'], requiredTreasure: 6, minPulls: 2
    },
    {
      id: 5, name: 'Burn the Brute', heroPower: 10, winWhen: 'allMonstersDead',
      hero: { x: 130, y: 716 }, heroRoom: { x: 20, y: 640, w: 233, h: 100 },
      walls: [[245, 100, 245, 194], [290, 130, 290, 266], [260, 470, 260, 740]],
      pins: [
        { id: 'A', x1: 284, y1: 260, x2: 414, y2: 260, outDir: 'right' },
        { id: 'B', x1: 14, y1: 300, x2: 414, y2: 500, outDir: 'right' },
        { id: 'C', x1: 6, y1: 200, x2: 251, y2: 200, outDir: 'left' }
      ],
      spawns: [
        { type: 'coin', x: 28, y: 120, w: 210, h: 73, count: 14 },
        { type: 'lava', x: 297, y: 200, w: 101, h: 53, count: 14 },
        { type: 'monster', x: 378, y: 452, power: 40 }
      ],
      solution: ['A', 'B', 'C'], requiredTreasure: 14, minPulls: 3
    },
    {
      id: 6, name: 'Water Works', heroPower: 10,
      hero: { x: 280, y: 716 }, heroRoom: { x: 20, y: 640, w: 380, h: 100 },
      walls: [[160, 40, 160, 205], [20, 260, 160, 330], [160, 330, 160, 512]],
      pins: [
        { id: 'A', x1: 154, y1: 470, x2: 414, y2: 470, outDir: 'right' },
        { id: 'B', x1: 154, y1: 520, x2: 414, y2: 520, outDir: 'right' },
        { id: 'C', x1: 6, y1: 210, x2: 166, y2: 210, outDir: 'left' }
      ],
      spawns: [
        { type: 'coin', x: 24, y: 120, w: 132, h: 83, count: 12 },
        { type: 'water', x: 168, y: 400, w: 230, h: 63, count: 36 },
        { type: 'lava', x: 168, y: 480, w: 230, h: 31, count: 20 }
      ],
      solution: ['A', 'C', 'B'], requiredTreasure: 12, minPulls: 3
    },
    {
      id: 7, name: 'Two Brutes', heroPower: 5, winWhen: 'allMonstersDead',
      hero: { x: 200, y: 716 }, heroRoom: { x: 20, y: 640, w: 380, h: 100 },
      walls: [[130, 40, 130, 600], [190, 120, 190, 600]],
      pins: [
        { id: 'A', x1: 6, y1: 200, x2: 130, y2: 200, outDir: 'left' },
        { id: 'B', x1: 124, y1: 360, x2: 414, y2: 360, outDir: 'right' },
        { id: 'C', x1: 184, y1: 460, x2: 414, y2: 460, outDir: 'right' }
      ],
      spawns: [
        { type: 'coin', x: 24, y: 120, w: 100, h: 73, count: 5 },
        { type: 'monster', x: 160, y: 337, power: 9 },
        { type: 'gem', x: 138, y: 240, w: 44, h: 78, count: 4 },
        { type: 'monster', x: 300, y: 437, power: 20 }
      ],
      solution: ['A', 'B', 'C'], requiredTreasure: 9, minPulls: 3
    },
    {
      id: 8, name: 'Switchback', heroPower: 10,
      hero: { x: 140, y: 716 }, heroRoom: { x: 20, y: 640, w: 263, h: 100 },
      walls: [[190, 40, 190, 186], [20, 235, 300, 330], [400, 370, 150, 450], [290, 630, 290, 740]],
      pins: [
        { id: 'A', x1: 6, y1: 150, x2: 204, y2: 190, outDir: 'left' },
        { id: 'B', x1: 6, y1: 470, x2: 414, y2: 670, outDir: 'right' },
        { id: 'D', x1: 196, y1: 190, x2: 414, y2: 190, outDir: 'right' }
      ],
      spawns: [
        { type: 'coin', x: 24, y: 80, w: 152, h: 57, count: 12 },
        { type: 'gem', x: 222, y: 150, w: 176, h: 33, count: 4 },
        { type: 'lava', x: 312, y: 570, w: 86, h: 30, count: 10 }
      ],
      solution: ['B', 'A', 'D'], requiredTreasure: 16, minPulls: 3
    },
    {
      id: 9, name: 'Steam and Fury', heroPower: 10, winWhen: 'allMonstersDead',
      hero: { x: 220, y: 716 }, heroRoom: { x: 20, y: 640, w: 380, h: 100 },
      walls: [[143, 20, 143, 290], [20, 290, 143, 340], [143, 340, 143, 444], [297, 20, 297, 444]],
      pins: [
        { id: 'A', x1: 137, y1: 280, x2: 414, y2: 280, outDir: 'right' },
        { id: 'B', x1: 137, y1: 450, x2: 414, y2: 450, outDir: 'right' },
        { id: 'C', x1: 6, y1: 200, x2: 143, y2: 200, outDir: 'left' },
        { id: 'D', x1: 297, y1: 390, x2: 414, y2: 390, outDir: 'right' },
        { id: 'W', x1: 137, y1: 160, x2: 414, y2: 160, outDir: 'right' }
      ],
      spawns: [
        { type: 'water', x: 150, y: 40, w: 140, h: 113, count: 34 },
        { type: 'lava', x: 150, y: 200, w: 140, h: 73, count: 22 },
        { type: 'monster', x: 220, y: 425, power: 30 },
        { type: 'coin', x: 24, y: 110, w: 112, h: 83, count: 12 },
        { type: 'lava', x: 304, y: 300, w: 94, h: 83, count: 18 }
      ],
      solution: ['A', 'W', 'C', 'B'], requiredTreasure: 12, minPulls: 4
    },
    {
      id: 10, name: "The Dragon's Hoard", heroPower: 5, winWhen: 'allMonstersDead',
      hero: { x: 210, y: 716 }, heroRoom: { x: 20, y: 640, w: 380, h: 100 },
      walls: [[117, 20, 117, 500], [303, 20, 303, 500]],
      pins: [
        { id: 'A', x1: 6, y1: 260, x2: 124, y2: 260, outDir: 'left' },
        { id: 'B', x1: 110, y1: 490, x2: 414, y2: 490, outDir: 'right' },
        { id: 'D', x1: 296, y1: 130, x2: 414, y2: 130, outDir: 'right' },
        { id: 'E', x1: 6, y1: 130, x2: 124, y2: 130, outDir: 'left' },
        { id: 'G', x1: 110, y1: 380, x2: 414, y2: 380, outDir: 'right' },
        { id: 'L', x1: 110, y1: 270, x2: 414, y2: 270, outDir: 'right' },
        { id: 'W', x1: 110, y1: 160, x2: 414, y2: 160, outDir: 'right' }
      ],
      spawns: [
        { type: 'lava', x: 24, y: 40, w: 86, h: 83, count: 18 },
        { type: 'coin', x: 24, y: 160, w: 86, h: 93, count: 10 },
        { type: 'water', x: 124, y: 40, w: 172, h: 113, count: 30 },
        { type: 'lava', x: 124, y: 200, w: 172, h: 63, count: 20 },
        { type: 'gem', x: 124, y: 300, w: 172, h: 73, count: 5 },
        { type: 'monster', x: 210, y: 467, power: 12 },
        { type: 'monster', x: 355, y: 107, power: 28 }
      ],
      solution: ['A', 'W', 'L', 'G', 'B', 'D'], requiredTreasure: 15, minPulls: 6
    }
  ];
})(typeof window !== 'undefined' ? window : this);

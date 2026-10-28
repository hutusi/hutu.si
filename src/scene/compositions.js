// The two compositions from the design, in stage coordinates: "wide" (1280×800) and "tall"
// (390×844, portrait viewports). head.js picks one and fits it to the viewport; everything here
// is drawn in these coordinates. Rects are [x0, y0, x1, y1].

const inRect = (r, x, y) => x > r[0] && x < r[2] && y > r[1] && y < r[3];

export const WIDE = {
  w: 1280,
  h: 800,
  card: [330, 196, 950, 556],
  branch: {
    // No blossoms here (keeps the magpie's perch clear), and no twigs into the card's margin.
    noBloom: [340, -20, 605, 215],
    avoid: [[300, 176, 980, 664], [64, 290, 150, 500]],
    bounds: [-50, -50, 1330, 850],
    upTwigBelow: 260,
    limbs: [
      {
        x: -30, y: 850, a: -1.05,
        way: [[118, 628, 12], [172, 470, 10], [198, 388, 6, 0.14], [258, 270, 8], [346, 166, 6, 0.12], [470, 128, 8], [640, 110, 6], [796, 86, 8]],
        w0: 24, wEnd: 1.8, tp: 0.95, t0: 0, dur: 14,
        wobble: [360, 840, 4.5, 150], knotAbove: 520, minBlooms: 44,
      },
      {
        x: 1320, y: 30, a: 2.55,
        way: [[1200, 96, 12], [1110, 168, 10, 0.12], [1050, 250, 10], [1018, 330, 8]],
        w0: 11, wEnd: 0.9, tp: 1, t0: 1, dur: 12, right: true, minBlooms: 34,
      },
    ],
    mainWindow: (p, f) => (p.x > 400 && p.y < 240) || (f > 0.2 && f < 0.26),
    mainChance: 0.85,
    mainStep: [6, 11],
    nodeBloom: [0.8, 0.3], // [focus, other]
    tipBloom: [0.55, 0.3],
    gaps: [140, 80, 64],
    minLimbKids: 5,
    twigLen: [[90, 210], [24, 64], [14, 34]],
    noDownTwigs: false,
    limbFocus: (main, p) => !main || (p.x > 400 && p.y < 300),
  },
  magpie: {
    perch: [455, 104, 560, 180],
    perchFallback: [360, 80, 900, 190],
    perchWidth: [3.5, 15],
    perchCenter: 505,
    blooms: [[16, 1, 'blossom', 8.5], [-9, 1, 'bud', 5], [27, 1, 'bud', 4.6], [36, -1, 'half', 8], [54, -1, 'blossom', 9]],
    // Bezier flights in, from below on either side or (coming back) from the top corners: the
    // start and first control of each, the approach offset from the perch for flights from
    // below and from above, and how long the first flight and a return take (s).
    entries: { bl: [[150, 880], [250, 600]], br: [[1130, 880], [1030, 600]], tl: [[-90, 70], [140, 40]], tr: [[1370, 60], [1140, 30]] },
    approach: [[280, 140], [240, 110]],
    flight: [5, 4.2],
    // Flying off along a bezier: its controls as offsets from the perch (x the way it faces), its
    // end (an x offset, and a y above the screen), how long that takes and how long it stays
    // away (s).
    off: { via: [[90, -60], [300, -210]], to: [560, -160], dur: 2.1, away: 10 },
    lowWingsBelow: Infinity,
    hideBehindCard: null,
    scale: 0.79,
    resolution: 1.5,
    reach: [100, 45], // pointer within this radius of (perch.x, perch.y - dy) makes it react
    hit: [14, 36, 58], // a tap within r of (perch.x - dx·dir, perch.y - dy) is on the bird
    // Its head follows a pointer within range of (perch.x + dx·dir, perch.y - dy); the range
    // grows once it is looking.
    look: { from: [16, 50], range: [230, 275] },
    // Hops: points along the limb per hop, and where it will land (thick, level enough, inside
    // the area, and within `level` of the height it hops from); `height` is the arc.
    hop: { step: 5, width: [4.6, 16], area: [380, 70, 900, 195], level: 9, height: 7 },
  },
  touchRadius: 22,
  specks: 9000,
  fibres: 160,
};

export const TALL = {
  w: 390,
  h: 844,
  card: [20, 242, 370, 742],
  branch: {
    noBloom: [80, 60, 236, 198],
    avoid: [[10, 232, 380, 750]],
    bounds: [-50, -50, 440, 894],
    upTwigBelow: 150,
    limbs: [
      {
        x: 430, y: -30, a: 2.3,
        way: [[352, 64, 8], [298, 116, 6, 0.12], [246, 152, 6], [192, 168, 4], [128, 174, 4], [70, 166, 6, 0.12], [22, 148, 6]],
        w0: 17, wEnd: 1.6, tp: 0.95, t0: 0, dur: 14, minBlooms: 24,
      },
    ],
    mainWindow: (p, f) => f > 0.08,
    mainChance: 0.5,
    mainStep: [8, 14],
    nodeBloom: [0.48, 0.2],
    tipBloom: [0.3, 0.18],
    gaps: [100, 60, 48],
    minLimbKids: 9,
    twigLen: [[60, 130], [20, 48], [14, 34]],
    noDownTwigs: true,
    limbFocus: () => true,
  },
  magpie: {
    perch: [150, 130, 230, 200],
    perchFallback: [100, 90, 300, 230],
    perchWidth: [3, 15],
    perchCenter: 190,
    blooms: [[13, 1, 'blossom', 7.5], [-7, 1, 'bud', 4.6], [29, -1, 'half', 7], [58, 1, 'bud', 4.4]],
    entries: { bl: [[-40, 900], [-90, 300]], br: [[430, 900], [480, 300]], tl: [[-70, 40], [40, 20]], tr: [[460, 30], [350, 10]] },
    approach: [[150, 110], [130, 80]],
    flight: [5, 3.6],
    off: { via: [[60, -50], [200, -170]], to: [340, -160], dur: 1.8, away: 10 },
    lowWingsBelow: 290,
    hideBehindCard: [18, 240, 372, 744],
    scale: 0.62,
    resolution: 1.6,
    reach: [56, 28],
    hit: [10, 28, 60],
    look: { from: [12, 40], range: [180, 215] },
    hop: { step: 4, width: [4.2, 16], area: [70, 95, 320, 230], level: 9, height: 6 },
  },
  touchRadius: 30,
  specks: 3000,
  fibres: 160,
};

export { inRect };

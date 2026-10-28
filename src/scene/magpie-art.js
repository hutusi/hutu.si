// The magpie's artwork, carried over from the design mechanically to keep its hand-tuned values
// exact: feather strokes, the parts pre-rendered from them once (tail, body, folded wing, head),
// the wings spread procedurally in flight, and the legs. drawMagpie() composes a pose.

function feather(c, x, y, ang, len, w, o, rnd) {
  const hw = w / 2, an = o.asym ?? 1;
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  const p = new Path2D();
  p.moveTo(0, -hw * 0.42 * an);
  p.bezierCurveTo(len * 0.3, -hw * an, len * 0.78, -hw * 1.04 * an, len * 0.93, -hw * 0.6 * an);
  p.quadraticCurveTo(len * 1.015, -hw * 0.05, len * 0.94, hw * 0.6);
  p.bezierCurveTo(len * 0.78, hw * 1.04, len * 0.3, hw, 0, hw * 0.42);
  p.closePath();
  const g = c.createLinearGradient(0, 0, len, 0);
  o.cols.forEach(([s, col]) => g.addColorStop(s, col));
  c.fillStyle = g;
  c.fill(p);
  if (o.sheen || o.edge || o.barbs && rnd) {
    c.save();
    c.clip(p);
    if (o.sheen) {
      const sg = c.createLinearGradient(0, 0, len, 0);
      o.sheen.forEach(([s, col]) => sg.addColorStop(s, col));
      c.fillStyle = sg;
      c.beginPath();
      c.ellipse(len * 0.55, hw * 0.3, len * 0.5, hw * 0.6, 0, 0, 6.283);
      c.fill();
    }
    if (o.edge) {
      const a0 = o.edge[0] * len, a1 = o.edge[1] * len;
      c.fillStyle = o.edge[2];
      c.beginPath();
      c.moveTo(a0, -hw * 0.45);
      c.quadraticCurveTo((a0 + a1) / 2, -hw * 1.25, a1, -hw * 0.55);
      c.quadraticCurveTo((a0 + a1) / 2, -hw * 0.5, a0, -hw * 0.45);
      c.fill();
    }
    if (o.barbs && rnd) {
      c.strokeStyle = o.barb;
      c.lineWidth = o.bwid ?? 0.32;
      c.beginPath();
      const n = Math.max(4, Math.round(len / o.barbs));
      for (let i = 1; i < n; i++) {
        const x0 = i / n * len;
        for (const s of [-1, 1]) {
          const lean = w * (0.45 + rnd() * 0.3);
          c.moveTo(x0, s * 0.3);
          c.quadraticCurveTo(x0 + lean * 0.45, s * hw * 0.55, x0 + lean, s * hw * 1.15);
        }
      }
      c.stroke();
    }
    c.restore();
  }
  c.strokeStyle = o.shaft;
  c.lineWidth = 0.5;
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(len * 0.5, hw * 0.04, len * 0.92, 0);
  c.stroke();
  c.strokeStyle = o.line;
  c.lineWidth = o.lw ?? 0.45;
  c.stroke(p);
  c.restore();
}

export function buildArt(K, pxPerUnit, resolution) {
  const RS = K * pxPerUnit * resolution;
  let sd = 917;
  const rnd = () => {
    sd = Math.imul(sd, 1664525) + 1013904223 >>> 0;
    return sd / 4294967296;
  }, Rr = (a, b) => a + (b - a) * rnd();
  const hit = document.createElement('canvas').getContext('2d');
  const mk = (x, y, w, h, fn) => {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w * RS);
    cv.height = Math.ceil(h * RS);
    const c = cv.getContext('2d');
    c.setTransform(RS, 0, 0, RS, -x * RS, -y * RS);
    c.lineCap = 'round';
    fn(c);
    return { cv, x, y, w, h };
  };
  const F = (c, x, y, a, len, w, o) => feather(c, x, y, a, len, w, o, rnd);
  const INK = '#17130f';
  const DARK = { cols: [[0, '#15110e'], [0.45, '#1a1c22'], [0.8, '#202838'], [1, '#232640']], sheen: [[0.15, 'rgba(84,140,150,0)'], [0.5, 'rgba(84,140,150,0.26)'], [0.8, 'rgba(104,112,196,0.28)'], [1, 'rgba(140,96,176,0.2)']], line: 'rgba(130,144,170,0.4)', barb: 'rgba(170,186,206,0.12)', shaft: 'rgba(150,160,180,0.22)', barbs: 1.25 };
  const PLAIN = { ...DARK, cols: [[0, '#15110e'], [1, '#1c1b20']], sheen: null, barbs: 1.4, line: 'rgba(130,144,170,0.32)' };
  const SEC = { ...DARK, cols: [[0, '#14110e'], [0.35, '#19222c'], [0.7, '#203250'], [1, '#262a50']], sheen: [[0.2, 'rgba(80,140,150,0)'], [0.5, 'rgba(80,140,150,0.3)'], [0.8, 'rgba(110,120,200,0.32)'], [1, 'rgba(140,100,180,0.22)']] };
  const TER = { ...DARK, cols: [[0, '#14110e'], [0.4, '#1a2420'], [0.75, '#23392f'], [1, '#2a2f44']], sheen: [[0.2, 'rgba(110,160,120,0)'], [0.55, 'rgba(110,160,120,0.3)'], [0.9, 'rgba(140,110,180,0.26)']] };
  const PRI = { ...DARK, cols: [[0, '#13100d'], [0.5, '#191a24'], [0.82, '#242248'], [1, '#1b1830']], sheen: [[0.3, 'rgba(120,100,190,0)'], [0.66, 'rgba(120,100,190,0.3)'], [1, 'rgba(90,140,160,0.2)']], edge: [0.1, 0.62, '#f1ece2'], asym: 0.8, barbs: 1.15 };
  const WHITE = { cols: [[0, '#e3ddd2'], [0.3, '#f6f2ea'], [0.8, '#f3eee5'], [1, '#e2dbcf']], sheen: null, line: 'rgba(96,86,78,0.55)', barb: 'rgba(128,118,108,0.2)', shaft: 'rgba(150,140,130,0.28)', barbs: 1.1, lw: 0.5 };
  const TAILO = { cols: [[0, '#191613'], [0.16, '#1f2b26'], [0.38, '#2b483c'], [0.58, '#2a475a'], [0.76, '#323d69'], [0.9, '#433668'], [1, '#251e31']], sheen: [[0.22, 'rgba(120,170,145,0)'], [0.42, 'rgba(120,170,145,0.32)'], [0.62, 'rgba(110,150,200,0.3)'], [0.82, 'rgba(150,120,200,0.32)'], [1, 'rgba(150,120,200,0)']], line: 'rgba(120,140,162,0.38)', barb: 'rgba(176,200,212,0.13)', shaft: 'rgba(10,8,7,0.8)', barbs: 1.25 };
  const T0x = -36, T0y = -27, TA = 2.66;
  const bodyP = new Path2D('M18 -71 C12 -66 6 -60 -2 -56.5 C-12 -52 -22 -46 -30 -38.5 C-34 -35 -37 -32 -39 -29 L-40 -25 C-34 -22.5 -27 -19 -20 -17.5 C-12 -15.5 -2 -14.5 6 -16 C15 -18 22 -24 26 -31 C29 -37 32 -44 34 -51 C35 -55 36 -58 37 -60 L30 -64 Z');
  const bellyP = new Path2D('M27.5 -36 C22 -38.5 14 -40 6 -40 C-4 -39.5 -14 -36.5 -22 -30 C-25 -27 -25 -21.5 -21 -18.2 C-12 -15.8 -2 -14.8 6 -16.3 C15 -18.3 22 -24.2 25.8 -31 C26.6 -32.8 27.2 -34.4 27.5 -36 Z');
  const inB = (x, y) => hit.isPointInPath(bodyP, x, y), inW = (x, y) => hit.isPointInPath(bellyP, x, y);
  const scallop = (c, x, y, r, d, col) => {
    c.strokeStyle = col;
    c.lineWidth = 0.45;
    c.beginPath();
    c.arc(x, y, r, d - 1.05, d + 1.05);
    c.stroke();
  };
  const spike = (c, x, y, a, l, b) => {
    const nx = -Math.sin(a), ny = Math.cos(a);
    c.beginPath();
    c.moveTo(x + nx * b, y + ny * b);
    c.quadraticCurveTo(x + Math.cos(a) * l * 0.6 + nx * b * 0.5, y + Math.sin(a) * l * 0.6 + ny * b * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    c.quadraticCurveTo(x + Math.cos(a) * l * 0.6 - nx * b * 0.5, y + Math.sin(a) * l * 0.6 - ny * b * 0.5, x - nx * b, y - ny * b);
    c.closePath();
    c.fill();
  };
  const tail = mk(-175, -48, 160, 100, (c) => {
    const ux = Math.cos(TA), uy = Math.sin(TA), dnx = Math.sin(TA), dny = -Math.cos(TA);
    [[54, 7.4], [64, 7.9], [76, 8.3], [90, 8.7], [106, 9.1], [124, 9.5]].forEach(([len, w], i) => {
      const k = 5 - i;
      F(c, T0x + dnx * k * 1.5 - ux * k * 0.5, T0y + dny * k * 1.5 - uy * k * 0.5, TA - k * 0.03, len, w, TAILO);
    });
  });
  const body = mk(-52, -80, 96, 72, (c) => {
    c.fillStyle = INK;
    c.fill(bodyP);
    c.save();
    c.clip(bodyP);
    let g = c.createLinearGradient(-6, -58, 4, -18);
    g.addColorStop(0, 'rgba(98,118,146,0.32)');
    g.addColorStop(0.2, 'rgba(70,96,120,0.1)');
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.3)');
    c.fillStyle = g;
    c.fillRect(-52, -80, 96, 72);
    g = c.createRadialGradient(29, -49, 0, 29, -49, 11);
    g.addColorStop(0, 'rgba(128,128,150,0.22)');
    g.addColorStop(1, 'rgba(128,128,150,0)');
    c.fillStyle = g;
    c.fillRect(14, -64, 26, 30);
    for (let i = 0; i < 340; i++) {
      const x = Rr(-42, 38), y = Rr(-74, -14);
      if (!inB(x, y) || inW(x, y)) continue;
      const d = x > 20 ? 1.75 + Rr(-0.2, 0.2) : 2.62 + Rr(-0.18, 0.18);
      scallop(c, x, y, Rr(1.5, 2.6), d, 'rgba(150,162,188,' + Rr(0.07, 0.17).toFixed(3) + ')');
    }
    c.strokeStyle = 'rgba(168,178,198,0.22)';
    c.lineWidth = 1.5;
    c.stroke(new Path2D('M18 -70.5 C12 -65.8 6 -59.8 -2 -56.2 C-12 -51.8 -22 -45.8 -30 -38.3 C-34 -34.8 -37 -31.8 -39 -28.8'));
    c.restore();
    [0, 1, 2, 3].forEach((i) => F(c, -27 - i * 2.2, -21.5 - i * 1.1, 2.72, 15 - i * 1.5, 7.5, PLAIN));
    c.save();
    c.clip(bellyP);
    c.fillStyle = '#f6f2e9';
    c.fillRect(-30, -45, 60, 32);
    g = c.createLinearGradient(0, -41, 0, -15);
    g.addColorStop(0, 'rgba(100,92,86,0.5)');
    g.addColorStop(0.22, 'rgba(130,120,112,0.14)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(0.82, 'rgba(140,128,118,0.12)');
    g.addColorStop(1, 'rgba(108,98,90,0.38)');
    c.fillStyle = g;
    c.fillRect(-30, -45, 60, 32);
    g = c.createLinearGradient(-24, 0, 27, 0);
    g.addColorStop(0, 'rgba(104,94,86,0.34)');
    g.addColorStop(0.38, 'rgba(0,0,0,0)');
    g.addColorStop(0.85, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(118,108,98,0.2)');
    c.fillStyle = g;
    c.fillRect(-30, -45, 60, 32);
    g = c.createRadialGradient(13, -27, 0, 13, -27, 13);
    g.addColorStop(0, 'rgba(255,255,255,0.62)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(-30, -45, 60, 32);
    for (let i = 0; i < 480; i++) {
      const x = Rr(-25, 28), y = Rr(-42, -14);
      if (!inW(x, y)) continue;
      const a = 2 + x * 7e-3 + Rr(-0.2, 0.2), l = Rr(2.4, 5), wh = rnd() < 0.3;
      c.strokeStyle = wh ? 'rgba(255,255,255,0.55)' : 'rgba(110,100,92,' + Rr(0.12, 0.28).toFixed(3) + ')';
      c.lineWidth = wh ? 0.4 : 0.32;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + Math.sin(a) * 0.6, y + Math.sin(a) * l * 0.5 - Math.cos(a) * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l);
      c.stroke();
    }
    c.restore();
    c.strokeStyle = 'rgba(92,84,76,0.5)';
    c.lineWidth = 0.55;
    c.stroke(new Path2D('M25.8 -31 C22 -24.2 15 -18.3 6 -16.3 C-2 -14.8 -12 -15.8 -21 -18.2'));
    c.fillStyle = INK;
    const bY = (x) => x > 6 ? -36 - (27.5 - x) * 0.186 : -40 + (6 - x) * 0.17;
    for (let i = 0; i < 24; i++) {
      const x = 27.5 - Math.min(1, Math.max(0, i / 23 + Rr(-0.03, 0.03))) * 26 + Rr(-0.8, 0.8);
      spike(c, x, bY(x) + Rr(-1.4, 1.6), 1.95 + Rr(-0.45, 0.45), rnd() < 0.25 ? Rr(5, 7.5) : Rr(1.4, 4.2), Rr(0.6, 1.7));
    }
    c.fillStyle = '#ece6db';
    for (let i = 0; i < 10; i++) {
      const x = Rr(2, 26);
      spike(c, x, bY(x) + Rr(0.6, 2), -1.25 + Rr(-0.5, 0.5), Rr(1.2, 3.8), Rr(0.5, 1.1));
    }
    c.fillStyle = INK;
    for (let i = 0; i < 9; i++) spike(c, -21.6 - Rr(-0.6, 1.4), -18.6 - i * 1.25 + Rr(-0.5, 0.5), Rr(-0.7, 0.15), Rr(1.4, 4.4), Rr(0.6, 1.2));
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.ellipse(2.6 + i * 1.7, -16.8 + Rr(-0.4, 0.4), 1.5, 2.6, 0.3, 0, 6.283);
      c.fill();
    }
  });
  const wing = mk(-66, -68, 100, 56, (c) => {
    [[-58, -19.5], [-55, -21.6], [-52, -23.7], [-49, -25.7], [-46, -27.5]].forEach(([tx, ty], i) => {
      const bx = -2 - i * 1.4, by = -37.5 - i * 1.1;
      F(c, bx, by, Math.atan2(ty - by, tx - bx), Math.hypot(tx - bx, ty - by), 6.2, PRI);
    });
    [[-38, -29.5], [-35, -31.8], [-32, -34.2], [-29, -36.6], [-26, -39]].forEach(([tx, ty], i) => {
      const bx = 8 - i * 2, by = -43.5 - i * 1.5;
      F(c, bx, by, Math.atan2(ty - by, tx - bx), Math.hypot(tx - bx, ty - by), 8.8, SEC);
    });
    [[6, -51.5, -24, -42], [4, -53.5, -19, -45.5]].forEach(([bx, by, tx, ty]) => F(c, bx, by, Math.atan2(ty - by, tx - bx), Math.hypot(tx - bx, ty - by), 9.6, TER));
    for (let j = 6; j >= 0; j--) F(c, 15 - j * 3.3, -46.8 + j * 0.2, 2.86 + j * 0.02, 15 - j * 0.4, 8.2, DARK);
    for (let j = 7; j >= 0; j--) F(c, 16.5 - j * 2.4, -50.5 + j * 0.15, 2.76, 8.5, 6.2, DARK);
    for (let i = 0; i < 16; i++) F(c, Rr(10, 18.5), Rr(-51, -42), 2.3 + Rr(-0.3, 0.3), Rr(3.8, 5.2), 4, PLAIN);
    c.strokeStyle = 'rgba(10,8,6,0.32)';
    c.lineWidth = 3;
    c.stroke(new Path2D('M15 -53 C4 -51 -10 -48 -25 -43.5'));
    const SCP = { ...WHITE, line: 'rgba(96,86,78,0.42)' };
    [[16, -55.5, -25, -42.6, 10.5], [15, -57, -20, -45.4, 11], [14, -58, -14.5, -48, 11], [13, -58.6, -8.5, -50.6, 10], [12, -58.8, -2.5, -53, 8.4]].forEach(([bx, by, tx, ty, w]) => {
      tx += Rr(-4, 3);
      ty += Rr(-1.2, 1.8);
      bx += Rr(-0.8, 0.8);
      by += Rr(-0.6, 0.6);
      F(c, bx, by, Math.atan2(ty - by, tx - bx), Math.hypot(tx - bx, ty - by), w * Rr(0.78, 1.18), SCP);
    });
    for (let i = 0; i < 10; i++) {
      const t = rnd(), bx = 14 - t * 22 + Rr(-1, 1), by = -59 + t * 7.5 + Rr(-1.6, 1.6);
      F(c, bx, by, 2.78 + Rr(-0.16, 0.16), Rr(4, 11.5), Rr(3.2, 8), SCP);
    }
    for (let i = 0; i < 7; i++) {
      const bx = Rr(-20, 13);
      F(c, bx, -55.5 + (16 - bx) * 0.315 + Rr(3.4, 5.6), 2.84 + Rr(-0.14, 0.14), Rr(3.5, 7.5), Rr(2.8, 5.2), PLAIN);
    }
    c.fillStyle = INK;
    c.fill(new Path2D('M18 -71 C12 -66 6 -60 -2 -56.5 C-12 -52 -22 -46 -30 -38.5 L-30 -41 C-22 -48.5 -12 -54.6 -2 -59 C6 -62.5 12 -68 18 -73 Z'));
    {
      const pts = [[18, -71], [6, -60], [-2, -56.5], [-12, -52], [-22, -46]], bandY = (x) => {
        for (let i = 0; i < 4; i++) {
          const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
          if (x <= x0 && x >= x1) return y0 + (y1 - y0) * (x0 - x) / (x0 - x1);
        }
        return -46;
      };
      for (let i = 0; i < 18; i++) {
        const x = Rr(-20, 15);
        spike(c, x, bandY(x) - 0.3, 2.2 + Rr(-0.4, 0.4), rnd() < 0.2 ? Rr(5, 7) : Rr(1.4, 4.4), Rr(0.7, 1.6));
      }
    }
    const FL = { ...WHITE, line: 'rgba(96,86,78,0.26)' };
    for (let i = 0; i < 6; i++) {
      const t = i / 5, x = 13 - t * 30;
      F(c, x, -37.6 + (14 - x) * 0.309 + Rr(-0.4, 0.5), 2.9 + Rr(-0.12, 0.12), Rr(7, 9), 6.4, FL);
    }
    const BR = { ...PLAIN, line: 'rgba(130,144,170,0.12)' };
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      F(c, 19.6 - t * 2.4, -53 + t * 13, 2.15 + Rr(-0.15, 0.15), Rr(7, 9), 7, BR);
    }
  });
  const head = mk(4, -86, 60, 34, (c) => {
    const hp = new Path2D('M14 -71 C18 -76 24 -77.6 28 -77.6 C35 -77.6 39 -72 38.8 -66 C38.6 -61 36 -57.5 32 -56.8 C26 -55.8 20 -57 15 -60.5 C12.5 -63.5 12.5 -68 14 -71 Z');
    c.fillStyle = INK;
    c.fill(hp);
    c.save();
    c.clip(hp);
    let g = c.createRadialGradient(25, -75, 0, 25, -75, 10);
    g.addColorStop(0, 'rgba(124,104,156,0.32)');
    g.addColorStop(1, 'rgba(124,104,156,0)');
    c.fillStyle = g;
    c.fillRect(4, -86, 60, 34);
    g = c.createRadialGradient(17, -70, 0, 17, -70, 7);
    g.addColorStop(0, 'rgba(80,122,110,0.22)');
    g.addColorStop(1, 'rgba(80,122,110,0)');
    c.fillStyle = g;
    c.fillRect(4, -86, 60, 34);
    g = c.createLinearGradient(0, -63, 0, -56);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    c.fillStyle = g;
    c.fillRect(4, -86, 60, 34);
    for (let i = 0; i < 110; i++) {
      const x = Rr(13, 38), y = Rr(-78, -57);
      if (!hit.isPointInPath(hp, x, y)) continue;
      if (y < -71) scallop(c, x, y, Rr(1, 1.6), 2.95 + Rr(-0.2, 0.2), 'rgba(150,160,184,' + Rr(0.08, 0.16).toFixed(3) + ')');
      else {
        c.strokeStyle = 'rgba(140,150,172,' + Rr(0.07, 0.15).toFixed(3) + ')';
        c.lineWidth = 0.35;
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x - 1.5, y - 0.3, x - Rr(2.5, 4.5), y + Rr(-0.6, 0.8));
        c.stroke();
      }
    }
    c.strokeStyle = 'rgba(172,178,198,0.26)';
    c.lineWidth = 1.3;
    c.stroke(new Path2D('M14.5 -71 C18 -75.6 24 -77.2 28 -77.2 C34 -77.2 37.8 -72.6 38.4 -68'));
    c.restore();
    c.fillStyle = '#3a3431';
    c.beginPath();
    c.arc(30, -69.5, 4.1, 0, 6.283);
    c.fill();
    g = c.createRadialGradient(30, -69.5, 0, 30, -69.5, 3.25);
    g.addColorStop(0, '#060504');
    g.addColorStop(0.55, '#0d0907');
    g.addColorStop(1, '#2e2016');
    c.fillStyle = g;
    c.beginPath();
    c.arc(30, -69.5, 3.25, 0, 6.283);
    c.fill();
    c.strokeStyle = 'rgba(150,142,134,0.55)';
    c.lineWidth = 0.45;
    c.beginPath();
    c.arc(30, -69.5, 3.7, -2.7, -0.3);
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.92)';
    c.beginPath();
    c.ellipse(31.1, -70.7, 1, 0.8, -0.5, 0, 6.283);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath();
    c.arc(28.7, -68.1, 0.45, 0, 6.283);
    c.fill();
    const up = new Path2D('M37 -72.4 L50.4 -66.2 L51.8 -65.1 Q46 -65.3 37.4 -64.9 Z'), lo = new Path2D('M37.4 -64.7 Q45 -65 51.6 -65 Q46 -62.4 37.4 -59.8 Z');
    g = c.createLinearGradient(0, -72.5, 0, -64.5);
    g.addColorStop(0, '#4b4643');
    g.addColorStop(0.35, '#211d1b');
    g.addColorStop(1, '#0f0d0c');
    c.fillStyle = g;
    c.fill(up);
    g = c.createLinearGradient(0, -64.5, 0, -59.5);
    g.addColorStop(0, '#0f0d0c');
    g.addColorStop(0.7, '#1f1b19');
    g.addColorStop(1, '#2e2926');
    c.fillStyle = g;
    c.fill(lo);
    c.strokeStyle = 'rgba(200,194,188,0.42)';
    c.lineWidth = 0.7;
    c.stroke(new Path2D('M38.6 -71.5 L49.6 -66.6'));
    c.strokeStyle = 'rgba(0,0,0,0.9)';
    c.lineWidth = 0.55;
    c.stroke(new Path2D('M37.4 -64.8 L51.4 -65.05'));
    c.strokeStyle = 'rgba(150,145,140,0.3)';
    c.lineWidth = 0.45;
    c.stroke(new Path2D('M39.5 -60.7 Q45 -62 49.6 -63.9'));
    c.strokeStyle = 'rgba(10,8,7,0.75)';
    c.lineWidth = 0.4;
    c.stroke(up);
    c.stroke(lo);
    for (let i = 0; i < 14; i++) {
      const x = Rr(33, 38), y = Rr(-73, -66.5);
      c.strokeStyle = i % 3 ? 'rgba(28,24,22,0.95)' : 'rgba(140,138,146,0.4)';
      c.lineWidth = 0.42;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + 2.5, y + Rr(-0.3, 0.3), x + Rr(4.5, 7), y + Rr(0.4, 1.6));
      c.stroke();
    }
  });
  return {
    K,
    T0x,
    T0y,
    tail,
    body,
    wing,
    head,
    SEC: { ...SEC, barbs: 0 },
    COV: { ...DARK, barbs: 0 },
    PRIF: { cols: [[0, '#efeae0'], [0.58, '#f4f0e7'], [0.7, '#2a2a36'], [1, '#15131a']], line: 'rgba(70,64,60,0.55)', shaft: 'rgba(120,112,104,0.4)', asym: 0.7 }
  };
}

function drawSpread(c, art, P, side) {
  const A = art, S = P.S, sx = 6, sy = -53, bx = -0.887, by = 0.461, ux = -0.461, uy = -0.887;
  const k = Math.cos(P.psi) + (side > 0 ? -0.62 : 0.62) * Math.sin(P.psi);
  const L = 64 * S, vx = (ux * k + bx * 0.2) * L, vy = (uy * k + by * 0.2) * L, vl = Math.hypot(vx, vy) || 1, dx = vx / vl, dy = vy / vl, ba = Math.atan2(by, bx);
  c.save();
  c.globalAlpha *= P.spreadA * (side > 0 ? 1 : 0.8);
  for (let i = 7; i >= 0; i--) {
    const s = 0.05 + i * 0.055;
    feather(c, sx + vx * s, sy + vy * s, ba + 0.05, 30 * S, 8.5 * S, A.SEC);
  }
  for (let j = 8; j >= 0; j--) {
    const t = j / 8, s = 0.47 + t * 0.48, m = 0.12 + 0.62 * t, ex = bx * (1 - m) + dx * m, ey = by * (1 - m) + dy * m;
    feather(c, sx + vx * s, sy + vy * s, Math.atan2(ey, ex), (34 + 12 * t) * S, 7 * S, A.PRIF);
  }
  for (let i = 6; i >= 0; i--) {
    const s = 0.04 + i * 0.085;
    feather(c, sx + vx * s, sy + vy * s, ba + 0.1, 15 * S, 9 * S, A.COV);
  }
  c.lineCap = 'round';
  c.strokeStyle = '#16120f';
  c.lineWidth = 7 * S;
  c.beginPath();
  c.moveTo(sx, sy);
  c.lineTo(sx + vx * 0.5, sy + vy * 0.5);
  c.stroke();
  c.lineWidth = 4 * S;
  c.beginPath();
  c.moveTo(sx + vx * 0.48, sy + vy * 0.48);
  c.lineTo(sx + vx * 0.92, sy + vy * 0.92);
  c.stroke();
  c.restore();
}

function drawLegs(c, P, far, bw) {
  const la = P.legA;
  if (la < 0.03) return;
  const hx = far ? 9.5 : 4.5, hy = -11 + P.dip, tx0 = far ? 8.8 : 2.5;
  const fx = hx - 7 + (tx0 - hx + 7) * la, fy = hy + 6 + (0 - hy - 6) * la, col = far ? '#3d3532' : '#1c1816';
  c.save();
  c.globalAlpha *= Math.min(1, la * 1.5);
  const an = Math.atan2(fy - hy, fx - hx), nx = -Math.sin(an), ny = Math.cos(an);
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(hx + nx * 1.25, hy + ny * 1.25);
  c.lineTo(fx + nx * 0.8, fy + ny * 0.8);
  c.lineTo(fx - nx * 0.8, fy - ny * 0.8);
  c.lineTo(hx - nx * 1.25, hy - ny * 1.25);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(128,120,114,0.5)';
  c.lineWidth = 0.35;
  c.beginPath();
  for (let i = 1; i < 6; i++) {
    const t = 0.3 + i * 0.11, x = hx + (fx - hx) * t, y = hy + (fy - hy) * t;
    c.moveTo(x - nx * 1.1, y - ny * 1.1);
    c.lineTo(x + nx * 1.1, y + ny * 1.1 - 0.4);
  }
  c.stroke();
  if (la > 0.9) {
    const toes = far ? [[7.5, 0.5 * bw, 5, -1]] : [[10.5, 0.34 * bw + 0.5, 8, -1.8], [9, 0.46 * bw + 0.5, 6.5, -1.2], [-7.8, 0.4 * bw, -6.4, -1.5]];
    c.lineCap = 'round';
    for (const [ex, ey, qx, qy] of toes) {
      c.strokeStyle = col;
      c.lineWidth = 1.7;
      c.beginPath();
      c.moveTo(fx, fy);
      c.quadraticCurveTo(fx + qx, fy + qy, fx + ex, fy + ey);
      c.stroke();
      const tx = fx + ex, ty = fy + ey, s = Math.sign(ex);
      c.fillStyle = '#0f0c0b';
      c.beginPath();
      c.moveTo(tx - s * 0.6, ty - 0.8);
      c.quadraticCurveTo(tx + s * 1.6, ty + 0.2, tx + s * 0.6, ty + 2.6);
      c.quadraticCurveTo(tx + s * 0.2, ty + 0.8, tx - s * 0.6, ty + 0.6);
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(130,122,116,0.45)';
      c.lineWidth = 0.3;
      c.beginPath();
      for (let i = 1; i < 4; i++) {
        const t = i / 4, x = (1 - t) * (1 - t) * fx + 2 * (1 - t) * t * (fx + qx) + t * t * tx, y = (1 - t) * (1 - t) * fy + 2 * (1 - t) * t * (fy + qy) + t * t * ty;
        c.moveTo(x - 0.5, y - 0.7);
        c.lineTo(x + 0.5, y + 0.7);
      }
      c.stroke();
    }
    c.fillStyle = col;
    c.beginPath();
    c.arc(fx, fy, 1.4, 0, 6.283);
    c.fill();
  }
  c.restore();
}

export function drawMagpie(c, art, P, bw) {
  const A = art;
  const cx = -6, cy = -40, d = (o) => c.drawImage(o.cv, o.x, o.y, o.w, o.h);
  c.save();
  c.translate(P.x + P.shake, P.y + P.hop);
  c.rotate(P.tilt * 0.35);
  const z = P.zs * A.K;
  c.scale(P.dir * z, z);
  if (P.legA > 0.95 && P.hop > -0.5) {
    c.save();
    c.translate(5, 1.2);
    c.scale(1, 0.16);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 16);
    g.addColorStop(0, 'rgba(30,20,14,0.22)');
    g.addColorStop(1, 'rgba(30,20,14,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 16, 0, 6.283);
    c.fill();
    c.restore();
  }
  c.translate(cx, cy);
  c.rotate(P.pitch);
  c.translate(-cx, -cy);
  drawLegs(c, P, true, bw);
  drawLegs(c, P, false, bw);
  c.save();
  c.translate(0, P.dip + 7);
  c.translate(cx, cy);
  c.scale(P.sc, P.sc);
  c.translate(-cx, -cy);
  if (P.spreadA > 0.01) drawSpread(c, art, P, -1);
  c.save();
  c.translate(A.T0x, A.T0y);
  c.rotate(P.tailRot);
  c.translate(-A.T0x, -A.T0y);
  d(A.tail);
  c.restore();
  d(A.body);
  if (P.foldA > 0.01) {
    c.save();
    c.globalAlpha = P.foldA;
    d(A.wing);
    c.restore();
  }
  if (P.spreadA > 0.01) drawSpread(c, art, P, 1);
  c.save();
  c.translate(18, -62);
  c.rotate(P.hr);
  c.scale(0.88, 0.88);
  c.translate(-18, 62 + P.bob);
  d(A.head);
  if (P.blink > 0.02) {
    c.fillStyle = 'rgba(70,64,60,' + Math.min(1, P.blink * 1.1).toFixed(2) + ')';
    c.beginPath();
    c.arc(30, -69.5, 4.1, 0, 6.283);
    c.fill();
  }
  c.restore();
  c.restore();
  c.restore();
}

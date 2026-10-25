// Grows one ink plum branch (折枝梅) for a composition: limbs steered through jittered waypoints,
// twigs that branch by depth and keep out of the card and of each other, and the blossoms, buds
// and moss dots along them. Each stroke and flower carries the time (seconds) at which it
// appears, so the scene can draw the branch growing. Port of the design's g4Gen ("plum").

import { inRect } from './compositions.js';

export const STEP = 3; // path sample spacing
const BLOSSOM_COLOURS = [[188, 92, 88], [198, 106, 98], [176, 84, 82], [204, 118, 108], [184, 96, 96]];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Moves a limb's start back along its heading until it is off-screen, so the branch always
// enters from the edge of the viewport ({ x0, y0, x1, y1 } in stage coordinates). `lead` is
// how many path points that adds before the design's own start.
function offscreen(limb, view) {
  let { x, y } = limb;
  const dx = -Math.cos(limb.a) * 10;
  const dy = -Math.sin(limb.a) * 10;
  const m = 30;
  let i = 0;
  for (; i < 400 && x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m; i++) {
    x += dx;
    y += dy;
  }
  return { x, y, lead: Math.round((i * 10) / STEP) };
}

export function growBranch(comp, rand, view) {
  const B = comp.branch;
  const R = rand.range;
  const strokes = [];
  const flora = [];
  const noBloom = (x, y) => inRect(B.noBloom, x, y);
  const avoid = (x, y) => noBloom(x, y) || B.avoid.some((r) => inRect(r, x, y));
  const out = (x, y) => !inRect(B.bounds, x, y);

  // Coarse occupancy grid, so twigs don't grow through thicker strokes.
  const grid = new Map();
  const CELL = 10;
  const occupy = (st) =>
    st.pts.forEach((p, i) => {
      if (i % 2) return;
      const key = `${(p.x / CELL) | 0},${(p.y / CELL) | 0}`;
      let cell = grid.get(key);
      if (!cell) grid.set(key, (cell = []));
      cell.push([p.x, p.y, p.w, st.id]);
    });
  const hits = (x, y, w, parent) => {
    const cx = (x / CELL) | 0;
    const cy = (y / CELL) | 0;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const q of grid.get(`${cx + i},${cy + j}`) ?? []) {
          if (q[3] !== parent && q[2] > 2.2 && Math.hypot(q[0] - x, q[1] - y) < q[2] / 2 + w / 2 + 2.5) return true;
        }
      }
    }
    return false;
  };

  // A limb: steer towards each waypoint in turn, with a little low-frequency wander.
  const limbPath = (o) => {
    let { x, y, a } = o;
    let av = 0;
    let wi = 0;
    const P = [{ x, y, a }];
    for (let i = 0; i < 1600; i++) {
      if (Math.hypot(o.way[wi].x - x, o.way[wi].y - y) < 30 && ++wi >= o.way.length) break;
      a += wrap(Math.atan2(o.way[wi].y - y, o.way[wi].x - x) - a) * (o.way[wi].k || 0.05);
      av = av * 0.9 + R(-1, 1) * o.noise;
      a += av;
      x += Math.cos(a) * STEP;
      y += Math.sin(a) * STEP;
      P.push({ x, y, a });
    }
    return P;
  };

  // A twig: gently curving segments with a kink at each node, drawn upwards, stopping at
  // obstacles. Nodes are where its own blossoms and sub-twigs may sprout.
  const twig = (o) => {
    let { x, y, a } = o;
    let seg = Math.max(2, Math.round(R(o.seg * 0.5, o.seg) / STEP));
    const curve = R(-0.012, 0.012);
    const P = [{ x, y, a }];
    const nodes = [];
    const up = Math.abs(wrap(a + 1.57)) < 0.4 && y < B.upTwigBelow;
    const max = Math.round((up ? Math.min(o.len, R(50, 90)) : o.len) / STEP);
    for (let i = 0; i < max; i++) {
      if (--seg <= 0) {
        nodes.push(P.length - 1);
        a += rand.sign() * R(0.1, 0.32);
        a += wrap(-1.57 - a) * 0.08;
        seg = Math.max(2, Math.round(R(o.seg * 0.7, o.seg * 1.3) / STEP));
      }
      a += curve;
      if (avoid(x + Math.cos(a) * 24, y + Math.sin(a) * 24)) a += wrap(-1.57 - a) * 0.22;
      if (Math.sin(a) > 0.45 && i * STEP > 45) break;
      x += Math.cos(a) * STEP;
      y += Math.sin(a) * STEP;
      if (out(x, y) || avoid(x, y) || y < 22 || (i > 4 && hits(x, y, o.w, o.parent))) break;
      P.push({ x, y, a });
    }
    P.nodes = nodes.filter((k) => k > 2 && k < P.length - 2);
    return P;
  };

  // Turns a path into a stroke: tapering width with slight swelling, and ragged left/right
  // outlines for the brush edge. `lanes` are the dry-brush streaks drawn along thick strokes.
  const stroke = (P, o) => {
    const n = P.length;
    const ph = R(0, 6.28);
    const ph2 = R(0, 6.28);
    const L = [];
    const Rt = [];
    P.forEach((p, i) => {
      const f = i / Math.max(1, n - 1);
      let w = (o.wEnd + (o.w0 - o.wEnd) * Math.pow(1 - f, o.tp)) * (1 + Math.sin(i * 0.19 + ph) * 0.04);
      if (o.depth > 0 && i < 5) w *= 1 + 0.5 * Math.pow(1 - i / 5, 2);
      if (o.knot > 0) w *= 1 + 0.2 * Math.exp(-Math.pow((i - o.knot) / 5, 2));
      p.w = Math.max(o.depth > 0 ? 0.6 : 0.3, w);
    });
    for (let i = 0; i < n; i++) {
      const a0 = P[Math.max(0, i - 1)];
      const a1 = P[Math.min(n - 1, i + 1)];
      const l = Math.hypot(a1.x - a0.x, a1.y - a0.y) || 1;
      const p = P[i];
      p.nx = -(a1.y - a0.y) / l;
      p.ny = (a1.x - a0.x) / l;
      const hw = p.w / 2;
      const jl = p.w > 2 ? 1 + 0.05 * Math.sin(i * 0.31 + ph) : 1;
      const jr = p.w > 2 ? 1 + 0.05 * Math.sin(i * 0.27 + ph2) : 1;
      L.push([p.x - p.nx * hw * jl, p.y - p.ny * hw * jl]);
      Rt.push([p.x + p.nx * hw * jr, p.y + p.ny * hw * jr]);
    }
    const st = {
      id: strokes.length,
      pts: P,
      L,
      R: Rt,
      t0: o.t0,
      dur: o.dur,
      depth: o.depth,
      w0: o.w0,
      root: o.root ?? strokes.length,
      right: !!o.right,
      focus: !!o.focus,
      drawn: 0, // segments drawn so far
      streaked: 0, // streak segments drawn (they trail the brush tip)
      lag: Math.ceil(o.w0 / 2 / STEP) + 2,
      df: R(0.02, 0.05),
      dp: R(0, 6.28),
      lanes:
        o.w0 >= 5
          ? Array.from({ length: 4 + Math.floor(rand() * 4) }, () => ({ o: R(0.1, 0.46), f: R(0.22, 0.5), p: R(0, 6.28), th: R(0.95, 1.3), lw: R(0.35, 0.9) }))
          : [],
    };
    strokes.push(st);
    occupy(st);
    return st;
  };

  // When the brush reaches point i of a stroke (strokes ease out as they grow).
  const timeAt = (st, i) => st.t0 + st.dur * (1 - Math.pow(1 - Math.min(1, i / Math.max(1, st.pts.length - 1)), 1 / 2.2));
  const bloomTime = (st, i) => Math.min(16.5, 8 + 7.5 * Math.min(1, timeAt(st, i) / 15) + R(0, 1.5));

  const bloomAt = (st, i, hint) => {
    const p = st.pts[i];
    if (!p || noBloom(p.x, p.y)) return;
    const roll = rand();
    const kind = hint || (roll < 0.3 ? 'blossom' : roll < 0.52 ? 'half' : roll < 0.68 ? 'side' : 'bud');
    const r = kind === 'bud' ? 5 * R(0.8, 1.2) : kind === 'blossom' ? 9.2 * R(0.7, 1.3) : 8.4 * R(0.72, 1.28);
    const side = rand.sign();
    const off = side * (p.w * 0.5 + (kind === 'blossom' ? r * 0.2 : -0.3));
    let dx = p.nx * side;
    let dy = p.ny * side;
    if (kind !== 'blossom') {
      dx = dx * 0.7 + Math.cos(p.a) * 0.4;
      dy = dy * 0.7 + Math.sin(p.a) * 0.4 - 0.45;
    }
    st.blooms = (st.blooms || 0) + 1;
    flora.push({
      kind,
      x: p.x + p.nx * off,
      y: p.y + p.ny * off,
      r,
      rot: Math.atan2(dx, -dy) + R(-0.3, 0.3),
      pa: R(0, 6.28),
      pj: [0, 0, 0, 0, 0].map(() => R(-0.1, 0.1)),
      sy: kind === 'blossom' ? R(0.55, 1) : R(0.75, 1),
      col: rand.pick(BLOSSOM_COLOURS),
      al: R(0.8, 0.92),
      t: bloomTime(st, i),
      dur: R(1.6, 2.6),
      root: st.root,
    });
  };
  const cluster = (st, i) => {
    const m = 2 + (rand() < 0.4 ? 1 : 0);
    const n = st.pts.length;
    for (let k = 0; k < m; k++) bloomAt(st, Math.min(n - 1, Math.max(0, i + Math.round(R(-2, 3)))), k === m - 1 && rand() < 0.5 ? 'bud' : null);
  };
  const mossAt = (st, i, big) => {
    const p = st.pts[i];
    if (!p || p.w < 1.8) return;
    const dots = [];
    const m = big ? 3 + Math.floor(rand() * 4) : 1 + Math.floor(rand() * 2);
    const s0 = rand.sign();
    for (let k = 0; k < m; k++) {
      const side = rand() < 0.75 ? s0 : -s0;
      const o = side * (p.w * 0.5 + R(-0.5, 2.2));
      const s = Math.pow(rand(), 1.6);
      dots.push({ x: p.nx * o + R(-3, 3), y: p.ny * o + R(-3, 3), rx: 0.6 + s * (big ? 2.8 : 1.6), ry: 0.5 + s * (big ? 2 : 1.1), rot: R(0, 3.14) });
    }
    flora.push({ kind: 'moss', x: p.x, y: p.y, dots, t: timeAt(st, i) + R(0.4, 1.2), dur: 0.8 });
  };

  // A limb's flowers and twigs are placed at fractions of its length, measured from the
  // design's start: an off-screen lead-in (`lead` points, on big screens) doesn't count, or the
  // fractions would shift onto it and leave the visible limb bare.
  const grow = (st, lead = 0) => {
    const d = st.depth;
    const n = st.pts.length;
    const n0 = Math.min(lead, n - 3);
    const span = n - n0;
    const main = st === strokes[0];
    if (d === 0) {
      let i = n0 + Math.floor(span * 0.12);
      while (i < n - 2) {
        const f = (i - n0) / (span - 1);
        const inWindow = main ? B.mainWindow(st.pts[i], f) : f > 0.25;
        if (inWindow && rand() < B.mainChance) {
          cluster(st, i);
          i += Math.floor(R(...B.mainStep));
        } else i += Math.floor(R(5, 10));
      }
      for (let k = 0, m = 2 + Math.floor(rand() * 3); k < m; k++) mossAt(st, n0 + Math.floor(R(0.06, 0.7) * span), true);
    } else {
      for (const k of st.pts.nodes || []) if (rand() < B.nodeBloom[st.focus ? 0 : 1]) cluster(st, k);
      if (d === 1 && rand() < 0.3) mossAt(st, Math.floor(n * R(0.1, 0.4)), false);
    }
    if (d < 3) {
      const mul = d === 0 ? (main ? 1.1 : 1.4) : d === 1 ? (st.focus ? 1.5 : 1) : st.focus ? 1 : 0.6;
      const min = d === 0 ? B.minLimbKids : d === 1 ? (st.focus ? 2 : 1) : 0;
      const count = Math.max(min, Math.round(((span * STEP) / B.gaps[d]) * R(0.8, 1.2) * mul));
      const anchors = [R(0.15, 0.5), R(0.5, 0.92)];
      let side = rand.sign();
      for (let c = 0, made = 0; made < count && c < count * 6; c++) {
        const fi = Math.min(0.95, Math.max(0.1, anchors[c % 2] + R(-0.1, 0.1)));
        const i = n0 + Math.max(1, Math.floor(fi * (span - 1)));
        const p = st.pts[i];
        if (noBloom(p.x, p.y)) continue;
        side = rand() < 0.72 ? -side : side;
        const reach = rand() < 0.3 ? R(1.25, 1.7) : R(0.55, 1);
        let len = R(...B.twigLen[d]) * reach;
        let a0 = p.a + side * R(0.45, 0.95);
        if (B.noDownTwigs && Math.sin(a0) > 0.1) {
          a0 = p.a - side * R(0.45, 0.95);
          if (Math.sin(a0) > 0.1) a0 = -1.57 + R(-0.85, 0.85);
        }
        if (st.right && Math.cos(a0) < -0.6) len = Math.min(len, R(30, 55));
        if (avoid(p.x + Math.cos(a0) * 12, p.y + Math.sin(a0) * 12)) continue;
        const focus = st.focus || (d === 0 && B.limbFocus(main, p));
        const P = twig({ x: p.x, y: p.y, a: a0, len, seg: d === 0 ? R(30, 55) : d === 1 ? R(16, 30) : R(10, 20), w: p.w * 0.55, parent: st.id });
        if (P.length < 6) continue;
        const sl = P.length * STEP;
        const w0 = Math.max(0.9, Math.min(p.w * R(0.42, 0.62), st.w0 * 0.7, 1 + sl / 16));
        const t0 = timeAt(st, i) + 0.1;
        const dur =
          d === 0 ? Math.max(1.5, Math.min(R(4, 7), 14.5 - t0))
            : d === 1 ? Math.max(1.2, Math.min(R(2.5, 4.5), 15 - t0))
              : Math.max(1, Math.min(R(1.5, 3), 15.5 - t0));
        const child = stroke(P, { w0, wEnd: d === 0 && sl < 60 ? Math.max(0.75, w0 * 0.5) : 0.75, tp: 0.75, t0, dur, depth: d + 1, root: st.root, right: st.right, focus });
        st.kids = (st.kids || 0) + 1;
        made++;
        if (rand() < (d === 0 ? 0.6 : 0.25)) mossAt(st, i, d === 0);
        grow(child);
      }
    }
    if (d > 0 && !st.kids && !st.blooms) bloomAt(st, n - 1, rand() < 0.6 ? 'bud' : null);
    else if (d > 0 && rand() < B.tipBloom[st.focus ? 0 : 1]) bloomAt(st, n - 1, rand() < 0.6 ? 'bud' : null);
  };

  // A slow sideways wave along part of a limb, so the trunk doesn't look ruled.
  const wobble = (P, [yMin, yMax, A, lambda]) => {
    let s = 0;
    for (let i = 1; i < P.length; i++) {
      s += STEP;
      const p = P[i];
      if (p.y < yMin || p.y > yMax) continue;
      const o = A * Math.min(1, (p.y - yMin) / 80, (yMax - p.y) / 60) * Math.sin((s / lambda) * 6.283);
      p.x += Math.cos(p.a + 1.5708) * o;
      p.y += Math.sin(p.a + 1.5708) * o;
    }
    for (let i = 1; i < P.length; i++) P[i].a = Math.atan2(P[i].y - P[i - 1].y, P[i].x - P[i - 1].x);
  };

  const limbs = B.limbs.map((limb) => {
    const way = limb.way.map(([x, y, j, k]) => ({ x: x + R(-j, j), y: y + R(-j, j), k }));
    const { lead, ...start } = offscreen(limb, view);
    const P = limbPath({ ...start, a: limb.a, way, noise: 0.004 });
    if (limb.wobble) wobble(P, limb.wobble);
    const knot = limb.knotAbove ? P.findIndex((p) => p.y < limb.knotAbove) : 0;
    const st = stroke(P, { ...limb, depth: 0, knot });
    if (knot > 0) mossAt(st, knot, true);
    grow(st, lead);
    return st;
  });

  // Top up each limb's blossoms so every branch reads as in flower.
  B.limbs.forEach((limb, li) => {
    const root = limbs[li].id;
    const pool = strokes.filter((s) => s.root === root && s.depth > 0 && s.pts.length > 6 && !noBloom(s.pts.at(-1).x, s.pts.at(-1).y));
    let count = flora.filter((f) => f.root === root && f.kind !== 'moss').length;
    for (let tries = 0; count < limb.minBlooms && pool.length && tries < 300; tries++) {
      const s = rand.pick(pool);
      const k = s.pts.nodes?.length && rand() < 0.6 ? rand.pick(s.pts.nodes) : s.pts.length - 1;
      const before = flora.length;
      cluster(s, k);
      count += flora.length - before;
    }
  });

  return { strokes, flora: flora.sort((a, b) => a.t - b.t) };
}

export function endTime(strokes, flora) {
  let end = 0;
  for (const f of flora) end = Math.max(end, f.t + f.dur);
  for (const s of strokes) end = Math.max(end, s.t0 + s.dur);
  return end;
}

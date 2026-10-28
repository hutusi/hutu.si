// The scene behind the card: an ink plum branch that grows for about 16 seconds, blossoms that
// open along it, a magpie that flies in and perches, and petals that fall when it lands, flutters
// or flies off, or when a visitor brushes a blossom. Every visit grows a different branch
// (?seed=N reproduces one). Loaded only after the card has painted (see boot.js).
//
// Everything is drawn in stage coordinates (compositions.js) onto viewport-sized canvases,
// mapped with the scale and offset head.js gives the card. The frame loop runs only while
// something moves: it sleeps once the branch is grown and the bird is still, wakes for the
// bird's next blink, glance or flutter (or its return) or for the pointer, and stops while the
// tab is hidden.

import { endTime, growBranch } from './branch.js';
import { TALL, WIDE } from './compositions.js';
import { drawFlora } from './flora.js';
import { drawSegment, drawStreak } from './ink.js';
import { Magpie } from './magpie.js';
import { addCardFibres, paintPaper } from './paper.js';
import { spawnPetal, stepPetals } from './petals.js';
import { createRng, randomSeed } from './rng.js';

performance.mark('scene-start');

const root = document.documentElement;
const card = document.getElementById('card');
const frameEl = document.getElementById('frame');
const again = document.getElementById('again');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const coarsePointer = matchMedia('(pointer: coarse)');

// The design's five layers: ink, settled flowers, opening flowers and the magpie under the card;
// falling petals over it.
const layers = {};
for (const name of ['ink', 'flora', 'bloom', 'bird', 'petal']) {
  const canvas = document.createElement('canvas');
  canvas.className = 'layer';
  canvas.setAttribute('aria-hidden', 'true');
  if (name === 'petal') frameEl.after(canvas);
  else frameEl.before(canvas);
  layers[name] = canvas.getContext('2d');
}

const scene = {
  layers,
  reduce: reduceMotion.matches,
  strokes: [],
  flora: [],
  petals: [],
  // Clears a whole layer, whatever its transform.
  clear(c) {
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    c.restore();
  },
  // The ink and flowers in a stage rect, at device resolution (for the branch bending).
  snapshot(x, y, w, h) {
    const r = scene.pxPerUnit;
    const out = document.createElement('canvas');
    out.width = Math.ceil(w * r);
    out.height = Math.ceil(h * r);
    const sx = (scene.ox + x * scene.s) * scene.dpr;
    const sy = (scene.oy + y * scene.s) * scene.dpr;
    const g = out.getContext('2d');
    for (const c of [layers.ink, layers.flora]) g.drawImage(c.canvas, sx, sy, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  },
  // A few petals from the open flowers nearest (x, y): the magpie landing or fluttering.
  shed(x, y, n) {
    if (scene.reduce) return;
    const d = (f) => Math.hypot(f.x - x, f.y - y);
    const near = scene.settled.filter((f) => d(f) < 150).sort((a, b) => d(a) - d(b)).slice(0, 8);
    for (let i = near.length - 1; i > 0; i--) {
      const j = Math.floor(scene.rand() * (i + 1));
      [near[i], near[j]] = [near[j], near[i]];
    }
    for (const f of near.slice(0, n)) shedPetal(f, (scene.rand() - 0.5) * 30, 6);
  },
};

const shedPetal = (f, vx, vy) => spawnPetal(scene.petals, f, vx, vy, scene.rand, scene.light ? 10 : 17);

// ---- Layout ----

function measure() {
  const { tall, s, ox, oy, vw, vh } = window.hutuStage;
  const dpr = Math.min(2, devicePixelRatio || 1);
  Object.assign(scene, {
    comp: tall ? TALL : WIDE,
    s,
    ox,
    oy,
    dpr,
    pxPerUnit: dpr * s,
    view: { x0: -ox / s, y0: -oy / s, x1: (vw - ox) / s, y1: (vh - oy) / s },
    // Phones and tablets: fewer petals, and a magpie that holds still between events.
    light: coarsePointer.matches || Math.min(vw, vh) < 500,
  });
  for (const c of Object.values(layers)) {
    c.canvas.width = Math.round(vw * dpr);
    c.canvas.height = Math.round(vh * dpr);
    c.setTransform(scene.pxPerUnit, 0, 0, scene.pxPerUnit, ox * dpr, oy * dpr);
  }
}

// A new branch. `instant` shows it finished (reduced motion, a repeat visit in this session).
function reset({ seed, instant }) {
  const rand = createRng(seed);
  const { strokes, flora } = growBranch(scene.comp, rand, scene.view);
  const perch = Magpie.perchOn(strokes[0], scene.comp.magpie);
  const magpie = perch && new Magpie(scene.comp, strokes[0], perch, rand, { breathing: !scene.light, shed: scene.shed });
  if (magpie) flora.push(...magpie.blooms());
  flora.sort((a, b) => a.t - b.t);
  Object.assign(scene, { seed, rand, strokes, flora, magpie, end: endTime(strokes, flora), t: 0, instant, petals: [] });
  redraw();
}

// Repaints every layer up to the current moment, after a reset or a resize.
function redraw() {
  for (const c of Object.values(layers)) scene.clear(c);
  paintPaper(layers.ink, scene.comp, scene.view, scene.seed ^ 0x9e3779b9);
  for (const st of scene.strokes) Object.assign(st, { drawn: 0, streaked: 0, done: false });
  Object.assign(scene, { next: 0, opening: [], settled: [], done: [], trembling: [], bloomDirty: false, petalDirty: true });
  scene.magpie?.resize();
  step(0);
  wake();
}

function relayout() {
  const before = scene.comp;
  measure();
  // A different composition, or a window grown enough to show where a limb starts: regrow.
  const v = scene.view;
  const exposed = scene.strokes.some(({ depth, pts: [p] }) => depth === 0 && p.x > v.x0 && p.x < v.x1 && p.y > v.y0 && p.y < v.y1);
  if (scene.comp !== before || exposed) reset({ seed: scene.seed, instant: true });
  else redraw();
}

// ---- Frame ----

function step(dt) {
  const S = scene;
  S.t += S.instant ? 1e5 : dt;
  const { ink, flora, bloom, petal } = layers;

  // Strokes grow from their start, easing out; dry-brush streaks trail the tip.
  for (const st of S.strokes) {
    if (st.done || S.t < st.t0) continue;
    const u = Math.min(1, (S.t - st.t0) / st.dur);
    const last = st.pts.length - 1;
    const target = u >= 1 ? last : Math.floor((1 - Math.pow(1 - u, 2.2)) * last);
    while (st.drawn < target) drawSegment(ink, st, ++st.drawn);
    const done = st.drawn >= last;
    while (st.streaked < (done ? st.drawn : st.drawn - st.lag)) drawStreak(ink, st, ++st.streaked);
    st.done = done;
  }

  // Flowers open on the bloom layer, then settle onto the flora layer.
  while (S.next < S.flora.length && S.flora[S.next].t <= S.t) S.opening.push(S.flora[S.next++]);
  if (S.bloomDirty) {
    S.clear(bloom);
    S.bloomDirty = false;
  }
  S.opening = S.opening.filter((f) => {
    const p = (S.t - f.t) / f.dur;
    if (p < 1) {
      drawFlora(bloom, f, p);
      S.bloomDirty = true;
      return true;
    }
    drawFlora(flora, f, 1);
    S.done.push(f);
    if (f.kind !== 'moss' && f.kind !== 'bud') S.settled.push(f);
    return false;
  });

  // A brushed flower shivers for a moment, then settles back (with any neighbours it overlapped).
  S.trembling = S.trembling.filter((q) => {
    q.t += dt;
    if (q.t >= 0.6) {
      drawFlora(flora, q.f, 1);
      for (const o of S.done) {
        if (o !== q.f && Math.hypot(o.x - q.f.x, o.y - q.f.y) < q.f.r * 1.2 + (o.r || 4) + 2) drawFlora(flora, o, 1);
      }
      return false;
    }
    const e = Math.max(0, 1 - q.t / 0.6);
    drawFlora(bloom, { ...q.f, rot: q.f.rot + Math.sin(q.t * 40) * 0.09 * e, x: q.f.x + Math.sin(q.t * 33) * 0.5 * e }, 1);
    S.bloomDirty = true;
    return true;
  });

  if (S.petalDirty) {
    S.clear(petal);
    S.petalDirty = false;
  }
  if (S.petals.length) {
    S.petals = stepPetals(petal, S.petals, dt, S.comp.card, S.view);
    S.petalDirty = true;
  }

  S.magpie?.step(dt, S);
}

const busy = () => {
  const S = scene;
  return (
    S.t < S.end ||
    (S.magpie && S.t < S.magpie.arrive) ||
    S.opening.length > 0 ||
    S.trembling.length > 0 ||
    S.petals.length > 0 ||
    S.bloomDirty ||
    S.petalDirty ||
    !!S.magpie?.busy
  );
};

let raf = 0;
let timer = 0;
let last = 0;

function frame(now) {
  raf = 0;
  const dt = Math.min(0.1, (now - (last || now)) / 1000);
  last = now;
  step(dt);
  if (busy()) raf = requestAnimationFrame(frame);
  else sleep();
}

function sleep() {
  last = 0;
  scene.magpie?.sleep(performance.now());
  const wait = scene.magpie?.nextEvent ?? Infinity;
  if (wait < Infinity) timer = setTimeout(wake, wait * 1000 + 16);
}

function wake() {
  clearTimeout(timer);
  timer = 0;
  if (raf || document.hidden) return;
  scene.magpie?.wake(performance.now());
  raf = requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return wake();
  cancelAnimationFrame(raf);
  raf = 0;
  sleep();
  clearTimeout(timer);
});

// ---- Pointer ----

const toStage = (e) => ({ x: (e.clientX - scene.ox) / scene.s, y: (e.clientY - scene.oy) / scene.s });

// Brushing a blossom shakes a petal or two loose (each flower rests for a few seconds after).
function touchNearest(x, y, radius) {
  if (scene.reduce) return;
  let best = null;
  let bd = radius * radius;
  for (const f of scene.settled) {
    const d = (f.x - x) ** 2 + (f.y - y) ** 2;
    if (d < bd) [bd, best] = [d, f];
  }
  const now = performance.now();
  if (!best || (best.cooldown || 0) > now || (scene.touchCooldown || 0) > now) return;
  best.cooldown = now + 4000;
  scene.touchCooldown = now + 500;
  for (let k = scene.rand() < 0.4 ? 2 : 1; k > 0; k--) shedPetal(best, (scene.rand() - 0.5) * 30, 4);
  if (!scene.trembling.some((q) => q.f === best)) {
    const c = layers.flora;
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(best.x, best.y, best.r * 1.2, 0, 6.283);
    c.fill();
    c.restore();
    scene.trembling.push({ f: best, t: 0 });
  }
  wake();
}

// Desktop: the card tilts towards the pointer and its sheen follows it.
function tilt(rx, ry, hover) {
  card.style.setProperty('--rx', rx.toFixed(2));
  card.style.setProperty('--ry', ry.toFixed(2));
  card.style.setProperty('--hover', hover);
}

// With a mouse or pen the magpie's head follows the pointer, which turns to a hand over the bird.
let pointer = null;
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  const { x, y } = toStage(e);
  const bird = scene.magpie;
  const now = performance.now();
  const [x0, y0, x1, y1] = scene.comp.card;
  const gx = ((x - x0) / (x1 - x0)) * 100;
  const gy = ((y - y0) / (y1 - y0)) * 100;
  card.style.setProperty('--gx', `${gx.toFixed(1)}%`);
  card.style.setProperty('--gy', `${gy.toFixed(1)}%`);
  const over = gx > 0 && gx < 100 && gy > 0 && gy < 100;
  if (scene.comp === WIDE && !scene.reduce) tilt(over ? -(gy / 100 - 0.5) * 5 : 0, over ? (gx / 100 - 0.5) * 5 : 0, over ? 1 : 0);
  if (bird) {
    root.style.cursor = !e.target.closest('#card, a, button') && bird.hit(x, y) ? 'pointer' : '';
    if (bird.watch({ x, y }, { now })) wake();
  }
  const prev = pointer;
  pointer = { x, y };
  if (!prev || Math.abs(x - prev.x) + Math.abs(y - prev.y) < 2) return;
  if (bird?.hover(x, y, now)) wake();
  touchNearest(x, y, scene.comp.touchRadius);
});
root.addEventListener('pointerleave', () => {
  pointer = null;
  tilt(0, 0, 0);
  card.style.removeProperty('--gx');
  card.style.removeProperty('--gy');
  root.style.cursor = '';
  if (scene.magpie?.watch(null)) wake();
});
// A tap or click on the magpie startles it; elsewhere it shakes the nearest blossom, and on a
// touch screen the bird looks to see what that was.
addEventListener('pointerdown', (e) => {
  if (e.target.closest('#card, a, button')) return;
  const { x, y } = toStage(e);
  const bird = scene.magpie;
  const now = performance.now();
  if (bird?.hit(x, y)) {
    if (bird.poke(now)) wake();
    return;
  }
  if (e.pointerType === 'touch' && bird?.watch({ x, y }, { tap: true, now })) wake();
  touchNearest(x, y, 30);
});

// ---- Start ----

let relayoutTimer;
addEventListener('stage', () => {
  clearTimeout(relayoutTimer);
  relayoutTimer = setTimeout(relayout, 150);
});
reduceMotion.addEventListener('change', () => {
  scene.reduce = reduceMotion.matches;
  if (scene.reduce) reset({ seed: scene.seed, instant: true });
  else if (scene.magpie) {
    // The bird was held still (and the loop asleep); let it blink and look round again.
    scene.magpie.still = false;
    wake();
  }
});
again.addEventListener('click', () => reset({ seed: randomSeed(), instant: scene.reduce }));

const seedParam = new URLSearchParams(location.search).get('seed');
measure();
addCardFibres();
reset({
  seed: /^\d+$/.test(seedParam ?? '') ? Number(seedParam) >>> 0 : randomSeed(),
  instant: scene.reduce || root.classList.contains('seen'),
});
again.hidden = false;

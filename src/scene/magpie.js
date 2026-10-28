// The magpie (喜鹊) that flies in once the blossoms open and settles on the branch: 喜上眉梢,
// 'joy up to the eyebrows'. This is its behaviour; update() works out a pose without touching a
// canvas, and the artwork that draws it is in magpie-art.js. Port of the design's g4Mag* methods.
//
// It comes in from the left or the right, at random, and perches facing the way it flew. There it
// blinks, glances about, nods, ruffles, flutters, stretches a wing and flicks its tail. With a
// mouse its head follows the pointer; on a touch screen it looks where you tap. Taps on it
// escalate: a flutter, a few hops along the branch, then it flies off, and some seconds later it
// comes back to its perch from another corner.

import { inRect } from './compositions.js';
import { buildArt, drawMagpie } from './magpie-art.js';

const smooth = (x) => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const EPS = 1e-3;

// A place to stand on a stroke at point i: the top of the branch there, its width and angle, and
// the bird's tilt (the angle turned to lean the same way whichever way the stroke runs).
function spotAt(stroke, i) {
  const P = stroke.pts;
  const p = P[i];
  const a0 = P[Math.max(0, i - 4)];
  const b0 = P[Math.min(P.length - 1, i + 4)];
  const a = Math.atan2(b0.y - a0.y, b0.x - a0.x);
  return { i, x: p.x, y: p.y - p.w * 0.5 + 0.8, bw: p.w, a, tilt: Math.cos(a) < 0 ? Math.atan2(-Math.sin(a), -Math.cos(a)) : a };
}

// The design puts the ends of the bird's flights just beyond an edge of the stage (or two). Where
// a screen shows more than the stage past such an edge, the point moves out by as much, so it is
// as far beyond what is shown and the bird never appears or vanishes in sight. Beyond one edge is
// enough, so it takes the smallest such move.
function offscreen([x, y], { w, h }, view) {
  const moves = [];
  if (x < 0) moves.push([Math.min(0, view.x0), 0]);
  if (x > w) moves.push([Math.max(0, view.x1 - w), 0]);
  if (y < 0) moves.push([0, Math.min(0, view.y0)]);
  if (y > h) moves.push([0, Math.max(0, view.y1 - h)]);
  if (!moves.length) return [x, y];
  const [dx, dy] = moves.reduce((a, b) => (Math.abs(b[0] + b[1]) < Math.abs(a[0] + a[1]) ? b : a));
  return [x + dx, y + dy];
}

// The pose's state, as the design names it: tr/tv the tail spring; hp/ha the head pose and angle
// shown, hpT/hrT the ones it is turning to, hs a turn under way and hold the pause before the
// next; blinkT, ruffT, flT (flutter), stT (stretch), nodT and tf (tail flare) the time into each.
export class Magpie {
  // The flattest medium-thick spot on the main limb inside the composition's perch window,
  // or null when this branch has none (then there is no magpie this time).
  static perchOn(stroke, cfg) {
    const P = stroke.pts;
    const n = P.length;
    const angle = (i) => {
      const a = P[Math.max(0, i - 4)];
      const b = P[Math.min(n - 1, i + 4)];
      return Math.atan2(b.y - a.y, b.x - a.x);
    };
    let best = -1;
    let score = 1e9;
    for (let i = 5; i < n - 5; i++) {
      const p = P[i];
      if (!inRect(cfg.perch, p.x, p.y) || p.w < cfg.perchWidth[0] || p.w > cfg.perchWidth[1]) continue;
      const s = Math.abs(Math.sin(angle(i))) * 2 + Math.abs(p.w - 8) * 0.03 + Math.abs(p.x - cfg.perchCenter) * 0.004;
      if (s < score) [score, best] = [s, i];
    }
    if (best < 0) {
      for (let i = 5; i < n - 5; i++) {
        const p = P[i];
        if (!inRect(cfg.perchFallback, p.x, p.y)) continue;
        const s = Math.abs(Math.sin(angle(i)));
        if (s < score) [score, best] = [s, i];
      }
    }
    return best < 0 ? null : spotAt(stroke, best);
  }

  // `shed(x, y, n)` shakes n petals loose from the flowers nearest (x, y).
  constructor(comp, stroke, perch, rand, { breathing, shed }) {
    this.cfg = comp.magpie;
    this.stage = { w: comp.w, h: comp.h };
    this.stroke = stroke;
    this.rand = rand;
    this.shed = shed;
    this.breathing = breathing; // a slow idle swell; off on phones so the loop can sleep
    this.dir = rand.sign(); // the way it flies in, and so faces
    this.home = perch;
    this.perchAt(perch);
    this.entry = this.dir > 0 ? 'bl' : 'br';
    this.route = null; // worked out as the flight starts, for the screen it is on
    this.dur = this.cfg.flight[0];
    this.arrive = 16;
    this.state = 'wait';
    Object.assign(this, { tr: 0, tv: 0, ft: 0, clock: 0, fp: 0, A: 1, psiC: 1.35, agit: 0, pokeT: -Infinity });
    Object.assign(this, { hp: 'pro', hpT: 'pro', ha: 0, hrT: 0, hs: null, hold: 0 });
    this.timers = { event: 14 + rand() * 12, blink: 3, turn: null, glance: null };
  }

  perchAt(s) {
    Object.assign(this, { x: s.x, y: s.y, bw: s.bw, tilt: s.tilt, i: s.i });
  }

  // A flight in from an entry ([start, first control]) to the perch, approaching from below or,
  // for the top corners, from above, starting out of sight of `view`.
  routeFrom(entry, view) {
    const [p0, p1] = this.cfg.entries[entry];
    const [ax, ay] = this.cfg.approach[entry[0] === 't' ? 1 : 0];
    return [offscreen(p0, this.stage, view), p1, [this.x - this.dir * ax, this.y - ay]];
  }

  // Flying off the way it faces, up and out of sight of `view`: the bezier from the perch.
  pathOff(view) {
    const D = this.dir;
    const { via, to } = this.cfg.off;
    return [[this.x, this.y], ...via.map(([dx, dy]) => [this.x + D * dx, this.y + dy]), offscreen([this.x + D * to[0], to[1]], this.stage, view)];
  }

  // Blossoms and buds right around the perch, opening just before it arrives (placed for the side
  // it first comes from).
  blooms() {
    const P = this.stroke.pts;
    const N = P.length;
    const R = this.rand.range;
    const at = (x) => {
      let bi = 0;
      let bd = 1e9;
      P.forEach((p, i) => {
        const d = Math.abs(p.x - x) + (Math.abs(p.y - this.y) > 40 ? 1e4 : 0);
        if (d < bd) [bd, bi] = [d, i];
      });
      return bi;
    };
    const colours = [[188, 92, 88], [198, 106, 98], [204, 118, 108], [184, 96, 96]];
    return this.cfg.blooms.map(([dx, down, kind, r], k) => {
      const i = at(this.x + dx * this.dir);
      const p = P[i];
      const q0 = P[Math.max(0, i - 2)];
      const q1 = P[Math.min(N - 1, i + 2)];
      const a = Math.atan2(q1.y - q0.y, q1.x - q0.x);
      let nx = -Math.sin(a);
      let ny = Math.cos(a);
      if ((ny > 0 ? 1 : -1) !== down) [nx, ny] = [-nx, -ny];
      const off = kind === 'blossom' ? p.w * 0.5 + r * 0.25 : p.w * 0.5 - 0.4;
      let vx = nx;
      let vy = ny;
      if (kind !== 'blossom' && down < 0) [vx, vy] = [nx * 0.6 + this.dir * 0.5, ny * 0.8];
      return {
        kind,
        x: p.x + nx * off,
        y: p.y + ny * off,
        r,
        rot: Math.atan2(vx, -vy) + R(-0.2, 0.2),
        pa: R(0, 6.28),
        pj: [0, 0, 0, 0, 0].map(() => R(-0.1, 0.1)),
        sy: R(0.78, 1),
        col: colours[k % colours.length],
        al: 0.88,
        t: 9 + k * 0.7,
        dur: R(1.8, 2.4),
      };
    });
  }

  // ---- Reactions ----

  // Whether (x, y) is on the bird (for taps, and the pointer's cursor).
  hit(x, y) {
    const [dx, dy, r] = this.cfg.hit;
    return !this.still && (this.state === 'perch' || this.state === 'hop') && Math.hypot(x - (this.x - this.dir * dx), y - (this.y - dy)) < r;
  }

  // Where the pointer is, or null once it has gone. Perched, the bird watches it, and loses
  // interest once it has been still for a few seconds. A tap (on a touch screen) catches its eye
  // the same way. Returns true when the scene should wake for the head to move.
  watch(at, { tap = false, now } = {}) {
    this.catchUp(now);
    if (this.state !== 'perch' || this.still) {
      if (!tap) this.look = null;
      return false;
    }
    if (!at) {
      this.look = null;
      return this.looking;
    }
    if (tap || !this.lookAt || Math.hypot(at.x - this.lookAt.x, at.y - this.lookAt.y) > 4) {
      this.lookAt = at;
      this.lookMoved = this.clock;
    }
    this.look = at;
    return true;
  }

  // A pointer passing close by: it flicks its tail and blinks (at most every 2.6 s). Returns
  // true when it reacted.
  hover(x, y, now) {
    this.catchUp(now);
    const [reach, dy] = this.cfg.reach;
    if (this.state !== 'perch' || this.still || Math.hypot(x - this.x, y - (this.y - dy)) >= reach) return false;
    if ((this.cooldown || 0) > now) return false;
    this.cooldown = now + 2600;
    this.tv += 3.5;
    this.blinkT = EPS;
    return true;
  }

  // A tap on the bird. Each tap within 8 s of the last startles it a little more: a flutter, a
  // few hops along the branch, then it flies off. Cornered at the thin end of the branch it flies
  // off at once, and a tap while it hops sends it off when it lands. Returns true when it reacted.
  poke(now) {
    this.catchUp(now);
    if (this.still) return false;
    if (this.state === 'hop') {
      this.pokeT = this.clock;
      this.agit = 3;
      this.queue = true;
      return true;
    }
    if (this.state !== 'perch') return false;
    if (this.clock - this.pokeT > 8) this.agit = 0;
    this.pokeT = this.clock;
    this.blinkT = EPS;
    if (!this.hopsAhead().length) {
      this.agit = 3;
      this.flyOff();
      return true;
    }
    this.agit = Math.min(3, this.agit + 1);
    if (this.agit === 1) {
      if (this.stT && this.stT < 1.6) this.stT = 1.6; // cut a stretch short
      this.ruffT = 0;
      this.flS = 0;
      this.flutter();
    } else if (this.agit === 2) this.hop();
    else this.flyOff();
    return true;
  }

  // A quick lift of the folded wings that shakes a petal or two loose and jogs the branch.
  flutter() {
    this.flT = EPS;
    this.shed(this.x, this.y, 1 + (this.rand() < 0.5 ? 1 : 0));
    this.bend = { t: 0, A: 0.9 };
    this.snap = null;
  }

  // Two or three hops forward (the way it faces) along the limb, each onto wood thick and level
  // enough to stand on: fewer near the thin end, and none once it is cornered there.
  hopsAhead() {
    const { step, width, area, level } = this.cfg.hop;
    const P = this.stroke.pts;
    const n = P.length;
    const ok = (i, j) => {
      if (j < 5 || j > n - 6) return false;
      const s = spotAt(this.stroke, j);
      return s.bw > width[0] && s.bw < width[1] && Math.abs(Math.sin(s.a)) < 0.5 && inRect(area, s.x, s.y) && Math.abs(s.y - spotAt(this.stroke, i).y) < level;
    };
    const along = (Math.sign(P[Math.min(n - 1, this.i + 5)].x - P[Math.max(0, this.i - 5)].x) || 1) * this.dir * step;
    const count = 2 + (this.rand() < 0.5 ? 1 : 0);
    const out = [];
    for (let i = this.i; out.length < count && ok(i, i + along); i += along) out.push(spotAt(this.stroke, i + along));
    return out;
  }

  hop() {
    if (this.flT && this.flT < 0.8) {
      this.hopQ = true; // once the flutter has settled
      return;
    }
    const hops = this.hopsAhead();
    if (!hops.length) return this.flyOff();
    for (const h of hops) h.pause = this.rand.range(0.06, 0.16);
    Object.assign(this, { state: 'hop', hops, hk: 0, ht: 0, h0: { x: this.x, y: this.y, tilt: this.tilt }, tf: 0, stT: 0, flT: 0, ruffT: 0, hopQ: false, hold: 0 });
  }

  // Off the branch the way it faces, up and out of the top of the screen.
  flyOff() {
    Object.assign(this, { state: 'off', ot: 0, odur: this.cfg.off.dur, path: null, pushed: false, stT: 0, flT: 0, ruffT: 0, hopQ: false, queue: false, fp: 0, hold: 0, hpT: 'pro', hrT: 0, looking: false, hz: null });
  }

  // Back to its first perch, from a corner other than the one it left by (and, when it can, the
  // one it last came in from), facing the way it flies.
  comeBack() {
    const { entries } = this.cfg;
    const exit = this.dir > 0 ? 'tr' : 'tl';
    const others = Object.keys(entries).filter((k) => k !== exit);
    const fresh = others.filter((k) => k !== this.entry);
    const entry = this.rand.pick(fresh.length ? fresh : others);
    this.perchAt(this.home);
    this.dir = this.home.x > entries[entry][0][0] ? 1 : -1;
    this.entry = entry;
    this.route = null;
    Object.assign(this, { state: 'fly', ft: 0, dur: this.cfg.flight[1], A: 0.9, psiC: 1.3, agit: 0, pumps: null, wasPerched: false });
    Object.assign(this, { look: null, lookAt: null, looking: false, bored: false, hz: null, hp: 'pro', hpT: 'pro', ha: 0, hrT: 0, hs: null, hold: 0 });
  }

  // ---- Loop ----

  // Whether the next frame would look any different (the scene sleeps when nothing moves).
  get busy() {
    if (this.state === 'wait') return false;
    if (this.state === 'away') return !!this.bend;
    if (this.state !== 'perch' || !this.drawn) return true;
    if (this.still) return false;
    return (
      this.breathing ||
      !!(this.blinkT || this.ruffT || this.flT || this.stT || this.nodT || this.tf || this.bend || this.hs || this.pumps?.length || this.hopQ) ||
      this.hpT !== this.hp || Math.abs(this.hrT - this.ha) > 0.08 || // a turn of the head, waiting its moment
      this.unsteady ||
      Math.abs(this.tr) > EPS || Math.abs(this.tv) > EPS
    );
  }

  // Seconds until something happens by itself, for waking a sleeping scene.
  get nextEvent() {
    if (this.state === 'away') return Math.max(0, this.awayT);
    if (this.state !== 'perch' || this.still) return Infinity;
    const T = this.timers;
    const bored = this.looking && !this.bored ? this.lookMoved + this.patience - this.clock : Infinity;
    return Math.max(0, Math.min(T.blink, T.event, T.turn ?? Infinity, T.glance ?? Infinity, bored));
  }

  // The scene's loop sleeps when nothing moves, and the bird's clock with it. sleep() notes when
  // (in performance.now() ms); wake() moves the clock and its timers on by the time since, and so
  // does any input first, since what a tap does depends on the time (how long the bird stays
  // interested, whether taps follow one another).
  sleep(now) {
    this.sleptAt ??= now;
  }

  wake(now) {
    this.catchUp(now);
    this.sleptAt = null;
  }

  catchUp(now) {
    if (this.sleptAt == null || now == null) return;
    this.skip((now - this.sleptAt) / 1000);
    this.sleptAt = now;
  }

  // Time passed with the clock standing still.
  skip(seconds) {
    this.clock += seconds;
    if (this.state === 'away') this.awayT -= seconds;
    else for (const key in this.timers) if (this.timers[key] != null) this.timers[key] -= seconds;
  }

  // Advances the bird and draws it on its layer.
  step(dt, scene) {
    const P = this.update(dt, scene);
    if (P) this.draw(scene.layers.bird, scene, P);
  }

  // The state machine: advances the bird by dt and returns the pose to draw, or null when there is
  // nothing new to draw.
  update(dt, scene) {
    if (this.state === 'wait') {
      if (scene.t < this.arrive) return null;
      this.state = scene.reduce || scene.instant ? 'perch' : 'fly';
      this.ft = 0;
    }
    if (this.still && this.drawn) return null;
    this.clock += dt;
    // Tail: a damped spring that every hop, landing and poke sets bobbing, sometimes pumped twice.
    this.tv += (-55 * this.tr - 13 * this.tv) * dt;
    this.tr += this.tv * dt;
    if (this.pumps?.length) {
      for (const p of this.pumps) p[0] -= dt;
      while (this.pumps.length && this.pumps[0][0] <= 0) this.tv += this.pumps.shift()[1];
    }
    const P = { x: this.x, y: this.y, dir: this.dir, tilt: 0, zs: 1, pitch: 0, dip: 0, sc: 1, hop: 0, shake: 0, psi: 1.3, S: 1, spreadA: 0, foldA: 1, legA: 1, tailRot: this.tr, hr: 0, hp: 'pro', hox: 0, hoy: 0, stab: 0, bob: 0, blink: 0, wl: 0, ws: 0 };

    if (this.state === 'away') {
      this.awayT -= dt;
      if (this.awayT <= 0) this.comeBack();
    }
    if (this.state === 'fly') this.flying(dt, P, scene);
    else if (this.state === 'land') this.landing(dt, P);
    else if (this.state === 'hop') this.hopping(dt, P);
    else if (this.state === 'off') this.leaving(dt, P, scene);
    else if (this.state === 'perch') this.perched(dt, P, scene);
    if (this.state !== 'fly' && this.state !== 'off' && this.state !== 'hop') P.tilt = this.tilt;

    // After the last hop the tail flares up twice.
    if (this.tf) {
      if (this.state !== 'perch' && this.state !== 'hop') this.tf = 0;
      else {
        this.tf += dt;
        const t = this.tf;
        const flare = (t0, up, down, A) => {
          const u = t - t0;
          return u <= 0 ? 0 : u < up ? A * (1 - (1 - u / up) ** 2) : A * (1 - smooth((u - up) / down));
        };
        P.tailRot += flare(0.05, 0.12, 0.44, 0.32) + flare(0.68, 0.11, 0.5, 0.2);
        if (t >= 1.35) this.tf = 0;
      }
    }
    this.turnHead(dt, P);
    if (this.nodT) {
      if (this.state !== 'perch' || this.still) this.nodT = 0;
      else {
        this.nodT += dt;
        const t = this.nodT;
        P.hr = clamp(P.hr + 0.2 * (t < 0.13 ? smooth(t / 0.13) : t < 0.24 ? 1 : 1 - smooth((t - 0.24) / 0.26)), -0.28, 0.3);
        if (t >= 0.5) this.nodT = 0;
      }
    }

    if (this.bend) {
      this.bend.t += dt;
      const bt = this.bend.t;
      const D = this.bend.A * Math.exp(-bt * 3.8) * Math.sin(bt * 15);
      if (bt > 1.4) this.bend = null;
      else {
        P.bend = D;
        if (this.state !== 'off') P.y += D;
      }
    }

    // On the branch the head holds still in space while the body bobs, as a bird's does: it trails
    // the body by a few hundredths of a second, up to 3 units.
    const zK = P.zs * this.cfg.scale;
    const bx = P.x + P.shake;
    const by = P.y + P.hop + P.dip * zK;
    if ((this.state === 'perch' || this.state === 'hop') && !this.still) {
      const hw = (this.hw ??= { x: bx, y: by });
      const k = 1 - Math.exp(-dt / 0.05);
      hw.x += (bx - hw.x) * k;
      hw.y += (by - hw.y) * k;
      P.hox = clamp(((hw.x - bx) * P.dir) / zK, -3, 3);
      P.hoy = clamp((hw.y - by) / zK, -3, 3);
      P.stab = 1;
      this.unsteady = Math.abs(hw.x - bx) > EPS || Math.abs(hw.y - by) > EPS;
    } else {
      this.hw = null;
      this.unsteady = false;
    }
    return P;
  }

  // Up from below the screen (or in from a top corner) along a bezier, flapping hard while
  // climbing, gliding, then braking with spread wings and legs down for the last stretch.
  flying(dt, P, scene) {
    this.route ??= this.routeFrom(this.entry, scene.view);
    this.ft += dt;
    const u = Math.min(1, this.ft / this.dur);
    const s = (1 - Math.cos(Math.PI * Math.pow(u, 0.85))) / 2;
    const q = 1 - s;
    const [p0, p1, p2] = this.route;
    const p3 = [this.x, this.y];
    P.x = q * q * q * p0[0] + 3 * q * q * s * p1[0] + 3 * q * s * s * p2[0] + s * s * s * p3[0];
    P.y = q * q * q * p0[1] + 3 * q * q * s * p1[1] + 3 * q * s * s * p2[1] + s * s * s * p3[1];
    const dx = 3 * q * q * (p1[0] - p0[0]) + 6 * q * s * (p2[0] - p1[0]) + 3 * s * s * (p3[0] - p2[0]);
    const dy = 3 * q * q * (p1[1] - p0[1]) + 6 * q * s * (p2[1] - p1[1]) + 3 * s * s * (p3[1] - p2[1]);
    const k = smooth((u - 0.86) / 0.14);
    const climb = u < 0.26;
    const lift = u < 0.08;
    const k6 = Math.min(1, dt * 5);
    this.A = lerp(this.A, k > 0 ? 0.55 : lift ? 0.95 : climb ? 1.1 : 0.05, k6);
    this.psiC = lerp(this.psiC, k > 0 ? 0.95 : climb ? 1.35 : 1.15, k6);
    this.fp += dt * Math.PI * 2 * (k > 0 ? 2.4 : lift ? 2.8 : climb ? 3.4 : 0.35);
    P.psi = this.psiC + this.A * Math.sin(this.fp + 0.3 * Math.sin(this.fp));
    P.spreadA = 1;
    P.foldA = 0;
    if (P.y > this.cfg.lowWingsBelow) P.S = 0.8;
    P.pitch = lerp(clamp(Math.atan2(dy, Math.abs(dx) + 1e-3) * 0.55, -0.75, 0.4), -0.18, k);
    P.legA = k;
    P.tailRot = this.tr - 0.18 * k;
    P.zs = 0.86 + 0.14 * u;
    if (u >= 1) {
      this.state = 'land';
      this.lt = 0;
      this.l0 = { psi: P.psi, pitch: P.pitch };
      this.tv += 3;
      this.shed(this.x, this.y, 3 + Math.floor(this.rand() * 3));
      this.bend = { t: 0, A: 2.4 };
      this.snap = null;
    }
  }

  // Touch down: wings fold, the body dips and the branch gives a little.
  landing(dt, P) {
    this.lt += dt;
    const lt = this.lt;
    const a = smooth(lt / 0.3);
    const f = smooth((lt - 0.3) / 0.5);
    P.psi = lerp(this.l0.psi, 0.45, a) + 0.2 * Math.sin(lt * 24) * Math.max(0, 1 - lt / 0.7);
    P.S = lerp(1, 0.55, f);
    P.spreadA = 1 - f;
    P.foldA = f;
    P.pitch = lerp(this.l0.pitch, 0, smooth(lt / 0.45));
    P.dip = lt < 0.3 ? 3.4 * Math.sin((Math.PI * lt) / 0.3) : lt < 0.62 ? -1.3 * Math.sin((Math.PI * (lt - 0.3)) / 0.32) : 0;
    if (lt >= 0.85) this.state = 'perch';
  }

  // One hop to the next spot: a crouch, a low arc with the legs folding and the wings lifting a
  // little, a dip as it lands (the branch gives), then a short pause before the next.
  hopping(dt, P) {
    const h = this.hops[this.hk];
    const last = this.hk === this.hops.length - 1;
    const TC = 0.1;
    const TA = 0.24;
    const TL = 0.1;
    const t = (this.ht += dt);
    const b = clamp((t - TC) / TA, 0, 1);
    const e = smooth(b);
    const arc = Math.sin(Math.PI * b);
    const cr = smooth(t / TC);
    P.x = lerp(this.h0.x, h.x, e);
    P.y = lerp(this.h0.y, h.y, e);
    P.tilt = lerp(this.h0.tilt, h.tilt, e);
    P.hop = -this.cfg.hop.height * arc;
    if (t < TC) {
      P.dip = 2.4 * cr;
      P.pitch = 0.07 * cr;
      P.tailRot = this.tr + 0.09 * cr;
    } else if (t < TC + TA) {
      P.dip = b < 0.15 ? lerp(2.4, -1.4, smooth(b / 0.15)) : lerp(-1.4, 0, smooth((b - 0.6) / 0.4));
      P.pitch = lerp(0.07, -0.06, smooth(b / 0.2)) + 0.1 * smooth((b - 0.55) / 0.45);
      P.legA = 1 - 0.28 * Math.sin(Math.PI * Math.min(1, b / 0.85));
      P.tailRot = this.tr + 0.09 * (1 - smooth(b / 0.3)) - 0.06 * arc;
      P.wl = 0.4 * Math.sin(Math.PI * b);
    } else {
      if (!h.landed) {
        h.landed = true;
        this.perchAt(h);
        Object.assign(this, { bend: { t: 0, A: 0.7 }, snap: null, pumps: null });
        this.tv += last ? 0.8 : 1.6;
        if (last) this.tf = EPS;
      }
      const lt = t - TC - TA;
      P.dip = 2 * Math.sin(Math.PI * Math.min(1, lt / TL));
      P.pitch = 0.04 * (1 - smooth(lt / TL));
      if (lt >= TL + (last ? 0 : h.pause)) {
        Object.assign(this, { ht: 0, hk: this.hk + 1, h0: { x: h.x, y: h.y, tilt: h.tilt } });
        if (last) {
          this.state = 'perch';
          this.timers.event = Math.max(this.timers.event, 6);
          if (this.rand() < 0.5) this.shed(this.x, this.y, 1);
          if (this.queue) {
            this.queue = false;
            this.flyOff();
          }
        }
      }
    }
  }

  // A crouch with the wings opening, a push off the branch (which springs back and sheds a few
  // petals), then flapping away along the bezier, shrinking a little with distance.
  leaving(dt, P, scene) {
    const o = (this.path ??= this.pathOff(scene.view));
    const T0 = 0.16;
    this.ot += dt;
    if (this.ot < T0) {
      const a = this.ot / T0;
      P.dip = 2.2 * Math.sin((Math.PI * a) / 2);
      P.S = lerp(0.55, 0.8, a);
      P.spreadA = a;
      P.foldA = 1 - a;
      P.psi = lerp(0.45, 1.3, a);
      return;
    }
    if (!this.pushed) {
      this.pushed = true;
      this.shed(this.x, this.y, 3 + (this.rand() < 0.5 ? 1 : 0));
      this.bend = { t: 0, A: 3 };
      this.snap = null;
      this.tv -= 3;
    }
    const u = Math.min(1, (this.ot - T0) / this.odur);
    const s = Math.pow(u, 1.4);
    const q = 1 - s;
    const B = (i) => q * q * q * o[0][i] + 3 * q * q * s * o[1][i] + 3 * q * s * s * o[2][i] + s * s * s * o[3][i];
    const dB = (i) => 3 * q * q * (o[1][i] - o[0][i]) + 6 * q * s * (o[2][i] - o[1][i]) + 3 * s * s * (o[3][i] - o[2][i]);
    P.x = B(0);
    P.y = B(1);
    this.fp += dt * Math.PI * 2 * 3.2;
    P.psi = 1.35 + 1.1 * Math.sin(this.fp + 0.3 * Math.sin(this.fp));
    P.spreadA = 1;
    P.foldA = 0;
    P.S = Math.min(1, 0.8 + u * 2);
    P.pitch = clamp(Math.atan2(dB(1), Math.abs(dB(0)) + 1e-3) * 0.55, -0.75, 0.4);
    P.legA = Math.max(0, 1 - u * 4);
    P.zs = 1 - 0.12 * u;
    P.tailRot = this.tr - 0.1;
    if (u >= 1) {
      this.state = 'away';
      this.awayT = this.cfg.off.away;
    }
  }

  perched(dt, P, scene) {
    this.still = scene.reduce;
    const R = this.rand.range;
    const T = this.timers;
    for (const key in T) if (T[key] != null) T[key] -= dt;
    if (this.agit && this.clock - this.pokeT > 8) this.agit = 0;
    if (!this.still) {
      if (T.blink <= 0) {
        this.blinkT = EPS;
        T.blink = R(4, 9);
      }
      // Every 20–40 s: a flutter, a wing stretch, a ruffle, a tail flick or a look round.
      if (T.event <= 0 && !this.ruffT && !this.flT && !this.stT) {
        const r = this.rand();
        if (r < 0.24) this.flutter();
        else if (r < 0.44) this.stT = EPS;
        else if (r < 0.6) this.ruffT = EPS;
        else if (r < 0.8) {
          this.tv += R(2.2, 3.2);
          if (this.rand() < 0.6) this.pumps = [[0.36, 1.4]];
        } else {
          this.hrT = R(-0.2, 0.18);
          T.turn = R(1.5, 3);
        }
        T.event = R(20, 40);
      }
      if (T.turn != null && T.turn <= 0) {
        this.hrT = 0;
        this.hpT = 'pro';
        T.turn = null;
      }
      // Every few seconds, unless it is watching the pointer: a nod, the head straightened, tipped
      // up or down, or turned over its shoulder for a moment.
      T.glance ??= R(2, 5);
      if (T.glance <= 0) {
        T.glance = R(2.5, 6);
        if (!this.looking && !this.flT) {
          const r = this.rand();
          if (r < 0.36) {
            if (r < 0.24) this.nodT = EPS;
            this.hpT = 'pro';
            this.hrT = 0;
            T.turn = null;
          } else if (r < 0.72) {
            this.hpT = 'pro';
            this.hrT = this.rand.sign() * R(0.17, 0.26);
            T.turn = R(1.2, 2.8);
          } else {
            this.hpT = r < 0.86 ? 'tq' : 'back';
            this.hrT = this.hpT === 'tq' ? R(-0.05, 0.12) : R(0, 0.16);
            T.turn = R(0.9, 1.7);
          }
        }
      }
    }
    this.follow();
    if (this.blinkT) {
      this.blinkT += dt;
      P.blink = Math.sin(Math.PI * Math.min(1, this.blinkT / 0.16));
      if (this.blinkT >= 0.16) this.blinkT = 0;
    }
    if (this.ruffT) {
      this.ruffT += dt;
      const b = this.ruffT / 0.9;
      const pf = Math.sin(Math.PI * Math.min(1, b));
      P.sc = 1 + 0.04 * pf;
      P.shake = Math.sin(b * 38) * 0.35 * pf;
      if (b >= 1) this.ruffT = 0;
    }
    if (this.flT) {
      // The folded wings lift off the back and settle (flS scales it down after a stretch).
      this.flT += dt;
      const t = this.flT;
      P.wl = t < 0.25 ? smooth(t / 0.25) : t < 0.4 ? 1 - 0.04 * smooth((t - 0.25) / 0.15) : t < 0.75 ? 0.96 * (1 - smooth((t - 0.4) / 0.35)) : 0.06 * Math.sin(Math.PI * Math.min(1, (t - 0.75) / 0.12));
      P.wl *= this.flS || 1;
      if (t >= 0.87) this.flT = this.flS = 0;
    }
    if (this.stT) {
      // A wing drawn out along the back, held, and folded again with a small flutter.
      this.stT += dt;
      const t = this.stT;
      P.ws = t < 0.7 ? smooth(t / 0.7) : t < 1.6 ? 1 - 0.05 * Math.sin((Math.PI * (t - 0.7)) / 0.9) : 1 - smooth((t - 1.6) / 0.6);
      if (t >= 2.2) {
        this.stT = 0;
        P.ws = 0;
        if (!this.flT) {
          this.flT = EPS;
          this.flS = 0.35;
        }
      }
    }
    if (this.breathing) P.sc *= 1 + 0.01 * Math.sin(this.clock * 2.1);
    if (Math.abs(this.tr) <= EPS && Math.abs(this.tv) <= EPS) this.tr = this.tv = 0;
    P.tailRot = this.tr;
    if (this.hopQ && (!this.flT || this.flT > 0.8)) {
      this.hopQ = false;
      this.hop();
    }
  }

  // Turning the head to the pointer: in profile while it is ahead, three-quarters as it passes
  // overhead or close behind, and turned right round once it is well behind (with some hysteresis
  // between them), tipped towards it. Out of range, or still for 3–3.5 s, and it looks away.
  follow() {
    let lq = null;
    if (this.look && !this.still) {
      const [fx, fy] = this.cfg.look.from;
      const dx = (this.look.x - (this.x + this.dir * fx)) * this.dir;
      const dy = this.look.y - (this.y - fy);
      lq = { dx, dy, d: Math.hypot(dx, dy) };
    }
    if (lq) {
      if (this.bored && this.lookMoved > this.boredAt) this.bored = false;
      this.patience = lq.dx < 0 ? 3.5 : 3;
      if (this.looking && !this.bored && this.clock - (this.lookMoved ?? this.clock) > this.patience) {
        this.bored = true;
        this.boredAt = this.clock;
        this.hsEase = lq.dx >= 0; // an easy turn back, unless it was looking behind
      }
    }
    const [near, far] = this.cfg.look.range;
    if (lq && !this.bored && lq.d < (this.looking ? far : near)) {
      const { dx, dy } = lq;
      if (!this.looking) this.hsEase = false;
      let z = this.hz || 'pro';
      if (z === 'pro') {
        if (dx < 0) z = 'tq';
      } else if (z === 'tq') {
        if (dx > 34) z = 'pro';
        else if (dx < -46) z = 'back';
      } else if (dx > -18) z = 'tq';
      const a = z === 'back'
        ? 0.06 - clamp(Math.atan2(dy, Math.max(20, -dx)) * 0.6, -0.26, 0.34)
        : clamp(Math.atan2(dy, Math.max(20, Math.abs(dx))) * 0.6, -0.42, 0.42) * (z === 'tq' ? 0.6 : 1);
      Object.assign(this, { hz: z, hpT: z, hrT: a, looking: true });
    } else if (this.looking) {
      Object.assign(this, { looking: false, hz: null, hpT: 'pro', hrT: 0 });
      if (!this.bored) this.hsEase = true;
    }
  }

  // The head moves the way a bird's does: in quick turns between held poses. A turn takes 0.1 s,
  // 0.16 s to a new pose (passing through three-quarters between profile and turned away), or
  // 0.55 s easing back after it loses interest; then it holds a moment before the next.
  turnHead(dt, P) {
    if (this.state !== 'perch') {
      this.hpT = 'pro';
      this.hrT = 0;
    }
    if (this.still) {
      this.hp = 'pro';
      this.ha = 0;
      this.hs = null;
    } else {
      this.hold -= dt;
      if (this.hs && (this.hs.t += dt) >= this.hs.du) {
        this.hp = this.hs.to;
        this.ha = this.hs.a1;
        this.hs = null;
        this.hold = this.state !== 'perch' ? 0 : this.looking ? this.rand.range(0.14, 0.32) : this.rand.range(0.3, 0.7);
      }
      if (!this.hs && this.hold <= 0 && (this.hpT !== this.hp || Math.abs(this.hrT - this.ha) > 0.08)) {
        const du = this.hsEase ? 0.55 : this.hp !== this.hpT ? 0.16 : 0.1;
        const mid = this.hp !== this.hpT && this.hp !== 'tq' && this.hpT !== 'tq' ? 'tq' : null;
        this.hs = { t: 0, du, from: this.hp, to: this.hpT, mid, a0: this.ha, a1: this.hrT };
        this.hsEase = false;
      }
    }
    const S = this.hs;
    if (S) {
      const u = Math.min(1, S.t / S.du);
      const e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
      P.hr = lerp(S.a0, S.a1, e);
      P.hp = S.mid ? (u < 0.34 ? S.from : u < 0.75 ? S.mid : S.to) : u < 0.5 ? S.from : S.to;
    } else {
      P.hp = this.hp;
      P.hr = this.ha;
    }
  }

  // ---- Drawing ----

  draw(c, scene, P) {
    const away = this.state === 'away';
    // Perched, only the area around the bird changes from frame to frame; away, nothing does.
    if (this.state === 'perch' && this.wasPerched) c.clearRect(this.x - 215, this.y - 135, 430, 190);
    else if (!away || P.bend != null || !this.cleared) scene.clear(c);
    this.wasPerched = this.state === 'perch';
    this.cleared = away;
    if (P.bend != null) this.drawBend(c, scene, P.bend);
    if (!away) {
      this.art ??= buildArt(this.cfg.scale, scene.pxPerUnit, this.cfg.resolution);
      const hide = (this.state === 'fly' || this.state === 'off') && this.cfg.hideBehindCard;
      if (hide) {
        // Keep the bird from showing around the card's edges while it flies behind it.
        const v = scene.view;
        c.save();
        c.beginPath();
        c.rect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
        c.rect(hide[0], hide[1], hide[2] - hide[0], hide[3] - hide[1]);
        c.clip('evenodd');
      }
      drawMagpie(c, this.art, P, this.bw);
      if (hide) c.restore();
    }
    this.drawn = true;
  }

  // The branch around the bird sags and springs back: a snapshot of the ink and flowers drawn
  // in thin vertical slices, each shifted by a bell-shaped amount.
  drawBend(c, scene, D) {
    const W = 260;
    const H = 120;
    const x0 = Math.round(this.x - W / 2);
    const y0 = Math.round(this.y - 70);
    const r = scene.pxPerUnit;
    if (!this.snap) this.snap = scene.snapshot(x0, y0, W, H);
    for (let x = 0; x < W; x += 3) {
      const u = (x + 1.5 - W / 2) / (W / 2);
      const dy = D * Math.pow(Math.cos((u * Math.PI) / 2), 2);
      c.drawImage(this.snap, x * r, 0, 3 * r, H * r, x0 + x, y0 + dy, 3.2, H);
    }
  }

  // Rebuild the sprites at the next draw (after the stage scale or pixel ratio changes).
  resize() {
    this.art = null;
    this.snap = null;
    this.wasPerched = false;
    this.cleared = false;
    this.drawn = false;
  }
}

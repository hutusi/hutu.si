// The magpie (喜鹊) that flies in once the blossoms open and stays on the branch: 喜上眉梢,
// 'joy up to the eyebrows'. This is its behaviour; update() works out a pose without touching a
// canvas, and the artwork that draws it is in magpie-art.js. Port of the design's g4Mag* methods.

import { inRect } from './compositions.js';
import { buildArt, drawMagpie } from './magpie-art.js';

const smooth = (x) => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};
const lerp = (a, b, k) => a + (b - a) * k;
const EPS = 1e-3;

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
    if (best < 0) return null;
    const p = P[best];
    const a = angle(best);
    return {
      x: p.x,
      y: p.y - p.w * 0.5 + 0.8,
      bw: p.w,
      tilt: Math.cos(a) < 0 ? Math.atan2(-Math.sin(a), -Math.cos(a)) : a,
      dir: p.x < 700 ? 1 : -1,
    };
  }

  constructor(comp, perch, rand, { breathing }) {
    this.cfg = comp.magpie;
    this.stageW = comp.w;
    this.rand = rand;
    this.breathing = breathing; // a slow idle swell; off on phones so the loop can sleep
    Object.assign(this, perch);
    this.arrive = 16;
    this.state = 'wait';
    Object.assign(this, { tr: 0, tv: 0, hr: 0, hrT: 0, ft: 0, clock: 0, fp: 0, A: 1, psiC: 1.35 });
    this.timers = { event: 14 + rand() * 12, blink: 3, head: null };
  }

  // Blossoms and buds right around the perch, opening just before it arrives.
  blooms(stroke) {
    const P = stroke.pts;
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

  // A pointer near the bird: it flicks its tail, turns its head and blinks. Taps can also
  // make it ruffle. Returns true when it reacted.
  poke(x, y, tap, now) {
    const [reach, dy] = this.cfg.reach;
    if (this.state !== 'perch' || this.still || Math.hypot(x - this.x, y - (this.y - dy)) >= reach) return false;
    if (!tap && (this.cooldown || 0) > now) return false;
    this.cooldown = now + 2600;
    this.tv += 3.5;
    this.hrT = (x - this.x) * this.dir > 0 ? -0.2 : 0.18;
    this.timers.head = 2.6;
    this.blinkT = EPS;
    if (tap && this.rand() < 0.4) this.ruffT = EPS;
    return true;
  }

  // Whether the next frame would look any different (the scene sleeps when nothing moves).
  get busy() {
    if (this.state === 'wait') return false;
    if (this.state !== 'perch' || !this.drawn) return true;
    if (this.still) return false;
    return (
      this.breathing ||
      !!(this.blinkT || this.ruffT || this.flT || this.bend) ||
      Math.abs(this.tr) > EPS || Math.abs(this.tv) > EPS || Math.abs(this.hr - this.hrT) > EPS
    );
  }

  // Seconds until the next idle event, for waking a sleeping scene.
  get nextEvent() {
    if (this.state !== 'perch' || this.still) return Infinity;
    return Math.max(0, Math.min(this.timers.blink, this.timers.event, this.timers.head ?? Infinity));
  }

  // Time passed while the scene slept.
  skip(seconds) {
    this.clock += seconds;
    for (const key in this.timers) if (this.timers[key] != null) this.timers[key] -= seconds;
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
    const R = this.rand.range;
    this.clock += dt;
    // Tail: a damped spring that every hop, landing and poke sets bobbing.
    this.tv += (-55 * this.tr - 13 * this.tv) * dt;
    this.tr += this.tv * dt;
    const P = { x: this.x, y: this.y, dir: this.dir, tilt: 0, zs: 1, pitch: 0, dip: 0, sc: 1, hop: 0, shake: 0, psi: 1.3, S: 1, spreadA: 0, foldA: 1, legA: 1, tailRot: this.tr, hr: 0, bob: 0, blink: 0 };

    if (this.state === 'fly') {
      // Up from below the screen along a bezier, flapping hard while climbing, gliding, then
      // braking with spread wings and legs down for the last stretch.
      this.ft += dt;
      const cfg = this.cfg;
      const u = Math.min(1, this.ft / 5);
      const s = (1 - Math.cos(Math.PI * Math.pow(u, 0.85))) / 2;
      const q = 1 - s;
      const D = this.dir;
      const X = (v) => (D > 0 ? v : this.stageW - v);
      const p0 = [X(cfg.from[0]), cfg.from[1]];
      const p1 = [X(cfg.via[0]), cfg.via[1]];
      const p2 = [this.x - D * cfg.approach[0], this.y - cfg.approach[1]];
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
      if (P.y > cfg.lowWingsBelow) P.S = 0.8;
      P.pitch = lerp(Math.max(-0.75, Math.min(0.4, Math.atan2(dy, Math.abs(dx) + 1e-3) * 0.55)), -0.18, k);
      P.legA = k;
      P.tailRot = this.tr - 0.18 * k;
      P.zs = 0.86 + 0.14 * u;
      if (u >= 1) {
        this.state = 'land';
        this.lt = 0;
        this.l0 = { psi: P.psi, pitch: P.pitch };
        this.tv += 3;
        scene.shed(this.x, this.y, 3 + Math.floor(this.rand() * 3));
        this.bend = { t: 0, A: 2.4 };
        this.snap = null;
      }
    } else if (this.state === 'land') {
      // Touch down: wings fold, the body dips and the branch gives a little.
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
    } else {
      this.still = scene.reduce;
      const T = this.timers;
      for (const key in T) if (T[key] != null) T[key] -= dt;
      if (!this.still) {
        if (T.blink <= 0) {
          this.blinkT = EPS;
          T.blink = R(4, 9);
        }
        // Every 20–40 s: a flutter (sheds a petal or two), a ruffle, a tail flick or a look round.
        if (T.event <= 0 && !this.ruffT && !this.flT) {
          const r = this.rand();
          if (r < 0.3) {
            this.flT = EPS;
            scene.shed(this.x, this.y, 1 + (this.rand() < 0.5 ? 1 : 0));
            this.bend = { t: 0, A: 0.9 };
            this.snap = null;
          } else if (r < 0.55) this.ruffT = EPS;
          else if (r < 0.8) this.tv += R(2.4, 3.8);
          else {
            this.hrT = R(-0.2, 0.18);
            T.head = R(1.5, 3);
          }
          T.event = R(20, 40);
        }
        if (T.head != null && T.head <= 0) {
          this.hrT = 0;
          T.head = null;
        }
      }
      this.hr = lerp(this.hr, this.hrT, Math.min(1, dt * 14));
      if (Math.abs(this.hr - this.hrT) <= EPS) this.hr = this.hrT;
      P.hr = this.hr;
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
        this.flT += dt;
        const b = this.flT / 0.6;
        const fl = Math.sin(Math.PI * Math.min(1, b));
        P.spreadA = fl * 0.9;
        P.foldA = 1 - fl * 0.9;
        P.S = 0.55;
        P.psi = 0.7 + 0.35 * Math.sin(this.flT * 34);
        if (b >= 1) this.flT = 0;
      }
      if (this.breathing) P.sc *= 1 + 0.01 * Math.sin(this.clock * 2.1);
      if (Math.abs(this.tr) <= EPS && Math.abs(this.tv) <= EPS) this.tr = this.tv = 0;
      P.tailRot = this.tr;
    }
    if (this.state !== 'fly') P.tilt = this.tilt;
    if (this.bend) {
      this.bend.t += dt;
      const bt = this.bend.t;
      const D = this.bend.A * Math.exp(-bt * 3.8) * Math.sin(bt * 15);
      if (bt > 1.4) this.bend = null;
      else {
        P.bend = D;
        P.y += D;
      }
    }
    return P;
  }

  draw(c, scene, P) {
    // Perched, only the area around the bird changes from frame to frame.
    if (this.state === 'perch' && this.wasPerched) c.clearRect(this.x - 215, this.y - 135, 430, 190);
    else scene.clear(c);
    this.wasPerched = this.state === 'perch';
    if (P.bend != null) this.drawBend(c, scene, P.bend);
    this.art ??= buildArt(this.cfg.scale, scene.pxPerUnit, this.cfg.resolution);
    const hide = this.state === 'fly' && this.cfg.hideBehindCard;
    if (hide) {
      // Keep the bird from showing around the card's edges while it flies up behind it.
      const v = scene.view;
      c.save();
      c.beginPath();
      c.rect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
      c.rect(hide[0], hide[1], hide[2] - hide[0], hide[3] - hide[1]);
      c.clip('evenodd');
    }
    drawMagpie(c, this.art, P, this.bw);
    if (hide) c.restore();
    this.drawn = true;
  }

  // The branch around the perch sags and springs back: a snapshot of the ink and flowers drawn
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
    this.drawn = false;
  }
}

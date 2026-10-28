// The magpie's behaviour on real branches, in both compositions: where it comes from and which way
// it faces, where it may hop, how taps escalate, where it comes back from, and when the scene may
// sleep. update() works out poses without a canvas, so this needs no browser.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { growBranch } from '../../src/scene/branch.js';
import { TALL, WIDE, inRect } from '../../src/scene/compositions.js';
import { Magpie } from '../../src/scene/magpie.js';
import { createRng } from '../../src/scene/rng.js';

const SEEDS = 120;
const COMPOSITIONS = { WIDE, TALL };
const VIEWS = { WIDE: { x0: 0, y0: 0, x1: 1280, y1: 800 }, TALL: { x0: 0, y0: 0, x1: 390, y1: 844 } };
// Screens that show more of the stage than the stage itself (as head.js fits them), and one that
// shows less.
const SCREENS = {
  WIDE: {
    'ultrawide 3440×1440': { x0: -507, y0: -80, x1: 1787, y1: 880 },
    'near-square 1000×1100': { x0: 0, y0: -304.6, x1: 1280, y1: 1103.4 },
    'phone landscape 844×390': { x0: 112.5, y0: 125, x1: 1167.5, y1: 612.5 },
  },
  TALL: {
    'phone 390×844': { x0: 0, y0: -17, x1: 390, y1: 827 },
    'iPad Pro portrait 1024×1366': { x0: -147, y0: -51, x1: 536, y1: 860 },
  },
};
const DT = 1 / 60;

// A bird on seed's branch, with a stand-in for the scene, recording the petals it sheds.
function bird(name, seed, { reduce = false } = {}) {
  const comp = COMPOSITIONS[name];
  const rand = createRng(seed);
  const { strokes } = growBranch(comp, rand, VIEWS[name]);
  const perch = Magpie.perchOn(strokes[0], comp.magpie);
  const shed = [];
  const m = new Magpie(comp, strokes[0], perch, rand, { breathing: false, shed: (x, y, n) => shed.push(n) });
  const scene = { t: 0, reduce, instant: false, view: VIEWS[name] };
  const run = (seconds, until = () => false) => {
    for (let t = 0; t < seconds && !until(); t += DT) {
      scene.t += DT;
      m.update(DT, scene);
    }
  };
  return { m, comp, perch, shed, run };
}

// Lands, then waits for the landing to settle.
const perched = (b) => {
  b.run(30, () => b.m.state === 'perch');
  b.run(1);
  assert.equal(b.m.state, 'perch');
};

for (const name of Object.keys(COMPOSITIONS)) {
  test(`${name}: it comes in from either side, facing the way it flies, with its blossoms on that side`, () => {
    const sides = new Set();
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { m, perch } = bird(name, seed);
      sides.add(m.dir);
      const [p0] = m.routeFrom(m.entry, VIEWS[name]);
      assert.equal(Math.sign(perch.x - p0[0]), m.dir, `seed ${seed}: flies in from the side it faces away from`);
      const [first] = m.blooms(); // a blossom just ahead of it
      assert.equal(Math.sign(first.x - perch.x), m.dir, `seed ${seed}: its blossom is behind it`);
    }
    assert.deepEqual([...sides].sort(), [-1, 1]);
  });

  test(`${name}: it hops forward onto thick, level wood, and is cornered at the thin end`, () => {
    const { width, area, level } = COMPOSITIONS[name].magpie.hop;
    let cornered = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { m } = bird(name, seed);
      for (let run = 0; run < 100; run++) {
        const hops = m.hopsAhead();
        if (!hops.length) {
          cornered++;
          break;
        }
        assert.ok(hops.length <= 3);
        let prev = m;
        for (const h of hops) {
          const at = `seed ${seed}, a hop to ${h.x.toFixed(0)},${h.y.toFixed(0)}`;
          assert.equal(Math.sign(h.x - prev.x), m.dir, `${at}: not forward`);
          assert.ok(h.bw > width[0] && h.bw < width[1], `${at}: wood ${h.bw.toFixed(1)} wide`);
          assert.ok(inRect(area, h.x, h.y), `${at}: outside the area`);
          assert.ok(Math.abs(Math.sin(h.a)) < 0.5, `${at}: too steep`);
          assert.ok(Math.abs(h.y - prev.y) < level, `${at}: too far up or down`);
          prev = h;
        }
        m.perchAt(hops.at(-1));
      }
    }
    assert.equal(cornered, SEEDS, 'every walk along the branch ends cornered');
  });

  test(`${name}: taps escalate from a flutter to hops to flying off, and it comes back to its perch`, () => {
    for (const seed of [3, 4, 7, 12, 31]) {
      const b = bird(name, seed);
      const { m, perch, comp } = b;
      perched(b);
      if (!m.hopsAhead().length) continue; // cornered from the start: see the next test
      const at = `seed ${seed}`;

      assert.ok(m.poke());
      assert.ok(m.flT > 0 && m.state === 'perch', `${at}: no flutter`);
      assert.ok(b.shed.length >= 2, `${at}: the flutter shed no petals`);
      b.run(1);

      const x0 = m.x;
      assert.ok(m.poke());
      assert.equal(m.state, 'hop', `${at}: no hop`);
      b.run(3, () => m.state === 'perch');
      assert.equal(m.state, 'perch');
      assert.equal(Math.sign(m.x - x0), m.dir, `${at}: hopped backwards`);
      b.run(0.5);

      const dir = m.dir;
      assert.ok(m.poke());
      assert.equal(m.state, 'off', `${at}: didn't fly off`);
      b.run(comp.magpie.off.dur + 1, () => m.state === 'away');
      assert.equal(m.state, 'away');
      m.drawn = true;
      assert.equal(m.busy, false, `${at}: busy while away`);
      assert.ok(Math.abs(m.nextEvent - comp.magpie.off.away) < 0.1, `${at}: wakes after ${m.nextEvent} s`);

      b.run(comp.magpie.off.away + 0.1, () => m.state === 'fly');
      assert.equal(m.state, 'fly');
      assert.notEqual(m.entry, dir > 0 ? 'tr' : 'tl', `${at}: came back the way it left`);
      b.run(6, () => m.state === 'perch');
      assert.equal(m.state, 'perch');
      assert.deepEqual([m.x, m.y], [perch.x, perch.y], `${at}: not back on its perch`);
    }
  });

  test(`${name}: cornered, it flies off at the first tap; tapped while hopping, it flies off when it lands`, () => {
    for (const seed of [3, 4, 7]) {
      const b = bird(name, seed);
      const { m } = b;
      perched(b);
      for (let hops = m.hopsAhead(); hops.length; hops = m.hopsAhead()) m.perchAt(hops.at(-1));
      assert.ok(m.poke());
      assert.equal(m.state, 'off', `seed ${seed}: cornered and stayed`);
    }
    for (const seed of [3, 4, 7, 12, 31]) {
      const b = bird(name, seed);
      const { m } = b;
      perched(b);
      if (!m.hopsAhead().length) continue;
      m.hop();
      assert.equal(m.state, 'hop');
      assert.ok(m.poke());
      b.run(3, () => m.state !== 'hop');
      assert.equal(m.state, 'off', `seed ${seed}`);
    }
  });

  test(`${name}: it comes back from another corner, and the last one it came in by when it can, facing the way it flies`, () => {
    const { entries } = COMPOSITIONS[name].magpie;
    for (let seed = 1; seed <= 40; seed++) {
      const { m, perch } = bird(name, seed);
      for (let k = 0; k < 6; k++) {
        const exit = m.dir > 0 ? 'tr' : 'tl';
        const last = m.entry;
        m.comeBack();
        assert.ok(m.entry !== exit && m.entry !== last, `seed ${seed}: from ${m.entry} after leaving by ${exit} and coming in by ${last}`);
        assert.equal(m.dir, Math.sign(perch.x - entries[m.entry][0][0]));
        assert.deepEqual(m.routeFrom(m.entry, VIEWS[name])[0], entries[m.entry][0]);
      }
    }
  });

  test(`${name}: on any screen its flights start and end out of sight`, () => {
    const comp = COMPOSITIONS[name];
    const { entries } = comp.magpie;
    // As far beyond an edge of what the screen shows as the design's point is beyond the stage's.
    const hidden = ([x, y], [dx, dy], v) =>
      (dx < 0 && x <= v.x0 + dx) || (dx > comp.w && x >= v.x1 + dx - comp.w) || (dy < 0 && y <= v.y0 + dy) || (dy > comp.h && y >= v.y1 + dy - comp.h);
    for (let seed = 1; seed <= 20; seed++) {
      const { m } = bird(name, seed);
      for (const dir of [1, -1]) {
        m.dir = dir;
        const end = m.pathOff(VIEWS[name]).at(-1);
        assert.ok(end[1] < 0, `seed ${seed}: flies off below the top`);
        for (const [screen, view] of Object.entries(SCREENS[name])) {
          for (const k of Object.keys(entries)) {
            const p0 = m.routeFrom(k, view)[0];
            assert.ok(hidden(p0, entries[k][0], view), `${screen}: the flight from ${k} starts in sight at ${p0}`);
          }
          const off = m.pathOff(view).at(-1);
          assert.ok(hidden(off, end, view), `${screen}: flying off ends in sight at ${off}`);
        }
      }
    }
  });

  test(`${name}: its head follows the pointer, turning round as it passes behind, and loses interest when it stops`, () => {
    const b = bird(name, 4);
    const { m } = b;
    perched(b);
    const [fx, fy] = COMPOSITIONS[name].magpie.look.from;
    const head = { x: m.x + m.dir * fx, y: m.y - fy };
    // Ahead and a little above: in profile, tipped up.
    assert.ok(m.watch({ x: head.x + m.dir * 120, y: head.y - 60 }));
    b.run(1.2);
    assert.equal(m.hp, 'pro');
    assert.ok(m.ha < -0.2, `tipped ${m.ha}`);
    // Well behind: turned away.
    m.watch({ x: head.x - m.dir * 150, y: head.y });
    b.run(1.5);
    assert.equal(m.hp, 'back');
    // Still for longer than its patience: it looks away again (and soon goes back to glancing
    // about by itself).
    b.run(4, () => m.bored);
    assert.ok(m.bored && !m.looking);
    b.run(1, () => m.hp === 'pro' && Math.abs(m.ha) < 0.09);
    assert.equal(m.hp, 'pro');
    // Out of range: no interest.
    m.watch({ x: head.x + m.dir * 400, y: head.y });
    b.run(1);
    assert.equal(m.looking, false);
  });

  test(`${name}: input after the loop has slept is timed by the bird's clock brought up to date`, () => {
    const b = bird(name, 4);
    const { m } = b;
    perched(b);
    const [fx, fy] = COMPOSITIONS[name].magpie.look.from;
    const head = { x: m.x + m.dir * fx, y: m.y - fy };
    // Asleep for 5 s, then a tap behind it: it looks round for its full patience, not a frame.
    m.sleep(0);
    assert.ok(m.watch({ x: head.x - m.dir * 100, y: head.y - 20 }, { tap: true, now: 5_000 }));
    m.wake(5_000);
    b.run(1);
    assert.ok(m.looking && !m.bored, 'lost interest at once');
    b.run(4);
    // Asleep for 9 s, then two taps a second apart: the second follows the first, so it hops.
    m.sleep(10_000);
    assert.ok(m.poke(19_000));
    m.wake(19_000);
    b.run(1);
    assert.ok(m.poke(20_000));
    assert.equal(m.state, 'hop', 'the second tap started over');
  });

  test(`${name}: with reduced motion it stays still, taps and pointer included`, () => {
    const b = bird(name, 4, { reduce: true });
    const { m } = b;
    b.run(20, () => m.state === 'perch');
    b.run(0.1);
    assert.equal(m.state, 'perch');
    m.drawn = true;
    assert.equal(m.hit(m.x, m.y - 20), false);
    assert.equal(m.poke(), false);
    assert.equal(m.watch({ x: m.x + 50, y: m.y - 50 }), false);
    assert.equal(m.hover(m.x, m.y - 20, 0), false);
    assert.equal(m.busy, false);
    assert.equal(m.nextEvent, Infinity);
    assert.equal(m.update(DT, { t: 99, reduce: true }), null);
  });

  test(`${name}: perched and left alone, the loop may sleep until its next glance or blink`, () => {
    for (const seed of [4, 7, 12]) {
      const b = bird(name, seed);
      const { m } = b;
      perched(b);
      m.drawn = true;
      b.run(40, () => !m.busy);
      assert.equal(m.busy, false, `seed ${seed}: never idle`);
      assert.ok(m.nextEvent > 0 && m.nextEvent <= 9, `seed ${seed}: next event in ${m.nextEvent} s`);
      const before = { ...m.timers };
      m.skip(1);
      for (const key in before) if (before[key] != null) assert.ok(Math.abs(m.timers[key] - (before[key] - 1)) < 1e-9);
    }
  });
}

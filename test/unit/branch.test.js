// Properties of the generated plum branch that the scene and the card rely on, checked over many
// seeds for both compositions (the generator is pure, so this needs no browser).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { endTime, growBranch } from '../../src/scene/branch.js';
import { TALL, WIDE, inRect } from '../../src/scene/compositions.js';
import { Magpie } from '../../src/scene/magpie.js';
import { createRng } from '../../src/scene/rng.js';

const SEEDS = 500;
const COMPOSITIONS = { WIDE, TALL };
// The visible part of the stage, in stage coordinates, for the stage itself and for real
// screens at the extremes, as head.js fits them. On big screens the limbs start further off.
const VIEWS = {
  WIDE: {
    stage: { x0: 0, y0: 0, x1: 1280, y1: 800 },
    'ultrawide 3440×1440': { x0: -507, y0: -80, x1: 1787, y1: 880 },
    'phone landscape 844×390': { x0: 112.5, y0: 125, x1: 1167.5, y1: 612.5 },
  },
  TALL: {
    stage: { x0: 0, y0: 0, x1: 390, y1: 844 },
    'phone 390×844': { x0: 0, y0: -17, x1: 390, y1: 827 },
    'iPad Pro portrait 1024×1366': { x0: -147, y0: -51, x1: 536, y1: 860 },
  },
};

for (const [name, comp] of Object.entries(COMPOSITIONS)) {
  const views = Object.entries(VIEWS[name]);

  test(`${name}: the same seed grows the same branch`, () => {
    const view = VIEWS[name].stage;
    for (let seed = 1; seed <= SEEDS; seed += 25) {
      assert.deepEqual(growBranch(comp, createRng(seed), view), growBranch(comp, createRng(seed), view), `seed ${seed}`);
    }
  });

  test(`${name}: ${SEEDS} seeds on each screen grow a full branch, keep the card clear and give the magpie a perch`, () => {
    for (const [screen, view] of views) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const { strokes, flora } = growBranch(comp, createRng(seed), view);
        const at = `seed ${seed}, ${screen}`;
        assert.ok(strokes.length >= 15 && flora.length >= 30, `${at}: a sparse branch (${strokes.length} strokes, ${flora.length} flowers)`);

        // No flower ever lands on the card.
        const onCard = flora.find((f) => inRect(comp.card, f.x, f.y));
        assert.equal(onCard, undefined, `${at}: a ${onCard?.kind} on the card`);

        // Twigs may start on a limb that passes behind the card, but never grow into the card
        // or the zones kept clear around it.
        const keepOut = [comp.card, ...comp.branch.avoid];
        for (const s of strokes.filter((st) => st.depth > 0)) {
          for (let i = 1; i < s.pts.length; i++) {
            const into = keepOut.find((r) => inRect(r, s.pts[i].x, s.pts[i].y) && !inRect(r, s.pts[i - 1].x, s.pts[i - 1].y));
            assert.equal(into, undefined, `${at}: a twig grows into ${JSON.stringify(into)}`);
          }
        }

        // Limbs enter from beyond the edge of the screen, so their cut ends never show.
        for (const s of strokes.filter((st) => st.depth === 0)) {
          const p = s.pts[0];
          assert.ok(p.x < view.x0 || p.x > view.x1 || p.y < view.y0 || p.y > view.y1, `${at}: a limb starts on screen at ${p.x},${p.y}`);
        }

        // The magpie needs a perch on the main limb, and lands at 16 s while the branch is
        // still finishing.
        assert.ok(Magpie.perchOn(strokes[0], comp.magpie), `${at}: no perch`);
        const end = endTime(strokes, flora);
        assert.ok(end > 14 && end < 20, `${at}: growth ends at ${end.toFixed(1)} s`);
      }
    }
  });
}

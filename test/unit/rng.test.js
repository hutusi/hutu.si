import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../../src/scene/rng.js';

const draw = (rand, n) => Array.from({ length: n }, () => rand());

test('a seed always gives the same sequence, and different seeds differ', () => {
  assert.deepEqual(draw(createRng(42), 100), draw(createRng(42), 100));
  assert.notDeepEqual(draw(createRng(42), 100), draw(createRng(43), 100));
});

test('values and helpers stay in range', () => {
  const rand = createRng(7);
  for (let i = 0; i < 10_000; i++) {
    const v = rand();
    assert.ok(v >= 0 && v < 1, `rand() = ${v}`);
    const r = rand.range(-3, 5);
    assert.ok(r >= -3 && r < 5, `range = ${r}`);
    assert.ok([1, -1].includes(rand.sign()));
    assert.ok(['a', 'b', 'c'].includes(rand.pick(['a', 'b', 'c'])));
  }
});

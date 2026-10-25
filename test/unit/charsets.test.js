import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { charsets, checkCoverage } from '../../scripts/lib/charsets.mjs';

const path = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const TEMPLATE = path('src/index.html');

test('the committed font subsets cover every character on the card', async () => {
  assert.deepEqual(await checkCoverage(TEMPLATE, path('assets/fonts/manifest.json')), []);
});

test('each font gets the characters it sets', async () => {
  const sets = await charsets(TEMPLATE);
  assert.ok(sets['huiwen-mincho'].includes('胡'), 'the name is set in Huiwen Mincho');
  assert.ok([...'hutsi'].every((c) => sets['cormorant-garamond-700'].includes(c)), 'the wordmark is set in Cormorant 700');
  assert.ok([...'John'].every((c) => sets['cormorant-garamond-500'].includes(c)), 'the English name is set in Cormorant 500');
  assert.ok(sets['zhuque-fangsong'].includes('写'), 'other Chinese text is set in Zhuque Fangsong');
  assert.ok(sets['eb-garamond'].includes('@'), 'Latin text is set in EB Garamond');
});

test('a missing font manifest fails instead of skipping the check', async () => {
  await assert.rejects(checkCoverage(TEMPLATE, path('assets/fonts/missing.json')), /npm run fonts/);
});

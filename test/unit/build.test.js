// Builds the site into a temporary directory and checks the output the deploy relies on.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { BUDGET, build } from '../../scripts/build.mjs';

let dist;
let sizes;
let pages;
let headers;
before(async () => {
  dist = await mkdtemp(join(tmpdir(), 'hutusi-build-'));
  sizes = await build({ outDir: dist, log: () => {} });
  pages = { index: await readFile(join(dist, 'index.html'), 'utf8'), notFound: await readFile(join(dist, '404.html'), 'utf8') };
  headers = await readFile(join(dist, '_headers'), 'utf8');
});
after(() => rm(dist, { recursive: true, force: true }));

const directive = (name) => headers.match(new RegExp(`${name} ([^;\\n]*)`))?.[1] ?? '';
const inline = (html, tag) =>
  [...html.matchAll(new RegExp(`<${tag}([^>]*)>([\\s\\S]*?)</${tag}>`, 'g'))].filter((m) => !/\ssrc=/.test(m[1]) && m[2]).map((m) => m[2]);
const sha = (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

test('the card fits in the first round trip, and a first visit stays within budget', () => {
  assert.ok(sizes.html.gzip <= BUDGET.html, `index.html is ${sizes.html.gzip} B gzip (budget ${BUDGET.html})`);
  assert.ok(sizes.total.gzip <= BUDGET.total, `a first visit is ${sizes.total.gzip} B gzip (budget ${BUDGET.total})`);
});

test('the CSP allows every inline script and style by hash, and nothing inline by default', () => {
  for (const [name, html] of Object.entries(pages)) {
    for (const code of inline(html, 'script')) assert.ok(directive('script-src').includes(sha(code)), `${name}: an inline script is not in script-src`);
    for (const code of inline(html, 'style')) assert.ok(directive('style-src').includes(sha(code)), `${name}: an inline style is not in style-src`);
  }
  assert.doesNotMatch(headers, /unsafe-inline|unsafe-eval/);
  assert.match(directive('default-src'), /^'none'$/);
});

test('no template placeholder or unresolved asset reference is left', () => {
  for (const text of [pages.index, pages.notFound, headers]) {
    assert.doesNotMatch(text, /asset:|\{\{|<!--%/);
  }
});

test('every referenced asset exists, fingerprinted and cached for good', () => {
  const refs = new Set(pages.index.match(/\/assets\/[\w./-]+/g));
  assert.ok(refs.size >= 8, `only ${refs.size} asset references`);
  for (const ref of refs) {
    assert.match(ref, /\.[0-9a-f]{10}\.\w+$/, `${ref} is not fingerprinted`);
    assert.ok(existsSync(join(dist, ref)), `${ref} is missing from the build`);
  }
  assert.match(headers, /\/assets\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
});

test('the static files ship', () => {
  for (const file of ['404.html', 'robots.txt', 'og.jpg', 'favicon.ico', 'apple-touch-icon.png', 'licenses/HuiwenMincho.txt']) {
    assert.ok(existsSync(join(dist, file)), `${file} is missing`);
  }
});

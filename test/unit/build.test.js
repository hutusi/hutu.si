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
  sizes.swCode = await readFile(join(dist, 'sw.js'), 'utf8');
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
  for (const text of [pages.index, pages.notFound, headers, sizes.swCode]) {
    assert.doesNotMatch(text, /asset:|\{\{|<!--%|__SERVICE_WORKER__/);
  }
});

// The service worker is built explicitly on and off, whatever ENABLED says in src/sw.js, so these
// tests pass with the kill switch in either position: they run before every deploy, and must
// never block the deploy that ships the kill switch.
const buildWith = async (swEnabled, check) => {
  const out = await mkdtemp(join(tmpdir(), `hutusi-sw-${swEnabled ? 'on' : 'off'}-`));
  try {
    const result = await build({ outDir: out, log: () => {}, swEnabled });
    await check(result, out, await readFile(join(out, 'index.html'), 'utf8'), await readFile(join(out, 'sw.js'), 'utf8'));
    return result.sw.version;
  } finally {
    await rm(out, { recursive: true, force: true });
  }
};

test('the service worker precaches exactly the card, and is never cached itself', () =>
  buildWith(true, async (result, out, index, code) => {
    const { version, precache, enabled } = result.sw;
    assert.equal(enabled, true);
    assert.match(version, /^[0-9a-f]{12}$/);
    assert.ok(code.includes(JSON.stringify(version)), 'sw.js carries its version');
    // It covers the rest of sw.js (its code and precache list), the page and its headers: so a
    // deploy that changes only the headers (the CSP, say) reaches returning visitors too, and
    // sw.js never changes without its version (each install gets a cache of its own).
    const rest = [code.replaceAll(version, '{{version}}'), index, await readFile(join(out, '_headers'), 'utf8')].join('\n');
    assert.equal(version, createHash('sha256').update(rest).digest('hex').slice(0, 12), 'the version covers the worker, the page and its headers');
    const assets = [...new Set(index.match(/\/assets\/[\w./-]+/g))];
    assert.equal(precache[0], '/');
    for (const asset of assets) assert.ok(precache.includes(asset), `${asset} is precached`);
    for (const url of precache.slice(1)) {
      assert.match(url, /^\/assets\//, `only the page and its assets: ${url}`);
      assert.ok(existsSync(join(out, url)), `${url} exists`);
    }
    assert.ok(!precache.some((u) => /^\/(a|w|t|cdn-cgi)(\/|$)/.test(u)), 'never the short-link paths or /cdn-cgi');
    assert.match(headers, /^\/sw\.js\n\s+Cache-Control: no-cache$/m);
    assert.match(directive('worker-src'), /^'self'$/);
    assert.match(index, /register\("\/sw\.js"\)/, 'the page registers it');
  }));

test('with the kill switch on, the worker clears itself and the page unregisters it', async () => {
  const on = await buildWith(true, () => {});
  const off = await buildWith(false, (result, out, index) => {
    assert.equal(result.sw.enabled, false);
    assert.doesNotMatch(index, /register\("\/sw\.js"\)/);
    assert.match(index, /getRegistrations\(\)/);
  });
  assert.notEqual(off, on, 'a new version, so browsers pick it up');
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

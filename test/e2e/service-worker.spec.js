// The service worker: a first visit left exactly as it was, return visits served from the cache
// (even with the network gone), only the card cached, a new deploy shown on the next visit, and
// the kill switch. Runs in the desktop project of each engine.
//
// The first test uses the usual `wrangler dev` server (real CSP and routing). The rest use their
// own server, so they can swap in another build ("a deploy") and drop the network.
import { cp, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../../scripts/build.mjs';
import { serve } from '../../scripts/lib/serve.mjs';
import { expect, test } from './fixtures.js';

test.skip(({ isMobile, hasTouch }) => isMobile || hasTouch, 'runs in the desktop project of each engine');

const controlled = (page) => page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20_000 });
const buildName = (page) => page.evaluate(() => document.documentElement.dataset.build ?? 'A');
// Checks for a new sw.js the way a visit does, without leaving the page, and waits until the new
// worker has taken over the page ("activated") or failed to install ("redundant").
const update = (page) =>
  page.evaluate(async () => {
    const sw = navigator.serviceWorker;
    const reg = await sw.getRegistration();
    const found = new Promise((resolve) => reg.addEventListener('updatefound', () => resolve(reg.installing), { once: true }));
    const changed = new Promise((resolve) => sw.addEventListener('controllerchange', resolve, { once: true }));
    await reg.update().catch(() => {});
    const worker = await found;
    const state = await new Promise((resolve) => {
      const settled = () => ['activated', 'redundant'].includes(worker.state) && resolve(worker.state);
      worker.addEventListener('statechange', settled);
      settled();
    });
    if (state === 'activated') await changed;
    return state;
  });
const cacheContents = (page) =>
  page.evaluate(async () => {
    const out = {};
    for (const key of await caches.keys()) out[key] = (await (await caches.open(key)).keys()).map((r) => new URL(r.url).pathname).sort();
    return out;
  });

test('a first visit registers the worker only once the page has loaded and gone idle', async ({ page }) => {
  await page.addInitScript(() => {
    const register = ServiceWorkerContainer.prototype.register;
    ServiceWorkerContainer.prototype.register = function (...args) {
      window.__registeredAt = performance.now();
      return register.apply(this, args);
    };
  });
  await page.goto('/?seed=4');
  await page.waitForFunction(() => window.__registeredAt !== undefined, null, { timeout: 20_000 });
  const t = await page.evaluate(() => ({
    registered: window.__registeredAt,
    load: performance.getEntriesByType('navigation')[0].loadEventEnd,
    painted: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
    scene: performance.getEntriesByName('scene-start')[0]?.startTime,
  }));
  // At or after: Firefox coarsens timestamps, and registration follows the load event closely.
  expect(t.registered).toBeGreaterThanOrEqual(t.load);
  expect(t.registered).toBeGreaterThanOrEqual(t.painted);
  // The CSP allows the worker (the fixture fails the test on any violation), and it takes over.
  await controlled(page);
});

test.describe('with its own server', () => {
  let dirs;
  let builds;
  let server;
  let qr; // the QR code's URL in A and in B

  test.beforeAll(async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'hutusi-sw-'));
    dirs = { A: join(tmp, 'A'), B: join(tmp, 'B'), F: join(tmp, 'F'), K: join(tmp, 'K') };
    // Explicitly on, whatever ENABLED says in src/sw.js, so a kill-switch deploy keeps CI green.
    builds = { A: await build({ outDir: dirs.A, log: () => {}, swEnabled: true }) };
    // B: the same site after a deploy that changed the page and the QR code (so its fingerprint).
    await cp(dirs.A, dirs.B, { recursive: true });
    qr = { A: builds.A.sw.precache.find((url) => url.includes('wechat-qr')) };
    qr.B = qr.A.replace(/\.[0-9a-f]{10}\./, `.${'b'.repeat(10)}.`);
    await rename(join(dirs.B, qr.A), join(dirs.B, qr.B));
    const html = await readFile(join(dirs.B, 'index.html'), 'utf8');
    await writeFile(join(dirs.B, 'index.html'), html.replace('<html lang="zh-Hans">', '<html lang="zh-Hans" data-build="B">').replaceAll(qr.A, qr.B));
    const sw = await readFile(join(dirs.B, 'sw.js'), 'utf8');
    await writeFile(join(dirs.B, 'sw.js'), sw.replaceAll(builds.A.sw.version, 'b'.repeat(12)).replaceAll(qr.A, qr.B));
    // F: a deploy whose worker fails to install: its list names a file the server doesn't have.
    await cp(dirs.A, dirs.F, { recursive: true });
    const failing = sw.replaceAll(builds.A.sw.version, 'f'.repeat(12)).replace('["/",', '["/","/assets/missing.0000000000.js",');
    if (!failing.includes('missing')) throw new Error('could not add a missing file to F\'s precache list');
    await writeFile(join(dirs.F, 'sw.js'), failing);
    // K: a deploy with the kill switch on.
    builds.K = await build({ outDir: dirs.K, log: () => {}, swEnabled: false });
    server = await serve(dirs.A, { headers: true });
  });
  test.afterAll(async () => {
    server?.close();
    if (dirs) await rm(join(dirs.A, '..'), { recursive: true, force: true });
  });
  test.beforeEach(() => {
    server.setRoot(dirs.A);
    server.setOffline(false);
  });

  // A visitor's browser after a first visit: the worker installed and in control.
  const returning = async (browser) => {
    const context = await browser.newContext({ locale: 'zh-CN', reducedMotion: 'reduce' });
    await context.addInitScript(() => navigator.serviceWorker?.addEventListener('controllerchange', () => (window.__controllerChanged = true)));
    const page = await context.newPage();
    await page.goto(`${server.url}/?seed=4`);
    await controlled(page);
    return { context, page };
  };

  test('a return visit comes from the cache, complete, even with the network gone', async ({ browser }) => {
    const { context, page } = await returning(browser);
    server.setOffline(true);
    await page.reload();
    await expect(page.locator('#front h1')).toHaveText('胡智勇');
    const fonts = await page.evaluate(() => document.fonts.ready.then(() => [...document.fonts].filter((f) => f.status === 'loaded' && !/Fallback/.test(f.family)).length));
    expect(fonts, 'every web font, from the cache').toBeGreaterThanOrEqual(5);
    await page.waitForFunction(() => performance.getEntriesByName('scene-start').length > 0);
    await expect(page.locator('#back .seal img')).toHaveJSProperty('complete', true);
    expect(await page.evaluate(() => document.querySelector('#back .seal img').naturalWidth)).toBeGreaterThan(0);
    await context.close();
  });

  test('only the card is cached; everything else is left to the network', async ({ browser }) => {
    const { context, page } = await returning(browser);
    const caches = await cacheContents(page);
    expect(caches).toEqual({ [`hutusi-${builds.A.sw.version}`]: [...builds.A.sw.precache].sort() });
    // With the network gone only the worker could answer these, and it must not.
    server.setOffline(true);
    for (const path of ['/a/x', '/w/1', '/t/1', '/cdn-cgi/rum', '/robots.txt', '/llms.txt']) {
      const outcome = await page.evaluate((p) => fetch(p).then(() => 'answered', () => 'network error'), path);
      expect(outcome, path).toBe('network error');
    }
    await context.close();
  });

  test('a new deploy shows on the next visit, fetched in the background', async ({ browser }) => {
    const { context, page } = await returning(browser);
    expect(await buildName(page)).toBe('A');
    server.setRoot(dirs.B);
    await page.reload(); // the cached card at once, while the new worker installs
    expect(await buildName(page)).toBe('A');
    await page.waitForFunction(() => window.__controllerChanged === true, null, { timeout: 20_000 });
    await page.reload();
    expect(await buildName(page)).toBe('B');
    // The previous copy is kept for pages still open on it; there's never more than two.
    expect(Object.keys(await cacheContents(page)).sort()).toEqual([`hutusi-${builds.A.sw.version}`, `hutusi-${'b'.repeat(12)}`].sort());
    await context.close();
  });

  test('a page still open across a deploy still gets its own assets, even offline', async ({ browser }) => {
    const { context, page } = await returning(browser);
    server.setRoot(dirs.B);
    expect(await update(page)).toBe('activated'); // B now controls this page from A
    // The page asks for A's QR code (as when the WeChat popup first opens), which B's deploy no
    // longer has: the copy of A kept for this answers. no-store: as if the HTTP cache had let it go.
    const status = () => page.evaluate((url) => fetch(url, { cache: 'no-store' }).then((r) => r.status, () => 'network error'), qr.A);
    expect(await status()).toBe(200);
    server.setOffline(true);
    expect(await status()).toBe(200);
    await context.close();
  });

  test('a failed update never costs the working copy', async ({ browser }) => {
    const { context, page } = await returning(browser);
    server.setRoot(dirs.F);
    expect(await update(page)).toBe('redundant');
    server.setRoot(dirs.B);
    expect(await update(page)).toBe('activated');
    // B's copy, and A's kept as the previous one (F's failed install left nothing worth keeping).
    expect(await cacheContents(page)).toEqual({
      [`hutusi-${builds.A.sw.version}`]: [...builds.A.sw.precache].sort(),
      [`hutusi-${'b'.repeat(12)}`]: builds.A.sw.precache.map((url) => (url === qr.A ? qr.B : url)).sort(),
    });
    await context.close();
  });

  test('the kill switch clears the cache and removes the worker', async ({ browser }) => {
    const { context, page } = await returning(browser);
    server.setRoot(dirs.K);
    // On the next visit the browser fetches the new sw.js, which cleans up and reloads the page.
    // A browser may skip that check right after installing a worker (real visitors' workers are
    // older), so give it up to three visits. Reads can land mid-reload: those are retried.
    const read = (fn) => page.evaluate(fn).catch(() => 'navigating');
    const registrations = () => read(() => navigator.serviceWorker.getRegistrations().then((all) => all.length));
    let cleared = false;
    for (let visit = 0; visit < 3 && !cleared; visit++) {
      await page.reload().catch(() => {}); // the worker may be reloading the page itself
      cleared = await expect.poll(registrations, { timeout: 8_000 }).toBe(0).then(() => true, () => false);
    }
    expect(cleared, 'the worker removed itself within three visits').toBe(true);
    await expect.poll(() => read(() => caches.keys())).toEqual([]);
    // From now on the card comes from the network again: without it, there's nothing to show.
    server.setOffline(true);
    await expect(page.reload()).rejects.toThrow();
    await context.close();
  });
});

// What the edge serves: security headers, caching, the static 404, and the paths reserved for
// short links (the only ones that run Worker code). HTTP-level, so it runs in one project.
import { expect, test } from './fixtures.js';

test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'HTTP checks run once');

test('the page is served with its security headers', async ({ request }) => {
  const res = await request.get('/');
  expect(res.status()).toBe(200);
  const h = res.headers();
  expect(h['content-type']).toMatch(/^text\/html/);
  expect(h['content-security-policy']).toMatch(/default-src 'none'/);
  expect(h['content-security-policy']).toMatch(/frame-ancestors 'none'/);
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['strict-transport-security']).toMatch(/max-age=\d+/);
  expect(h['permissions-policy']).toMatch(/camera=\(\)/);
});

for (const path of ['/a', '/a/x', '/w/abc', '/t/1']) {
  test(`${path} is reserved for short links: a 404 from the Worker, not cached`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(404);
    expect(res.headers()['cache-control']).toBe('no-store');
    expect(res.headers()['content-security-policy']).toMatch(/default-src 'none'/);
    expect(await res.text()).toContain('Nothing here');
  });
}

test('an unknown path gets the static 404 page', async ({ request }) => {
  const res = await request.get('/nope');
  expect(res.status()).toBe(404);
  expect(await res.text()).toContain('Nothing here');
});

test('/index.html redirects to /', async ({ request }) => {
  const res = await request.get('/index.html', { maxRedirects: 0 });
  expect([301, 307, 308]).toContain(res.status());
  expect(res.headers()['location']).toBe('/');
});

test('fingerprinted assets are cached for good, other files revalidate', async ({ request }) => {
  const html = await (await request.get('/')).text();
  const asset = html.match(/\/assets\/[\w./-]+\.js/)[0];
  expect((await request.get(asset)).headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  for (const path of ['/robots.txt', '/og.jpg', '/favicon.ico', '/apple-touch-icon.png', '/licenses/HuiwenMincho.txt']) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()['cache-control'] ?? '', path).not.toMatch(/immutable/);
  }
});

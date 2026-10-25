// Things that can break on the live site without any code change: Cloudflare zone settings
// (a feature that rewrites the HTML breaks the CSP), DNS and DNSSEC, the certificate, routing.
import { connect } from 'node:tls';
import { expect, test } from '@playwright/test';

const ORIGINS = ['https://static.cloudflareinsights.com']; // the analytics beacon the edge adds

test('the card loads cleanly: no errors, no CSP violations, no unexpected origins', async ({ page, baseURL }) => {
  const problems = [];
  const allowed = [new URL(baseURL).origin, ...ORIGINS];
  page.on('console', (m) => m.type() === 'error' && problems.push(`console error: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('request', (r) => {
    const url = r.url();
    if (/^https?:/.test(url) && !allowed.includes(new URL(url).origin)) problems.push(`request to ${url}`);
  });
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`)));
  const res = await page.goto('/');
  expect(res.status()).toBe(200);
  await expect(page.locator('#card h1').first()).toBeVisible();
  await page.waitForFunction(() => performance.getEntriesByName('scene-start').length > 0, null, { timeout: 15_000 });
  await page.waitForTimeout(1000); // let the beacon load and report
  expect(problems).toEqual([]);
});

test('security headers are in place', async ({ request }) => {
  const h = (await request.get('/')).headers();
  expect(h['content-security-policy']).toMatch(/default-src 'none'/);
  expect(h['content-security-policy']).toContain('https://static.cloudflareinsights.com');
  expect(h['strict-transport-security']).toMatch(/max-age=\d+/);
  expect(h['x-content-type-options']).toBe('nosniff');
});

test('plain HTTP redirects to HTTPS, and reserved paths answer 404', async ({ request, baseURL }) => {
  const http = baseURL.replace(/^https:/, 'http:');
  const res = await request.get(`${http}/a/x?q=1`, { maxRedirects: 0 });
  expect(res.status()).toBe(301);
  expect(res.headers()['location']).toBe(`${baseURL}/a/x?q=1`);
  expect((await request.get('/a/x')).status()).toBe(404);
});

test('DNSSEC validates', async ({ request, baseURL }) => {
  const host = new URL(baseURL).hostname;
  const res = await request.get(`https://cloudflare-dns.com/dns-query?name=${host}&type=A`, { headers: { accept: 'application/dns-json' } });
  const body = await res.json();
  expect(body.Status, 'NOERROR').toBe(0);
  expect(body.AD, 'answer authenticated').toBe(true);
  expect(body.Answer?.length).toBeGreaterThan(0);
});

test('the TLS certificate has more than 14 days left', async ({ baseURL }) => {
  const host = new URL(baseURL).hostname;
  const validTo = await new Promise((resolve, reject) => {
    const socket = connect({ host, port: 443, servername: host }, () => {
      resolve(new Date(socket.getPeerCertificate().valid_to));
      socket.end();
    });
    socket.on('error', reject);
  });
  const days = (validTo - Date.now()) / 86_400_000;
  expect(days, `certificate expires ${validTo.toISOString()}`).toBeGreaterThan(14);
});

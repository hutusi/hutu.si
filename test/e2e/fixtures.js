// The shared test fixture: every test fails if the page logs a console error, throws, violates
// the CSP, or requests anything from another origin. A test that provokes an error on purpose
// (a failed image, say) names what it expects with `test.use({ allow: /…/ })`.
import { test as base, expect } from '@playwright/test';

export { expect };

export const test = base.extend({
  allow: [null, { option: true }], // a RegExp of messages a test expects

  page: async ({ page, baseURL, allow }, use, testInfo) => {
    const origin = new URL(baseURL).origin;
    const problems = [];
    const report = (text) => allow?.test(text) || problems.push(text);
    page.on('console', (m) => m.type() === 'error' && report(`console error: ${m.text()}`));
    page.on('pageerror', (e) => report(`page error: ${e.message}`));
    page.on('request', (r) => {
      const url = r.url();
      if (/^https?:/.test(url) && new URL(url).origin !== origin) report(`request to another origin: ${url}`);
    });
    await page.addInitScript(() =>
      document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`)),
    );
    await use(page);
    // After a failure the report's own screenshot can trip the CSP in WebKit; the failure already says enough.
    if (testInfo.status === testInfo.expectedStatus) {
      expect(problems, 'console errors, page errors, CSP violations or requests to other origins').toEqual([]);
    }
  },
});

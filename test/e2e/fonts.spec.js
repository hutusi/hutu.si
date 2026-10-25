// Text shows at once in a metric-matched local fallback, and nothing moves when the web fonts
// swap in. The fallbacks are local fonts (Times New Roman, Songti SC, or Noto on other systems);
// where none is installed the comparison would be meaningless, so the test skips.
import { expect, test } from './fixtures.js';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

// The start (left and top) of each text box that must not move: name, role, link values, email.
// Link labels may re-space (vertical Zhuque on phones; small caps wait for their font).
const starts = (page, face) =>
  page.evaluate((face) => {
    const out = {};
    for (const el of document.querySelectorAll(`${face} .name, ${face} .role, ${face} .links .v, ${face} .mail`)) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()].filter((r) => r.width && r.height);
      out[el.textContent.trim()] = [Math.min(...rects.map((r) => r.left)), Math.min(...rects.map((r) => r.top))];
    }
    return out;
  }, face);

for (const [locale, face] of [['zh-CN', '#front'], ['en-US', '#back']]) {
  test.describe(locale, () => {
    test.use({ locale });

    test('text stays put when the web fonts arrive', async ({ page, browserName }) => {
      const vertical = locale === 'zh-CN' && page.viewportSize().width / page.viewportSize().height <= 0.9;
      test.skip(
        browserName === 'firefox' && vertical,
        'Known limitation: Firefox places vertical CJK text by the font\'s own vertical metrics, which @font-face overrides do not reach, so the vertical Chinese text shifts ~5 px as the font swaps (docs/decisions.md)',
      );
      await page.route('**/*.woff2', async (route) => {
        await new Promise((ok) => setTimeout(ok, 1000));
        await route.continue();
      });
      await page.addInitScript(() => {
        window.__cls = 0;
        try {
          new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__cls += e.value))).observe({ type: 'layout-shift', buffered: true });
        } catch {}
      });
      await page.goto('/?seed=4', { waitUntil: 'commit' });
      await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length > 0);

      const fallbacks = await page.evaluate(async () => {
        const faces = [...document.fonts].filter((f) => /Fallback/.test(f.family));
        await Promise.allSettled(faces.map((f) => f.load()));
        return faces.filter((f) => f.status === 'loaded').map((f) => f.family);
      });
      test.skip(!fallbacks.some((f) => /EB Garamond/.test(f)), `no metric-matched fallback font installed here (${fallbacks.join(', ') || 'none'})`);

      expect(await page.evaluate(() => document.fonts.status), 'measured before the web fonts arrived').toBe('loading');
      const before = await starts(page, face);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
      const after = await starts(page, face);

      // Up to 2.5 px is allowed: a centred line moves by half the small width difference between
      // fallback and web font, and Safari ignores ascent-override/descent-override. The faults
      // this guards against are bigger: an unloaded fallback face, or a line that wraps once the
      // font arrives, moved text by 4 to 12 px.
      for (const [text, [x, y]] of Object.entries(before)) {
        expect(Math.abs(after[text][0] - x), `"${text}" moved sideways`).toBeLessThan(2.5);
        expect(Math.abs(after[text][1] - y), `"${text}" moved up or down`).toBeLessThan(2.5);
      }
      if (browserName === 'chromium') expect(await page.evaluate(() => window.__cls)).toBeLessThan(0.001);
    });
  });
}

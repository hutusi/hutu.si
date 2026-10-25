// The logo seal: fetched first, held by a placeholder disc in its own tones, faded in on load.
import { expect, test } from './fixtures.js';
import { hold } from './helpers.js';

test.use({ locale: 'en-US', contextOptions: { reducedMotion: 'reduce' } }); // the back face's seal has no intro

const seal = (page) => page.locator('#back .seal');
const img = (page) => page.locator('#back .seal img');

test('the logo is requested first, at high priority, matching the image', async ({ page }) => {
  await page.goto('/');
  const first = page.locator('head link[rel=preload]').first();
  await expect(first).toHaveAttribute('as', 'image');
  await expect(first).toHaveAttribute('fetchpriority', 'high');
  await expect(first).toHaveAttribute('imagesrcset', (await img(page).getAttribute('srcset')) ?? '');
  await expect(img(page)).toHaveAttribute('fetchpriority', 'high');
});

test('a slow logo shows the placeholder disc, then fades in', async ({ page }) => {
  const releaseLogo = await hold(page, /logo-\d+/);
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length > 0);
  await expect(seal(page)).toHaveClass(/\bwait\b/);
  await expect(img(page)).toHaveCSS('opacity', '0');
  await expect(seal(page)).toHaveCSS('background-image', /radial-gradient/);
  releaseLogo();
  await expect(seal(page)).not.toHaveClass(/\bwait\b/);
  await expect(img(page)).toHaveCSS('opacity', '1');
});

test.describe('a logo that fails', () => {
  test.use({ allow: /Failed to load resource|logo-\d+|ERR_FAILED/i });

  test('leaves the placeholder disc', async ({ page }) => {
    await page.route(/logo-\d+/, (route) => route.abort());
    await page.goto('/');
    await expect(seal(page)).toHaveClass(/\bwait\b/);
    await expect(img(page)).toHaveCSS('opacity', '0');
  });

  test('leaves the disc even when it fails before the page script runs', async ({ page }) => {
    // Hold the parser just before boot.js with a slow script, and fail the logo at once.
    await page.route('**/', async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace('</main>', '</main><script src="/slow.js"></script>');
      await route.fulfill({ response, body });
    });
    await page.route('**/slow.js', async (route) => {
      await new Promise((ok) => setTimeout(ok, 800));
      await route.fulfill({ contentType: 'text/javascript', body: 'window.__failedFirst = [...document.querySelectorAll(".seal img")].every((i) => i.complete && !i.naturalWidth);' });
    });
    await page.route(/logo-\d+/, (route) => route.abort());
    await page.goto('/');
    expect(await page.evaluate(() => window.__failedFirst)).toBe(true);
    await expect(seal(page)).toHaveClass(/\bwait\b/);
    await expect(img(page)).toHaveCSS('opacity', '0');
  });
});

test('without JavaScript the logo simply shows', async ({ browser, baseURL, browserName }) => {
  test.skip(browserName === 'firefox', 'Playwright cannot inspect a Firefox page with JavaScript turned off');
  const context = await browser.newContext({ javaScriptEnabled: false, locale: 'en-US', baseURL });
  const page = await context.newPage();
  await page.goto('/');
  await expect(img(page)).toHaveJSProperty('complete', true);
  expect(await img(page).evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
  await expect(img(page)).toHaveCSS('opacity', '1');
  await context.close();
});

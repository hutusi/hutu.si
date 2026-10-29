// How the card fits the screen: the stage is scaled to fit (at most 1.5×), cropped to a readable
// core on small screens, and switches to the tall composition on portrait screens.
import { expect, test } from './fixtures.js';
import { open } from './helpers.js';

test.use({ locale: 'zh-CN', contextOptions: { reducedMotion: 'reduce' } });
test.skip(({ isMobile, hasTouch }) => isMobile || hasTouch, 'the screen-size matrix runs in the desktop projects');

const SIZES = [
  [1280, 800], [1920, 1080], [2560, 1440], [1280, 600], [1024, 640],
  [844, 390], [667, 375], [568, 320], // phones held sideways
  [390, 844], [360, 740], [820, 1180], // portrait
];

const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const inside = (r, w, h) => r.x >= -0.5 && r.y >= -0.5 && r.x + r.width <= w + 0.5 && r.y + r.height <= h + 0.5;

for (const [width, height] of SIZES) {
  test(`${width}×${height}: the card, "Watch again" and the language switch fit on screen`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page);
    const card = await page.locator('#card').boundingBox();
    const again = await page.locator('#again').boundingBox();
    const lang = await page.locator('#lang').boundingBox();
    expect(inside(card, width, height), 'card on screen').toBe(true);
    // "Watch again" once fell below the fold on phones held sideways.
    expect(inside(again, width, height), '"Watch again" on screen').toBe(true);
    expect(overlap(card, again), '"Watch again" clear of the card').toBe(false);
    expect(inside(lang, width, height), 'the language switch on screen').toBe(true);
    expect(overlap(card, lang), 'the language switch clear of the card').toBe(false);
    expect(overlap(again, lang), 'the language switch clear of "Watch again"').toBe(false);
    const tall = width / height <= 0.9;
    expect(card.height > card.width, 'tall composition on portrait screens').toBe(tall);
  });
}

test('the stage scales up to 1.5× and no further', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await open(page, { scene: false });
  expect(await page.evaluate(() => window.hutuStage.s)).toBe(1.5);
  await page.setViewportSize({ width: 3840, height: 2160 });
  await expect.poll(() => page.evaluate(() => window.hutuStage.s)).toBe(1.5);
  const card = await page.locator('#card').boundingBox();
  expect(card.width).toBeCloseTo(620 * 1.5, 0);
});

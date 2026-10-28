// The ink plum scene behind the card: when it starts, that it is seeded, and that it stops
// drawing when nothing moves, with reduced motion, and in a hidden tab; and the magpie's
// reactions to the pointer and to taps.
import { expect, test } from './fixtures.js';
import { birdBox, canvasHash, countFrames, hold, open } from './helpers.js';

test.use({ locale: 'zh-CN' });

const frames = (page) => page.evaluate(() => window.__frames);
const settle = (page, ms) => page.waitForTimeout(ms); // a pause to count frames over, not an assertion

test('starts only after the card has painted and its fonts have arrived', async ({ page }) => {
  const releaseFonts = await hold(page, '**/*.woff2');
  // Note the state of the page at the moment the scene's script is added.
  await page.addInitScript(() => {
    new MutationObserver((records, observer) => {
      for (const r of records) for (const n of r.addedNodes) {
        if (n.tagName === 'SCRIPT' && n.type === 'module') {
          window.__atScene = { painted: performance.getEntriesByName('first-contentful-paint').length > 0, fonts: document.fonts.status };
          observer.disconnect();
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length > 0);
  await settle(page, 1000); // time for a premature start to show itself
  expect(await page.evaluate(() => window.__atScene), 'no scene while the fonts are still loading').toBeUndefined();
  releaseFonts();
  await page.waitForFunction(() => performance.getEntriesByName('scene-start').length > 0);
  expect(await page.evaluate(() => window.__atScene)).toEqual({ painted: true, fonts: 'loaded' });
  await expect(page.locator('canvas.layer')).toHaveCount(5);
});

test.describe('with reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('a seed always draws the same branch, and another seed a different one', async ({ page }) => {
    await open(page, { seed: 7 });
    const first = await canvasHash(page);
    await page.reload();
    await page.locator('#again').waitFor({ state: 'visible' });
    expect(await canvasHash(page)).toBe(first);
    await open(page, { seed: 8 });
    expect(await canvasHash(page)).not.toBe(first);
  });

  test('the finished scene holds still', async ({ page }) => {
    await page.addInitScript(countFrames);
    await open(page);
    await settle(page, 1000);
    const before = await frames(page);
    await settle(page, 2000);
    expect(await frames(page)).toBe(before);
  });

  test('a tap on the magpie moves nothing, and the pointer stays an arrow over it', async ({ page, hasTouch }) => {
    await page.addInitScript(countFrames);
    await open(page);
    await settle(page, 1000);
    const bird = await birdBox(page);
    const before = await frames(page);
    if (hasTouch) await page.touchscreen.tap(bird.x, bird.y);
    else {
      await page.mouse.move(bird.x, bird.y);
      expect(await page.evaluate(() => document.documentElement.style.cursor)).toBe('');
      await page.mouse.down();
      await page.mouse.up();
    }
    await settle(page, 1500);
    expect(await frames(page)).toBe(before);
  });

  test('turning reduced motion off brings the magpie back to life', async ({ page }) => {
    await page.addInitScript(countFrames);
    await open(page);
    await settle(page, 1000);
    const before = await frames(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect.poll(() => frames(page), { timeout: 5000 }).toBeGreaterThan(before);
  });

  test('"Watch again" grows a new branch, from the keyboard too', async ({ page }) => {
    await open(page);
    const first = await canvasHash(page);
    await page.locator('#again').focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => canvasHash(page)).not.toBe(first);
  });
});

test('a hidden tab draws nothing, and drawing resumes when it is shown', async ({ page }) => {
  await page.addInitScript(countFrames);
  await page.goto('/?seed=4');
  await page.waitForFunction(() => performance.getEntriesByName('scene-start').length > 0);
  const setHidden = (hidden) =>
    page.evaluate((hidden) => {
      Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: hidden ? 'hidden' : 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await setHidden(true);
  await settle(page, 200);
  const before = await frames(page);
  await settle(page, 1500);
  expect(await frames(page)).toBe(before);
  await setHidden(false);
  await expect.poll(() => frames(page)).toBeGreaterThan(before);
});

test.describe('the magpie', () => {
  // The branch grows for about 16 s and the bird takes about 6 s to fly in and land; a fake clock
  // runs through that, and through its time away, faster than real time. Every frame is still
  // drawn, which takes WebKit a while.
  test.slow();
  const perched = async (page) => {
    await page.clock.install();
    await open(page);
    await page.clock.runFor(24_000);
    const bird = await birdBox(page);
    expect(bird, 'no magpie on the branch').not.toBeNull();
    return bird;
  };

  test('the pointer turns to a hand over it', async ({ page, hasTouch }) => {
    test.skip(hasTouch, 'no pointer to hover on a touch screen');
    const bird = await perched(page);
    const cursor = () => page.evaluate(() => document.documentElement.style.cursor);
    await page.mouse.move(bird.x, bird.y);
    expect(await cursor()).toBe('pointer');
    await page.mouse.move(bird.x, bird.y + 200);
    expect(await cursor()).toBe('');
  });

  test('taps startle it until it flies off, and it comes back to its perch', async ({ page, hasTouch }) => {
    const perch = await perched(page);
    // A flutter, then hops along the branch, then off (sooner if it is cornered at the tip).
    for (let taps = 0, bird = perch; bird && taps < 4; taps++, bird = await birdBox(page)) {
      if (hasTouch) await page.touchscreen.tap(bird.x, bird.y);
      else await page.mouse.click(bird.x, bird.y);
      await page.clock.runFor(3_000);
    }
    expect(await birdBox(page), 'still on the branch after four taps').toBeNull();
    await page.clock.runFor(17_000);
    const back = await birdBox(page);
    expect(back, 'never came back').not.toBeNull();
    expect(Math.abs(back.y - perch.y)).toBeLessThan(30);
    expect(Math.abs(back.x - perch.x)).toBeLessThan(150); // it may face the other way now
  });
});

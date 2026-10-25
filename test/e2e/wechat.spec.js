// The WeChat QR popup and the icon row it sits in.
import { expect, test } from './fixtures.js';
import { glyphCentres, open } from './helpers.js';

test.use({ locale: 'zh-CN', contextOptions: { reducedMotion: 'reduce' } });

const button = (page) => page.locator('#front .wx button');
const popup = (page) => page.locator('#front .pop');

test('click or tap toggles the popup, and the button says so', async ({ page, hasTouch }) => {
  await open(page, { scene: false });
  const press = () => (hasTouch ? button(page).tap() : button(page).click());
  await expect(button(page)).toHaveAttribute('aria-expanded', 'false');
  await press();
  await expect(popup(page)).toBeVisible();
  await expect(button(page)).toHaveAttribute('aria-expanded', 'true');
  await press();
  await expect(popup(page)).toBeHidden();
  await expect(button(page)).toHaveAttribute('aria-expanded', 'false');
});

test('a tap elsewhere or Escape closes it', async ({ page }) => {
  await open(page, { scene: false });
  await button(page).click();
  await expect(popup(page)).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(popup(page)).toBeHidden();
  await button(page).click();
  await expect(popup(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popup(page)).toBeHidden();
  await expect(button(page)).toHaveAttribute('aria-expanded', 'false');
});

test('it opens from the keyboard', async ({ page }) => {
  await open(page, { scene: false });
  await button(page).focus();
  await page.keyboard.press('Enter');
  await expect(popup(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popup(page)).toBeHidden();
});

test.describe('with a mouse', () => {
  test.skip(({ hasTouch }) => hasTouch, 'hover needs a mouse');

  test('hover previews it, and Escape dismisses it even while hovering', async ({ page }) => {
    await open(page, { scene: false });
    await button(page).hover();
    await expect(popup(page)).toBeVisible();
    await expect(button(page)).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Escape');
    await expect(popup(page)).toBeHidden();
    // Leaving and coming back previews it again.
    await page.mouse.move(5, 5);
    await button(page).hover();
    await expect(popup(page)).toBeVisible();
  });
});

test('the popup stays on screen and points down at the icon', async ({ page }) => {
  await open(page, { scene: false });
  await button(page).click();
  await expect(popup(page)).toBeVisible();
  await popup(page).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished))); // it slides up as it fades in
  const pop = await popup(page).boundingBox();
  const { width, height } = page.viewportSize();
  expect(pop.x).toBeGreaterThanOrEqual(0);
  expect(pop.y).toBeGreaterThanOrEqual(0);
  expect(pop.x + pop.width).toBeLessThanOrEqual(width);
  const [, , wechat] = await glyphCentres(page, '#front');
  const tip = await popup(page).evaluate((el) => el.getBoundingClientRect().bottom + parseFloat(getComputedStyle(el, '::after').height) * 0.71);
  expect(tip).toBeLessThan(wechat.top);
  expect(wechat.top - tip).toBeLessThan(12);
  expect(Math.abs(pop.x + pop.width / 2 - wechat.x)).toBeLessThan(1);
  expect(pop.y + pop.height).toBeLessThan(height);
});

test('the icons line up on both sides of the card', async ({ page }) => {
  // In WebKit the WeChat icon once sat a box-height below the others (an empty <button>'s
  // baseline is its middle there, its bottom in Chrome).
  await open(page, { scene: false });
  for (const face of ['#front', '#back']) {
    const ys = (await glyphCentres(page, face)).map((g) => g.y);
    expect(Math.max(...ys) - Math.min(...ys), `${face} icon row`).toBeLessThan(0.75);
  }
});

// The card itself: which side shows first, flipping (pointer and keyboard), what assistive
// technology can reach, the links, and the intro on a repeat visit.
import { expect, test } from './fixtures.js';
import { open } from './helpers.js';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

const SIDES = [
  {
    locale: 'zh-CN', shown: '#front', hidden: '#back', lang: 'zh-Hans', name: '胡智勇',
    tree: `
      - heading "胡智勇" [level=1]
      - paragraph: /开发者 ?[·・] ?写作者/
      - list:
        - listitem:
          - link "博客 胡涂说"
        - listitem:
          - link "周刊 好奇心周刊"
        - listitem:
          - link "作品 ainaive.com"
      - link "GitHub"
      - link "X"
      - button "微信公众号「胡涂说」"
      - link "me@hutu.si"`,
  },
  {
    locale: 'en-US', shown: '#back', hidden: '#front', lang: 'en', name: 'John Hu',
    tree: `
      - heading "John Hu" [level=1]
      - paragraph: Builder · Writer
      - list:
        - listitem:
          - link "blog hutusi.com"
        - listitem:
          - link "newsletter Curiosity Weekly"
        - listitem:
          - link "projects ainaive.com"
      - link "GitHub"
      - link "X"
      - button "WeChat official account 胡涂说"
      - link "me@hutu.si"`,
  },
];

for (const side of SIDES) {
  test.describe(`${side.locale} visitor`, () => {
    test.use({ locale: side.locale });

    test('sees their own language first, and only that side is reachable', async ({ page, browserName }) => {
      await open(page, { scene: false });
      await expect(page.locator('html')).toHaveAttribute('lang', side.lang);
      await expect(page.locator(side.hidden)).toHaveAttribute('inert', '');
      await expect(page.locator(side.shown)).not.toHaveAttribute('inert');
      await expect(page.locator(`${side.shown} h1`)).toHaveText(side.name);

      // Nothing on the hidden side can take focus.
      await page.locator(`${side.hidden} a`).first().evaluate((a) => a.focus());
      expect(await page.evaluate((h) => document.activeElement.closest(h) === null, side.hidden)).toBe(true);

      // Chromium's real accessibility tree leaves the hidden side out.
      if (browserName === 'chromium') {
        const cdp = await page.context().newCDPSession(page);
        const { nodes } = await cdp.send('Accessibility.getFullAXTree');
        const headings = nodes.filter((n) => n.role?.value === 'heading' && !n.ignored).map((n) => n.name?.value);
        expect(headings).toEqual([side.name]);
      }
    });

    test('can flip the card with a click or tap, and back', async ({ page, hasTouch }) => {
      await open(page, { scene: false });
      const name = page.locator(`${side.shown} h1`);
      if (hasTouch) await name.tap();
      else await name.click();
      await expect(page.locator(side.shown)).toHaveAttribute('inert', '');
      await expect(page.locator(side.hidden)).not.toHaveAttribute('inert');
      await expect(page.locator('html')).toHaveAttribute('lang', side.lang === 'en' ? 'zh-Hans' : 'en');
      await page.locator(`${side.hidden} h1`).click();
      await expect(page.locator(side.shown)).not.toHaveAttribute('inert');
    });

    test('the visible side has a clear accessible structure', async ({ page }) => {
      await open(page, { scene: false });
      await expect(page.locator(side.shown)).toMatchAriaSnapshot(side.tree);
    });

    test('links go where they say', async ({ page }) => {
      await open(page, { scene: false });
      const face = page.locator(side.shown);
      const hrefs = await face.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      expect(hrefs).toEqual([
        'https://hutusi.com',
        'https://hutusi.substack.com/',
        'https://ainaive.com',
        'https://github.com/hutusi',
        'https://x.com/hutusi',
        'mailto:me@hutu.si',
      ]);
    });
  });
}

test.describe('keyboard', () => {
  test.use({ locale: 'zh-CN' });

  test('the flip button appears on focus and flips with Enter and Space', async ({ page, browserName }) => {
    await open(page, { scene: false });
    const turn = page.locator('#turn');
    await expect(turn).toHaveCSS('opacity', '0');
    // It is the first stop when tabbing in (Safari reaches buttons with Option-Tab).
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    await expect(turn).toBeFocused();
    await expect(turn).toHaveCSS('opacity', '1');
    await expect(turn).toHaveAccessibleName(/Flip to English/);
    await page.keyboard.press('Enter');
    await expect(page.locator('#front')).toHaveAttribute('inert', '');
    await expect(turn).toHaveAccessibleName(/Flip to Chinese/);
    await page.keyboard.press('Space');
    await expect(page.locator('#front')).not.toHaveAttribute('inert');
  });
});

test.describe('repeat visit', () => {
  test.use({ locale: 'zh-CN', contextOptions: { reducedMotion: 'no-preference' } });

  test('plays the intro once per session', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).not.toHaveClass(/\bseen\b/);
    await expect(page.locator('#card')).not.toHaveCSS('animation-name', 'none');
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/\bseen\b/);
    await expect(page.locator('#card')).toHaveCSS('animation-name', 'none');
  });
});

test('without JavaScript, both sides are readable, each in its own language', async ({ browser, baseURL, browserName }) => {
  test.skip(browserName === 'firefox', 'Playwright cannot inspect a Firefox page with JavaScript turned off');
  // What a crawler or agent that doesn't run scripts gets.
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('section[lang="zh-Hans"] h1')).toHaveText('胡智勇');
  await expect(page.locator('section[lang="en"] h1')).toHaveText('John Hu');
  for (const lang of ['zh-Hans', 'en']) {
    await expect(page.locator(`section[lang="${lang}"] a[rel~="me"]`)).toHaveCount(6);
    await expect(page.locator(`section[lang="${lang}"]`)).not.toHaveAttribute('inert');
  }
  await context.close();
});

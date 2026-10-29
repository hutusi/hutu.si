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

  test('the language switch shows the side you are on, is the first stop, and flips with Enter and Space', async ({ page, browserName }) => {
    await open(page, { scene: false });
    const lang = page.locator('#lang');
    const turn = page.locator('#turn');
    const now = page.locator('#now');
    // Always "中文 / English": the side you're on as text, the other as the button.
    const order = async () => (await now.boundingBox()).x < (await turn.boundingBox()).x ? 'now first' : 'turn first';
    await expect(lang).toBeVisible();
    await expect(now).toHaveText('中文');
    await expect(turn).toHaveAccessibleName('English');
    await expect(turn).toHaveAttribute('lang', 'en');
    expect(await order()).toBe('now first');
    // It is the first stop when tabbing in (Safari reaches buttons with Option-Tab).
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    await expect(turn).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#front')).toHaveAttribute('inert', '');
    await expect(now).toHaveText('English');
    await expect(turn).toHaveAccessibleName('中文');
    await expect(turn).toHaveAttribute('lang', 'zh-Hans');
    expect(await order()).toBe('turn first');
    // Focus stays on it, so the same key flips back.
    await expect(turn).toBeFocused();
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
  await expect(page.locator('#lang'), 'a language switch that would do nothing').toBeHidden();
  for (const lang of ['zh-Hans', 'en']) {
    await expect(page.locator(`section[lang="${lang}"] a[rel~="me"]`)).toHaveCount(6);
    await expect(page.locator(`section[lang="${lang}"]`)).not.toHaveAttribute('inert');
  }
  await context.close();
});

// Clicks a side, reads in the same task what changed (which side is reachable), then records
// each frame for a while: the turn, the card's box and its tilt, the faces' state. Frame rates
// vary under load, so the checks are on what must hold in every frame and at the end, plus the
// transitions the CSS declares; the fade itself was checked frame by frame when it was built.
const flipAndWatch = (page, from, ms) =>
  page.evaluate(
    async ({ from, ms }) => {
      const $ = (s) => document.querySelector(s);
      const box = () => (({ x, y, width, height }) => [x, y, width, height].map((v) => v.toFixed(2)).join())($('#card').getBoundingClientRect());
      const frame = () => ({ flip: getComputedStyle($('.flip')).transform, box: box(), tilt: getComputedStyle($('.tilt')).transform, back: getComputedStyle($('#back')).opacity });
      const before = frame();
      $(`${from} h1`).click();
      const at = { inert: { front: $('#front').inert, back: $('#back').inert }, lang: document.documentElement.lang, label: $('#turn').textContent, front: getComputedStyle($('#front')).visibility };
      const frames = [frame()];
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        await new Promise(requestAnimationFrame);
        frames.push(frame());
      }
      const style = (el) => (({ transitionProperty, transitionDuration, transitionDelay }) => ({ transitionProperty, transitionDuration, transitionDelay }))(getComputedStyle(el));
      return { before, at, frames, declared: { flip: style($('.flip')), front: style($('#front')), back: style($('#back')) } };
    },
    { from, ms },
  );
// The duration (or delay) a computed style declares for one property's transition.
const declared = (style, property, field = 'transitionDuration') =>
  style[field].split(',').map((d) => d.trim())[style.transitionProperty.split(',').map((p) => p.trim()).indexOf(property)];
const end = (page) => page.evaluate(() => ['#front', '#back'].map((s) => ((st) => `${st.opacity}/${st.visibility}`)(getComputedStyle(document.querySelector(s)))));

test.describe('flipping with reduced motion', () => {
  test.use({ locale: 'zh-CN', contextOptions: { reducedMotion: 'reduce' } });

  test('cross-fades the sides in place over 0.3 s, switching the accessible side at once', async ({ page }) => {
    await open(page, { scene: false });

    // To English: the accessible side switches at once, the front stays under the fading back,
    // and the card neither turns, moves, scales nor lifts in any frame.
    let w = await flipAndWatch(page, '#front', 500);
    expect(w.at.inert).toEqual({ front: true, back: false });
    expect(w.at.lang).toBe('en');
    expect(w.at.label).toBe('中文');
    expect(declared(w.declared.back, 'opacity')).toBe('0.3s');
    expect(declared(w.declared.front, 'visibility', 'transitionDelay'), 'the front hides only once covered').toBe('0.3s');
    for (const f of w.frames) {
      expect(f.flip, 'no turn').toBe('none');
      expect(f.box, 'no movement or scaling').toBe(w.before.box);
      expect(f.tilt, 'no lift').toBe(w.before.tilt);
    }
    await expect.poll(() => end(page)).toEqual(['1/hidden', '1/visible']); // front hidden, back shown

    // And back: the front is there at once; the back fades out over it and is then hidden.
    w = await flipAndWatch(page, '#back', 500);
    expect(w.at.inert).toEqual({ front: false, back: true });
    expect(w.at.lang).toBe('zh-Hans');
    expect(w.at.front).toBe('visible');
    expect(declared(w.declared.back, 'opacity')).toBe('0.3s');
    for (const f of w.frames) {
      expect(f.flip, 'no turn').toBe('none');
      expect(f.box, 'no movement or scaling').toBe(w.before.box);
    }
    await expect.poll(() => end(page)).toEqual(['1/visible', '0/hidden']);
  });
});

test.describe('flipping with motion', () => {
  test.use({ locale: 'zh-CN', contextOptions: { reducedMotion: 'no-preference' } });

  test('turns the card in 3D, and nothing fades', async ({ page }) => {
    await open(page, { scene: false });
    const w = await flipAndWatch(page, '#front', 300);
    expect(declared(w.declared.flip, 'transform')).toBe('0.9s');
    for (const face of [w.declared.front, w.declared.back]) expect(face.transitionProperty).not.toMatch(/opacity/);
    expect(w.frames.every((f) => f.back === '1'), 'neither side fades').toBe(true);
    // It ends half a turn about the vertical axis: matrix3d(-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, …).
    const t = await page.locator('.flip').evaluate(async (el) => {
      await Promise.all(el.getAnimations().map((a) => a.finished));
      const m = getComputedStyle(el).transform;
      return m.slice(m.indexOf('(') + 1, -1).split(',').map(Number);
    });
    expect(t[0]).toBeCloseTo(-1);
    expect(t[10]).toBeCloseTo(-1);
  });
});

// Small page helpers shared by the specs.

// The face the visitor is looking at, and the other one.
export const faces = async (page) => {
  const en = await page.evaluate(() => document.documentElement.classList.contains('en'));
  return en ? { shown: '#back', hidden: '#front' } : { shown: '#front', hidden: '#back' };
};

// Opens the card with a fixed branch, and waits until its fonts and the scene are ready.
export async function open(page, { seed = 4, scene = true } = {}) {
  await page.goto(`/?seed=${seed}`);
  await page.evaluate(() => document.fonts.ready);
  if (scene) await page.locator('#again').waitFor({ state: 'visible' });
}

// The vertical centre of each icon glyph in a face's icon row: GitHub, X, WeChat, email.
export const glyphCentres = (page, face) =>
  page.locator(`${face} .social svg`).evaluateAll((svgs) =>
    svgs.map((s) => {
      const r = s.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top };
    }),
  );

// A fingerprint of a canvas layer's pixels (0 = ink, 1 = flowers, 3 = the magpie).
export const canvasHash = (page, layer = 0) =>
  page.evaluate((i) => {
    const c = document.querySelectorAll('canvas.layer')[i];
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 0;
    for (let k = 0; k < d.length; k += 13) h = (Math.imul(h, 31) + d[k]) | 0;
    return h;
  }, layer);

// Counts the scene's animation frames, from page load on (an init script).
export const countFrames = () => {
  window.__frames = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (f) => raf((t) => (window.__frames++, f(t)));
};

// Holds matching requests until `release()` is called, so a test can look at the page before
// they arrive however slow the machine is (a fixed delay can run out before the first paint).
export async function hold(page, pattern) {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  await page.route(pattern, async (route) => {
    await gate;
    await route.continue();
  });
  return release;
}

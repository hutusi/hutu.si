# Testing

```
test/unit/    node:test, no browser: the branch generator, the build output, font coverage, the RNG
test/e2e/     Playwright: the site in Chromium, WebKit and Firefox, at desktop and phone sizes
test/smoke/   Playwright: the live site (run daily by GitHub Actions)
```

## Running

```sh
npx playwright install chromium webkit firefox   # once, and after a Playwright upgrade
npm run verify                                   # build, unit tests, browser tests: the gate for main
npm run test:unit                                # about 2 s
npm run test:e2e                                 # all six browser projects
npx playwright test --project=webkit-mobile      # one project
npx playwright test wechat.spec.js -g "Escape"   # one file, matching tests
npx playwright test --ui                         # pick and watch tests interactively
npx playwright show-report                       # the last run's HTML report, with screenshots
npm run test:smoke                               # the live site (SMOKE_URL=… for another host)
```

- **Server.** The browser tests build the site and serve it with `wrangler dev` on port 8789.
  That is the real asset routing, `_headers` and Worker, so the CSP and the reserved paths are
  tested too. Locally, an already running server on that port is reused.
- **Projects.** `chromium`, `webkit` and `firefox`, each with `-desktop` (1280×800) and
  `-mobile`:
  - Chromium uses the Pixel 7 profile and WebKit the iPhone 15;
  - Firefox gets 390×844 with touch, since Playwright can't emulate a mobile Firefox.

## What every browser test checks

`test/e2e/fixtures.js` extends Playwright's `page` so that every test fails if the page:

- logs a console error or throws;
- violates the CSP;
- requests anything from another origin.

A test that provokes an error on purpose, such as a failed image, names what it expects with
`test.use({ allow: /…/ })`.

## What guards what

| Behaviour | Where |
|---|---|
| fits the first round trip (HTML ≤ 14 KB gzip), first visit ≤ 150 KB | `npm run build`, `unit/build.test.js` |
| every inline script and style is allowed by the CSP, nothing unsafe | `unit/build.test.js`, plus the fixture in every browser test |
| assets fingerprinted, present, cached for good | `unit/build.test.js`, `e2e/routing.spec.js` |
| every character on the card is in the font subsets | `npm run build`, `unit/charsets.test.js` |
| the branch: full, off the card, enters from off-screen, magpie can perch, seeded | `unit/branch.test.js` |
| visitor's language picks the side; only that side is reachable | `e2e/card.spec.js` |
| flipping by click, tap, Enter and Space; the flip button shows on focus | `e2e/card.spec.js` |
| links, and the accessible structure of each side | `e2e/card.spec.js` |
| intro plays once per session | `e2e/card.spec.js` |
| WeChat popup: tap, outside tap, Escape (also while hovered), keyboard, hover | `e2e/wechat.spec.js` |
| icon row lines up on both sides (the WebKit button-baseline bug) | `e2e/wechat.spec.js` |
| card and "Watch again" on screen at 11 sizes, incl. phones held sideways; 1.5× cap | `e2e/layout.spec.js` |
| text stays put when the web fonts swap in (incl. the 412 px role wrap, Firefox fallbacks) | `e2e/fonts.spec.js` |
| logo: preloaded first, placeholder then fade, failure keeps the disc, works without JS | `e2e/logo.spec.js` |
| scene starts after the card's paint and fonts; seeded; holds still with reduced motion; restarts when it's turned off; stops in a hidden tab; "Watch again" | `e2e/scene.spec.js` |
| security headers, reserved paths, static 404, redirects, caching | `e2e/routing.spec.js` |
| identity: bilingual ProfilePage, `rel="me"`, social tags, robots/sitemap, `llms.txt`, all links in agreement | `unit/identity.test.js` |
| text files served as UTF-8; both sides readable without JavaScript | `e2e/routing.spec.js`, `e2e/card.spec.js` |
| live site: clean load, headers, HTTPS redirect, identity metadata, scripts let in, DNSSEC, certificate | `smoke/production.spec.js` |

`e2e/screenshots.spec.js` attaches screenshots of both sides, with the popup open, to the HTML
report for each project. They are for a person to look over; nothing compares them pixel by
pixel.

## Writing tests

- **Reproducibility.** Open the card with `open(page)` from `helpers.js`: it loads `?seed=4` and
  waits for the fonts and the scene. Use `contextOptions: { reducedMotion: 'reduce' }` unless
  the test is about motion; the intro and the branch then finish at once.
- **Assert geometry and state, not pixels.** Bounding boxes, computed styles, attributes,
  accessible names. Fonts and anti-aliasing differ between systems, so screenshots would be
  flaky.
- **Don't use a fixed wait as an assertion.** Use Playwright's waiting assertions (`expect(…)`
  with a timeout, or `expect.poll`). A plain pause is only for counting animation frames over a
  period, and is commented as such.
- **Skip what a project can't do,** and say why: for example, `test.skip(({ hasTouch }) =>
  hasTouch, 'hover needs a mouse')`.
- **When you fix a bug, add the test that would have caught it.** Then check that the test fails
  without the fix.

## CI

`.github/workflows/ci.yml` runs on every pull request and push to `main`:

- **`check` (Linux):** the build, with the size table in the job summary, then the unit tests.
- **`e2e` (macOS):** one job per engine, each running its desktop and phone projects. macOS
  because the card's metric-matched fallback fonts (Times New Roman, Songti SC) are installed
  there, which the font test needs, and because its WebKit is the engine behind Safari. The HTML
  report, with screenshots and failure traces, is kept for 7 days.
- **Retries.** Two, in CI only; locally a test must pass the first time.

## Known limitations

- **Firefox, vertical Chinese text.** Firefox places it by the font's own vertical metrics, which
  `@font-face` overrides don't reach, so it shifts about 5 px as the fonts swap in. The font test
  skips that one case and says so.
- **Headless WebKit ignores `backface-visibility`** and draws the back of the card mirrored over
  the front. DOM assertions are unaffected; the screenshot test hides the far face.
- **WebKit screenshots** inject a stylesheet that the page's CSP correctly refuses; only the
  screenshot spec allows that message.
- **Firefox with JavaScript off** can't be inspected by Playwright; the no-JavaScript logo test
  runs in Chromium and WebKit.
- **The font test** needs the metric-matched fallback fonts installed. Without them (on most
  Linux systems) it skips.

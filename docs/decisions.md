# Decisions

The decisions that shape hutu.si, why they were made, and what they ask of future changes. Most
are enforced by the build or the tests; the rest rely on whoever changes the code reading this
first.

## 1. No framework, no runtime dependencies

**Decision.** The page is hand-written HTML, CSS and a little JavaScript. Every npm package is a
dev dependency: esbuild, font and image tooling, Playwright, wrangler.

**Why.** The brief put speed first. A framework's runtime would cost more than the whole card
(about 9 KB), and the page has almost no state to manage.

**Keep in mind.** Don't add a runtime library or a request to another domain. The only exception
is the analytics beacon that Cloudflare adds ([13](#13-cloudflare-web-analytics-is-an-accepted-cost)).
The browser tests fail on any request to another origin.

## 2. The card arrives in the first round trip

**Decision.** Everything the card needs is inlined into `index.html`: its CSS, the font
declarations, and two small scripts. The page must stay at or under **14 KB gzip**, and a first
visit at or under **150 KB gzip**. `npm run build` fails above either.

**Why.** About 14 KB is what a new TCP connection delivers in its first round trip. A card that
fits there renders as soon as that first response arrives, with nothing blocking.

**Keep in mind.** Check the size table the build prints, and don't move card CSS into an external
stylesheet. Anything the card doesn't need at first paint belongs in the deferred scene module.

## 3. Card before animation

**Decision.** The scene (branch, magpie, petals) is a separate module. It is added only after the
card's first contentful paint *and* after its fonts have loaded (`boot.js`), never on the load
event.

**Why.** The card is the content; the scene is decoration and shouldn't compete with the card's
fonts for bandwidth. The load event is the wrong signal in both directions:

- font preloads don't hold it back, so it can fire before the fonts arrive;
- the analytics beacon can hold it back for seconds.

A fast or cached load can also finish before the first paint. Waiting for the paint guarantees
the card is on screen first.

**Keep in mind.** Don't move scene work into `head.js` or `boot.js`, and don't trigger the scene
from `load` or `DOMContentLoaded`. A browser test checks that the scene starts after the paint
and the fonts.

## 4. Self-hosted, subset fonts that swap without moving anything

**Decision.**
- **Subsets.** Four families are self-hosted and subset to exactly the characters on the card
  (`npm run fonts`).
- **Sources.** They are pinned and sha256-checked; the subsets are committed and preloaded.
- **Display.** They use `font-display: swap`. Text shows at once in local fallback faces whose
  metrics are matched to the web fonts (capsize for Latin, pinned vertical metrics for CJK).
- **Firefox.** `head.js` loads those fallback faces explicitly, because Firefox ignores a
  local() face until something loads it.
- **Small caps.** The English small-caps labels use a `block` alias, so a faux small-caps
  fallback never shows.

**Why.** Google Fonts would mean another domain and a render-blocking stylesheet. Unsubset CJK
fonts run to megabytes. The brief asked for text to show immediately, with no shift when fonts
arrive.

**Keep in mind.**
- After changing text, run `npm run fonts`; the build fails on a missing character.
- Keep fixed sizes fixed: the vertical text's lengths and the label column are pinned in
  `align.css`.
- Swapping a font needs new fallback metrics (`scripts/fonts.mjs`) and a new alignment pass.
- Known limitation: Firefox places vertical CJK text by the font's own vertical metrics, which
  `@font-face` overrides don't reach. In Firefox, the vertical Chinese text on phones shifts
  about 5 px when the fonts arrive. Every other engine and layout stays within about 2 px.

## 5. Optical alignment is measured once, not at runtime

**Decision.** The design measured glyph ink at runtime to align the debossed wordmark, the seal
and the name. `npm run align` does those measurements once, in Chrome with the real fonts, and
writes the results to `src/align.css`. It also pins sizes that would otherwise change when the
fonts swap in.

**Why.** Measuring at runtime means waiting for the fonts and then moving things, which is
exactly the layout shift to avoid.

**Keep in mind.** Run `npm run align` after any change to text, sizes or fonts, and commit
`src/align.css`. The script measures natural sizes, so it never just copies its previous output.

## 6. Fit with CSS zoom, capped at 1.5, cropped to a readable core

**Decision.**
- **Fit.** The design's fixed stage is scaled to fit the viewport and capped at 1.5×.
- **Readable core.** Below 0.8× it stops shrinking and crops to a core: the card, plus room for
  "Watch again".
- **Zoom.** Scaling uses CSS `zoom`, set before the first paint.

**Why.** It keeps the design's proportions on any screen without separate layouts per size.
`zoom` keeps text crisp where `transform: scale` blurs it in Safari's 3D layers. The cap keeps
the card from looking blown up on large monitors.

**Keep in mind.** Anything that must stay on screen belongs in the core. The browser tests check
eleven screen sizes, including phones held sideways.

## 7. Two compositions, chosen by aspect ratio

**Decision.** **Wide** (1280×800) for landscape-ish screens and **tall** (390×844) for portrait
ones, switching at an aspect ratio of 9/10. One DOM serves both. In the tall composition, the
Chinese face sets its text vertically.

**Why.** These are the two designs. Splitting by aspect ratio rather than by width keeps tablets
and phones held sideways sensible.

**Keep in mind.** Changes to card CSS usually need doing in both compositions; the tall rules
live in one media query at the end of `critical.css`.

## 8. A seeded scene that sleeps

**Decision.**
- **Seeded.** One seeded RNG drives every random choice, and `?seed=N` reproduces a branch.
- **Off-screen starts.** Limbs start beyond the screen's edge.
- **Sleeping loop.** The frame loop runs only while something moves. It sleeps otherwise, wakes
  for the bird's next event, and stops while the tab is hidden.
- **Light mode on phones.** Fewer petals, and no continuous breathing.

**Why.** It's reproducible for the social preview and the tests, and cheap on batteries: an idle
page draws nothing.

**Keep in mind.**
- Unit tests check the generator over hundreds of seeds and screens: a full branch, no flowers
  on the card, and a perch for the magpie.
- `npm run og` uses seed 4, so changing the generator changes the preview.
- Anything new that moves must report itself as busy, or the loop will sleep through it.

## 9. Accessibility

**Decision.**
- **Real content.** Real text, headings, lists and links.
- **One side at a time.** The hidden side is `inert`, and `<html lang>` follows the visible side.
- **Keyboard.** The language switch is always shown and is the first stop when tabbing in. (Shown,
  it also tells mouse and touch visitors that there is another side.) The popup works by keyboard
  and closes with Escape, even while hovered.
- **Motion and contrast.** Reduced motion shows the finished scene, still, and the card doesn't
  turn when flipped: its sides cross-fade in place over 0.3 s. Small text meets WCAG AA
  contrast.

**Why.** It's a calling card: it has to work for everyone, and a screen reader should hear one
language at a time.

**Keep in mind.** The browser tests check the accessible structure of the visible side, that
nothing on the hidden side can take focus, and keyboard flipping.

## 10. A static-first Worker, with short-link paths reserved

**Decision.** It is a Cloudflare Worker with static assets, not Pages. Only `/a`, `/w` and `/t`
(and below) run Worker code; for now they answer 404. Everything else, including the 404 page,
is served by the asset layer.

**Why.** Static files from the edge never run or bill Worker code. The prefixes are kept free
for future short links.

**Keep in mind.** Don't add routes to `run_worker_first` casually; each one runs code on every
request. Worker responses don't get `_headers`, so `src/worker.js` sets its own headers,
including the CSP.

## 11. A strict, hash-based CSP

**Decision.** `default-src 'none'`. Scripts and styles are allowed only by the sha256 hashes the
build computes, plus same-origin files. The analytics beacon is allowed explicitly
(`static.cloudflareinsights.com`, reporting to `/cdn-cgi/rum`). There is no `unsafe-inline`.

**Why.** It's a small, fully known page, so the policy can be exact.

**Keep in mind.**
- Never hand-edit hashes; the build writes them.
- Anything that rewrites the HTML after the build breaks them. That includes Cloudflare zone
  features ([12](#12-cloudflare-zone-settings)). The page then turns unstyled or loses its
  scripts.
- The browser tests and the daily production check fail on any policy violation.

## 12. Cloudflare zone settings

**Decision.**
- **On:** DNSSEC (DS algorithm 13), Always Use HTTPS, Web Analytics (real user monitoring).
- **Off:** Email Obfuscation, Rocket Loader, Automatic HTTPS Rewrites and Zaraz, because they
  rewrite the HTML or add third-party requests.
- **Off:** Browser Integrity Check; AI Crawl Control blocks no crawler (see
  [17](#17-identity-for-search-engines-and-ai-agents)).

**Why.** See [11](#11-a-strict-hash-based-csp). Always Use HTTPS matters because the Worker never
redirects HTTP itself.

**Keep in mind.** These live in the Cloudflare dashboard, not in the repo. The daily production
check catches a setting changed by mistake (see [operations.md](operations.md)).

## 13. Cloudflare Web Analytics is an accepted cost

**Decision.** Keep the zone's real user monitoring, which Cloudflare adds to every HTML response.

**Why.** It gives traffic and real-user performance data without a cookie banner. The cost was
measured and accepted:
- about 10 KB per visit;
- a second domain;
- the page differs from the build by one tag.

It doesn't affect the card's first paint.

**Keep in mind.** It is the one other domain the page may load. The CSP and the tests name it
explicitly.

## 14. The Huiwen Mincho licence

**Decision.** Embed a subset of Huiwen Mincho. It keeps the font's copyright and licence strings
in its name table, and the author's statement is served at `/licenses/HuiwenMincho.txt`.

**Why.** The author's statement allows embedding in electronic documents and devices, and free
redistribution. It's an informal statement rather than a standard licence, so the subset keeps
everything it asks for.

**Keep in mind.** Don't strip the name table when subsetting (`scripts/fonts.mjs` preserves it),
and keep the licence file.

## 15. Engine quirks this code works around

Each of these caused a real bug; each has a test.

- **WebKit puts an empty `<button>`'s baseline in its middle**, where Chrome uses its bottom. In
  a baseline-aligned row the WeChat icon dropped half a box. The wrapper is now the icon box, and
  the button fills it.
- **Zhuque Fangsong has no vertical metrics.** In vertical text, Chrome spaces its characters by
  their line height (about 1.2em), so the vertical labels' lengths are measured with the real
  font, not computed.
- **Layout rounding at fractional zoom** can push a line that exactly fills its space onto a
  second line. The role line is `nowrap`.
- **Firefox ignores a local() fallback face until it's loaded.** `head.js` loads them.
- **Font preloads don't hold the load event back** (see [3](#3-card-before-animation)).

## 16. Tested in three engines, on macOS

**Decision.**
- **Engines.** The browser tests run in Chromium, WebKit and Firefox, at a desktop and a phone
  size.
- **CI on macOS.** They run on GitHub's macOS runners, so the metric-matched fallback fonts are
  present and WebKit is the engine behind Safari.
- **Assertions.** They check geometry and behaviour, not pixels.
- **Deploy gate.** Workers Builds runs the unit tests before every deploy.

**Why.**
- Most of the bugs found so far were engine-specific.
- Pixel comparisons across systems and font renderers would be flaky, while geometry catches the
  same faults.
- The deploy gate stops a broken build reaching production even on a direct push to `main`.

**Keep in mind.** Run `npm run verify` before landing on `main`. When fixing a bug, add the test
that would have caught it. [testing.md](testing.md) maps each test to what it guards.

## 17. Identity for search engines and AI agents

**Decision.** One URL, https://hutu.si/, serves both languages, and tells machines who it
belongs to:

- **Structured data.** JSON-LD in Google's profile-page form: a ProfilePage whose main entity is
  the Person 胡智勇, also known as John Hu and hutusi. It carries:
  - the bio and the roles in both languages, each marked with `@language`;
  - the logo (`/logo.jpg`) as the image;
  - `sameAs` links to every profile.
- **Profile links.** `rel="me"` on every profile link, on both faces.
- **Social tags.** Complete Open Graph and X card tags; `og:locale` is `zh_CN`, with `en_US` as
  alternate.
- **Discovery files.**
  - `robots.txt` allows every crawler and names `sitemap.xml`, which lists the one URL with no
    `lastmod`.
  - `llms.txt` is a plain-text, bilingual introduction with every link.
- **No JavaScript needed.** Both faces' text is in the HTML, each `<section>` with its own `lang`.
- **Reachability.**
  - Text files are served as UTF-8.
  - AI Crawl Control blocks no crawler, and Browser Integrity Check is off. It had refused simple
    clients such as Python's urllib.

**Why.** The goal is identity, not ranking. A search for the name, or an AI asked who hutusi is,
should find an accurate, complete answer in either language that ties the profiles together.
There's no `hreflang`: it describes separate URLs per language, which this site doesn't have.

**Keep in mind.**
- **Four places for each link.** A profile link lives on both faces, in the JSON-LD `sameAs` and
  in `static/llms.txt`; the bio lives in the JSON-LD and `llms.txt`. Change them together; the
  unit tests fail if they disagree.
- **Card text stays in the HTML,** so crawlers and agents never see less than a visitor.

## 18. A service worker for return visits

**Decision.** A small service worker (`src/sw.js`) keeps a copy of the card, so return visits
show it at once, even offline.
- **What's cached.** Exactly the page and its fingerprinted assets, precached all or nothing.
  Navigations to `/` (any query) and `/assets/` files come from the cache: this version's copy,
  else the previous one's (for a page still open on it), else the network. Everything else goes to
  the network untouched: `/a`, `/w`, `/t`, `/cdn-cgi/`, other origins, and anything but GET.
- **Versioning.** The build writes the version and the precache list into `sw.js`. The version
  is a hash of the rest of `sw.js` (its code and precache list), the page and `_headers`. So any
  change to the card or to the headers it is served with changes `sw.js` (a cached page keeps
  the headers it was cached with, CSP included), and `sw.js` never changes without its version.
- **Updates.** Browsers re-check `sw.js` on each visit (it is served `no-cache`). A new copy
  installs in the background, and the next visit shows it. The copy of the version that took
  over before it is kept for pages still open across a deploy. The worker records that order
  itself (a rollback takes over again, so it counts as the newest), and an install stores all
  of its copy or nothing, so a failed update or rollback never touches a complete copy.
- **First visits.** The worker is registered only after the card has painted, the page has
  loaded and the browser is idle.
- **Kill switch.** `ENABLED` in `src/sw.js` (see [operations.md](operations.md#the-service-worker)).

**Why.** Some mainland China networks reach Cloudflare slowly, and the card rarely changes.
Measured locally, return visits show the card in about 0.1 s on Slow 4G and 3G, against 0.36
and 0.78 s cold, with about 1 KB on the wire. First visits are unchanged.

**Keep in mind.**
- **Never widen what's cached** beyond the page and `/assets/`. The short-link paths and
  `/cdn-cgi/` must never be served from the cache.
- **A deploy shows up one visit late.** That is the trade-off for instant visits.
- **Recovering from a bad version:** for a bad *card*, deploy the fix, and it reaches each
  visitor on their second visit. For a bad *worker*, use the kill switch.
- **The scene keeps its timing:** a cached return visit still starts it only after paint and
  fonts.

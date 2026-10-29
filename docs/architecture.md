# Architecture

How hutu.si is served, how the page is put together and loaded, and how the build makes it. The
reasons behind these choices are in [decisions.md](decisions.md).

## Request flow

```
visitor ── https://hutu.si ──▶ Cloudflare edge (zone hutu.si)
                                 │  Always Use HTTPS, DNSSEC, compression (zstd/br/gzip),
                                 │  Web Analytics beacon added to HTML responses
                                 ▼
                         Worker "hutu-si" with static assets (wrangler.jsonc)
                                 ├─ /a, /w, /t and below ─▶ src/worker.js  (reserved: 404 for now)
                                 └─ everything else ─────▶ dist/ served by the asset layer
                                                           (no Worker code runs)
```

- **Static assets.** `dist/` is served directly from the edge. `html_handling:
  auto-trailing-slash` serves `/` for `/index.html` (by redirect), and `not_found_handling:
  404-page` answers unknown paths with `404.html` and a 404 status.
- **Headers.** `_headers` (built from `src/_headers`) applies to asset responses: the CSP, HSTS,
  `nosniff` and the other security headers on everything, and immutable caching on `/assets/*`.
  Every file under `/assets/` has a content hash in its name.
- **The Worker** runs only for the paths reserved for future short links (`run_worker_first`).
  For now it returns the 404 page with `Cache-Control: no-store`, copying the asset's CSP header
  across, because `_headers` doesn't apply to Worker responses.
- **Analytics.** The zone's Web Analytics (real user monitoring) adds a deferred module script
  from `static.cloudflareinsights.com` to HTML responses. It reports to `/cdn-cgi/rum` on the
  same host. The CSP allows exactly that.

## The page

`dist/index.html` is everything the card needs, in one file of about 9 KB gzip:

```
<head>
  meta, title, Open Graph and X card tags, JSON-LD (ProfilePage + Person, both languages)
  <link rel=preload> the logo (fetchpriority=high), then the five font subsets
  <style>   fonts.css + critical.css + align.css, minified
  <script>  head.js
<body>
  SVG sprite of the four icons
  <main class=frame> <div class=stage>
    <div id=lang hidden>  the language switch, "中文 / English" (boot.js shows it)
    <article class=card>  shadow, 9 edge layers,
      <section class="face front" lang=zh-Hans> … <section class="face back" lang=en>
    <button id=again hidden>  "再看一次 · Watch again"
  <script>  boot.js
```

One DOM serves both compositions; CSS rearranges it for the tall one. Both faces' text is in the
HTML, each `<section>` with its own `lang`, so crawlers and agents that don't run JavaScript read
the whole card. For them there are also `robots.txt`, `sitemap.xml`, `llms.txt` (a plain-text,
bilingual introduction) and `logo.jpg`, all in `static/`; see
[decisions.md](decisions.md#17-identity-for-search-engines-and-ai-agents).

## Loading order

1. **HTML, first round trip.** `head.js` runs before the first paint:
   - picks the side: English unless the browser's first language is Chinese;
   - marks a repeat visit in the same session (`html.seen`), which skips the intro;
   - starts loading the metric-matched fallback font faces;
   - fits the stage to the viewport (see [Layout](#layout)).
2. **Preloads.** The logo and the five font subsets are requested from the head, logo first.
3. **First paint.** The card is drawn in the fallback fonts, which are metric-matched so nothing
   moves later. The logo slot shows a placeholder disc until the image arrives, then the logo
   fades in. The intro plays as CSS animations from the first paint: the card rises, the ink
   settles at 0.55 s, the seal stamps at 1.85 s, and the card presses at 2.12 s.
4. **`boot.js`**, at the end of the body:
   - wires up flipping (click, tap, keyboard), the WeChat popups, and the logo fade;
   - after the first contentful paint, waits for `document.fonts.ready`, then adds the scene
     module. It never waits for the load event (see [decisions.md](decisions.md#3-card-before-animation)).
5. **Fonts swap in** with `font-display: swap`. The English small-caps labels use a `block` alias
   instead, so they never show in faux small caps.
6. **The scene** grows the branch for about 16 s, then the magpie flies in and perches. After
   that the loop sleeps whenever nothing moves.
7. **The analytics beacon** loads and reports. It is deferred, so it never touches the card.
8. **The service worker** (`sw.js`) is registered once the card has painted, the page has loaded
   and the browser is idle. It precaches the page and its assets, so the next visit is served
   from that copy, even offline. Meanwhile the browser checks for a newer `sw.js` in the
   background. See [decisions.md](decisions.md#18-a-service-worker-for-return-visits).

## Layout

The design has two fixed stages: **wide** (1280×800) and **tall** (390×844). The tall one is used
when the viewport's aspect ratio is 9/10 or narrower (`(max-aspect-ratio: 9/10)`, in both CSS and
`head.js`).

`head.js` fits the stage to the viewport:

- **frame:** the region it tries to show whole. **core:** the region that must stay visible,
  which is the card plus room for "Watch again".
- **Scale:** `s = min(1.5, vw / frame width, vh / frame height)`. Below 0.8, text gets too
  small, so it uses `min(0.8, the scale that fits the core)` and crops the rest.
- **Position:** the frame is centred horizontally; vertically it is centred if it fits, else
  shown from the top. Both offsets are then clamped so the core stays on screen.
- **CSS variables** carry the result:
  - `--s` drives `zoom` on `.stage`, which keeps text crisp, unlike `transform: scale`.
  - `--ox` and `--oy` translate the frame.
  - `--cut-r` and `--cut-b` say how much of the stage is cropped, so "Watch again" can move in
    from the corner.
- **Shared state:** `window.hutuStage` and a `stage` event give the same numbers to the scene.
  The scene re-lays itself out 150 ms after the last resize.

Optical alignments the design measured at runtime are measured once with the real fonts by
`npm run align` and kept in `src/align.css`:

- the debossed wordmark's offsets;
- the seal's position;
- the name's first stroke;
- the email row's margins;
- the label column width (`--k-w`);
- on phones, the vertical text's height and its label and separator lengths (`--vgroup-h`,
  `--vk-h`, `--vsep-h`).

## The card

- **Sides.** `html.en` turns `.flip` 180°. The hidden face gets `inert`, so it's out of the tab
  order and the accessibility tree, and `<html lang>` follows the visible side.
- **Reduced motion.** The card doesn't turn or lift. The faces lie flat, the back on top, and
  only the back's opacity changes over 0.3 s, over a front kept opaque, so the card is never
  see-through mid-fade.
- **Flipping.** A click or tap on the card flips it, except on links, buttons, images and the
  popup. So does the language switch, "中文 / English", in the stage's corner beside "Watch
  again" (on the tall composition, under the card's left edge). It shows the side you're on as
  text and the other one as its button, always in that order, and it is the first stop when
  tabbing in. Its width is fixed, so "Watch again" sits at a fixed distance whichever font has
  loaded. Without JavaScript it stays hidden, since it couldn't flip anything.
- **WeChat popup.** It opens on hover (pointer devices), click, tap, Enter or Space, and closes
  on Escape, an outside tap or loss of focus. Closing it while hovered marks it `shut`, which
  suppresses the hover preview until the pointer leaves.
- **Icon boxes.** Every icon in the row is a box with no in-flow content, so the row lines up on
  their bottom edges in every engine. For the WeChat icon, the wrapper is that box and its
  `<button>` fills it.
- **Paper.** The card's paper noise is CSS (data-URI SVG filters in the critical CSS). The fibre
  strokes are added by the scene as mask layers.

## The scene (`src/scene/`)

| Module | Role |
|---|---|
| `main.js` | entry: canvases, state, the frame loop, input, resize, reduced motion, "Watch again" |
| `compositions.js` | WIDE and TALL: the card rect, branch parameters (limbs, waypoints, zones to keep clear), magpie parameters |
| `branch.js` | `growBranch(comp, rand, view)`: strokes and flowers, each with the time it appears |
| `ink.js`, `flora.js` | drawing the strokes (with dry-brush streaks) and the flowers |
| `petals.js` | falling petals |
| `magpie.js` | the bird: perch, flight in, landing, idle behaviours, and its art |
| `paper.js` | specks and fibres on the paper |
| `rng.js` | mulberry32, so `?seed=N` reproduces a branch |

- **Layers.** Five canvases: ink, settled flowers, opening flowers and the bird under the card,
  and falling petals over it. They are viewport-sized and drawn in stage coordinates.
- **The loop runs only while something moves**: growth, opening flowers, petals, or a busy bird.
  It then sleeps, and wakes for the bird's next scheduled event (blink, flutter), for pointer
  input, or when the tab becomes visible again. While the tab is hidden nothing runs.
- **Light mode** applies on phones (coarse pointer or a small screen): fewer petals, and no
  continuous "breathing", so the loop can sleep between the bird's events.
- **Reduced motion** draws the finished scene at once. The bird is perched and still, there are
  no petals or tilt, and switching the preference on or off is honoured live.
- **Big screens.** A limb's start is pushed back until it is off-screen. Twigs and flowers are
  still placed relative to the design's start, so big screens get the same branch.

## The build (`scripts/build.mjs`)

1. Copy `static/` to `dist/`. Fingerprint everything under `assets/` as
   `/assets/<name>.<sha256:10>.<ext>`.
2. Bundle `src/scene/main.js` with esbuild (targets: Chrome 111, Safari 16.4, Firefox 115).
3. Concatenate and minify `fonts.css` + `critical.css` + `align.css`, and minify `head.js` and
   `boot.js`. Inline all of them into `index.html`, resolving `asset:` references and adding
   the preload links.
4. Write `_headers` with the sha256 hash of every inline script and style in `index.html` and
   `404.html`. Then write `sw.js` from `src/sw.js`, with its precache list (`/` plus every
   `/assets/` file) and this build's version (a hash of the rest of `sw.js`, the page and
   `_headers`).
5. **Fail** if a character on the card is missing from the font subsets
   (`assets/fonts/manifest.json`), or if `index.html` is over 14 KB gzip or a first visit over
   150 KB gzip.

### Tooling

| Script | Does |
|---|---|
| `scripts/fonts.mjs` | downloads the pinned font sources (sha256-checked), subsets them to the card's characters (`scripts/lib/charsets.mjs`), writes the subsets, the manifest, `src/fonts.css` with metric-matched fallbacks (capsize), and the licences |
| `scripts/align.mjs` | builds a private copy, opens it in Chrome at 1280×800 and 390×810, measures the optical alignments with the real fonts, writes `src/align.css` |
| `scripts/images.mjs` | logo (52 px at 2× and 3×), QR code, favicon and touch icon from `sources/` |
| `scripts/og.mjs` | renders the 1200×630 social preview from a fixed seed |
| `scripts/measure.mjs` | cold-load timings under throttling, and compressed sizes as served |
| `scripts/dev.mjs` | rebuild on change, served by `wrangler dev` |

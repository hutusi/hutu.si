# hutu.si

John Hu's homepage: a bilingual calling card (Chinese front, English back; click, tap or use the
keyboard to flip it) over an ink plum branch that grows behind it. A magpie flies in and perches;
petals fall when it lands or flutters, or when you brush a blossom. Every visit grows a
different branch (`?seed=N` reproduces one).

No framework and no runtime dependencies. Visitors load one HTML file, five small font subsets,
two images and one deferred script, all from hutu.si, plus the Cloudflare Web Analytics beacon
that the edge adds to the page. The card arrives in the first network round trip (about 9 KB
compressed, against a 14 KB budget); the scene loads after the card has painted and its fonts
have arrived. A first visit is about 82 KB compressed, plus the 10 KB beacon.

## Quick start

Requires Node 24 (see `.node-version`). The local tools (`align`, `og`, `measure`) drive the
installed Google Chrome.

```sh
npm ci
npx playwright install chromium webkit firefox   # browsers for the tests, once
npm run dev                                      # http://localhost:8787, rebuilds on change
```

## Commands

| | |
|---|---|
| `npm run dev` | build, watch, and serve with `wrangler dev` on :8787 (same routing as production) |
| `npm run build` | build `dist/`; fails over the size budgets or on a character missing from the fonts |
| `npm run verify` | build, then every test. **Run it before anything lands on `main`.** |
| `npm test` | unit tests, then the browser tests |
| `npm run test:unit` | unit tests only (about 2 s, no browser) |
| `npm run test:e2e` | browser tests: Chromium, WebKit and Firefox, at desktop and phone sizes |
| `npm run test:smoke` | check the live site: headers, redirects, DNSSEC, certificate, console |
| `npm run fonts` | download the pinned font sources, subset them to the card's characters, regenerate `src/fonts.css` |
| `npm run align` | measure the optical alignments with the real fonts, regenerate `src/align.css` |
| `npm run images` | regenerate the logo, QR code and icons from `sources/` |
| `npm run og` | render the social preview `static/og.jpg` (`npm run og -- 3 7 12` renders seeds to compare) |
| `npm run measure -- <url>` | cold-load timings under three network profiles, and real compressed sizes |

## Changing the card

The card's text lives in `src/index.html` (both faces, plus the metadata and JSON-LD in the
head). After changing any of it:

1. `npm run fonts`. The fonts are subset to exactly the characters on the card, so new
   characters need new subsets; the build fails if one is missing.
2. `npm run align`. This re-measures the optical alignments with the real fonts: the debossed
   wordmark, the seal, the label column, and the vertical text on phones.
3. `npm run og`, which re-renders the social preview of the front of the card.
4. `npm run verify`, then look at the card in a browser at a desktop and a phone size.

Commit the regenerated files (`assets/fonts/`, `src/fonts.css`, `src/align.css`,
`static/og.jpg`) with the change. Links, the QR code and the logo are covered in
[docs/operations.md](docs/operations.md#updating-the-content).

## Layout

```
src/index.html         the page: both faces of the card, one DOM for both layouts
src/critical.css       inlined styles; "wide" (1280×800) and "tall" (390×844) compositions
src/head.js, src/boot.js  inlined scripts: side, scale and intro; flipping, popup, logo, scene loader
src/fonts.css          generated @font-face rules                   (npm run fonts)
src/align.css          generated optical alignments                 (npm run align)
src/scene/             the deferred scene: branch, flowers, petals, magpie, paper
src/worker.js          Worker code, only for the reserved /a /w /t paths
src/_headers           security headers and caching; CSP hashes filled in by the build
assets/                fingerprinted at build: font subsets, card images
static/                copied as-is: favicon, touch icon, og.jpg, robots.txt, licences
sources/               original logo and WeChat QR images
scripts/               build and tooling
test/                  unit (node:test), e2e and smoke (Playwright) tests
docs/                  architecture, decisions, operations, testing
```

## Deploying

Pushes to `main` deploy to hutu.si through Cloudflare Workers Builds, which runs the build and
the unit tests first. Pull requests get a preview URL, and GitHub Actions runs the browser tests
on every pull request and push. See [docs/operations.md](docs/operations.md) for rollback and
for the Cloudflare settings that must stay as they are.

## Documentation

- [docs/architecture.md](docs/architecture.md): how the page is built, loaded and served.
- [docs/decisions.md](docs/decisions.md): the key decisions and what they ask of future
  changes. Read it before changing how the page loads.
- [docs/operations.md](docs/operations.md): deploying, rolling back, Cloudflare settings,
  updating content, troubleshooting.
- [docs/testing.md](docs/testing.md): what the tests cover, and how to run and extend them.
- [AGENTS.md](AGENTS.md): the short version, for AI coding agents.

## Fonts

| Font | Use | Licence |
|---|---|---|
| Huiwen Mincho 汇文明朝体 | names, Chinese link titles | the author's free-use statement ([licences/HuiwenMincho.txt](static/licenses/HuiwenMincho.txt)) |
| Zhuque Fangsong 朱雀仿宋 | other Chinese text | SIL OFL 1.1 |
| Cormorant Garamond | wordmark, English name | SIL OFL 1.1 |
| EB Garamond | Latin text, small caps | SIL OFL 1.1 |

Only the subsets are committed. They keep each font's copyright and licence strings, and the
licence texts are served under `/licenses/`.

## Licence

The code is licensed under the [MIT License](LICENSE). The licence covers the code only; these
are not covered by it and remain all rights reserved unless stated otherwise:

- the card's content: its text, names and links;
- the visual design of the card and of the scene;
- the logo and portrait (`sources/logo.jpg` and every image derived from it, including the
  favicon, the touch icon and the social preview);
- the WeChat QR code (`sources/wechat-qr.jpg` and the images derived from it);
- the fonts in `assets/fonts/`, distributed under their own licences in `static/licenses/`.

The design is in Claude Design ("John Hu's Personal Homepage Directions", options 4a and 5a).

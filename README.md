# hutu.si

John Hu's homepage: a bilingual calling card (Chinese front, English back; click, tap or use the
keyboard to flip it) over an ink plum branch that grows behind it. A magpie flies in and perches;
petals fall when it lands or flutters, or when you brush a blossom. Every visit grows a
different branch (`?seed=N` reproduces one).

No framework and no runtime dependencies. Visitors load one HTML file, five small font
subsets, two images and one deferred script, all from hutu.si.

## How it loads

- **The card is the HTML.** `index.html` inlines everything the card needs: critical CSS, font
  declarations, a 0.4 KB head script and a 1 KB boot script. That is about 9 KB gzip, so it
  arrives in the first round trip. `npm run build` fails above 14 KB.
- **Text never waits.** Text shows at once in a local serif. Fonts are preloaded and swap in
  with `font-display: swap`. Fallback faces are metric-matched, and the card's geometry is fixed,
  so nothing moves when they arrive.
- **The scene comes last.** The branch, magpie and petals load as a module after the page has
  painted. The loop sleeps whenever nothing moves and stops while the tab is hidden. With reduced
  motion it draws the finished scene and holds still.
- **Budget.** A first visit is about 82 KB compressed. `npm run build` fails above 150 KB.

## Layout

```
src/index.html         the page: both faces of the card, one DOM for both layouts
src/critical.css       inlined styles; "wide" (1280×800) and "tall" (390×844) compositions
src/head.js, boot.js   inlined scripts: side, scale and intro; flipping, WeChat popup, scene loader
src/fonts.css          generated @font-face rules           (npm run fonts)
src/align.css          generated optical alignments         (npm run align)
src/scene/             the deferred scene: branch, flowers, petals, magpie, paper
src/worker.js          Worker code, only for the reserved /a /w /t paths
assets/                fingerprinted at build: font subsets, card images
static/                copied as-is: favicon, touch icon, og.jpg, robots.txt, licences
sources/               original logo and WeChat QR images
scripts/               build and tooling
```

## Commands

| | |
|---|---|
| `npm run dev` | build, watch, and serve with `wrangler dev` on :8787 (same routing as production) |
| `npm run build` | build `dist/`; checks font coverage and size budgets |
| `npm run fonts` | download the pinned font sources, subset them to the page's characters, regenerate `src/fonts.css` |
| `npm run align` | measure the optical alignments with the real fonts, regenerate `src/align.css` |
| `npm run images` | regenerate the logo, QR and icons from `sources/` |
| `npm run og` | render `static/og.jpg` (`npm run og -- 3 7 12` renders seeds to compare) |
| `npm run measure -- <url>` | cold-load timings under three network profiles, and real compressed sizes |

After changing card text, run `npm run fonts` and `npm run align`. The build fails if a
character is missing from the subsets. Node 24; the local tools use the installed Google Chrome.

## Fonts

| Font | Use | Licence |
|---|---|---|
| Huiwen Mincho 汇文明朝体 | names, Chinese link titles | the author's free-use statement ([licences/HuiwenMincho.txt](static/licenses/HuiwenMincho.txt)) |
| Zhuque Fangsong 朱雀仿宋 | other Chinese text | SIL OFL 1.1 |
| Cormorant Garamond | wordmark, English name | SIL OFL 1.1 |
| EB Garamond | Latin text, small caps | SIL OFL 1.1 |

Only the subsets are committed. They keep each font's copyright and licence strings, and the
licence texts are served under `/licenses/`.

## Deploy

A Cloudflare Worker with static assets (`wrangler.jsonc`), deployed by Workers Builds on every
push to `main`: build command `npm run build`, deploy command `npx wrangler deploy`.

- Static files and the 404 page are served by the asset layer without running Worker code.
  Only `/a`, `/w` and `/t` (reserved for short links) reach `src/worker.js`, which returns 404
  for now.
- `_headers` sets immutable caching for `/assets/*` and a CSP that allows only the page's own
  inline code by hash.
- Keep these zone features **off**: they rewrite the HTML (breaking the CSP hashes) or add
  third-party requests. Email Obfuscation, Rocket Loader, Automatic HTTPS Rewrites, Web
  Analytics auto-injection, Zaraz.

The design is in Claude Design ("John Hu's Personal Homepage Directions", options 4a and 5a).

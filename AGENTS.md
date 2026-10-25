# AGENTS.md

Guidance for AI coding agents working on this repository. People should start with the
[README](README.md); the reasons behind everything below are in
[docs/decisions.md](docs/decisions.md).

hutu.si is a single-page bilingual calling card over an animated ink plum branch. It is static
HTML, inlined CSS and JS, and a deferred canvas module, served by a Cloudflare Worker with
static assets.

## Commands

```sh
npm ci && npx playwright install chromium webkit firefox   # setup
npm run dev           # http://localhost:8787
npm run verify        # build + unit + browser tests: must pass before anything lands on main
npm run test:unit     # fast (about 2 s)
npx playwright test --project=webkit-mobile -g "…"         # a focused browser run
```

After changing any text on the card: `npm run fonts`, `npm run align`, `npm run og`, then
`npm run verify`, and commit the regenerated files.

## Invariants: don't break these

1. **Size.** `index.html` is ≤ 14 KB gzip, and a first visit ≤ 150 KB; `npm run build` fails
   otherwise. Inline only what the card needs at first paint; everything else goes in the
   deferred scene module (`src/scene/`).
2. **No runtime dependencies and no other origins.** No libraries, CDNs or web fonts from
   elsewhere. The only exception is the Cloudflare analytics beacon the edge adds. Every
   browser test fails on a request to another origin.
3. **Card before animation.** The scene loads only after the card's first contentful paint and
   `document.fonts.ready`. Never trigger it from `load` or `DOMContentLoaded`.
4. **Generated files are never edited by hand:** the CSP hashes in `dist/_headers`,
   `src/fonts.css`, `src/align.css`, `assets/fonts/*`, `static/og.jpg`, and the images derived
   from `sources/`. Change the inputs and rerun the script.
5. **Nothing moves when the fonts swap in.** Keep the pinned sizes in `src/align.css`, and
   re-run `npm run align` when text, sizes or fonts change.
6. **Two compositions and two faces.** Card changes usually need doing in both the wide and the
   tall (`@media (max-aspect-ratio: 9/10)`) layout, and on both the Chinese and the English face.
7. **Three engines.** Check behaviour in Chromium, WebKit and Firefox; most bugs so far were
   engine-specific (docs/decisions.md §15).
8. **Accessibility.**
   - The hidden face stays `inert`, and `<html lang>` follows the visible face.
   - Everything works by keyboard, and Escape closes the popup.
   - Reduced motion shows the finished scene, still.
9. **Worker routes.** The Worker runs only for `/a`, `/w` and `/t` (reserved for short links);
   keep `run_worker_first` minimal. Worker responses need their own headers, including the CSP.
10. **The scene's loop sleeps when idle.** Anything new that moves must report itself in
    `busy()`. Anything random goes through the seeded RNG.
11. **Identity data stays consistent.** A profile link lives in four places: both faces, the
    JSON-LD `sameAs`, and `static/llms.txt`. The bio lives in two: the JSON-LD and `llms.txt`.
    Change them together; `test/unit/identity.test.js` checks.

## Workflow

- **Branching.** Small fixes go straight to `main` after `npm run verify`. Bigger work gets a
  `<type>/<topic>` branch and a pull request; check its Workers preview URL.
- **Commits.** Conventional Commits, with a body that explains why, one logical change per
  commit. Don't add `Co-Authored-By` trailers or AI-attribution lines to commits or pull
  requests.
- **Bug fixes.** Add the test that would have caught the bug, and check that it fails without
  the fix.
- **Generated files.** Commit the generated files with the change that needs them.

## Where things are

- `src/index.html`, `src/critical.css`, `src/head.js`, `src/boot.js`: the card (inlined at build).
- `src/scene/`: the branch, flowers, petals and magpie (deferred module).
- `src/_headers`, `src/worker.js`, `wrangler.jsonc`: serving.
- `scripts/`: the build and the tooling.
- `test/unit/`, `test/e2e/`, `test/smoke/`: the tests; [docs/testing.md](docs/testing.md) maps
  each to what it guards.
- [docs/architecture.md](docs/architecture.md), [docs/operations.md](docs/operations.md).

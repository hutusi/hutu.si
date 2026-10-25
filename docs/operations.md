# Operations

How hutu.si is deployed and run, and what to do when something needs changing or goes wrong.

## Environments

| | URL | From |
|---|---|---|
| Production | https://hutu.si | `main`, deployed by Workers Builds to the Worker `hutu-si` |
| Worker address | https://hutu-si.huziyong.workers.dev | the same deployment (`workers_dev: true`; can be turned off) |
| Previews | `https://<branch>-hutu-si.huziyong.workers.dev` | every push to another branch, linked from the PR |

## Making a change

- **Small fixes** (a bug, a tweak, docs) go straight to `main` after `npm run verify` passes.
- **Bigger work** (a feature, a refactor, a dependency upgrade) gets a `<type>/<topic>` branch and
  a pull request. CI runs, Workers Builds posts a preview URL, and you check the preview, on a
  phone too. Then merge with a merge commit, so the focused commits stay readable in the history.
- **Commits:** Conventional Commit messages, with the reason in the body.

## Deploys

Workers Builds deploys from the repository. Its settings are in the Cloudflare dashboard under
Workers & Pages → hutu-si → Settings → Builds:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Build command | `npm run build && npm run test:unit` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | `npx wrangler preview` (needs the `previews` block in `wrangler.jsonc`) |

- **What blocks a deploy.** A failing build (size budgets, font coverage) or unit test stops it.
- **Browser tests** run in GitHub Actions. On a pull request they run before you merge. On a
  direct push to `main` they run alongside the deploy, so run `npm run verify` locally first.
- **Manual deploy** (rarely needed): `npx wrangler login` once, then `npm run deploy`.

## The service worker

Return visits are served from a copy of the card that a service worker keeps (`src/sw.js`; see
[decisions.md](decisions.md#18-a-service-worker-for-return-visits)).

- **How a deploy reaches visitors.** Each deploy that changes the card or its headers
  (`_headers`) changes `sw.js`. On a
  visitor's next visit the browser notices, shows the cached card, and installs the new copy in
  the background; the visit after that shows the new card. So after a deploy, expect returning
  visitors to see the change one visit late.
- **To see the new version yourself at once:** reload twice, or use a private window.
- **The kill switch,** if a bad version is ever cached:
  1. In `src/sw.js`, set `const ENABLED = false;`, then commit and push. The tests build the
     worker explicitly on and off, so they pass either way and never block this deploy. The unit
     tests also check the kill-switch build itself.
  2. On each visitor's next visit, the browser fetches the new `sw.js`. No cache can stand in
     its way. It deletes the cached card, unregisters itself and reloads the page from the
     network. The page from that build unregisters any worker instead of registering one.
  3. Once it's fixed, set `ENABLED` back to `true` and deploy again.
- **If deploys are broken too:** add a Cloudflare response-header rule (Rules → Transform Rules →
  Modify Response Header) setting `Clear-Site-Data: "cache", "storage"` on `hutu.si/sw.js`.
  Browsers that see it drop the site's caches and workers. Remove the rule once visitors have
  been cleared.

## Rolling back

1. Find the last good version: `npx wrangler deployments list`, or the dashboard's Deployments
   tab.
2. Roll back: `npx wrangler rollback <version-id>`, or the dashboard's Rollback action. This takes
   effect in seconds.
3. Revert the bad commit on `main` (`git revert`), so the next build doesn't deploy it again.

## Cloudflare settings (zone hutu.si)

These live in the dashboard, not in the repository. The [daily production
check](#the-daily-production-check) notices most of them changing.

| Setting | State | Why |
|---|---|---|
| DNSSEC | **on**, DS at the .si registrar with algorithm 13 | validating resolvers (1.1.1.1 among them) refuse the domain otherwise, and mail to me@hutu.si fails too |
| Always Use HTTPS (SSL/TLS → Edge Certificates) | **on** | the Worker never redirects HTTP itself |
| Web Analytics (Speed → Real user monitoring) | **on** | analytics; the CSP allows its beacon |
| Email Obfuscation | **off** | rewrites `mailto:` links and adds a script, which breaks the CSP |
| Rocket Loader | **off** | rewrites the scripts, which breaks the CSP hashes |
| Automatic HTTPS Rewrites | **off** | rewrites the HTML |
| Zaraz | **off** | adds third-party scripts |
| AI Crawl Control | **nothing blocked** | search engines and AI agents should be able to read the card |
| Browser Integrity Check (Security → Settings) | **off** | it refused simple clients such as Python's urllib; a static public card gains nothing from it |

The bare domain has no A or AAAA record of its own: the Worker's custom domain manages it.

## DNS and email

- **Nameservers and DNSSEC.** Cloudflare's nameservers serve the domain. The DS record at the
  registrar must match Cloudflare's key and use algorithm 13 (ECDSA P-256). A wrong algorithm
  once made the domain unreachable for validating resolvers.
- **Email.** me@hutu.si uses Cloudflare Email Routing (MX `route1–3.mx.cloudflare.net`), so it
  depends on DNSSEC as well.

## Updating the content

| To change | Do |
|---|---|
| Card text | edit `src/index.html`, then `npm run fonts`, `npm run align`, `npm run og`, `npm run verify` (see the [README](../README.md#changing-the-card)) |
| A link | four places: both faces in `src/index.html`, the JSON-LD `sameAs` list in its head, and `static/llms.txt`; the unit tests fail if they disagree |
| The bio | the JSON-LD `description` (in `src/index.html`) and `static/llms.txt`, in both languages; the tests require them to match |
| The WeChat QR code | replace `sources/wechat-qr.jpg`, run `npm run images` |
| The logo | replace `sources/logo.jpg`, run `npm run images` (logo, favicon, touch icon) and `npm run og`; update the placeholder's tones in `.seal` (`src/critical.css`) to the new logo's colours |
| The social preview | `npm run og`, which uses seed 4; `npm run og -- 3 7 12` renders other seeds to compare, and `SEED` in `scripts/og.mjs` picks one |
| A font | its pinned source and sha256 are in `scripts/fonts.mjs`; then `npm run fonts` and `npm run align` |
| The branch or the magpie | the composition parameters in `src/scene/compositions.js` |

Commit the generated files with the change.

## Dependencies

- **Exact pins.** All dependencies are dev dependencies, pinned to exact versions, and the
  Actions are pinned to commit SHAs.
- **Dependabot** opens one grouped pull request a week for npm and one for Actions. Each runs CI
  and gets a preview; merge when they're green.
- **Playwright.** `@playwright/test` and `playwright-core` must move together. After an upgrade,
  run `npx playwright install chromium webkit firefox`.
- **Node.** `.node-version` sets Node for CI and for Workers Builds.

## The daily production check

`.github/workflows/smoke.yml` runs `npm run test:smoke` against hutu.si every morning; you can
also run it from the Actions tab. A failure emails the repository's owner.

| Failure | Likely cause |
|---|---|
| console error or CSP violation | a zone feature rewriting the HTML, or a change to the analytics beacon |
| request to an unexpected origin | a new zone feature adding a third-party script |
| security header missing | `_headers` not deployed, or the deploy went wrong |
| HTTP not redirected | Always Use HTTPS turned off |
| DNSSEC not validated | the DS record at the registrar no longer matches |
| certificate expiring | edge certificate renewal (SSL/TLS → Edge Certificates) |
| identity metadata missing, or `llms.txt` not UTF-8 | a bad deploy, or `_headers` lost its text-file rules |
| a script's request refused (403) | Browser Integrity Check, or a new bot rule, switched on |

GitHub pauses scheduled workflows in a repository with no activity for 60 days. Re-enable it from
the Actions tab if that happens.

## Search engines

Optional, since crawlers find the site on their own: submit `https://hutu.si/sitemap.xml` in
Google Search Console and Bing Webmaster Tools (both need your account), and check the page in
Google's [Rich Results Test](https://search.google.com/test/rich-results?url=https%3A%2F%2Fhutu.si%2F),
which should find the ProfilePage.

## Measuring performance

`npm run measure -- https://hutu.si/` loads the page cold, three times per network profile
(unthrottled, Slow 4G, 3G), and prints medians plus the compressed size of every file as served.
Timings depend on your own network path; compare runs from the same machine.

## Troubleshooting

- **The page is unstyled or its scripts don't run, with CSP errors in the console.** Something
  rewrote the HTML after the build, usually a zone feature from the table above. Locally it can
  also be a stale `dist/_headers` from two builds racing; restart `npm run dev`.
- **hutu.si doesn't load from one machine only.** A local DNS cache is holding an old answer.
  For example, a proxy with "fake-IP" DNS can keep a "no such record" answer from before the
  domain was set up. Check what the world sees with
  `curl -s -H 'accept: application/dns-json' 'https://cloudflare-dns.com/dns-query?name=hutu.si&type=A'`,
  then flush the local cache.
- **Headless WebKit shows the back of the card mirrored over the front.** Headless WebKit draws
  without compositing and ignores `backface-visibility`; real Safari is fine. The screenshot
  test hides the far face.
- **npm warns about install scripts** (esbuild, workerd, fsevents) on newer npm versions that
  ask for scripts to be approved. This is harmless: those packages work without them, as the
  builds in CI and Workers Builds show.
- **A port is already in use.** `npm run dev` uses 8787 and the browser tests use 8789.

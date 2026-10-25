// Builds dist/ for the Worker's static assets:
//   - inlines the critical CSS and the two small scripts into index.html (the card must render
//     from the first network round trip, so nothing it needs may live in another file),
//   - bundles the deferred scene module and fingerprints everything under assets/,
//   - writes _headers with CSP hashes for the inline code,
//   - writes the service worker with this build's version and precache list,
//   - fails when a page character is missing from the font subsets or a size budget is blown.
import { build as bundle, transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { checkCoverage } from './lib/charsets.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const TARGET = ['chrome111', 'safari16.4', 'firefox115'];
const KB = 1024;
export const BUDGET = { html: 14 * KB, total: 150 * KB }; // compressed bytes (gzip, the worst case)

const sha = (data, enc = 'hex') => createHash('sha256').update(data).digest(enc);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else if (!entry.name.startsWith('.')) out.push(p);
  }
  return out;
}

// Copies assets/** to dist/assets/ under content-hashed names (served as immutable).
async function fingerprint(dist, map) {
  for (const file of await walk(join(ROOT, 'assets'))) {
    const rel = relative(join(ROOT, 'assets'), file);
    if (rel.endsWith('.json')) continue;
    const data = await readFile(file);
    const hashed = rel.replace(/(\.[^.]+)$/, `.${sha(data).slice(0, 10)}$1`);
    await mkdir(dirname(join(dist, 'assets', hashed)), { recursive: true });
    await writeFile(join(dist, 'assets', hashed), data);
    map.set(rel, `/assets/${hashed}`);
  }
}

async function bundleScene(dist, map) {
  const { outputFiles } = await bundle({
    entryPoints: [join(SRC, 'scene/main.js')],
    bundle: true,
    format: 'esm',
    minify: true,
    target: TARGET,
    write: false,
    legalComments: 'none',
  });
  const code = outputFiles[0].contents;
  const name = `scene.${sha(code).slice(0, 10)}.js`;
  await writeFile(join(dist, 'assets', name), code);
  map.set('scene.js', `/assets/${name}`);
}

function resolveAssets(text, map, from) {
  return text.replace(/asset:([\w./-]+)/g, (_, rel) => {
    const url = map.get(rel);
    if (!url) throw new Error(`${from}: unknown asset "${rel}"`);
    return url;
  });
}

const minifyJs = async (code) =>
  (await transform(code, { loader: 'js', minify: true, target: TARGET })).code.trim();
const minifyCss = async (code) =>
  (await transform(code, { loader: 'css', minify: true, target: TARGET })).code.trim();

// The templates keep markup on separate lines; whitespace that spans a line break is never
// meaningful there, so it can be dropped wholesale.
const collapse = (html) => html.replace(/<!--(?!%)[\s\S]*?-->/g, '').replace(/\n\s*/g, '');

async function page(file, map, inline) {
  let html = await readFile(join(SRC, file), 'utf8');
  for (const [marker, value] of Object.entries(inline)) html = html.replace(`<!--%${marker}%-->`, value);
  html = collapse(resolveAssets(html, map, file));
  const left = html.match(/<!--%\w+%-->/);
  if (left) throw new Error(`${file}: unfilled placeholder ${left[0]}`);
  return html;
}

const hashesOf = (html, tag) =>
  [...html.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))]
    .filter((m) => !/\ssrc=/.test(m[0].slice(0, m[0].indexOf('>'))) && m[1].length)
    .map((m) => `'sha256-${sha(m[1], 'base64')}'`);

function sizes(name, data) {
  const compressible = /\.(html|js|css|svg|txt|json)$|_headers$/.test(name);
  const row = { name, raw: data.length, gzip: data.length, br: data.length, zstd: data.length };
  if (compressible) {
    row.gzip = zlib.gzipSync(data, { level: 9 }).length;
    row.br = zlib.brotliCompressSync(data, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length;
    row.zstd = zlib.zstdCompressSync ? zlib.zstdCompressSync(data).length : NaN;
  }
  return row;
}

async function report(dist, html, sw, log) {
  // Everything a first visit can load: the page, the service worker (fetched once the page is
  // idle) and every fingerprinted asset (both logo densities are counted: an upper bound).
  const rows = [sizes('index.html', Buffer.from(html)), sizes('sw.js', Buffer.from(sw))];
  for (const file of await walk(join(dist, 'assets'))) {
    rows.push(sizes(relative(dist, file), await readFile(file)));
  }
  const total = rows.reduce((t, r) => ({ raw: t.raw + r.raw, gzip: t.gzip + r.gzip, br: t.br + r.br, zstd: t.zstd + r.zstd }), { raw: 0, gzip: 0, br: 0, zstd: 0 });
  const fmt = (n) => (Number.isNaN(n) ? '—' : (n / KB).toFixed(1).padStart(7));
  log(`\n${'file'.padEnd(46)}${'raw'.padStart(7)}${'gzip'.padStart(7)}${'br'.padStart(7)}${'zstd'.padStart(7)}  (KB)`);
  for (const r of [...rows, { name: 'total (first visit, upper bound)', ...total }]) {
    log(`${r.name.padEnd(46)}${fmt(r.raw)}${fmt(r.gzip)}${fmt(r.br)}${fmt(r.zstd)}`);
  }
  const errors = [];
  if (rows[0].gzip > BUDGET.html) errors.push(`index.html is ${rows[0].gzip} B gzip, budget ${BUDGET.html} B`);
  if (total.gzip > BUDGET.total) errors.push(`first visit is ${total.gzip} B, budget ${BUDGET.total} B`);
  return { errors, html: rows[0], total };
}

// The service worker (src/sw.js). The build writes in this build's version (a hash of the page,
// its response headers and the asset names) and its precache list, so any change to what the
// cached card is served with changes sw.js, which is how browsers notice a new copy. `enabled`
// is the kill switch.
async function serviceWorker(dist, index, headers, enabled) {
  const assets = (await walk(join(dist, 'assets'))).map((f) => `/${relative(dist, f).replaceAll('\\', '/')}`).sort();
  const precache = ['/', ...assets];
  const version = sha([index, headers, ...precache].join('\n')).slice(0, 12);
  const code = (await readFile(join(SRC, 'sw.js'), 'utf8'))
    .replace(/const ENABLED = (true|false);/, `const ENABLED = ${enabled};`)
    .replace("'{{version}}'", JSON.stringify(version))
    .replace("['{{precache}}']", JSON.stringify(precache));
  const out = await minifyJs(code);
  await writeFile(join(dist, 'sw.js'), out);
  return { version, precache, enabled, code: out };
}

// `outDir` lets the local tools (align, og) and the tests build a private copy, so they never
// race the dev server over dist/. `swEnabled` overrides the service worker's kill switch (tests).
// Returns the compressed sizes the budgets were checked against, and the service worker's
// version and precache list.
export async function build({ outDir = join(ROOT, 'dist'), log = console.log, swEnabled } = {}) {
  const dist = outDir;
  await rm(dist, { recursive: true, force: true });
  await mkdir(join(dist, 'assets'), { recursive: true });
  await cp(join(ROOT, 'static'), dist, { recursive: true });

  const map = new Map();
  await fingerprint(dist, map);
  await bundleScene(dist, map);

  // fonts.css (generated by `npm run fonts`) declares the faces; every font it names is
  // preloaded so the swap happens as early as possible.
  const fontsCss = await readFile(join(SRC, 'fonts.css'), 'utf8');
  const preload = [...new Set(fontsCss.match(/asset:fonts\/[\w.-]+\.woff2/g) ?? [])]
    .map((ref) => `<link rel="preload" href="${ref}" as="font" type="font/woff2" crossorigin>`)
    .join('');
  const sources = [fontsCss, ...(await Promise.all(['critical.css', 'align.css'].map((f) => readFile(join(SRC, f), 'utf8'))))];
  const css = await minifyCss(resolveAssets(sources.join('\n'), map, 'css'));
  const head = await minifyJs(await readFile(join(SRC, 'head.js'), 'utf8'));
  const enabled = swEnabled ?? /const ENABLED = true;/.test(await readFile(join(SRC, 'sw.js'), 'utf8'));
  const boot = await minifyJs(resolveAssets(await readFile(join(SRC, 'boot.js'), 'utf8'), map, 'boot.js').replace(/__SERVICE_WORKER__/g, String(enabled)));

  const index = await page('index.html', map, { preload, css: `<style>${css}</style>`, head: `<script>${head}</script>`, boot: `<script>${boot}</script>` });
  const notFound = await page('404.html', map, {});
  await writeFile(join(dist, 'index.html'), index);
  await writeFile(join(dist, '404.html'), notFound);

  const both = index + notFound;
  const headers = (await readFile(join(SRC, '_headers'), 'utf8'))
    .replace('{{script-hashes}}', [...new Set(hashesOf(both, 'script'))].join(' '))
    .replace('{{style-hashes}}', [...new Set(hashesOf(both, 'style'))].join(' '));
  await writeFile(join(dist, '_headers'), headers);
  const sw = await serviceWorker(dist, index, headers, enabled);

  const sizes = await report(dist, index, sw.code, log);
  const errors = [...(await checkCoverage(join(SRC, 'index.html'), join(ROOT, 'assets/fonts/manifest.json'))), ...sizes.errors];
  if (errors.length) throw new Error(errors.join('\n'));
  return { html: sizes.html, total: sizes.total, sw: { version: sw.version, precache: sw.precache, enabled: sw.enabled } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t0 = performance.now();
  // --sw=on|off overrides the service worker's kill switch (the browser tests build it on).
  const sw = process.argv.find((a) => a.startsWith('--sw='))?.slice(5);
  if (sw !== undefined && sw !== 'on' && sw !== 'off') {
    console.error(`--sw must be on or off, not "${sw}"`);
    process.exit(1);
  }
  build({ swEnabled: sw === undefined ? undefined : sw === 'on' })
    .then(async () => console.log(`\nbuilt dist/ in ${(performance.now() - t0).toFixed(0)} ms, ${(await stat(join(ROOT, 'dist/index.html'))).size} B index.html`))
    .catch((err) => {
      console.error(`\nbuild failed:\n${err.message}`);
      process.exit(1);
    });
}

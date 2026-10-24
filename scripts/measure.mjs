// Load-performance report for a deployed (or `wrangler dev`) URL:
//   npm run measure -- https://hutu.si/            (default: http://localhost:8787/)
// For each network profile it loads the page cold, three times, in Chrome with DevTools
// throttling, and prints medians: time to first byte, first paint (the card), largest paint,
// fonts loaded, scene start, load event, layout shift, bytes on the wire and request origins.
// It then fetches each file with gzip, br and zstd to show the real compressed sizes served.
// DevTools throttling adds latency per request rather than modelling TCP slow start, so whether
// the card arrives in the first round trip is shown by the HTML's compressed size (≤ ~14 KB).
import { request } from 'node:https';
import { request as httpRequest } from 'node:http';
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:8787/';
const RUNS = 3;
const PROFILES = [
  { name: 'unthrottled' },
  // Lighthouse's mobile defaults ("Slow 4G").
  { name: 'slow 4G', latency: 150, down: 1.6e6, up: 750e3, cpu: 4 },
  { name: '3G', latency: 400, down: 400e3, up: 400e3, cpu: 4 },
];

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function load(browser, profile) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-CN' });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (profile.latency) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: profile.latency,
      downloadThroughput: profile.down / 8,
      uploadThroughput: profile.up / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  }
  let bytes = 0;
  const origins = new Set();
  cdp.on('Network.requestWillBeSent', (e) => /^https?:/.test(e.request.url) && origins.add(new URL(e.request.url).origin));
  cdp.on('Network.loadingFinished', (e) => (bytes += e.encodedDataLength));
  await page.addInitScript(() => {
    window.__lcp = 0;
    window.__cls = 0;
    new PerformanceObserver((l) => (window.__lcp = l.getEntries().at(-1).startTime)).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__cls += e.value))).observe({ type: 'layout-shift', buffered: true });
    document.fonts.addEventListener('loadingdone', () => performance.mark('fonts-loaded'));
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => performance.getEntriesByName('scene-start').length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const mark = (name) => performance.getEntriesByName(name).at(-1)?.startTime ?? NaN;
    return {
      ttfb: nav.responseStart,
      fcp: mark('first-contentful-paint'),
      lcp: window.__lcp,
      fonts: mark('fonts-loaded'),
      scene: mark('scene-start'),
      load: nav.loadEventStart,
      cls: window.__cls,
    };
  });
  await context.close();
  return { ...m, bytes, origins: [...origins] };
}

// Bytes on the wire for one file with a given Accept-Encoding (no decompression).
function wireSize(fileUrl, encoding) {
  const send = fileUrl.startsWith('https:') ? request : httpRequest;
  return new Promise((resolve, reject) => {
    const req = send(fileUrl, { headers: { 'Accept-Encoding': encoding } }, (res) => {
      let n = 0;
      res.on('data', (d) => (n += d.length));
      res.on('end', () => resolve({ n, enc: res.headers['content-encoding'] ?? 'identity' }));
    });
    req.on('error', reject);
    req.end();
  });
}

const browser = await chromium.launch({ channel: 'chrome' });
console.log(`\n${url}  (median of ${RUNS} cold loads, 1280×800, times in ms)\n`);
console.log(`${'profile'.padEnd(13)}${['TTFB', 'card(FCP)', 'LCP', 'fonts', 'scene', 'load', 'CLS', 'KB wire'].map((h) => h.padStart(10)).join('')}`);
let origins = [];
for (const profile of PROFILES) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await load(browser, profile));
  origins = runs[0].origins;
  const col = (k, d = 0) => median(runs.map((r) => r[k])).toFixed(d).padStart(10);
  console.log(`${profile.name.padEnd(13)}${col('ttfb')}${col('fcp')}${col('lcp')}${col('fonts')}${col('scene')}${col('load')}${col('cls', 3)}${(median(runs.map((r) => r.bytes)) / 1024).toFixed(1).padStart(10)}`);
}
console.log(`\nrequest origins: ${origins.join(', ')}`);

// Compressed sizes as served, for the page and what it loads.
const page = await browser.newPage();
const files = [];
page.on('response', (r) => files.push(r.url()));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => performance.getEntriesByName('scene-start').length > 0);
await page.waitForTimeout(500);
await browser.close();
console.log(`\n${'file'.padEnd(52)}${['gzip', 'br', 'zstd'].map((h) => h.padStart(9)).join('')}  (bytes on the wire)`);
let totals = { gzip: 0, br: 0, zstd: 0 };
for (const f of [...new Set(files)].filter((f) => f.startsWith(new URL(url).origin))) {
  const sizes = {};
  for (const enc of ['gzip', 'br', 'zstd']) {
    const { n, enc: got } = await wireSize(f, enc);
    sizes[enc] = n;
    totals[enc] += n;
    if (got !== enc && got !== 'identity') sizes[enc] = `${n}(${got})`;
  }
  console.log(`${new URL(f).pathname.slice(0, 51).padEnd(52)}${Object.values(sizes).map((v) => String(v).padStart(9)).join('')}`);
}
console.log(`${'total'.padEnd(52)}${Object.values(totals).map((v) => String(v).padStart(9)).join('')}`);

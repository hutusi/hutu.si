// Renders the social preview (static/og.jpg, 1200×630): the Chinese front of the card over a
// finished branch with the magpie, from a fixed seed. Run locally after visual changes:
//   npm run og               uses SEED below
//   npm run og -- 7 12 31    renders those seeds to .cache/og-<seed>.jpg to choose from
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { build } from './build.mjs';
import { serve } from './lib/serve.mjs';

const SEED = 4;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const seeds = process.argv.slice(2).map(Number);

const DIR = `${ROOT}.cache/build-og`;
await build({ outDir: DIR });
const server = await serve(DIR);
const browser = await chromium.launch({ channel: 'chrome' });
try {
  // Reduced motion: no intro, the branch drawn finished, the magpie already perched and still.
  const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' });
  for (const seed of seeds.length ? seeds : [SEED]) {
    const page = await context.newPage();
    await page.goto(`${server.url}/?seed=${seed}`);
    await page.waitForSelector('#again:not([hidden])');
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => (document.getElementById('again').hidden = true)); // noise in a preview
    await page.waitForTimeout(800);
    const shot = await page.screenshot({ type: 'png' });
    const file = seeds.length ? `${ROOT}.cache/og-${seed}.jpg` : `${ROOT}static/og.jpg`;
    await sharp(shot).resize(1200, 630, { kernel: 'lanczos3' }).jpeg({ quality: 86, mozjpeg: true }).toFile(file);
    console.log(`seed ${seed} → ${file}`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

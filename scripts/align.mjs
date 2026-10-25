// Measures the optical alignments the design computed at runtime and writes them to
// src/align.css as constants, so the page never re-lays out once its fonts arrive:
//   - the debossed wordmark's ink edge sits on the card margin, its ink top level with the seal
//     (Latin wordmarks are placed from the left, so a fallback's different width doesn't move
//     them when the font swaps in);
//   - on wide cards the name's first stroke lines up with the seal's left edge, and the email row
//     continues the link rows' rhythm with its baseline level with the role line;
//   - on tall cards the seal is centred on the wordmark.
// It also pins sizes that would otherwise change when the fonts swap in: the small-caps label
// column on wide cards, and the height of the vertical text on tall ones.
// Run after changing card text, sizes or fonts: `npm run align`.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { build } from './build.mjs';
import { serve } from './lib/serve.mjs';

const OUT = fileURLToPath(new URL('../src/align.css', import.meta.url));
const DIR = fileURLToPath(new URL('../.cache/build-align', import.meta.url));

// Runs in the page. Ports the design's g4AlignNow measurements; returns CSS custom properties.
function measure({ tall, margin }) {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const fontOf = (el) => {
    const s = getComputedStyle(el);
    return `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
  };
  const metrics = (el, text) => {
    ctx.font = fontOf(el);
    return ctx.measureText(text);
  };
  // Offset of el within ancestor, through the offsetParent chain.
  const offset = (el, ancestor) => {
    let x = 0;
    let y = 0;
    for (let n = el; n && n !== ancestor; n = n.offsetParent) {
      x += n.offsetLeft;
      y += n.offsetTop;
    }
    return { x, y };
  };
  // Baseline of an element's last line, via a zero-size inline-block appended to it.
  const baseline = (el, ancestor) => {
    const mark = document.createElement('span');
    mark.style.cssText = 'display:inline-block;width:0;height:0';
    el.append(mark);
    const at = offset(mark, ancestor);
    mark.remove();
    return at;
  };
  // Left edge of the rendered ink (side bearings differ per glyph and font).
  const inkLeft = (el, text) => {
    const m = metrics(el, text);
    const size = parseFloat(getComputedStyle(el).fontSize);
    const pad = Math.ceil(size * 0.5);
    const w = Math.ceil(m.width + pad * 2);
    const h = Math.ceil(size * 1.9);
    const base = Math.ceil(size * 1.3);
    Object.assign(ctx.canvas, { width: w, height: h });
    ctx.font = fontOf(el);
    ctx.fillText(text, pad, base);
    const data = ctx.getImageData(0, 0, w, h).data;
    let min = w;
    for (let y = 0; y < h; y++) for (let x = 0; x < min; x++) if (data[(y * w + x) * 4 + 3] > 60) min = x;
    return min - pad;
  };
  const px = (v) => `${Math.round(v * 10) / 10}px`;

  const out = {};
  for (const face of document.querySelectorAll('.face')) {
    const vars = {};
    // The page already has the current align.css; measure natural sizes, not those it pins.
    for (const pin of ['--k-w', '--vgroup-h']) face.style.setProperty(pin, 'auto');
    const deboss = face.querySelector('.deboss');
    const seal = face.querySelector('.seal');
    const cjk = deboss.classList.contains('deboss-cjk');
    const text = deboss.textContent;
    const whole = metrics(deboss, text);
    const top = metrics(deboss, cjk ? text.slice(1) : text); // the first CJK glyph is nudged down
    const inkTop = tall ? margin : seal.offsetTop;
    vars['--dbx-t'] = px(inkTop - (baseline(deboss, deboss).y - top.actualBoundingBoxAscent));
    if (cjk) vars['--dbx-r'] = px(margin - (deboss.offsetWidth - whole.actualBoundingBoxRight));
    else if (tall) vars['--dbx-l'] = px(margin + whole.actualBoundingBoxLeft);
    else vars['--dbx-l'] = px(face.offsetWidth - margin - whole.actualBoundingBoxRight);
    if (tall) {
      if (!cjk) vars['--vgroup-h'] = px(face.querySelector('.main').offsetHeight);
      const mid = inkTop + (cjk ? (top.actualBoundingBoxAscent + whole.actualBoundingBoxDescent) / 2 : top.actualBoundingBoxAscent / 2);
      vars['--seal-t'] = px(mid - seal.offsetHeight / 2);
    } else {
      const name = face.querySelector('.name');
      name.style.marginLeft = '0px';
      vars['--name-ml'] = px(seal.offsetLeft - (offset(name, face).x + inkLeft(name, name.textContent)));
      // Email row: one link-row pitch below the last link, then the whole right column moved so
      // the email's baseline is level with the role line.
      const body = face.querySelector('.body');
      const social = face.querySelector('.social');
      const values = [...face.querySelectorAll('.links .v')];
      const mail = face.querySelector('.mail');
      social.style.margin = '0';
      const [v0, v1] = values.map((v) => baseline(v, body));
      const last = baseline(values.at(-1), body);
      const mt = last.y + (v1.y - v0.y) - baseline(mail, body).y;
      social.style.marginTop = `${mt}px`;
      const delta = baseline(face.querySelector('.role'), body).y - baseline(mail, body).y;
      vars['--social-mt'] = px(mt);
      if (cjk) vars['--k-w'] = px(face.querySelector('.links .k').offsetWidth);
      vars['--social-mb'] = px(-delta);
    }
    out[face.classList.contains('front') ? 'front' : 'back'] = vars;
  }
  return out;
}

async function run(page, url, { width, height, tall, margin }) {
  await page.setViewportSize({ width, height });
  await page.goto(url);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.allSettled([...document.fonts].map((f) => f.load())); // local() fallbacks may be absent
  });
  const s = await page.evaluate(() => window.hutuStage.s);
  if (s !== 1) throw new Error(`expected the stage at 1x, got ${s}`);
  return page.evaluate(measure, { tall, margin });
}

const rule = (sel, vars) => `${sel} { ${Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join(' ')} }`;

await build({ outDir: DIR });
const server = await serve(DIR);
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ locale: 'zh-CN' });
  const wide = await run(page, server.url, { width: 1280, height: 800, tall: false, margin: 44 });
  const tall = await run(page, server.url, { width: 390, height: 810, tall: true, margin: 36 });
  const css = [
    '/* Generated by scripts/align.mjs from the real fonts — do not edit by hand. */',
    rule('.front', wide.front),
    rule('.back', wide.back),
    '@media (max-aspect-ratio: 9/10) {',
    `  ${rule('.front', tall.front)}`,
    `  ${rule('.back', tall.back)}`,
    '}',
    '',
  ].join('\n');
  await writeFile(OUT, css);
  console.log(css);
} finally {
  await browser.close();
  server.close();
}

// Self-hosted font subsets (run locally with `npm run fonts`; the outputs are committed, so the
// deploy build needs no network). Downloads pinned sources into .cache/fonts, verifies their
// sha256, subsets each family to exactly the characters the page uses, and writes
//   assets/fonts/*.woff2        fingerprinted by the build and served as immutable
//   assets/fonts/manifest.json  character sets, checked by every build
//   src/fonts.css               @font-face rules plus metric-matched local fallbacks
//   static/licenses/*           licence texts that must accompany the fonts
import { createFontStack } from '@capsizecss/core';
import ebGaramondMetrics from '@capsizecss/metrics/eBGaramond';
import cormorantMetrics from '@capsizecss/metrics/cormorantGaramond';
import timesMetrics from '@capsizecss/metrics/timesNewRoman';
import notoSerifMetrics from '@capsizecss/metrics/notoSerif';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';
import { charsets } from './lib/charsets.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CACHE = join(ROOT, '.cache/fonts');

const GOOGLE_FONTS = 'https://raw.githubusercontent.com/google/fonts';
const SOURCES = {
  ebGaramond: {
    url: `${GOOGLE_FONTS}/f8c1d3d6cc75e30d77130bdcbfbff27e3b6233fe/ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf`,
    sha256: 'ef9512f92f6d579e5dc75af59a5a4b1b8b47d2eda89e00b954d44520e5369027',
    licence: `${GOOGLE_FONTS}/f8c1d3d6cc75e30d77130bdcbfbff27e3b6233fe/ofl/ebgaramond/OFL.txt`,
  },
  cormorant: {
    url: `${GOOGLE_FONTS}/5fcfd99f2fa4422991d29f4adae3f2f4b774f058/ofl/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf`,
    sha256: 'b20b7d9626dd956b2c5e558692ad328b1f19e3275e2782db4fa07670d83f35e0',
    licence: `${GOOGLE_FONTS}/5fcfd99f2fa4422991d29f4adae3f2f4b774f058/ofl/cormorantgaramond/OFL.txt`,
  },
  zhuque: {
    url: 'https://github.com/TrionesType/zhuque/releases/download/v0.212/ZhuqueFangsong-v0.212.zip',
    sha256: 'bb8b661a7643d2296a72d9d10530a00949419c4e527fb61783f73c2ba1a8c062',
    member: 'ZhuqueFangsong-Regular.ttf',
    licence: 'https://raw.githubusercontent.com/TrionesType/zhuque/v0.212/LICENSE.txt',
  },
  huiwen: {
    // The author's GBK release, as mirrored on npm (the package is a plain redistribution).
    url: 'https://registry.npmjs.org/@fontpkg/huiwen-mincho-gbk/-/huiwen-mincho-gbk-1.0.0.tgz',
    sha256: '83269c1ed7c4737a8c5df3db255d6d40a63fa8f74fe13e14847713f62af1f284',
    member: 'package/汇文明朝体GBK.ttf',
  },
};

// Layout features the Latin text actually uses; keeping every feature would drag in hundreds of
// alternates through glyph closure. CJK subsets keep everything (vertical forms need vert/vrt2).
const LATIN_FEATURES = ['kern', 'liga', 'clig', 'calt', 'ccmp', 'locl', 'mark', 'mkmk', 'smcp', 'c2sc'];

// `cjkFallback` gets a local face with the web font's own vertical metrics, so the baseline
// doesn't move when the font swaps in. `alias` adds a font-display: block family over the same
// file, for text whose fallback measures too differently (the small-caps labels): it appears
// once its font has loaded, which is early since every font is preloaded.
// local() matches full or PostScript names, not family names.
const CJK_LOCAL = ['Songti SC Regular', 'STSongti-SC-Regular', 'STSong', 'Noto Serif CJK SC', 'NotoSerifCJKsc-Regular', 'Source Han Serif SC', 'SourceHanSerifSC-Regular', 'SimSun'].map((n) => `local('${n}')`);
const FONTS = [
  { key: 'huiwen-mincho', source: 'huiwen', family: 'Huiwen Mincho', weight: 400, cjkFallback: true },
  { key: 'zhuque-fangsong', source: 'zhuque', family: 'Zhuque Fangsong', weight: 400, cjkFallback: true },
  { key: 'cormorant-garamond-700', source: 'cormorant', family: 'Cormorant Garamond', weight: 700, axes: { wght: 700 }, features: LATIN_FEATURES },
  { key: 'cormorant-garamond-500', source: 'cormorant', family: 'Cormorant Garamond', weight: 500, axes: { wght: 500 }, features: LATIN_FEATURES },
  // The small-caps labels use the alias: synthesised small caps in a fallback are much narrower.
  { key: 'eb-garamond', source: 'ebGaramond', family: 'EB Garamond', weight: 400, axes: { wght: 400 }, features: LATIN_FEATURES, alias: 'EB Garamond Caps' },
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Fetches a pinned source once and returns the font file inside it.
async function source(name) {
  const src = SOURCES[name];
  const archive = join(CACHE, decodeURIComponent(src.url.split('/').pop()));
  if (!existsSync(archive)) {
    console.log(`downloading ${src.url}`);
    await writeFile(archive, await download(src.url));
  }
  const digest = sha256(await readFile(archive));
  if (!src.sha256) console.warn(`  ${name}: unpinned, sha256 ${digest}`);
  else if (digest !== src.sha256) throw new Error(`${name}: sha256 mismatch (${digest})`);
  if (!src.member) return readFile(archive);
  const dir = join(CACHE, name);
  const file = join(dir, src.member);
  if (!existsSync(file)) {
    await mkdir(dir, { recursive: true });
    const tool = archive.endsWith('.zip') ? ['unzip', ['-o', '-q', archive, src.member, '-d', dir]] : ['tar', ['-xzf', archive, '-C', dir, src.member]];
    execFileSync(...tool);
  }
  return readFile(file);
}

// Vertical metrics from `hhea` (ascender, descender, line gap), as fractions of the em.
function verticalMetrics(font) {
  const table = (tag) => {
    for (let i = 0; i < font.readUInt16BE(4); i++) {
      const rec = 12 + i * 16;
      if (font.toString('latin1', rec, rec + 4) === tag) return font.readUInt32BE(rec + 8);
    }
    throw new Error(`no ${tag} table`);
  };
  const upm = font.readUInt16BE(table('head') + 18);
  const hhea = table('hhea');
  const pct = (v) => `${((v / upm) * 100).toFixed(2)}%`;
  return { ascent: pct(font.readInt16BE(hhea + 4)), descent: pct(-font.readInt16BE(hhea + 6)), lineGap: pct(font.readInt16BE(hhea + 8)) };
}

// Reads a few records from an OpenType `name` table (copyright, version, licence, licence URL).
function nameTable(font) {
  const tables = font.readUInt16BE(4);
  for (let i = 0; i < tables; i++) {
    const rec = 12 + i * 16;
    if (font.toString('latin1', rec, rec + 4) !== 'name') continue;
    const base = font.readUInt32BE(rec + 8);
    const count = font.readUInt16BE(base + 2);
    const strings = base + font.readUInt16BE(base + 4);
    const out = {};
    for (let j = 0; j < count; j++) {
      const r = base + 6 + j * 12;
      const [platform, , , id, length, offset] = [0, 2, 4, 6, 8, 10].map((o) => font.readUInt16BE(r + o));
      if (platform !== 3 || out[id] || ![0, 5, 13, 14].includes(id)) continue;
      const bytes = font.subarray(strings + offset, strings + offset + length);
      out[id] = Buffer.from(bytes).swap16().toString('utf16le');
    }
    return out;
  }
  return {};
}

async function main() {
  await mkdir(CACHE, { recursive: true });
  await mkdir(join(ROOT, 'assets/fonts'), { recursive: true });
  await mkdir(join(ROOT, 'static/licenses'), { recursive: true });
  const sets = await charsets(join(ROOT, 'src/index.html'));
  const manifest = {};

  for (const font of FONTS) {
    const data = await source(font.source);
    const text = sets[font.key];
    const woff2 = await subsetFont(data, text, {
      targetFormat: 'woff2',
      preserveNameIds: [0, 5, 13, 14],
      ...(font.axes && { variationAxes: font.axes }),
      ...(font.features && { keepFeatures: font.features }),
    });
    if (font.cjkFallback) font.metrics = verticalMetrics(data);
    await writeFile(join(ROOT, 'assets/fonts', `${font.key}.woff2`), woff2);
    manifest[font.key] = { family: font.family, weight: font.weight, chars: text, bytes: woff2.length, source: SOURCES[font.source].url };
    console.log(`${font.key.padEnd(24)} ${String([...text].length).padStart(3)} chars  ${(woff2.length / 1024).toFixed(1)} KB`);
  }
  await writeFile(join(ROOT, 'assets/fonts/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  // Fallback faces sized to the web fonts' metrics so the swap moves as little as possible.
  // Safari honours only size-adjust; Chromium and Firefox also apply the vertical overrides.
  const faces = FONTS.flatMap((f) => {
    const src = `url(asset:fonts/${f.key}.woff2) format("woff2")`;
    const m = f.metrics && `ascent-override: ${f.metrics.ascent}; descent-override: ${f.metrics.descent}; line-gap-override: ${f.metrics.lineGap};`;
    const face = (family, display) => `@font-face { font-family: "${family}"; font-weight: ${f.weight}; font-display: ${display}; src: ${src};${m ? ` ${m}` : ''} }`;
    return [
      face(f.family, 'swap'),
      ...(f.alias ? [face(f.alias, 'block')] : []),
      ...(m ? [`@font-face { font-family: "${f.family} Fallback"; src: ${CJK_LOCAL.join(', ')}; ${m} }`] : []),
    ];
  });
  const stack = (metrics, names) => {
    let css = createFontStack(metrics, { fontFaceFormat: 'styleString' }).fontFaces;
    for (const [from, to] of Object.entries(names)) css = css.replaceAll(`"${from}"`, `"${to}"`);
    return css.replace("local('Noto Serif Regular')", "local('Noto Serif'), local('Noto Serif Regular')");
  };
  const fallbacks = [
    stack([ebGaramondMetrics, timesMetrics, notoSerifMetrics], {
      'EB Garamond Fallback: Times New Roman': 'EB Garamond Fallback',
      'EB Garamond Fallback: Noto Serif': 'EB Garamond Fallback Noto',
    }),
    stack([cormorantMetrics, timesMetrics], { 'Cormorant Garamond Fallback': 'Cormorant Fallback' }),
  ];
  await writeFile(
    join(ROOT, 'src/fonts.css'),
    `/* Generated by scripts/fonts.mjs. Subsets cover only the characters in src/index.html. */\n${faces.join('\n')}\n${fallbacks.join('\n')}\n`,
  );

  // Licences: the OFL texts, and Huiwen Mincho's author statement plus its embedded notices.
  for (const [name, file] of [['ebGaramond', 'OFL-EBGaramond.txt'], ['cormorant', 'OFL-CormorantGaramond.txt'], ['zhuque', 'OFL-ZhuqueFangsong.txt']]) {
    await writeFile(join(ROOT, 'static/licenses', file), await download(SOURCES[name].licence));
  }
  const huiwen = nameTable(await source('huiwen'));
  await writeFile(
    join(ROOT, 'static/licenses/HuiwenMincho.txt'),
    [
      '汇文明朝体 Huiwen Mincho (GBK) — by 特里王 TerryWang',
      '',
      'Notices embedded in the font (kept in the subset served by this site):',
      `  Copyright: ${huiwen[0] ?? ''}`,
      `  Version:   ${huiwen[5] ?? ''}`,
      '',
      "The author's licence statement (授权声明):",
      '  1. 此字体可免费用于印刷、显示、嵌入电子文档、设备。',
      '     Free to use for printing, display, and embedding in electronic documents and devices.',
      '  2. 此字体可自由转发。',
      '     Free to redistribute.',
      '  3. 可以将此字体作为更大规模的套服软件的一部分来销售。（但不可单独将此字体文件作为商品转卖）',
      '     May be sold as part of a larger software bundle, but the font file may not be resold on its own.',
      '  4. 可以使用此字体开发新字体。',
      '     May be used to develop new fonts.',
      '',
      'Sources: https://zhuanlan.zhihu.com/p/344103391 (author), https://fonts.zeoseven.com/items/256/',
      'This site serves only a subset of the glyphs it uses, unmodified, free of charge.',
      '',
    ].join('\n'),
  );
  console.log('wrote assets/fonts, src/fonts.css and static/licenses');
}

await main();

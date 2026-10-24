// Works out which characters each self-hosted font has to cover, from the page template.
// Fonts are picked by marker classes (see src/critical.css):
//   .mincho      → Huiwen Mincho        .deboss-lat → Cormorant Garamond 700
//   .name-en     → Cormorant Garamond 500
// Every CJK character on the page also goes to Zhuque Fangsong (the CJK fallback of the body
// stack), and every other character to EB Garamond. Labels that boot.js swaps in (its string
// literals containing CJK) count as page text too.
import { readFile } from 'node:fs/promises';

const SKIP = new Set(['script', 'style', 'title', 'svg', 'template', 'noscript']);
const VOID = new Set(['meta', 'link', 'img', 'br', 'input', 'source', 'use', 'path', 'hr']);

export const isCjk = (ch) => ch.codePointAt(0) >= 0x2e80;

const decode = (s) =>
  s.replace(/&(#x?[\da-f]+|amp|lt|gt|quot|nbsp);/gi, (_, e) =>
    e[0] === '#' ? String.fromCodePoint(parseInt(e.slice(e[1] === 'x' ? 2 : 1), e[1] === 'x' ? 16 : 10))
      : { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ' }[e.toLowerCase()]);

// Returns [{ text, classes }] for every text node in <body>, outside skipped elements.
function textNodes(html) {
  const body = html.slice(html.indexOf('<body')).replace(/<!--[\s\S]*?-->/g, '');
  const stack = [];
  const out = [];
  for (const m of body.matchAll(/<(\/?)([a-z][\w-]*)([^>]*?)(\/?)>|([^<]+)/gi)) {
    const [, close, tag, attrs, selfClose, text] = m;
    if (text !== undefined) {
      if (!stack.some((e) => SKIP.has(e.tag))) {
        out.push({ text: decode(text), classes: new Set(stack.flatMap((e) => e.classes)) });
      }
      continue;
    }
    const name = tag.toLowerCase();
    if (close) {
      const i = stack.findLastIndex((e) => e.tag === name);
      if (i >= 0) stack.length = i;
    } else if (!selfClose && !VOID.has(name)) {
      const cls = attrs.match(/\sclass="([^"]*)"/);
      stack.push({ tag: name, classes: cls ? cls[1].split(/\s+/) : [] });
    }
  }
  return out;
}

const chars = (s) => [...new Set([...s.replace(/\s/g, '')])].sort().join('');

export async function charsets(templatePath) {
  const nodes = textNodes(await readFile(templatePath, 'utf8'));
  const within = (cls) => nodes.filter((n) => n.classes.has(cls)).map((n) => n.text).join('');
  const script = await readFile(new URL('boot.js', `file://${templatePath}`), 'utf8');
  const literals = (script.match(/'[^'\n]*'/g) ?? []).filter((l) => [...l].some(isCjk)).join('');
  const all = nodes.map((n) => n.text).join('') + literals;
  return {
    'huiwen-mincho': chars([...within('mincho')].filter(isCjk).join('')),
    'zhuque-fangsong': chars([...all].filter(isCjk).join('')),
    'cormorant-garamond-700': chars(within('deboss-lat')),
    'cormorant-garamond-500': chars(within('name-en')),
    'eb-garamond': chars([...all].filter((c) => !isCjk(c) && c !== "'").join('')) + ' ',
  };
}

// Lists characters the page uses that the committed subsets don't contain.
export async function checkCoverage(templatePath, manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    console.warn('warning: no font manifest yet; run `npm run fonts`');
    return [];
  }
  const need = await charsets(templatePath);
  const errors = [];
  for (const [font, set] of Object.entries(need)) {
    const have = manifest[font]?.chars ?? '';
    const missing = [...set].filter((c) => c !== ' ' && !have.includes(c));
    if (missing.length) errors.push(`font ${font} lacks ${JSON.stringify(missing.join(''))}; run \`npm run fonts\``);
  }
  return errors;
}

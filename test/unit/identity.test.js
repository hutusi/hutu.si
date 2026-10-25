// The page's identity for search engines and AI agents, in both languages: the structured data,
// rel="me" links, social tags, robots.txt, sitemap.xml and llms.txt, checked against the built
// site, with every place a profile link appears kept in agreement.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import { build } from '../../scripts/build.mjs';

const sharp = createRequire(import.meta.url)('sharp');
const CANONICAL = 'https://hutu.si/';
const PROFILES = ['https://hutusi.com', 'https://hutusi.substack.com/', 'https://ainaive.com', 'https://github.com/hutusi', 'https://x.com/hutusi'];

let dist;
let html;
let file;
before(async () => {
  dist = await mkdtemp(join(tmpdir(), 'hutusi-identity-'));
  await build({ outDir: dist, log: () => {} });
  html = await readFile(join(dist, 'index.html'), 'utf8');
  file = (p) => readFile(join(dist, p), 'utf8');
});
after(() => rm(dist, { recursive: true, force: true }));

const meta = (key) => html.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`))?.[1];
const face = (id) => html.match(new RegExp(`<section[^>]*id="${id}"[^>]*>([\\s\\S]*?)</section>`));
const text = (s) => s.replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const ld = () => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const tagged = (values, lang) => [values].flat().find((v) => v['@language'] === lang)?.['@value'];
const hasCjk = (s) => /[一-鿿]/.test(s);
const hasLatin = (s) => /[A-Za-z]{3}/.test(s);

test('the structured data describes the person in both languages', async () => {
  const page = ld();
  assert.equal(page['@type'], 'ProfilePage');
  assert.equal(page.url, CANONICAL);
  const person = page.mainEntity;
  assert.equal(person['@type'], 'Person');
  assert.equal(person.name, '胡智勇');
  for (const alias of ['John Hu', 'hutusi']) assert.ok(person.alternateName.includes(alias), `alternateName has ${alias}`);
  for (const field of ['description', 'jobTitle']) {
    assert.ok(hasCjk(tagged(person[field], 'zh-Hans') ?? ''), `${field} in Chinese`);
    assert.ok(hasLatin(tagged(person[field], 'en') ?? ''), `${field} in English`);
  }
  assert.equal(person.url, CANONICAL);
  assert.equal(person.email, 'mailto:me@hutu.si');
  assert.deepEqual(person.sameAs, PROFILES);

  // The image is the logo, at a stable URL that exists and is big enough to use.
  const image = new URL(person.image);
  assert.equal(image.origin, new URL(CANONICAL).origin);
  assert.ok(existsSync(join(dist, image.pathname)), `${image.pathname} is in the build`);
  const { width, height } = await sharp(join(dist, image.pathname)).metadata();
  assert.ok(width >= 112 && height >= 112, `logo is ${width}×${height}`);
});

test('every profile link on both faces is rel="me", and matches the structured data', () => {
  for (const id of ['front', 'back']) {
    const anchors = [...face(id)[1].matchAll(/<a [^>]*href="([^"]+)"[^>]*>/g)];
    const hrefs = anchors.map((a) => a[1]);
    assert.deepEqual(hrefs.filter((h) => /^https?:/.test(h)), PROFILES, `${id} face links`);
    assert.ok(hrefs.includes('mailto:me@hutu.si'), `${id} face has the email`);
    for (const a of anchors) assert.match(a[0], /\brel="[^"]*\bme\b/, `${id}: ${a[1]} is rel="me"`);
  }
});

test('the head has a canonical URL and complete, bilingual social card tags', async () => {
  assert.match(html, new RegExp(`<link rel="canonical" href="${CANONICAL}">`));
  assert.equal(meta('og:url'), CANONICAL);
  const title = html.match(/<title>([^<]*)<\/title>/)[1];
  for (const s of [title, meta('description'), meta('og:description'), meta('twitter:description')]) {
    assert.ok(hasCjk(s) && hasLatin(s), `bilingual: ${s}`);
  }
  assert.equal(meta('og:type'), 'profile');
  assert.equal(meta('og:locale'), 'zh_CN');
  assert.equal(meta('og:locale:alternate'), 'en_US');
  assert.equal(meta('twitter:card'), 'summary_large_image');
  assert.equal(meta('twitter:image'), meta('og:image'));
  assert.ok(meta('og:image:alt') && meta('twitter:image:alt'), 'the image has alt text');

  // The declared size of the social image matches the image itself.
  const og = new URL(meta('og:image'));
  const { width, height } = await sharp(join(dist, og.pathname)).metadata();
  assert.deepEqual([Number(meta('og:image:width')), Number(meta('og:image:height'))], [width, height]);
});

test('both faces are readable without JavaScript, each marked with its language', () => {
  const [front, back] = [face('front'), face('back')];
  assert.match(front[0], /lang="zh-Hans"/);
  assert.match(back[0], /lang="en"/);
  for (const words of ['胡智勇', '开发者', '写作者', '胡涂说', '好奇心周刊', 'ainaive.com', 'me@hutu.si']) assert.ok(text(front[1]).includes(words), `front: ${words}`);
  for (const words of ['John Hu', 'Builder', 'Writer', 'hutusi.com', 'Curiosity Weekly', 'ainaive.com', 'me@hutu.si']) assert.ok(text(back[1]).includes(words), `back: ${words}`);
});

test('robots.txt allows everything and names the sitemap, which lists the page', async () => {
  const robots = await file('robots.txt');
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.doesNotMatch(robots, /^Disallow: \S/m);
  const sitemap = robots.match(/^Sitemap: (\S+)$/m)?.[1];
  assert.equal(sitemap, `${CANONICAL}sitemap.xml`);
  const xml = await file('sitemap.xml');
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.deepEqual([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]), [CANONICAL]);
});

test('llms.txt introduces the person in both languages, with every link', async () => {
  const llms = await file('llms.txt');
  assert.match(llms, /^# 胡智勇 John Hu \(hutusi\)\n/);
  assert.match(llms, /^> .+/m, 'a one-line summary');
  assert.match(llms, /^## 中文$/m);
  assert.match(llms, /^## English$/m);
  const person = ld().mainEntity;
  for (const bio of [tagged(person.description, 'zh-Hans'), tagged(person.description, 'en')]) assert.ok(llms.includes(bio), 'the same bio as the structured data');
  for (const link of [...PROFILES, 'mailto:me@hutu.si']) assert.equal(llms.split(`(${link})`).length - 1, 2, `${link} once per language`);
  assert.ok(llms.includes('hututalk'), 'the WeChat account');
});

test('text files are served as UTF-8', async () => {
  const headers = await file('_headers');
  for (const path of ['/llms.txt', '/robots.txt', '/licenses/*']) {
    assert.match(headers, new RegExp(`^${path.replace(/[.*]/g, '\\$&')}\\n\\s+Content-Type: text/plain; charset=utf-8$`, 'm'), path);
  }
});

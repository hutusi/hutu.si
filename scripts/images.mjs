// Derives the site's raster images from the originals in sources/ (run locally; outputs are
// committed). Card images go to assets/img/ (fingerprinted by the build); icons go to static/
// (served at fixed URLs).
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const out = (p) => `${ROOT}${p}`;

await mkdir(out('assets/img'), { recursive: true });

// Logo seal on the card: 52 CSS px, at 2x and 3x.
for (const size of [104, 156]) {
  await sharp(out('sources/logo.jpg'))
    .resize(size, size, { kernel: 'lanczos3' })
    .webp({ quality: 65, effort: 6, smartSubsample: true })
    .toFile(out(`assets/img/logo-${size}.webp`));
}

// WeChat QR in the popup: 124 CSS px at 2x. The centre carries a photo, so it stays lossy, but
// quality is kept high enough that the modules stay crisp for scanning.
await sharp(out('sources/wechat-qr.jpg'))
  .resize(248, 248, { kernel: 'lanczos3' })
  .webp({ quality: 72, effort: 6 })
  .toFile(out('assets/img/wechat-qr.webp'));

// Favicon: the logo as the round seal it is on the card, at 16 and 32 px in one .ico (PNG entries,
// which every current browser reads).
const round = (size) =>
  sharp(out('sources/logo.jpg'))
    .resize(size, size, { kernel: 'lanczos3' })
    .composite([{ input: Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`), blend: 'dest-in' }])
    .png({ compressionLevel: 9, palette: true, effort: 10 })
    .toBuffer();
const sizes = [16, 32];
const pngs = await Promise.all(sizes.map(round));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const entry = 6 + 16 * i;
  header.writeUInt8(size, entry);
  header.writeUInt8(size, entry + 1);
  header.writeUInt16LE(1, entry + 4); // colour planes
  header.writeUInt16LE(32, entry + 6); // bits per pixel
  header.writeUInt32LE(pngs[i].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += pngs[i].length;
});
await writeFile(out('static/favicon.ico'), Buffer.concat([header, ...pngs]));

// Home-screen icon: square and opaque (iOS rounds the corners itself).
await sharp(out('sources/logo.jpg')).resize(180, 180, { kernel: 'lanczos3' }).png({ compressionLevel: 9, palette: true, effort: 10 }).toFile(out('static/apple-touch-icon.png'));

console.log('images written to assets/img/ and static/');

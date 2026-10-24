// Derives the site's raster images from the originals in sources/ (run locally; outputs are
// committed). Card images go to assets/img/ (fingerprinted by the build).
import { mkdir } from 'node:fs/promises';
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

console.log('images written to assets/img/');

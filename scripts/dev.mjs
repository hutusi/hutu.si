// Rebuilds dist/ whenever a source changes and serves it with `wrangler dev`, which runs the
// same asset routing as production (static files first, Worker only for /a /w /t).
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let timer;
let running = Promise.resolve();

const rebuild = () =>
  (running = running.then(() =>
    build().then(
      () => console.log('[dev] rebuilt'),
      (err) => console.error(`[dev] build failed:\n${err.message}`),
    ),
  ));

await rebuild();
for (const dir of ['src', 'assets', 'static']) {
  watch(`${ROOT}${dir}`, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 80);
  });
}
spawn('npx', ['wrangler', 'dev', '--port', process.env.PORT ?? '8787', ...process.argv.slice(2)], {
  cwd: ROOT,
  stdio: 'inherit',
});

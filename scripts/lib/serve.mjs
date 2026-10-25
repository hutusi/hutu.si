// A minimal static server for a build directory, used by the local tooling scripts (align, og)
// and by the service-worker tests, which need three more things: the build's _headers (so the
// CSP is real), a root that can be swapped for another build (a "new deploy"), and a way to drop
// every connection (a lost network, the same in every browser).
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

// _headers: a path pattern (`*` matches anything) followed by indented `Name: value` lines.
function parseHeaders(dir) {
  const file = join(dir, '_headers');
  if (!existsSync(file)) return [];
  const rules = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const pattern = new RegExp(`^${line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
      rules.push({ pattern, headers: {} });
    } else if (rules.length) {
      const i = line.indexOf(':');
      rules.at(-1).headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return rules;
}

export function serve(dir, { headers = false } = {}) {
  let root = dir;
  let rules = headers ? parseHeaders(root) : [];
  let offline = false;
  const server = createServer((req, res) => {
    if (offline) return req.socket.destroy();
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    let file = join(root, path === '/' ? 'index.html' : path);
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, '404.html');
    const extra = Object.assign({}, ...rules.filter((r) => r.pattern.test(path)).map((r) => r.headers));
    res.writeHead(file.endsWith('404.html') && path !== '/404.html' ? 404 : 200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', ...extra });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        close: () => (server.closeAllConnections(), server.close()),
        setRoot: (next) => ((root = next), (rules = headers ? parseHeaders(root) : [])),
        setOffline: (value) => ((offline = value), value && server.closeAllConnections()),
      }),
    ),
  );
}

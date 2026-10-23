// Zero-dependency static file server for the examples (works fully offline).
//   npm run demo            -> http://localhost:8080/examples/tv-demo/
//   node scripts/serve.mjs --port 4173
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portArg = process.argv.indexOf('--port');
const port = Number(portArg > -1 ? process.argv[portArg + 1] : process.env.PORT || 8080);
const host = process.env.HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root + path.sep) && file !== root) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (url.pathname === '/') {
      res.writeHead(302, { Location: '/examples/tv-demo/' }).end();
      return;
    }
    let info = await stat(file).catch(() => null);
    if (info && info.isDirectory()) {
      file = path.join(file, 'index.html');
      info = await stat(file).catch(() => null);
    }
    if (!info || path.basename(file).startsWith('.') || file.includes(`${path.sep}node_modules${path.sep}`)) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(500).end('Server error');
  }
});

server.listen(port, host, () => {
  console.log(`DPadBridge demo: http://localhost:${port}/examples/tv-demo/`);
  console.log(`Minimal example: http://localhost:${port}/examples/minimal/`);
});

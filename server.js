import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { createMarkHandler } from './server/mark-api.js';

const outputDir = resolve(process.cwd(), 'dist');
const markHandler = createMarkHandler(process.env.DSA_MARK_PASSWORD);
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

const app = createServer((req, res) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  if (pathname === '/api/mark') return markHandler(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }
  if (!existsSync(outputDir)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Run npm run build before starting the preview server.');
    return;
  }
  let requested;
  try { requested = resolve(outputDir, `.${decodeURIComponent(pathname)}`); }
  catch { res.writeHead(400).end('Invalid path'); return; }
  if (requested !== outputDir && !requested.startsWith(outputDir + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  let file = requested;
  if (!existsSync(file) || !statSync(file).isFile()) file = resolve(outputDir, 'index.html');
  if (!existsSync(file)) { res.writeHead(404).end('Not found'); return; }
  res.setHeader('Content-Type', contentTypes[extname(file)] || 'application/octet-stream');
  if (req.method === 'HEAD') { res.writeHead(200).end(); return; }
  createReadStream(file).pipe(res);
});

const port = Number(process.env.PORT || 4173);
app.listen(port, process.env.HOST || '127.0.0.1', () => {
  console.log(`Technovation preview is available at http://${process.env.HOST || '127.0.0.1'}:${port}`);
});

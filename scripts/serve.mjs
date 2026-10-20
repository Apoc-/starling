import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist');
const port = Number(process.env.PORT || 4173);
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png'};
http.createServer(async (req,res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') { res.writeHead(200); return res.end('ok'); }
  if (url.pathname === '/starling') { res.writeHead(302, {location:'/starling/'}); return res.end(); }
  if (!url.pathname.startsWith('/starling/')) { res.writeHead(404); return res.end('Not found'); }
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname.slice('/starling'.length)), url.pathname.endsWith('/') ? 'index.html' : '');
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  try { const body = await readFile(file); res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache'}); res.end(body); }
  catch { res.writeHead(404, {'Content-Type':'text/plain'}); res.end('Not found'); }
}).listen(port, '0.0.0.0', () => console.log(`Starling preview: http://localhost:${port}/starling/`));

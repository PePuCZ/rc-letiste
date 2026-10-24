// RC Letiště – jednoduchý server pro vyzkoušení na PC a v telefonu přes Tailscale (bez knihoven).
// Spuštění: node tools/server.mjs [port]   (výchozí 8080) → http://localhost:8080 a http://<IP Tailscale>:8080
// Pozor: přes http (ne localhost) iPhone nespustí service worker ani nepovolí polohu – na to je potřeba HTTPS
// (GitHub Pages / Cloudflare Pages, nebo „tailscale serve“). Vzhled a výpočty se ale vyzkoušet dají.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const KOREN = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +process.argv[2] || 8080;
const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
// Složky, které se nepodávají (podklady z HA, nástroje, git)
const SKRYTE = /^[\\/](podklady|tools|\.git)([\\/]|$)/;

createServer(async (req, res) => {
  let cesta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (cesta.endsWith('/')) cesta += 'index.html';
  const rel = normalize(cesta);
  if (rel.includes('..') || SKRYTE.test(rel)) { res.writeHead(404).end(); return; }
  try {
    const obsah = await readFile(join(KOREN, rel));
    res.writeHead(200, { 'content-type': TYPY[extname(rel)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(obsah);
  } catch (e) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Nenalezeno');
  }
}).listen(PORT, () => {
  console.log(`RC Letiště: http://localhost:${PORT}`);
  for (const a of Object.values(networkInterfaces()).flat())
    if (a && a.family === 'IPv4' && !a.internal) console.log(`            http://${a.address}:${PORT}`);
});

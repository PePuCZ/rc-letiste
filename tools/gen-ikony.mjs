// RC Letiště – generátor ikon aplikace (bez knihoven: vlastní kreslení do pixelů + zápis PNG přes zlib).
// Spuštění: node tools/gen-ikony.mjs  → ikony/ikona-180.png (iPhone plocha), -192, -512, -512-maskable a ikona.svg.
// Motiv: zelený čtverec, bílá kružnice kompasu, šedá dráha 07/25 s přerušovanou osou a modrá šipka větru.
// Souřadnice tvarů jsou v jednotkách 0–1 (střed 0,5; 0,5) a stejné tvary se zapíší i do SVG.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const KOREN = join(dirname(fileURLToPath(import.meta.url)), '..');
const VYSTUP = join(KOREN, 'ikony');

// Barvy (RGB)
const ZELENA = [99, 153, 34], BILA = [255, 255, 255], DRAHA = [60, 66, 54], MODRA = [58, 123, 213];
const RWY = 70;   // směr dráhy ve stupních (jako výchozí v aplikaci)

// Otočení bodu (x, y) kolem středu o úhel a (°, po směru hodinových ručiček, 0 = sever)
function otoc(x, y, a) {
  const k = -a * Math.PI / 180, dx = x - 0.5, dy = y - 0.5;
  return [0.5 + dx * Math.cos(k) - dy * Math.sin(k), 0.5 + dx * Math.sin(k) + dy * Math.cos(k)];
}

// Barva bodu (x, y) v jednotkách 0–1; m = měřítko kresby (maskovatelná ikona má motiv menší kvůli ořezu)
function barvaBodu(x, y, m) {
  // zpětné zmenšení motivu ke středu
  x = 0.5 + (x - 0.5) / m; y = 0.5 + (y - 0.5) / m;
  const r = Math.hypot(x - 0.5, y - 0.5);
  let c = ZELENA;
  if (Math.abs(r - 0.37) < 0.022) c = BILA;                       // kružnice kompasu
  const [u, v] = otoc(x, y, RWY);                                 // souřadnice v ose dráhy (v = podél)
  if (Math.abs(u - 0.5) < 0.075 && Math.abs(v - 0.5) < 0.33) {    // dráha
    c = DRAHA;
    if (Math.abs(u - 0.5) < 0.008 && Math.abs(v - 0.5) < 0.27 && Math.floor((v - 0.23) / 0.06) % 2 === 0) c = BILA;   // osa
  }
  // šipka větru ze 300° (fouká od severozápadu ke středu): dřík a hrot
  const [p, q] = otoc(x, y, 300);
  if (Math.abs(p - 0.5) < 0.028 && q > 0.06 && q < 0.27) c = MODRA;
  if (q >= 0.25 && q < 0.37 && Math.abs(p - 0.5) < (0.37 - q) * 0.62) c = MODRA;
  return c;
}

// Vykreslení čtverce n×n s vyhlazením (4×4 vzorky na pixel) do RGB bajtů
function kresli(n, m) {
  const px = Buffer.alloc(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let s = [0, 0, 0];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
      const c = barvaBodu((i + (a + 0.5) / 4) / n, (j + (b + 0.5) / 4) / n, m);
      s = s.map((v, k) => v + c[k]);
    }
    s.forEach((v, k) => { px[(j * n + i) * 3 + k] = Math.round(v / 16); });
  }
  return px;
}

// CRC32 pro bloky PNG
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function blok(typ, data) {
  const d = Buffer.concat([Buffer.from(typ), data]), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(d));
  return Buffer.concat([len, d, crc]);
}

// Zápis PNG (RGB, 8 bitů, bez průhlednosti – iOS průhlednost u ikon stejně nahradí černou)
function png(n, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 2;
  const radky = Buffer.alloc(n * (n * 3 + 1));
  for (let j = 0; j < n; j++) px.copy(radky, j * (n * 3 + 1) + 1, j * n * 3, (j + 1) * n * 3);   // filtr 0 na začátku řádku
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), blok('IHDR', ihdr), blok('IDAT', deflateSync(radky, { level: 9 })), blok('IEND', Buffer.alloc(0))]);
}

// Stejný motiv jako SVG (pro záložku prohlížeče a manifest)
function svg() {
  const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <!-- RC Letiště: kompas, dráha ${RWY}°, šipka větru (generuje tools/gen-ikony.mjs) -->
  <rect width="100" height="100" rx="22" fill="${hex(ZELENA)}"/>
  <circle cx="50" cy="50" r="37" fill="none" stroke="#fff" stroke-width="4.4"/>
  <g transform="rotate(${RWY} 50 50)">
    <rect x="42.5" y="17" width="15" height="66" fill="${hex(DRAHA)}"/>
    <line x1="50" y1="23" x2="50" y2="77" stroke="#fff" stroke-width="1.6" stroke-dasharray="6 6"/>
  </g>
  <g transform="rotate(300 50 50)" fill="${hex(MODRA)}">
    <rect x="47.2" y="6" width="5.6" height="21"/>
    <path d="M42.6 25 H57.4 L50 37 Z"/>
  </g>
</svg>
`;
}

mkdirSync(VYSTUP, { recursive: true });
for (const [n, jm, m] of [[180, 'ikona-180.png', 1], [192, 'ikona-192.png', 1], [512, 'ikona-512.png', 1], [512, 'ikona-512-maskable.png', 0.8]]) {
  writeFileSync(join(VYSTUP, jm), png(n, kresli(n, m)));
  console.log('ikona', jm);
}
writeFileSync(join(VYSTUP, 'ikona.svg'), svg());
console.log('ikona ikona.svg');

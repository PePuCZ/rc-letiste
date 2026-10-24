// RC Letiště – kreslení SVG: ikony počasí, nákres (kompas, dráha, start, vítr, slunce) a graf výhledu větru.
// Převzato z karty HA letiste-card.js; místo proměnných motivu HA se používají proměnné CSS aplikace
// (--text, --text2, --cara, --karta – definované v css/styl.css pro světlý i tmavý režim).

import { OK, BAD, WIND, rad, num, barva } from './vypocty.js';

// Barvy ikon a nákresu – tmavý motiv (původní) a světlý (kontrastnější)
const PAL_TMAVA = { sun: '#f2c14e', moon: '#d8dce6', mrak1: '#e8ebf0', mrak: '#b8bec8', mrakDest: '#9aa1ac', mrakBour: '#7d8490',
  obrys: '#00000033', obrysW: '.6', mlha: '#c9ced6', vlocka: '#fff', mrholeni: '#6aa6ff', dest: '#3a7bd5',
  kruh: 'var(--cara)', draha: '#8a8f84' };
const PAL_SVETLA = { sun: '#e39b00', moon: '#7f889b', mrak1: '#ffffff', mrak: '#a3aab5', mrakDest: '#8b93a0', mrakBour: '#5f6672',
  obrys: '#4b5563', obrysW: '1', mlha: '#6b7280', vlocka: '#5b7fc4', mrholeni: '#3a7bd5', dest: '#1f5fbf',
  kruh: '#9aa0a6', draha: '#6f756a' };
let PAL = PAL_TMAVA;

// Přepnutí palety podle režimu telefonu (volá app.js při startu a při změně režimu)
export function nastavMotiv(svetly) { PAL = svetly ? PAL_SVETLA : PAL_TMAVA; }

// Ikona počasí (SVG) podle WMO kódu se středem x, y; den = slunce, noc = měsíc
export function wxIcon(code, den, x, y) {
  const sun = den
    ? `<circle cx="${x}" cy="${y}" r="6" fill="${PAL.sun}"/>` + [0, 45, 90, 135, 180, 225, 270, 315].map(a =>
        `<line x1="${x + 8 * Math.sin(rad(a))}" y1="${y - 8 * Math.cos(rad(a))}" x2="${x + 11 * Math.sin(rad(a))}" y2="${y - 11 * Math.cos(rad(a))}" stroke="${PAL.sun}" stroke-width="1.8" stroke-linecap="round"/>`).join('')
    : `<path d="M${x + 3} ${y - 8} a8 8 0 1 0 5 12 a6.5 6.5 0 1 1 -5 -12z" fill="${PAL.moon}"/>`;
  const cloud = (dx, dy, c) => `<path d="M${x + dx - 9} ${y + dy + 5} h17 a4.5 4.5 0 0 0 0 -9 a6 6 0 0 0 -11.5 -1.5 a4.8 4.8 0 0 0 -5.5 10.5z" fill="${c}" stroke="${PAL.obrys}" stroke-width="${PAL.obrysW}"/>`;
  const drops = (n, c) => Array.from({ length: n }, (_, i) => `<line x1="${x - 5 + i * 5}" y1="${y + 8}" x2="${x - 7 + i * 5}" y2="${y + 13}" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`).join('');
  const flakes = n => Array.from({ length: n }, (_, i) => `<circle cx="${x - 5 + i * 5}" cy="${y + 11}" r="1.4" fill="${PAL.vlocka}"/>`).join('');
  if (code === 0) return sun;
  if (code === 1 || code === 2) return `<g transform="translate(-3 -3)">${sun}</g>` + cloud(3, 2, PAL.mrak1);
  if (code === 3) return cloud(0, 0, PAL.mrak);
  if (code === 45 || code === 48) return [0, 4, 8].map(i => `<line x1="${x - 9}" y1="${y - 4 + i}" x2="${x + 9}" y2="${y - 4 + i}" stroke="${PAL.mlha}" stroke-width="2" stroke-linecap="round"/>`).join('');
  if (code >= 51 && code <= 57) return cloud(0, -3, PAL.mrak) + drops(2, PAL.mrholeni);
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return cloud(0, -3, PAL.mrakDest) + drops(3, PAL.dest);
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return cloud(0, -3, PAL.mrak) + flakes(3);
  if (code >= 95) return cloud(0, -3, PAL.mrakBour) + `<path d="M${x + 1} ${y + 5} l-4 6 h3 l-2 5 l6 -7 h-3 l2 -4z" fill="${PAL.sun}"/>`;
  return '';
}

// Nákres do viewBoxu 200×200: r = směr dráhy, v/d = vítr (m/s, odkud °), oba = start možný z obou konců,
// t = směr startu, slunce = { az, alt }, code = WMO kód počasí. Vrací obsah SVG.
export function kompas({ r, v, d, oba, t, slunce, code }) {
  let h = `<circle cx="100" cy="100" r="86" fill="none" stroke="${PAL.kruh}" stroke-width="1.5"/>`;
  // světové strany
  for (const [a, l] of [[0, 'S'], [90, 'V'], [180, 'J'], [270, 'Z']])
    h += `<text x="${100 + 76 * Math.sin(rad(a))}" y="${104 - 76 * Math.cos(rad(a))}" text-anchor="middle" font-size="11" fill="var(--text2)">${l}</text>`;
  // dráha s přerušovanou osou
  h += `<g transform="rotate(${r} 100 100)"><rect x="91" y="34" width="18" height="132" rx="3" fill="${PAL.draha}"/>` +
       `<line x1="100" y1="44" x2="100" y2="156" stroke="var(--karta)" stroke-width="1.5" stroke-dasharray="6 6"/></g>`;
  // čísla konců dráhy – u konce, KAM se letí
  for (const e of [r, (r + 180) % 360]) {
    const x = 100 + 50 * Math.sin(rad(e)) + 14 * Math.cos(rad(e)), y = 104 - 50 * Math.cos(rad(e)) + 14 * Math.sin(rad(e));
    h += `<text x="${x}" y="${y}" text-anchor="middle" font-size="10" font-weight="600" fill="var(--text)">${num(e)}</text>`;
  }
  // zelená šipka (šipky) doporučeného směru startu
  for (const a of (oba ? [r, (r + 180) % 360] : [t]))
    h += `<g transform="rotate(${a} 100 100)"><path d="M100 58 l9 14 h-6 v26 h-6 v-26 h-6z" fill="${OK}"/></g>`;
  // modrá šipka větru: začíná na kružnici na straně, odkud fouká, délka podle síly
  if (v > 0.2) {
    const len = Math.min(14 + v * 6, 52);
    h += `<g transform="rotate(${d} 100 100)"><line x1="100" y1="6" x2="100" y2="${6 + len}" stroke="${WIND}" stroke-width="4" stroke-linecap="round"/>` +
         `<path d="M100 ${14 + len} l-8 -12 h16z" fill="${WIND}"/></g>`;
  } else if (!isNaN(v)) h += `<text x="100" y="196" text-anchor="middle" font-size="11" fill="var(--text2)">bezvětří</text>`;
  // slunce na kružnici (azimut) s ikonou počasí; v noci ikona počasí (s měsícem) vpravo nahoře
  const den = slunce.alt > -0.83, c = code ?? -1;
  if (den) {
    const sx = 100 + 86 * Math.sin(rad(slunce.az)), sy = 100 - 86 * Math.cos(rad(slunce.az));
    h += `<circle cx="${sx}" cy="${sy}" r="13" fill="var(--karta)"/>` + (wxIcon(c, true, sx, sy) || wxIcon(0, true, sx, sy));
  } else if (c >= 0) h += wxIcon(c, false, 182, 18);
  return h;
}

// Graf výhledu do viewBoxu 360×150: sloupce = vítr (barva = hodnocení), čára = nárazy, červená přerušovaná = mez větru.
// M = { time, wind_speed_10m, wind_direction_10m, wind_gusts_10m }, r = směr dráhy, m = meze.
export function graf(M, r, m) {
  const T = M.time || [], S = M.wind_speed_10m || [], D = M.wind_direction_10m || [], G = M.wind_gusts_10m || [];
  const n = Math.min(T.length, S.length, D.length, G.length);
  const W = 360, H = 150, L = 28, B = 22, TP = 8, R = 6;   // rozměry a okraje (vlevo osa, dole časy)
  if (!n) return `<text x="180" y="75" text-anchor="middle" font-size="12" fill="var(--text2)">Načítám data…</text>`;
  const cr = S.slice(0, n).map((s, i) => Math.abs(s * Math.sin(rad(D[i] - r))));   // složka bokem
  const ymax = Math.max(10, Math.ceil(Math.max(...G.slice(0, n).filter(g => g != null), m.v) + 1));
  const y = val => H - B - (H - B - TP) * val / ymax, bw = (W - L - R) / n;
  let c = '';
  for (let k = 0; k <= ymax; k += 2)   // vodorovná mřížka po 2 m/s
    c += `<line x1="${L}" x2="${W - R}" y1="${y(k)}" y2="${y(k)}" stroke="var(--cara)" stroke-width="0.6"/>` +
         `<text x="${L - 4}" y="${y(k) + 3}" text-anchor="end" font-size="9" fill="var(--text2)">${k}</text>`;
  c += `<line x1="${L}" x2="${W - R}" y1="${y(m.v)}" y2="${y(m.v)}" stroke="${BAD}" stroke-dasharray="4 3"/>`;
  cr.forEach((b, i) => {
    const sp = S[i];
    c += `<rect x="${L + i * bw + 2}" y="${y(sp)}" width="${bw - 4}" height="${y(0) - y(sp)}" rx="2" fill="${barva(b, sp, G[i], m)}"/>`;
    if (i % 2 === 0 || n <= 6) c += `<text x="${L + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="9" fill="var(--text2)">${String(T[i]).slice(11, 16)}</text>`;
  });
  c += `<polyline fill="none" stroke="var(--text)" stroke-width="1.5" points="${G.slice(0, n).map((g, i) => g == null ? '' : `${L + i * bw + bw / 2},${y(g)}`).filter(Boolean).join(' ')}"/>`;
  G.slice(0, n).forEach((g, i) => { if (g != null) c += `<circle cx="${L + i * bw + bw / 2}" cy="${y(g)}" r="2" fill="var(--text)"/>`; });
  return c;
}

// RC Letiště – výpočty bez vazby na zobrazení (převzato z karty HA letiste-card.js, 24. 10. 2026).
// Obsah: barvy hodnocení, převody jednotek a formátování, číselník počasí WMO, poloha slunce,
// rozklad větru na složku po dráze a bokem s hodnocením „Lze létat / Pozor / Nelétat“,
// vzdálenost dvou bodů na Zemi a čísla konců dráhy (07/25 apod.).

// Barvy hodnocení a větru (stejné jako v kartě HA: zelená / oranžová / červená / modrá)
export const OK = '#639922', WARN = '#eda100', BAD = '#e24b4a', WIND = '#3a7bd5';

// Výchozí meze hodnocení v m/s (v HA to byly input_number v balíčku letiste.yaml)
//   o = bokem oranžová, r = bokem červená, v = vítr celkem červená, g = nárazy červená
export const MEZE_VYCHOZI = { o: 3, r: 5, v: 4, g: 8 };

// Stupně → radiány
export const rad = x => x * Math.PI / 180;

// Číslo na jedno desetinné místo s desetinnou čárkou; chybějící hodnota = pomlčka
export const f1 = x => (x == null || isNaN(x) ? '–' : Number(x).toFixed(1).replace('.', ','));

// Zkratky dnů v týdnu (index = Date.getDay(), 0 = neděle)
export const DNY = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];

// Počasí podle WMO kódu (Open-Meteo weather_code)
export const WX = {
  0: 'Jasno', 1: 'Skoro jasno', 2: 'Polojasno', 3: 'Zataženo', 45: 'Mlha', 48: 'Mlha (námraza)',
  51: 'Slabé mrholení', 53: 'Mrholení', 55: 'Silné mrholení', 56: 'Mrznoucí mrholení', 57: 'Mrznoucí mrholení',
  61: 'Slabý déšť', 63: 'Déšť', 65: 'Silný déšť', 66: 'Mrznoucí déšť', 67: 'Mrznoucí déšť',
  71: 'Slabé sněžení', 73: 'Sněžení', 75: 'Silné sněžení', 77: 'Sněhová zrna',
  80: 'Přeháňky', 81: 'Přeháňky', 82: 'Silné přeháňky', 85: 'Sněhové přeháňky', 86: 'Sněhové přeháňky',
  95: 'Bouřka', 96: 'Bouřka s kroupami', 99: 'Bouřka s kroupami',
};

// Poloha slunce (azimut od severu, výška nad obzorem) – zjednodušený astronomický výpočet, přesnost ~1°
export function sunPos(date, lat, lon) {
  const k = Math.PI / 180, dd = date.getTime() / 86400000 - 10957.5;   // dny od J2000.0
  const g = (357.529 + 0.98560028 * dd) * k, q = 280.459 + 0.98564736 * dd;   // střední anomálie a délka
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * k, e = (23.439 - 0.00000036 * dd) * k;   // ekliptikální délka, sklon
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));   // rektascenze, deklinace
  const H = ((18.697374558 + 24.06570982441908 * dd) % 24) * 15 * k + lon * k - ra, f = lat * k;   // hodinový úhel
  const alt = Math.asin(Math.sin(f) * Math.sin(dec) + Math.cos(f) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(f) - Math.sin(f) * Math.cos(H));
  return { az: (az / k + 360) % 360, alt: alt / k };
}

// Symbol počasí MET Norway (yr.no, např. „lightrainshowers_day“) → nejbližší WMO kód
export function yrKod(sym) {
  const s = String(sym || '').replace(/_(day|night|polartwilight)$/, '');
  if (!s) return undefined;
  if (s.includes('thunder')) return 95;
  if (s.includes('sleet')) return s.includes('showers') ? 85 : 67;
  if (s.includes('snow')) return s.includes('showers') ? (s.startsWith('heavy') ? 86 : 85) : (s.startsWith('light') ? 71 : s.startsWith('heavy') ? 75 : 73);
  if (s.includes('rainshowers')) return s.startsWith('light') ? 80 : s.startsWith('heavy') ? 82 : 81;
  if (s.includes('rain')) return s.startsWith('light') ? 61 : s.startsWith('heavy') ? 65 : 63;
  return { clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45 }[s];
}

// Čas (ISO nebo ms) → místní čas v Praze ve tvaru Open-Meteo „RRRR-MM-DDTHH:MM“
export const mistni = iso => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Prague' }).replace(' ', 'T').slice(0, 16);

// „Závažnost“ WMO kódu pro výběr nejhoršího počasí dne (bouřka > sníh > déšť > mrholení > mlha > oblačnost)
export const HOR_KOD = c => c == null ? -1 : c >= 95 ? 9 : c >= 71 && c <= 86 && !(c >= 80 && c <= 82) ? 8 : c >= 61 ? 7 : c >= 51 ? 6 : c >= 45 ? 5 : c;

// Číslo konce dráhy podle směru (kurz / 10, zaokrouhleno; 0 → 36), např. 70° → „07“
export const num = x => { let n = Math.round(((x % 360) + 360) % 360 / 10); if (n === 0) n = 36; return String(n).padStart(2, '0'); };

// Vyhodnocení větru v (m/s) ze směru d (°) s nárazy g pro dráhu r (°) a meze m (viz MEZE_VYCHOZI).
// Vrací: cross = složka bokem, head = složka po dráze (proti), start = číslo dráhy pro start (při skoro
// bezvětří po dráze oba konce „07/25“), strana = odkud fouká bokem, fc = barva, t = směr startu (°), podm = text.
export function hodnot(v, d, g, r, m) {
  const c = Math.cos(rad(d - r)), cross = Math.abs(v * Math.sin(rad(d - r))), head = Math.abs(v * c);
  const t = c >= 0 ? r : (r + 180) % 360;   // startuje se proti větru: ten konec, ze kterého fouká
  const start = head < 0.5 ? [num(r), num(r + 180)].sort().join('/') : num(t);
  const sd = (c >= 0 ? 1 : -1) * Math.sin(rad(d - r));   // znaménko boční složky vůči směru startu
  const strana = sd > 0.05 ? 'zprava' : sd < -0.05 ? 'zleva' : 'po ose';
  const fc = cross >= m.r || g > m.g || v >= m.v ? BAD : cross >= m.o ? WARN : OK;
  return { cross, head, start, strana, fc, t, podm: fc === BAD ? 'Nelétat' : fc === WARN ? 'Pozor' : 'Lze létat' };
}

// Barva hodnocení jen podle čísel (pro sloupce grafu, kde se nepočítá směr startu)
export const barva = (cross, v, g, m) => cross >= m.r || g > m.g || v >= m.v ? BAD : cross >= m.o ? WARN : OK;

// Vzdálenost dvou bodů na Zemi v km (haversine); a, b = šířka a délka prvního bodu, c, d = druhého
export function vzdal(a, b, c, d) {
  const k = Math.PI / 180, x = Math.sin((c - a) * k / 2) ** 2 + Math.cos(a * k) * Math.cos(c * k) * Math.sin((d - b) * k / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(x));
}

// Escapování textu do HTML (názvy a kontakty z databáze)
export const esc = x => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

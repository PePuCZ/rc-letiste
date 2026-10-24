// RC Letiště – service worker: běh aplikace bez signálu (offline) a rychlé spuštění.
//  • Soubory aplikace (APP): uložené při instalaci; podávají se z mezipaměti a na pozadí se aktualizují
//    (nová verze se projeví při dalším spuštění). Při změně souborů zvýšit VERZE → stará mezipaměť se smaže.
//  • Předpověď (Open-Meteo, MET Norway): nejdřív síť; úspěšná odpověď se uloží s hlavičkou „x-ulozeno“
//    (čas stažení v ms). Bez sítě se vrátí uložená odpověď – aplikace podle hlavičky ukáže „Offline · data z …“.
//  • Ostatní (dlaždice mapy, snímky radaru, odkazy) jdou rovnou na síť.

const VERZE = 'rc-letiste-v1';
const DATA = 'rc-letiste-data';   // předpověď – nemaže se při nové verzi aplikace
const APP = [
  './', 'index.html', 'manifest.webmanifest', 'css/styl.css',
  'js/app.js', 'js/data.js', 'js/kresba.js', 'js/nastaveni.js', 'js/radar.js', 'js/vypocty.js',
  'data/letiste.json', 'ikony/ikona.svg', 'ikony/ikona-180.png', 'ikony/ikona-192.png', 'ikony/ikona-512.png',
];
const PREDPOVED = ['api.open-meteo.com', 'api.met.no'];

// Instalace: uložit soubory aplikace
self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERZE).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});

// Aktivace: smazat mezipaměti starších verzí aplikace (data předpovědi zůstanou)
self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys()
    .then(k => Promise.all(k.filter(n => n !== VERZE && n !== DATA).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (PREDPOVED.includes(url.hostname)) ev.respondWith(predpoved(req));
  else if (url.origin === self.location.origin) ev.respondWith(aplikace(req, ev));
});

// Předpověď: síť, při chybě uložená kopie
async function predpoved(req) {
  const c = await caches.open(DATA);
  try {
    const odp = await fetch(req);
    if (odp.ok) {
      const h = new Headers(odp.headers);
      h.set('x-ulozeno', String(Date.now()));
      await c.put(req, new Response(await odp.clone().blob(), { status: odp.status, statusText: odp.statusText, headers: h }));
    }
    return odp;
  } catch (e) {
    const ulozena = await c.match(req);
    if (ulozena) return ulozena;
    throw e;
  }
}

// Soubory aplikace: z mezipaměti hned, ze sítě na pozadí obnovit (bez sítě aspoň uložená verze)
async function aplikace(req, ev) {
  const c = await caches.open(VERZE);
  const ulozena = await c.match(req, { ignoreSearch: true });
  const zeSite = fetch(req).then(odp => { if (odp.ok) c.put(req, odp.clone()); return odp; });
  if (ulozena) { ev.waitUntil(zeSite.catch(() => {})); return ulozena; }
  return zeSite;
}

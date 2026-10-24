// RC Letiště – hlavní modul aplikace (PWA pro iPhone, 24. 10. 2026).
// Převod karty Home Assistantu letiste-card.js na samostatnou aplikaci, která si data stahuje sama.
// Obsah obrazovky (shora): výběr letiště (oblíbená + seznam podle vzdálenosti), detail letiště, nákres
// s hodnocením a údaji o větru, přepínač zdroje předpovědi, graf výhledu, tabulka „Kdy se dá létat“
// na 8 dní po hodinách s detailem počasí dne, meteoradar ČHMÚ, nastavení mezí.
// Vybraná hodina: klepnutím v tabulce, nebo švihnutím do stran přes nákres (doleva = později, doprava = dříve).
// Data: js/data.js (Open-Meteo, MET Norway, ALADIN), nastavení v telefonu: js/nastaveni.js.

import { OK, WARN, BAD, MEZE_VYCHOZI, f1, DNY, WX, sunPos, hodnot, vzdal, num, esc } from './vypocty.js';
import { wxIcon, kompas, graf, nastavMotiv } from './kresba.js';
import { obnov, data, stahujeSe } from './data.js';
import { nast, uloz, oblibena, prepniOblibene } from './nastaveni.js';
import { Radar } from './radar.js';

// Zkratka pro výběr prvku
const $ = s => document.querySelector(s);

// Stav obrazovky (co je rozbalené a vybrané); trvalé volby jsou v nast
const st = {
  db: [],          // databáze letišť (data/letiste.json)
  sel: null,       // vybraná hodina předpovědi „RRRR-MM-DDTHH“, null = teď
  fc: [],          // hodiny tabulky předpovědi s vyhodnocením (plní kresliPredpoved)
  menu: false,     // rozbalený seznam všech letišť
  jenObl: false,   // v seznamu jen oblíbená
  info: false,     // otevřený detail letiště
  wxDen: null,     // den s otevřeným detailem počasí
  poloha: nast.poloha,   // poloha telefonu { lat, lon, cas, cerstva }
};

// Světlý / tmavý režim podle telefonu
const tmavyRezim = window.matchMedia('(prefers-color-scheme: dark)');
const jeTmavy = () => tmavyRezim.matches;

// Prvky stránky
const el = {
  chips: $('.chips'), menu: $('.menu'), info: $('.info'), main: $('.main'), dial: $('.dial'), pill: $('.pill'),
  kdy: $('.kdy'), dl: $('.udaje'), warn: $('.warn'), zdroj: $('.zdroj'), chart: $('.chart'), pred: $('.pred'),
  wxd: $('.wxd'), stav: $('.stav'), obnovit: $('.obnovit'), nastBtn: $('.nastbtn'), nast: $('.nast'),
};
const radar = new Radar($('.rad'));

// Zobrazené letiště (podle id v nastavení, jinak nejbližší / první)
const letiste = () => st.db.find(l => l.id === nast.vybrane) || st.db[0];

// ===== Start =====
async function start() {
  nastavMotiv(!jeTmavy());
  tmavyRezim.addEventListener('change', () => { nastavMotiv(!jeTmavy()); kresli(); });
  try {
    st.db = await (await fetch('data/letiste.json')).json();
  } catch (e) {
    el.pill.textContent = 'Databázi letišť se nepodařilo načíst';
    return;
  }
  udalosti();
  if (!st.db.some(l => l.id === nast.vybrane)) uloz({ vybrane: st.db[0].id });
  kresli();
  zjistiPolohu(true);
  stahni();
  // obnova dat: při návratu do aplikace a každých 5 min, dokud je vidět (mezipaměť v data.js hlídá limity)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { stahni(); zjistiPolohu(false); } });
  setInterval(() => { if (!document.hidden) stahni(); else kresli(); }, 5 * 60000);
  setInterval(() => { if (!document.hidden) kresli(); }, 60000);   // posun „teď“ a stáří dat
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker:', e.message));
}

// Stažení dat zobrazeného letiště (vynutit = tlačítko Obnovit)
function stahni(vynutit = false) {
  obnov(letiste(), nast.zdroj, kresli, vynutit);
  kresli();
}

// Poloha telefonu pro řazení letišť; při prvním spuštění bez uloženého výběru se zvolí nejbližší letiště
function zjistiPolohu(prvni) {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(p => {
    const pol = { lat: p.coords.latitude, lon: p.coords.longitude, cas: Date.now() };
    st.poloha = { ...pol, cerstva: true };
    const nove = !nast.poloha;   // úplně první poloha = první spuštění
    uloz({ poloha: pol });
    if (prvni && nove) {
      const nej = [...st.db].sort((a, b) => vzdal(pol.lat, pol.lon, a.lat, a.lon) - vzdal(pol.lat, pol.lon, b.lat, b.lon))[0];
      if (nej) { uloz({ vybrane: nej.id }); stahni(); }
    }
    kresli();
  }, () => { /* poloha nepovolena / nedostupná – zůstane poslední uložená */ }, { maximumAge: 5 * 60000, timeout: 15000 });
}

// Výběr letiště (zvolená hodina zůstává)
function vyber(id) {
  uloz({ vybrane: id });
  st.menu = false;
  stahni();
}

// ===== Obsluha klepnutí a švihnutí =====
function udalosti() {
  el.zdroj.addEventListener('click', ev => {
    const b = ev.target.closest('button[data-z]'); if (!b) return;
    uloz({ zdroj: b.dataset.z }); stahni();
  });
  el.obnovit.addEventListener('click', () => { stahni(true); zjistiPolohu(false); });
  el.chips.addEventListener('click', ev => {
    if (ev.target.closest('.vse')) { st.menu = !st.menu; kresli(); return; }
    const b = ev.target.closest('button[data-id]');
    if (b && b.dataset.id !== nast.vybrane) vyber(b.dataset.id);
  });
  el.menu.addEventListener('click', ev => {
    if (ev.target.closest('.x')) { st.menu = false; kresli(); return; }
    const ii = ev.target.closest('.ii'), hv = ev.target.closest('.hv'), vy = ev.target.closest('.vy'), sg = ev.target.closest('.seg button');
    if (ii) { vyber(ii.dataset.id); st.info = true; kresli(); el.info.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
    if (sg) { st.jenObl = sg.dataset.f === 'obl'; kresli(); return; }
    if (vy) { vyber(vy.dataset.id); return; }
    if (hv) { prepniOblibene(hv.dataset.id); kresli(); }   // hvězdička: přidat / odebrat z oblíbených
  });
  el.info.addEventListener('click', ev => { if (ev.target.closest('.x')) { st.info = false; kresli(); } });
  el.dl.addEventListener('click', ev => { if (ev.target.closest('.let')) { st.info = !st.info; kresli(); } });
  el.kdy.addEventListener('click', ev => { if (ev.target.closest('.zpet')) { st.sel = null; kresli(); } });
  el.wxd.addEventListener('click', ev => { if (ev.target.closest('.x')) { st.wxDen = null; kresli(); } });
  el.pred.addEventListener('click', ev => {
    const dn = ev.target.closest('button[data-den]');
    if (dn) {   // symbol počasí u dne → detail počasí (druhé klepnutí zavře)
      st.wxDen = st.wxDen === dn.dataset.den ? null : dn.dataset.den;
      kresli();
      if (st.wxDen) el.wxd.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const b = ev.target.closest('button[data-i]');
    if (!b) return;
    const f = st.fc[+b.dataset.i];
    st.sel = st.sel === f.key ? null : f.key;   // druhé klepnutí = zpět na teď
    kresli();
    if (st.sel) el.main.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // Švihnutí do stran přes nákres a údaje posouvá vybranou hodinu: doleva = o hodinu později, doprava = dříve;
  // před první hodinou předpovědi se vrátí na „Teď“. Svislý posun stránky zůstává prohlížeči (touch-action: pan-y),
  // počítá se jen převážně vodorovné švihnutí aspoň 40 px.
  let sx = null, sy = null;
  el.main.addEventListener('touchstart', ev => { const t = ev.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
  el.main.addEventListener('touchend', ev => {
    if (sx === null || !st.fc.length) return;
    const t = ev.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    sx = sy = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    // výchozí pozice: vybraná hodina, jinak „teď“ = první hodina předpovědi, která ještě neskončila
    const ted = st.fc.findIndex(x => new Date(x.key + ':00') > Date.now() - 3600e3);
    const i = st.sel ? st.fc.findIndex(x => x.key === st.sel) : ted - 1;
    const n = i + (dx < 0 ? 1 : -1);
    st.sel = n < Math.max(ted, 0) ? null : st.fc[Math.min(n, st.fc.length - 1)].key;
    kresli();
  }, { passive: true });

  // Nastavení mezí (dialog)
  el.nastBtn.addEventListener('click', () => { vyplnNastaveni(); el.nast.showModal(); });
  el.nast.addEventListener('click', ev => {
    if (ev.target === el.nast || ev.target.closest('.zavrit')) el.nast.close();
    if (ev.target.closest('.vychozi')) { uloz({ meze: { ...MEZE_VYCHOZI } }); vyplnNastaveni(); kresli(); }
  });
  el.nast.addEventListener('input', ev => {
    const i = ev.target.closest('input[data-m]'); if (!i) return;
    const v = parseFloat(i.value.replace(',', '.'));
    if (!isNaN(v) && v > 0) { uloz({ meze: { ...nast.meze, [i.dataset.m]: v } }); kresli(); }
  });
}

// Hodnoty mezí do dialogu nastavení
function vyplnNastaveni() {
  el.nast.querySelectorAll('input[data-m]').forEach(i => { i.value = nast.meze[i.dataset.m]; });
}

// ===== Kreslení celé obrazovky =====
function kresli() {
  const L0 = letiste(); if (!L0) return;
  const r = Number(L0.rwy ?? 70), m = nast.meze;
  const D = data(L0.id, nast.zdroj), d0 = D ? D.d : null;

  // tabulka předpovědi (naplní st.fc); vybraná hodina se pak ukáže nahoře místo aktuálního stavu
  kresliPredpoved(d0, r, m);
  const f = st.sel && st.fc.find(x => x.key === st.sel);
  if (!f && st.fc.length) st.sel = null;   // hodina už v předpovědi není
  let v, d, g, head, cross, start, strana, podm, wx;
  if (f) {
    ({ v, d, g, head, cross, start, strana, podm } = f);
    wx = { code: f.wc, cc: f.cc, pp: f.pp, cas: new Date(f.key + ':30') };
    el.kdy.innerHTML = `<span>Zvolená hodina <b>${f.label} ${f.h}:00</b></span><button type="button" class="zpet">Zpět na teď</button>`;
  } else {
    const C = (d0 && d0.current) || {};
    v = parseFloat(C.wind_speed_10m); d = parseFloat(C.wind_direction_10m); g = parseFloat(C.wind_gusts_10m);
    if (isNaN(v)) { podm = 'Načítám data…'; start = ''; strana = ''; head = cross = NaN; }
    else ({ head, cross, start, strana, podm } = hodnot(v, d, g, r, m));
    el.kdy.innerHTML = st.sel ? '<span>Načítám předpověď…</span>' : '<span><b>Teď</b></span>';
    wx = { code: C.weather_code, cc: C.cloud_cover, srazky: C.precipitation, cas: new Date() };
  }
  const col = { 'Lze létat': OK, 'Pozor': WARN, 'Nelétat': BAD }[podm] || '#888';
  const oba = start.includes('/');
  const t = Math.cos((d - r) * Math.PI / 180) >= 0 ? r : (r + 180) % 360;

  // nákres
  const sp = sunPos(wx.cas, Number(L0.lat), Number(L0.lon));
  el.dial.innerHTML = kompas({ r, v, d, oba, t, slunce: sp, code: wx.code });

  // hodnocení a údaje
  el.pill.textContent = podm; el.pill.style.background = col;
  const smery = oba ? [r, (r + 180) % 360] : [t];
  const protiSlunci = sp.alt > 0 && sp.alt < 30 && smery.some(a => Math.abs(((sp.az - a + 540) % 360) - 180) < 25);
  el.dl.innerHTML = `
    <dt>Letiště</dt><dd>${esc(L0.nazev)} <button type="button" class="let" aria-label="Detail letiště">ⓘ</button></dd>
    <dt>Start na dráhu</dt><dd>${start ? (oba ? start + ' (oba směry)' : start) : '–'}</dd>
    <dt>Vítr</dt><dd>${f1(v)} m/s z ${isNaN(d) ? '–' : Math.round(d)}°</dd>
    <dt>Proti (po dráze)</dt><dd>${f1(head)} m/s</dd>
    <dt>Bokem</dt><dd>${f1(cross)} m/s ${oba ? '' : strana}</dd>
    <dt>Nárazy</dt><dd>${f1(g)} m/s</dd>
    <dt>Počasí</dt><dd>${WX[wx.code] || '–'}${wx.cc != null ? ` · oblačnost ${Math.round(wx.cc)} %` : ''}${wx.pp != null ? ` · déšť ${Math.round(wx.pp)} %` : ''}${wx.srazky ? ` · ${f1(wx.srazky)} mm` : ''}</dd>
    <dt>Slunce</dt><dd>${sp.alt > -0.83 ? `výška ${Math.round(sp.alt)}°, směr ${Math.round(sp.az)}°` : 'pod obzorem'}${protiSlunci ? ' · <span class="slw">slunce proti startu!</span>' : ''}</dd>`;
  el.warn.hidden = L0.jistota !== 'nízká';

  kresliZdroj(D);
  kresliVyber(L0);
  el.chart.innerHTML = graf((d0 && d0.minutely_15) || {}, r, m);
  radar.nastav(L0, jeTmavy());
}

// Přepínač zdroje předpovědi a stav dat v liště (stáří, offline)
function kresliZdroj(D) {
  const z = nast.zdroj, ok = D && D.zdroj === z;
  const popis = { yr: 'MET Norway (yr.no), nárazy a slunce: Open-Meteo', aladin: 'ČHMÚ ALADIN 1 km (3 dny), dál ECMWF – přes Open-Meteo',
                  om: 'Open-Meteo (nejlepší mix modelů)' }[z];
  el.zdroj.innerHTML = `<span class="seg">${[['yr', 'yr.no'], ['aladin', 'ČHMÚ ALADIN'], ['om', 'Open-Meteo']].map(([k, t]) =>
    `<button type="button" data-z="${k}" class="${z === k ? 'on' : ''}">${t}</button>`).join('')}</span>` +
    `<span>${ok ? 'Data: ' + popis : D ? 'Načítám… (zatím Open-Meteo)' : 'Načítám…'}</span>`;
  // lišta: kdy byla data stažená; offline = z mezipaměti telefonu
  const bezi = stahujeSe(letiste().id);
  let txt = bezi ? 'Stahuji…' : '';
  if (D && !bezi) {
    const min = Math.round((Date.now() - D.cas) / 60000);
    const kdy = new Date(D.cas).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
    txt = (D.offline ? 'Offline · data z ' : 'Data z ') + kdy + (min >= 60 ? ` (před ${Math.floor(min / 60)} h)` : '');
  }
  el.stav.textContent = txt;
  el.stav.classList.toggle('stare', !!(D && (D.offline || Date.now() - D.cas > 60 * 60000)));
  el.obnovit.classList.toggle('toci', !!bezi);
}

// Výběr letiště: rychlá tlačítka (oblíbená + zobrazené) a rozbalovací seznam řazený podle vzdálenosti
function kresliVyber(L0) {
  const cur = L0.id, pol = st.poloha, obl = oblibena();
  const sez = st.db.map(l => ({ ...l, km: pol ? vzdal(pol.lat, pol.lon, l.lat, l.lon) : null }))
                   .sort((a, b) => (a.km ?? 0) - (b.km ?? 0) || a.nazev.localeCompare(b.nazev, 'cs'));
  const kmTxt = l => l.km == null ? '' : (l.km < 10 ? l.km.toFixed(1).replace('.', ',') : Math.round(l.km)) + ' km';
  const rychla = sez.filter(l => obl.has(l.id) || l.id === cur);
  el.chips.innerHTML = rychla.map(l => `<button type="button" class="chip${l.id === cur ? ' on' : ''}" data-id="${l.id}">${esc(l.nazev)}</button>`).join('') +
    `<button type="button" class="chip vse" aria-expanded="${st.menu}">Všechna letiště ${st.menu ? '▴' : '▾'}</button>`;
  kresliInfo(sez.find(l => l.id === cur), kmTxt);
  el.menu.hidden = !st.menu;
  if (!st.menu) return;
  const vid = st.jenObl ? sez.filter(l => obl.has(l.id)) : sez;
  const odkud = pol ? 'podle vzdálenosti od ' + (pol.cerstva ? 'telefonu' : 'poslední polohy') : 'abecedně (poloha neznámá)';
  el.menu.innerHTML = `
    <div class="mh"><span class="seg"><button type="button" data-f="vse" class="${st.jenObl ? '' : 'on'}">Vše (${sez.length})</button><button type="button" data-f="obl" class="${st.jenObl ? 'on' : ''}">★ Oblíbená (${obl.size})</button></span>
      <span>${odkud}</span><button type="button" class="x">Zavřít</button></div>
    <ul>${vid.map(l => `<li><button type="button" class="hv${obl.has(l.id) ? ' on' : ''}" data-id="${l.id}" aria-label="${obl.has(l.id) ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'}">${obl.has(l.id) ? '★' : '☆'}</button>` +
      `<button type="button" class="vy${l.id === cur ? ' on' : ''}" data-id="${l.id}"><span>${esc(l.nazev)}</span><small>${l.jistota === 'nízká' ? 'směr ? · ' : ''}${kmTxt(l)}</small></button>` +
      `<button type="button" class="ii" data-id="${l.id}" aria-label="Detail letiště ${esc(l.nazev)}">ⓘ</button></li>`).join('') ||
      '<li class="prazdne">Zatím žádná oblíbená – přidej je hvězdičkou.</li>'}</ul>`;
}

// Detail letiště: navigace, kontakty, dráha, poloha, popis (METAR přijde ve druhé vlně)
function kresliInfo(l, kmTxt) {
  el.info.hidden = !(st.info && l);
  if (!st.info || !l) return;
  const telHref = t => 'tel:' + (t.replace(/\D/g, '').length === 9 ? '+420' : '+') + t.replace(/\D/g, '').slice(-12);
  const dest = `${l.lat},${l.lon}`;
  const r = Number(l.rwy), smer = `${num(r)}/${num(r + 180)}`;
  const radky = [
    ...(l.tel || []).map(t => `<span>Telefon</span><a href="${telHref(t)}">${esc(t)}</a>`),
    ...(l.email || []).map(m => `<span>E-mail</span><a href="mailto:${esc(m)}">${esc(m)}</a>`),
    ...(l.webs || []).map(w => `<span>${/facebook/.test(w) ? 'Facebook' : 'Web'}</span><a href="${esc(w)}" target="_blank" rel="noopener">${esc(w.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>`),
    ...(l.kamera || []).map(k => `<span>Kamera</span><a href="${esc(k)}" target="_blank" rel="noopener">${esc(k.replace(/^https?:\/\//, ''))}</a>`),
    `<span>Dráha</span><b>${smer} (${r}°) · jistota ${esc(l.jistota)}</b>`,
    `<span>Poloha</span><b>${l.lat.toFixed(5)}, ${l.lon.toFixed(5)}</b>`,
  ];
  el.info.innerHTML = `
    <div class="ih"><b>${esc(l.nazev)}</b><small>${kmTxt(l)}</small><button type="button" class="x">Zavřít</button></div>
    <div class="nav">
      <a class="hl" href="https://maps.apple.com/?daddr=${dest}&dirflg=d" target="_blank" rel="noopener">➤ Navigovat (Apple Mapy)</a>
      <a href="https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving" target="_blank" rel="noopener">Google Mapy</a>
      <a href="https://mapy.cz/zakladni?x=${l.lon}&y=${l.lat}&z=16&source=coor&id=${l.lon}%2C${l.lat}" target="_blank" rel="noopener">Mapy.cz</a>
    </div>
    <div class="kon">${radky.join('')}</div>
    ${(l.tel || []).length + (l.email || []).length ? '' : '<div class="p">Kontakt v databázích není.</div>'}
    <div class="p">${esc(l.popis)}</div>`;
}

// Detail počasí vybraného dne (z tabulky) po hodinách
function kresliPocasiDne(d0, idx, dny) {
  const x = dny.find(z => z.day === st.wxDen);
  if (!x) { el.wxd.hidden = true; st.wxDen = null; return; }
  const A = a => d0.daily[a] || [], P = a => d0.hourly[a] || [];
  const k = A('time').indexOf(x.day), pad = n => String(n).padStart(2, '0');
  const dt = new Date(x.day + 'T12:00'), label = `${DNY[dt.getDay()]} ${dt.getDate()}. ${dt.getMonth() + 1}.`;
  const wc = A('weather_code')[k], tmax = A('temperature_2m_max')[k], tmin = A('temperature_2m_min')[k];
  const ps = A('precipitation_sum')[k], pp = A('precipitation_probability_max')[k];
  const vm = A('wind_speed_10m_max')[k], gm = A('wind_gusts_10m_max')[k];
  const WCh = P('weather_code'), TT = P('temperature_2m'), PPh = P('precipitation_probability'), SS = P('wind_speed_10m');
  let hrs = '';
  for (let hh = x.a; hh <= x.b; hh++) {
    const i = idx[`${x.day}T${pad(hh)}`];
    if (i === undefined) continue;
    hrs += `<div>${hh} h<svg viewBox="0 0 30 30">${wxIcon(WCh[i], true, 15, 14)}</svg><b>${TT[i] != null ? Math.round(TT[i]) + '°' : '–'}</b>` +
           `<span class="pp">${PPh[i] != null ? PPh[i] + ' %' : ''}</span><br>${SS[i] != null ? f1(SS[i]) + ' m/s' : ''}</div>`;
  }
  el.wxd.hidden = false;
  el.wxd.innerHTML = `
    <div class="hl"><svg viewBox="0 0 30 30">${wxIcon(wc, true, 15, 14)}</svg>
      <div><b>${label}</b><br>${WX[wc] || '–'}</div><button type="button" class="x">Zavřít</button></div>
    <div class="sum">
      <span>Teplota</span><span>${tmin != null ? Math.round(tmin) : '–'} až ${tmax != null ? Math.round(tmax) : '–'} °C</span>
      <span>Srážky</span><span>${ps != null ? f1(ps) + ' mm' : '–'}${pp != null ? ` · pravděpodobnost ${pp} %` : ''}</span>
      <span>Vítr max</span><span>${vm != null ? f1(vm) + ' m/s' : '–'}${gm != null ? ` · nárazy ${f1(gm)} m/s` : ''}</span>
      <span>Slunce</span><span>východ ${x.sr} · západ ${x.ss}</span>
    </div>
    <div class="hrs">${hrs}</div>
    <div class="note">Po hodinách: počasí, teplota, pravděpodobnost deště (modře), vítr.</div>`;
}

// Tabulka „Kdy se dá létat“: dnes + 7 dní, hodiny od východu do západu slunce, barva = hodnocení
function kresliPredpoved(d0, r, m) {
  st.fc = [];
  const Hh = a => (d0 && d0.hourly && d0.hourly[a]) || [], Dd = a => (d0 && d0.daily && d0.daily[a]) || [];
  const T = Hh('time'), S = Hh('wind_speed_10m'), D = Hh('wind_direction_10m'), G = Hh('wind_gusts_10m');
  const DWC = Dd('weather_code'), WC = Hh('weather_code'), CC = Hh('cloud_cover'), PP = Hh('precipitation_probability');
  const dd = Dd('time'), sr = Dd('sunrise'), ss = Dd('sunset');
  if (!T.length || !dd.length) { el.pred.innerHTML = '<tr><td class="note">Načítám předpověď…</td></tr>'; el.wxd.hidden = true; return; }
  const now = new Date(), pad = x => String(x).padStart(2, '0');
  const ted = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}`;
  const hr = t => +t.slice(11, 13);
  const dnes = ted.slice(0, 10);
  const dny = dd.map((day, k) => ({ day, a: hr(sr[k]), b: hr(ss[k]), sr: sr[k].slice(11, 16), ss: ss[k].slice(11, 16) }))
                .filter(x => x.day >= dnes).slice(0, 8);
  if (!dny.length) return;
  const lo = Math.min(...dny.map(x => x.a)), hi = Math.max(...dny.map(x => x.b));
  const idx = {}; T.forEach((t, i) => { idx[t.slice(0, 13)] = i; });
  let h = '<tr><th></th>' + Array.from({ length: hi - lo + 1 }, (_, i) => `<th>${i + lo}</th>`).join('') + '</tr>';
  for (const x of dny) {
    const dt = new Date(x.day + 'T12:00');
    const label = x.day === dnes ? 'Dnes' : `${DNY[dt.getDay()]} ${dt.getDate()}. ${dt.getMonth() + 1}.`;
    const k = dd.indexOf(x.day), dwc = DWC[k];
    const ikona = dwc != null ? `<svg viewBox="0 0 30 30">${wxIcon(dwc, true, 15, 14)}</svg>` : '';
    h += `<tr><th class="d"><button type="button" class="den${st.wxDen === x.day ? ' on' : ''}" data-den="${x.day}" aria-label="Počasí ${label}">${ikona}<span>${label}<small>☀ ${x.sr}–${x.ss}</small></span></button></th>`;
    for (let hh = lo; hh <= hi; hh++) {
      const key = `${x.day}T${pad(hh)}`, i = idx[key];
      if (hh < x.a || hh > x.b || i === undefined || S[i] == null) { h += '<td></td>'; continue; }
      const minule = key < ted;   // uplynulé hodiny dnes ztlumené
      const v = S[i], d = D[i], g = G[i], e = hodnot(v, d, g, r, m);
      st.fc.push({ key, label, h: hh, v, d, g, ...e, wc: WC[i], cc: CC[i], pp: PP[i] });
      h += `<td><button type="button" data-i="${st.fc.length - 1}"${key === st.sel ? ' class="sel"' : ''} style="background:${e.fc}${minule ? ';opacity:.4' : ''}" aria-label="${label} ${hh} h">${f1(v)}</button></td>`;
    }
    h += '</tr>';
  }
  el.pred.innerHTML = h;
  if (st.wxDen) kresliPocasiDne(d0, idx, dny); else el.wxd.hidden = true;
}

start();

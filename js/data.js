// RC Letiště – stahování předpovědi přímo z veřejných služeb (bez Home Assistantu).
// Zdroje (přepínač v aplikaci):
//   yr  = MET Norway Locationforecast 2.0 (yr.no, CC BY 4.0) – výchozí; nedává pro ČR nárazy ani slunce,
//         ty se doplní z Open-Meteo;
//   aladin = ČHMÚ ALADIN 1 km přes Open-Meteo (model chmi_aladin_seamless: 3 dny, dál ECMWF);
//   om  = Open-Meteo (nejlepší mix modelů) – stahuje se vždy, protože dává nárazy a východ/západ slunce.
// Mezipaměť v paměti: Open-Meteo 15 min, yr.no a ALADIN 30 min na letiště; po chybě nový pokus za 2 min.
// Offline: service worker (sw.js) vrací poslední uloženou odpověď a přidá k ní hlavičku „x-ulozeno“
// s časem stažení, takže aplikace umí ukázat, jak stará data jsou.
// Výsledek je vždy ve tvaru odpovědi Open-Meteo: { current, hourly, daily, minutely_15 }.

import { mistni, yrKod, HOR_KOD } from './vypocty.js';

// Proměnné, které chceme od Open-Meteo (aktuální stav, 15minutové kroky, hodiny, dny)
const OM_CUR = 'wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,cloud_cover,precipitation';
const OM_M15 = 'wind_speed_10m,wind_direction_10m,wind_gusts_10m';
const OM_HOUR = 'wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,cloud_cover,precipitation_probability,temperature_2m,precipitation';
const OM_DAY = 'sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max';

// Platnost mezipaměti v minutách a čekání po chybě
const PLATNOST = { om: 15, aladin: 30, yr: 30 };
const PO_CHYBE = 2;

// Adresy dotazů pro letiště l (lat/lon z databáze)
const ADRESA = {
  om: l => `https://api.open-meteo.com/v1/forecast?latitude=${l.lat}&longitude=${l.lon}&current=${OM_CUR}` +
    `&minutely_15=${OM_M15}&forecast_minutely_15=12&hourly=${OM_HOUR}&daily=${OM_DAY}&forecast_days=8` +
    `&wind_speed_unit=ms&timezone=Europe%2FPrague`,
  aladin: l => `https://api.open-meteo.com/v1/forecast?latitude=${l.lat}&longitude=${l.lon}&current=${OM_CUR}` +
    `&hourly=${OM_HOUR}&daily=${OM_DAY}&forecast_days=8&models=chmi_aladin_seamless&wind_speed_unit=ms&timezone=Europe%2FPrague`,
  // MET Norway: poloha nejvýš na 4 desetinná místa (podmínky služby)
  yr: l => `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${(+l.lat).toFixed(4)}&lon=${(+l.lon).toFixed(4)}`,
};

// Stažená data: pamet[druh][id letiště] = { j: JSON, cas: kdy stažené (ms), offline: z mezipaměti SW }
const pamet = { om: {}, aladin: {}, yr: {} };
const pokus = { om: {}, aladin: {}, yr: {} };   // čas posledního pokusu (ms)
const bezi = { om: {}, aladin: {}, yr: {} };    // právě se stahuje
let yrPrevod = null;                            // poslední převod yr.no → tvar Open-Meteo (ať se nepočítá při každém kreslení)

// Stažení JSON s časovým limitem 30 s; čas stažení z hlavičky service workeru, jinak teď
async function stahniJson(url) {
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 30000);
  try {
    const odp = await fetch(url, { signal: ac.signal });
    if (!odp.ok) throw new Error('HTTP ' + odp.status);
    const ulozeno = Number(odp.headers.get('x-ulozeno'));
    return { j: await odp.json(), cas: ulozeno || Date.now(), offline: !!ulozeno };
  } finally { clearTimeout(tm); }
}

// Úprava stažených dat podle druhu; vrací null, když odpověď nedává smysl
function uprav(druh, j) {
  if (druh === 'yr') return j && j.properties && j.properties.timeseries ? j.properties.timeseries : null;
  if (!j || !j.hourly) return null;
  if (druh === 'aladin') {
    // ALADIN nemá 15min krok → „výhled“ pro graf ze 6 hodinových hodnot od aktuální hodiny
    const H = j.hourly, ted = mistni(Date.now()).slice(0, 13), i0 = Math.max(0, H.time.findIndex(t => t.slice(0, 13) >= ted));
    j.minutely_15 = {};
    ['time', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'].forEach(a => { j.minutely_15[a] = H[a].slice(i0, i0 + 6); });
  }
  return j;
}

// Jeden druh dat pro letiště l; hotovo() se zavolá, když přijdou nová data. vynutit = bez ohledu na mezipaměť.
async function stahni(druh, l, hotovo, vynutit) {
  const id = l.id, ted = Date.now();
  if (bezi[druh][id]) return;
  const p = pamet[druh][id];
  if (!vynutit && p && !p.offline && ted - p.cas < PLATNOST[druh] * 60000) return;   // ještě platné
  if (!vynutit && pokus[druh][id] && ted - pokus[druh][id] < PO_CHYBE * 60000 && !(p && p.offline)) return;   // nedávno se zkoušelo
  bezi[druh][id] = true; pokus[druh][id] = ted;
  try {
    const { j, cas, offline } = await stahniJson(ADRESA[druh](l));
    const d = uprav(druh, j);
    // data ze service workeru (offline) nepřepíší čerstvější, která už máme
    if (d && !(offline && p && p.cas >= cas)) pamet[druh][id] = { j: d, cas, offline };
  } catch (e) {
    console.warn('RC Letiště: stažení', druh, l.nazev, 'selhalo:', e.message);
  }
  bezi[druh][id] = false;
  hotovo();   // překreslit i po chybě (zmizí „Stahuji…“) – až po uvolnění příznaku bezi
}

// Obnoví data letiště l pro zvolený zdroj (Open-Meteo vždy kvůli nárazům a slunci)
export function obnov(l, zdroj, hotovo, vynutit = false) {
  if (!l) return;
  stahni('om', l, hotovo, vynutit);
  if (zdroj === 'yr' || zdroj === 'aladin') stahni(zdroj, l, hotovo, vynutit);
}

// Probíhá stahování pro letiště? (pro ukazatel v liště)
export const stahujeSe = id => bezi.om[id] || bezi.yr[id] || bezi.aladin[id];

// Data yr.no převedená do tvaru Open-Meteo; nárazy a slunce z Open-Meteo. Šestihodinové kroky se rozprostřou do hodin.
function yrData(ts, om) {
  if (yrPrevod && yrPrevod.ts === ts && yrPrevod.om === om) return yrPrevod.d;
  const H = { time: [], wind_speed_10m: [], wind_direction_10m: [], wind_gusts_10m: [], weather_code: [], cloud_cover: [],
              precipitation_probability: [], temperature_2m: [], precipitation: [] };
  const gOm = {}; (om.hourly.time || []).forEach((t, i) => { gOm[t.slice(0, 13)] = om.hourly.wind_gusts_10m[i]; });   // nárazy podle hodiny
  ts.forEach((e, k) => {
    const dalsi = ts[k + 1], krok = dalsi ? Math.round((Date.parse(dalsi.time) - Date.parse(e.time)) / 3600000) : 1;
    const d = e.data.instant.details, b = e.data.next_1_hours || e.data.next_6_hours || e.data.next_12_hours || {};
    const sr = (e.data.next_1_hours || e.data.next_6_hours || {}).details || {};
    for (let h = 0; h < Math.max(1, Math.min(krok, 6)); h++) {
      const t = mistni(Date.parse(e.time) + h * 3600000);
      H.time.push(t); H.wind_speed_10m.push(d.wind_speed); H.wind_direction_10m.push(d.wind_from_direction);
      H.wind_gusts_10m.push(gOm[t.slice(0, 13)] ?? null); H.weather_code.push(yrKod(b.summary && b.summary.symbol_code));
      H.cloud_cover.push(d.cloud_area_fraction); H.precipitation_probability.push(null); H.temperature_2m.push(d.air_temperature);
      H.precipitation.push(sr.precipitation_amount != null ? +(sr.precipitation_amount / (e.data.next_1_hours ? 1 : 6)).toFixed(1) : null);
    }
  });
  // denní souhrn z hodin yr.no, východ/západ slunce a max. nárazy z Open-Meteo
  const D = { ...om.daily, weather_code: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_sum: [],
              precipitation_probability_max: [], wind_speed_10m_max: [], wind_gusts_10m_max: [] };
  (om.daily.time || []).forEach((den, k) => {
    const ii = H.time.map((t, i) => t.startsWith(den) ? i : -1).filter(i => i >= 0);
    const v = a => ii.map(i => H[a][i]).filter(x => x != null);
    const kody = v('weather_code');
    D.weather_code.push(kody.length ? kody.reduce((a, b) => HOR_KOD(b) > HOR_KOD(a) ? b : a) : null);
    D.temperature_2m_max.push(v('temperature_2m').length ? Math.max(...v('temperature_2m')) : null);
    D.temperature_2m_min.push(v('temperature_2m').length ? Math.min(...v('temperature_2m')) : null);
    D.precipitation_sum.push(ii.length ? +v('precipitation').reduce((a, b) => a + b, 0).toFixed(1) : null);
    D.precipitation_probability_max.push(null);
    D.wind_speed_10m_max.push(v('wind_speed_10m').length ? Math.max(...v('wind_speed_10m')) : null);
    D.wind_gusts_10m_max.push(om.daily.wind_gusts_10m_max ? om.daily.wind_gusts_10m_max[k] : null);
  });
  // teď = první krok yr.no; výhled pro graf = příštích 6 hodin po hodinách
  const t0 = ts[0].data, d0 = t0.instant.details, s0 = t0.next_1_hours || t0.next_6_hours || {};
  const C = { wind_speed_10m: d0.wind_speed, wind_direction_10m: d0.wind_from_direction, wind_gusts_10m: om.current ? om.current.wind_gusts_10m : null,
              weather_code: yrKod(s0.summary && s0.summary.symbol_code), cloud_cover: d0.cloud_area_fraction,
              precipitation: s0.details ? s0.details.precipitation_amount : null };
  const ted = mistni(Date.now()).slice(0, 13), i0 = Math.max(0, H.time.findIndex(t => t.slice(0, 13) >= ted));
  const M = {}; ['time', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'].forEach(a => { M[a] = H[a].slice(i0, i0 + 6); });
  const d = { current: C, hourly: H, daily: D, minutely_15: M };
  yrPrevod = { ts, om, d };
  return d;
}

// Data k zobrazení pro letiště id a zdroj. Dokud zvolený zdroj není stažený, použije se Open-Meteo.
// Vrací { d: data ve tvaru Open-Meteo, zdroj: skutečně použitý, cas: stáří nejstarší části, offline } nebo null.
export function data(id, zdroj) {
  const om = pamet.om[id], yr = pamet.yr[id], al = pamet.aladin[id];
  if (zdroj === 'yr' && yr && om) return { d: yrData(yr.j, om.j), zdroj: 'yr', cas: Math.min(yr.cas, om.cas), offline: yr.offline || om.offline };
  if (zdroj === 'aladin' && al) return { d: al.j, zdroj: 'aladin', cas: al.cas, offline: al.offline };
  if (om) return { d: om.j, zdroj: 'om', cas: om.cas, offline: om.offline };
  return null;
}

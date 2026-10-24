// RC Letiště – meteoradar ČHMÚ na mapě OpenStreetMap (převzato z karty HA letiste-card.js).
// Snímky: opendata.chmi.cz, složená odrazivost max Z, krok 5 min, projekce EPSG:3857 (jako dlaždice OSM).
// Stahuje se jen po rozbalení části „Meteoradar“; přehrává posledních 60 min (13 snímků), zoom 19 km až celá ČR.
// Obrázky se vkládají jako <img>, takže nevadí CORS a nic se nestahuje přes fetch.

import { BAD } from './vypocty.js';

// Adresa snímků a zeměpisný rozsah mapové části snímku (západ, východ, jih, sever) + velikost vnitřní mapy v px
const RAD = { url: 'https://opendata.chmi.cz/meteorology/weather/radar/composite/maxz/png/pacz2gmaps3.z_max3d.',
              z: 11.267, v: 19.624, j: 48.047, s: 51.458, W: 384, H: 320 };
// Zeměpisná délka / šířka → pixely Web Mercatoru v zoomu z
const mx = (lon, z) => (lon + 180) / 360 * 256 * 2 ** z;
const my = (lat, z) => (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * 256 * 2 ** z;

export class Radar {
  // el = kontejner části „Meteoradar“ v index.html (tlačítko .radbtn, mapa .radmap, ovládání)
  constructor(el) {
    this.el = el;
    this.zoom = 8;
    this.mapa = el.querySelector('.radmap');
    this.vnitr = el.querySelector('.radmap .vnitr');
    this.pos = el.querySelector('.radpos');
    this.cas = el.querySelector('.radcas');
    this.hrajBtn = el.querySelector('.hraj');
    this.obsah = el.querySelector('.radin');
    el.querySelector('.radbtn').addEventListener('click', () => this.prepni());
    this.hrajBtn.addEventListener('click', () => { this.hraje ? this.stop() : this.start(); });
    this.pos.addEventListener('input', () => { this.stop(); this.snimek(+this.pos.value); });
    el.addEventListener('click', ev => {
      const b = ev.target.closest('button[data-zoom]'); if (!b) return;
      this.zoom = +b.dataset.zoom; this.kresli();
    });
    if (window.ResizeObserver) new ResizeObserver(() => this.meritko()).observe(this.mapa);
  }

  // Rozbalení / sbalení části
  prepni() {
    this.otevreno = !this.otevreno;
    this.el.querySelector('.radsip').textContent = this.otevreno ? '▴' : '▾';
    this.obsah.hidden = !this.otevreno;
    if (this.otevreno) this.nacti(); else this.stop();
  }

  // Nastavení letiště a motivu (volá app.js při každém kreslení; mapa se překreslí jen při změně)
  nastav(l, tmavy) {
    const zmena = !this.l || this.l.id !== l.id || this.tmavy !== tmavy;
    this.l = l; this.tmavy = tmavy;
    if (this.otevreno && zmena) this.kresli();
  }

  // Časy snímků: posledních 60 min po 5 min (UTC), nejnovější s rezervou 7 min na zpracování v ČHMÚ
  nacti() {
    const t0 = Math.floor((Date.now() - 7 * 60000) / 300000) * 300000;
    const p2 = n => String(n).padStart(2, '0');
    const jm = t => { const d = new Date(t); return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}.${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}`; };
    if (!this.sn || this.t0 !== t0) {
      this.t0 = t0; this.i = null;
      this.sn = Array.from({ length: 13 }, (_, k) => {
        const t = t0 - (12 - k) * 300000, img = new Image(), sn = { t, img, ok: null };
        img.onload = () => { sn.ok = true; this.prehled(); };
        img.onerror = () => { sn.ok = false; this.prehled(); };   // snímek chybí (výpadek radaru) – přeskočí se
        img.src = RAD.url + jm(t) + '.0.png';
        return sn;
      });
    }
    this.kresli();
    this.start();
  }

  // Posuvník jen přes načtené snímky; první načtený hned zobrazit
  prehled() {
    const ok = this.sn.filter(x => x.ok);
    this.pos.max = Math.max(0, ok.length - 1);
    if (this.i == null && ok.length) this.snimek(ok.length - 1);
  }

  // Mapa: dlaždice OSM, výřez radaru, letiště s kruhy vzdálenosti, atribuce
  kresli() {
    const l = this.l; if (!l) return;
    const z = this.zoom, W = RAD.W, H = RAD.H;
    const cel = z <= 6, clon = cel ? 15.45 : l.lon, clat = cel ? 49.8 : l.lat;   // celá ČR = střed republiky
    const ox = mx(clon, z) - W / 2, oy = my(clat, z) - H / 2;
    let h = '';
    for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + W) / 256); tx++)
      for (let ty = Math.floor(oy / 256); ty <= Math.floor((oy + H) / 256); ty++)
        h += `<img class="podklad${this.tmavy ? ' tma' : ''}" src="https://tile.openstreetmap.org/${z}/${tx}/${ty}.png" style="left:${tx * 256 - ox}px;top:${ty * 256 - oy}px;width:256px;height:256px" alt="">`;
    const rx = mx(RAD.z, z) - ox, ry = my(RAD.s, z) - oy, rw = mx(RAD.v, z) - mx(RAD.z, z), rh = my(RAD.j, z) - my(RAD.s, z);
    // ČHMÚ PNG 680×460: zeměpisně platí jen mapová část x 0–598, y 81–459 px (vpravo a nahoře jsou výškové řezy);
    // ořízne se i rámeček a nadpis (horních 14 px mapové části = jen pás nad severní hranicí ČR)
    const kx = rw / 598, ky = rh / 378, ox1 = 1, oy1 = 15, ox2 = 597, oy2 = 377;
    h += `<div style="position:absolute;overflow:hidden;opacity:.8;left:${rx + ox1 * kx}px;top:${ry + oy1 * ky}px;width:${(ox2 - ox1) * kx}px;height:${(oy2 - oy1) * ky}px">` +
         `<img class="radimg" src="" style="image-rendering:${z >= 10 ? 'pixelated' : 'auto'};left:${-ox1 * kx}px;top:${-(81 + oy1) * ky}px;width:${680 * kx}px;height:${460 * ky}px" alt=""></div>`;
    // letiště + kruhy 5/10 km (blízko) nebo 10/25 km
    const ax = mx(l.lon, z) - ox, ay = my(l.lat, z) - oy, mpp = 156543.03 * Math.cos(l.lat * Math.PI / 180) / 2 ** z;   // metrů na pixel
    if (!cel) for (const km of (z >= 10 ? [5, 10] : [10, 25])) { const r = km * 1000 / mpp; h += `<div class="kruh" style="left:${ax - r}px;top:${ay - r}px;width:${2 * r}px;height:${2 * r}px"></div>`; }
    h += `<div class="bod" style="left:${ax}px;top:${ay}px;background:${BAD}"></div><div class="jm" style="left:${ax}px;top:${ay}px">${l.nazev}</div>`;
    h += `<div class="atrib">Radar © ČHMÚ · mapa © OpenStreetMap</div>`;
    this.vnitr.innerHTML = h;
    this.img = this.vnitr.querySelector('.radimg');
    this.el.querySelectorAll('button[data-zoom]').forEach(b => b.classList.toggle('on', +b.dataset.zoom === z));
    this.meritko();
    if (this.i != null) this.snimek(this.i);
  }

  // Vnitřní mapa má pevných 384×320 px a zvětší se na šířku kontejneru
  meritko() { if (this.mapa.clientWidth) this.vnitr.style.transform = `scale(${this.mapa.clientWidth / RAD.W})`; }

  // Zobrazení i-tého načteného snímku s časem
  snimek(i) {
    const ok = (this.sn || []).filter(x => x.ok);
    if (!ok.length) { this.cas.textContent = 'Načítám radar…'; return; }
    i = Math.min(Math.max(0, i), ok.length - 1); this.i = i; this.pos.value = i;
    const sn = ok[i];
    if (this.img) this.img.src = sn.img.src;
    const min = Math.round((Date.now() - sn.t) / 60000);
    this.cas.textContent = new Date(sn.t).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) + ` (před ${min} min)`;
  }

  // Přehrávání animace po 0,6 s; na posledním snímku chvíli počkat
  start() {
    this.stop(); this.hraje = true; this.hrajBtn.textContent = '❚❚';
    let pauza = 0;
    this.timer = setInterval(() => {
      const n = (this.sn || []).filter(x => x.ok).length; if (!n) return;
      if (this.i === n - 1 && pauza++ < 3) return;
      pauza = 0; this.snimek(this.i == null || this.i >= n - 1 ? 0 : this.i + 1);
    }, 600);
  }
  stop() { clearInterval(this.timer); this.timer = null; this.hraje = false; this.hrajBtn.textContent = '▶'; }
}

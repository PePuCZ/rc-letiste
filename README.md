# RC Letiště

Webová aplikace (PWA) pro iPhone: jestli a kterým směrem se dá na modelářském letišti létat.
Vznikla převodem karty Home Assistantu „Letiště“ – data si stahuje sama, HA nepotřebuje.
Zadání a podklady z HA jsou jen lokálně na PC POHODA (`ZADANI.md`, `podklady/`), do veřejného repozitáře nepatří.

## Co umí (1. verze)

- výběr z 31 letišť, oblíbená (hvězdička), řazení podle vzdálenosti od telefonu, při prvním spuštění nejbližší letiště;
- nákres: kompas, dráha s čísly konců, směr startu proti větru, šipka větru, slunce s ikonou počasí;
- vítr po dráze / bokem, nárazy, hodnocení Lze létat / Pozor / Nelétat (meze v ⚙ nastavení);
- předpověď dnes + 7 dní po hodinách, výběr hodiny klepnutím nebo švihnutím přes nákres, detail počasí dne, graf výhledu;
- zdroj předpovědi: yr.no (MET Norway), ČHMÚ ALADIN, Open-Meteo;
- meteoradar ČHMÚ s animací;
- offline: poslední stažená data a celá aplikace z mezipaměti telefonu.

## Struktura

| Soubor | Obsah |
|---|---|
| `index.html`, `css/styl.css` | kostra stránky a vzhled (světlý / tmavý režim) |
| `js/app.js` | obrazovka, ovládání, poloha |
| `js/data.js` | stahování Open-Meteo / MET Norway / ALADIN, mezipaměť |
| `js/vypocty.js` | vítr po dráze a bokem, hodnocení, slunce, vzdálenosti |
| `js/kresba.js` | SVG: nákres, graf, ikony počasí |
| `js/radar.js` | meteoradar ČHMÚ |
| `js/nastaveni.js` | volby uložené v telefonu |
| `sw.js`, `manifest.webmanifest`, `ikony/` | instalace na plochu a offline běh |
| `data/letiste.json` | databáze letišť (kopie z `C:\ESP_Analyzer\ha\letiste_seznam.json`) |
| `tools/` | server pro zkoušení, generátor ikon, test v emulovaném iPhonu |

## Vyzkoušení na PC

```
node tools/server.mjs          # http://localhost:8080
node tools/test-iphone.mjs .   # snímky v emulovaném iPhonu (server musí běžet)
node tools/gen-ikony.mjs       # nové ikony po změně motivu
python tools/gen-qr.py         # QR kód s odkazem: ikony/qr-rc-letiste.png (pip install segno pillow)
```

Na iPhonu funguje poloha, offline i „Přidat na plochu“ jen přes HTTPS, tedy až po nasazení.
Po změně souborů aplikace zvýšit `VERZE` v `sw.js`, jinak telefon může držet starou verzi.

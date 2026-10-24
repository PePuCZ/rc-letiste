// RC Letiště – kontrola v emulovaném iPhonu (Chrome bez okna přes DevTools protokol, bez knihoven).
// Spuštění (server musí běžet: node tools/server.mjs): node tools/test-iphone.mjs [výstupní složka]
// Nasazená verze: URL_APP=https://pepucz.github.io/rc-letiste/ node tools/test-iphone.mjs [výstupní složka]
// Udělá snímky obrazovky (výchozí stav, po švihnutí doleva, otevřený seznam letišť, tmavý režim) a vypíše
// chyby z konzole a případné vodorovné přetečení stránky.

import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL_APP = process.env.URL_APP || 'http://localhost:8080/';
const VYSTUP = process.argv[2] || '.';
const PORT = 9333;

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'rcl-'))}`, 'about:blank'], { stdio: 'ignore' });
const cekej = ms => new Promise(r => setTimeout(r, ms));

// připojení k první záložce
let ws;
for (let k = 0; k < 40 && !ws; k++) {
  try {
    const t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(x => x.type === 'page');
    ws = new WebSocket(t.webSocketDebuggerUrl);
  } catch (e) { await cekej(250); }
}
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const cekajici = {};
ws.addEventListener('message', ev => {
  const z = JSON.parse(ev.data);
  if (z.id && cekajici[z.id]) { cekajici[z.id](z); delete cekajici[z.id]; }
  if (z.method === 'Runtime.exceptionThrown') console.log('VÝJIMKA:', z.params.exceptionDetails.exception?.description || z.params.exceptionDetails.text);
  if (z.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(z.params.type)) console.log('KONZOLE:', z.params.args.map(a => a.value ?? a.description).join(' '));
});
const cdp = (method, params = {}) => new Promise(r => { cekajici[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
const js = async v => (await cdp('Runtime.evaluate', { expression: v, returnByValue: true, awaitPromise: true })).result?.result?.value;
const snimek = async jm => {
  const h = await js('document.documentElement.scrollHeight');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: h, deviceScaleFactor: 1, mobile: true });
  const z = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(VYSTUP, jm), Buffer.from(z.result.data, 'base64'));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  console.log('snímek', jm, '· šířka stránky', await js('document.documentElement.scrollWidth'), '(má být 390)');
};
// švihnutí přes prvek .main (dx < 0 = doleva)
const svihni = async dx => {
  const b = await js(`(() => { const r = document.querySelector('.main').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 120 }; })()`);
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y }] });
  await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x + dx / 2, y: b.y }] });
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cekej(300);
};

await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await cdp('Emulation.setGeolocationOverride', { latitude: 49.195, longitude: 16.608, accuracy: 50 });   // Brno
await cdp('Browser.grantPermissions', { permissions: ['geolocation'], origin: URL_APP.slice(0, -1) });
await cdp('Page.navigate', { url: URL_APP });
await cekej(8000);   // stažení předpovědi
console.log('stav:', await js(`document.querySelector('.stav').textContent + ' | ' + document.querySelector('.pill').textContent + ' | ' + document.querySelector('.chips').textContent.trim()`));
await snimek('1-vychozi.png');
await svihni(-120); await svihni(-120);
console.log('po švihnutí:', await js(`document.querySelector('.kdy').textContent`));
await snimek('2-svihnuti.png');
await js(`document.querySelector('.chip.vse').click()`); await cekej(300);
await snimek('3-seznam.png');
await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
await js(`document.querySelector('.menu .x').click(); document.querySelector('.radbtn').click()`); await cekej(4000);
console.log('radar:', await js(`document.querySelector('.radcas').textContent`));
await snimek('4-tmavy-radar.png');
console.log('service worker:', await js(`navigator.serviceWorker.getRegistration().then(r => r ? r.active ? 'aktivní' : 'registrovaný' : 'není')`));
ws.close(); chrome.kill();
process.exit(0);

// RC Letiště – nastavení uložené v telefonu (localStorage), místo entit Home Assistantu z karty:
//   vybrane  = id zobrazeného letiště (dříve input_text.letiste)
//   oblibena = id oblíbených letišť (dříve input_text.letiste_oblibena)
//   zdroj    = zdroj předpovědi: 'yr' | 'aladin' | 'om'
//   meze     = meze hodnocení v m/s (dříve input_number.letiste_*), viz MEZE_VYCHOZI ve vypocty.js
//   poloha   = poslední známá poloha telefonu { lat, lon, cas } – pro řazení letišť, i když GPS zrovna neodpoví
// Úložiště může být nedostupné (soukromé okno, smazaná data) – pak aplikace jede s výchozími hodnotami.

import { MEZE_VYCHOZI } from './vypocty.js';

const KLIC = 'letiste-nastaveni';
const VYCHOZI = { vybrane: null, oblibena: [], zdroj: 'yr', meze: { ...MEZE_VYCHOZI }, poloha: null };

// Načtení s doplněním chybějících položek výchozími hodnotami
function nacti() {
  try {
    const n = JSON.parse(localStorage.getItem(KLIC) || '{}');
    return { ...VYCHOZI, ...n, meze: { ...MEZE_VYCHOZI, ...(n.meze || {}) } };
  } catch (e) {
    return { ...VYCHOZI, meze: { ...MEZE_VYCHOZI } };
  }
}

// Aktuální nastavení (objekt se mění na místě a ukládá funkcí uloz)
export const nast = nacti();

// Uložení změn: uloz({ zdroj: 'om' }) – sloučí a zapíše
export function uloz(zmena = {}) {
  Object.assign(nast, zmena);
  try { localStorage.setItem(KLIC, JSON.stringify(nast)); } catch (e) { /* jen pro tuto relaci */ }
}

// Oblíbená jako množina id
export const oblibena = () => new Set(nast.oblibena);

// Přidání / odebrání letiště z oblíbených
export function prepniOblibene(id) {
  const o = oblibena();
  o.has(id) ? o.delete(id) : o.add(id);
  uloz({ oblibena: [...o] });
}

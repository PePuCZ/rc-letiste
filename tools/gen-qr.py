# RC Letiště – QR kód s odkazem na aplikaci (k vytištění nebo poslání kamarádům modelářům).
# Spuštění: python tools/gen-qr.py   → ikony/qr-rc-letiste.png (karta 1000×1300 px: název, QR s ikonou uprostřed,
# adresa a krátký návod k instalaci). Potřebuje knihovny segno (QR) a Pillow (obrázek): pip install segno pillow
# QR má nejvyšší opravu chyb (H, 30 %), takže ikona aplikace uprostřed čtení nevadí.

import io
from pathlib import Path

import segno
from PIL import Image, ImageDraw, ImageFont

KOREN = Path(__file__).resolve().parent.parent
ADRESA = 'https://pepucz.github.io/rc-letiste/'
VYSTUP = KOREN / 'ikony' / 'qr-rc-letiste.png'
ZELENA = (99, 153, 34)
TEXT, TEXT2 = (28, 31, 26), (97, 103, 93)


def pismo(tucne, velikost):
    """Písmo Segoe UI z Windows (s diakritikou), jinak výchozí písmo Pillow."""
    soubor = 'segoeuib.ttf' if tucne else 'segoeui.ttf'
    try:
        return ImageFont.truetype(f'C:/Windows/Fonts/{soubor}', velikost)
    except OSError:
        return ImageFont.load_default(velikost)


def na_stred(kresba, y, text, font, barva, sirka):
    """Vodorovně vycentrovaný řádek textu."""
    w = kresba.textlength(text, font=font)
    kresba.text(((sirka - w) / 2, y), text, font=font, fill=barva)


# QR kód: oprava chyb H, černé moduly na bílé, okraj 2 moduly
qr = segno.make(ADRESA, error='h')
buf = io.BytesIO()
qr.save(buf, kind='png', scale=20, border=2, dark='#1c1f1a', light='white')
qr_img = Image.open(buf).convert('RGB')
qr_img = qr_img.resize((760, 760), Image.NEAREST)

# ikona aplikace doprostřed (asi 20 % šířky QR) s bílým lemem
ikona = Image.open(KOREN / 'ikony' / 'ikona-512.png').convert('RGB').resize((150, 150), Image.LANCZOS)
lem = Image.new('RGB', (172, 172), 'white')
lem.paste(ikona, (11, 11))
qr_img.paste(lem, ((760 - 172) // 2, (760 - 172) // 2))

# karta s nadpisem, QR, adresou a návodem
W, H = 1000, 1300
karta = Image.new('RGB', (W, H), 'white')
k = ImageDraw.Draw(karta)
k.rectangle([0, 0, W, 150], fill=ZELENA)
na_stred(k, 28, 'RC Letiště', pismo(True, 76), (255, 255, 255), W)
na_stred(k, 175, 'Vítr na dráze modelářského letiště', pismo(False, 38), TEXT2, W)
karta.paste(qr_img, ((W - 760) // 2, 240))
na_stred(k, 1015, ADRESA.removeprefix('https://').rstrip('/'), pismo(True, 40), TEXT, W)
na_stred(k, 1090, 'iPhone: Safari → Sdílet → Přidat na plochu', pismo(False, 34), TEXT2, W)
na_stred(k, 1140, 'Android: Chrome → nabídka → Instalovat aplikaci', pismo(False, 34), TEXT2, W)
na_stred(k, 1215, 'Zdarma · předpověď yr.no, ČHMÚ ALADIN, Open-Meteo', pismo(False, 28), TEXT2, W)

karta.save(VYSTUP)
print('QR kód:', VYSTUP)

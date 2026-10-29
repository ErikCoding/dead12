# dead12 — sklep (ONA / ON)

Statyczny front sklepu: HTML + CSS + JS (ES modules) + three.js z CDN.

## Uruchomienie

Plik GLB i moduły JS wymagają serwera (nie zadziała przez `file://`):

```bash
cd "dead12/web"
python3 -m http.server 8012
# albo: npx serve .
```

Otwórz http://localhost:8012 (strefa ON: http://localhost:8012/#on).

## Struktura

```
index.html          — cała strona: header, świat ONA, świat ON, modal, koszyk, checkout
css/fonts.css       — czcionki self-hosted (Bagel Fat One, UnifrakturMaguntia, Mansalva,
                      Silkscreen, Bodoni Moda, IBM Plex Mono, Pinyon Script, Grenze Gotisch)
css/base.css        — wspólne elementy + tokeny kolorów dla obu trybów
css/ona.css         — ONA: pudełko lalki, blistry, pamiętnik, nagrobek
css/on.css          — ON: gazeta „The dead12 Journal”, parkiet, portret, wizytówka
js/products.js      — KATALOG — tu dodajesz produkty (każdy ma wersję ona + on)
js/app.js           — przełączanie trybów, koszyk (localStorage), modal, efekty, kursor
js/doll.js          — lalka 3D (poza z kości, głowa śledzi kursor, klik = skok)
js/coin.js          — złota moneta z czaszką wyciągniętą z logo (SVG → 3D)
assets/model/doll.glb
assets/img/         — wycięte z tła bluzy, loga, naklejki, skull.svg
```

## Nowy produkt

Dopisz obiekt w `js/products.js` (zdjęcie PNG z przezroczystym tłem do `assets/img/`).
Pojawi się automatycznie w obu strefach: jako blister (ONA) i jako notowanie (ON).

## Co jest demo

Checkout to sam formularz — pod płatności trzeba podpiąć backend
(np. Shopify Storefront API, Stripe Checkout albo Przelewy24). Newsletter też nie wysyła danych.

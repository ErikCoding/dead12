# dead12 — sklep (ONA / ON) + panel „Kostnica”

## Start (pełny sklep z bazą zamówień)

Wymaga Node 18+. Zero zależności — nic nie instalujesz.

```bash
cd "dead12/web"
node server.mjs                                # http://localhost:8012
ADMIN_PASSWORD=mojetajnehaslo node server.mjs  # własne hasło admina (zalecane)
PORT=8080 node server.mjs                      # inny port
```

- sklep: http://localhost:8012 (strefa ON: `/#on`)
- panel admina: http://localhost:8012/admin — domyślne hasło `dead12admin` (tylko do testów!)
- baza: `data/db.json` (tworzy się sama, jest w `.gitignore`)

Tryb bez serwera: jeśli stronę wrzucisz na zwykły hosting statyczny (albo `python3 -m http.server`),
sklep i panel przełączą się w **tryb lokalny** — dane trzymane w przeglądarce (localStorage), tylko do demo.
Panel pokazuje w lewym dolnym rogu, w jakim trybie działa.

## Co jest w środku

**Koszyk:** pasek do darmowej dostawy, zmiana rozmiaru i ilości (limit = stan magazynu), kody rabatowe,
„cofnij” po usunięciu, podpowiedź dorzucenia produktu, podsumowanie liczone przez serwer.

**Kasa (4 kroki):** dane (walidacja, maska kodu pocztowego, zapamiętywanie danych) → dostawa
(InPost z kodem paczkomatu / DPD / ekspres) → płatność (BLIK, karta, przelew, pobranie + opłata) → podsumowanie.
Zamówienie zdejmuje stan magazynu i nalicza użycie kodu. Ceny zawsze liczy serwer — klient nie może ich podmienić.

**Panel „Kostnica” (`/admin`):**
- pulpit: przychód, zamówienia, AOV, sztuki, klienci powracający, rabaty — z porównaniem do poprzedniego okresu;
  wykres dzienny ONA vs ON (z tabelą), bestsellery, rozmiary, płatności/dostawy, kody, miasta, alerty (do wysyłki, nieopłacone, niski stan)
- zamówienia: wyszukiwarka, filtry statusu i strefy, szczegóły (status, tracking, notatka, historia, kopiuj adres, druk slipu), eksport CSV (Excel)
- kody rabatowe: % / kwota / darmowa dostawa, minimum, limit użyć, strefa (ONA/ON/obie), data ważności, włącz/wyłącz
- produkty: cena, cena przekreślona, nazwy, opisy, stan na rozmiar, ukrywanie, dodawanie nowych
- ustawienia: próg darmowej dostawy, ceny dostaw, opłaty płatności, alert stanu, dane demo, reset bazy
- co 15 s sprawdza nowe zamówienia i daje powiadomienie

## Struktura

```
server.mjs         — serwer: pliki + REST API (/api/*) + data/db.json
admin.html         — panel
js/core.js         — wspólna logika (ceny, rabaty, stany, statystyki, CSV) — działa w Node i w przeglądarce
js/api.js          — klient API z automatycznym trybem lokalnym
js/cart.js         — koszyk + kasa
js/admin.js        — panel
js/app.js, doll.js, coin.js, products.js — sklep, 3D, katalog startowy
css/shop.css       — koszyk + kasa · css/admin.css — panel
```

## Przed produkcją

Płatności BLIK/karta są symulowane (zamówienie od razu „opłacone”). Do podpięcia: Przelewy24 / Stripe / PayU
(w `createOrder` w `js/core.js` zamiast `status: paid` → przekierowanie do bramki + webhook).
Maile z potwierdzeniem i integracja z InPost/DPD — do zrobienia na serwerze.
Uruchom za HTTPS (np. Caddy/nginx) i ustaw własne `ADMIN_PASSWORD`.

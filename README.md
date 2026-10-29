# dead12 — sklep + przymierzalnia 3D + panel „Kostnica”

## Start (pełny sklep z bazą zamówień)

Wymaga Node 18+. Zero zależności — nic nie instalujesz.

```bash
cd "dead12/web"
node server.mjs                                # http://localhost:8012
ADMIN_PASSWORD=mojetajnehaslo node server.mjs  # własne hasło admina (zalecane)
PORT=8080 node server.mjs                      # inny port
```

- sklep: http://localhost:8012 (konkretny model: `/#stars`, `/#plaid`)
- panel admina: http://localhost:8012/admin — domyślne hasło `dead12admin` (tylko do testów!)
- baza: `data/db.json` (tworzy się sama, jest w `.gitignore`)

Tryb bez serwera: jeśli stronę wrzucisz na zwykły hosting statyczny (albo `python3 -m http.server`),
sklep i panel przełączą się w **tryb lokalny** — dane trzymane w przeglądarce (localStorage), tylko do demo.
Panel pokazuje w lewym dolnym rogu, w jakim trybie działa.

## Strona główna

- **hero** — czaszka z piszczelami z logo jako bryła 3D (lak z opalizacją), orbitujące gwiazdki, da się nią zakręcić (`js/hero.js`)
- **nagłówek** — większe logo, bez paska z przewijanym tekstem; na desktopie info o darmowej dostawie obok koszyka
- **drop 01 w trumienkach** — każdy produkt w stojącej trumience-gablocie: lakierowana rama z głębią, w środku pikowana
  satyna, szklane wieko uchyla się po najechaniu, pod spodem chromowana tabliczka z nazwą. Trumienka przechyla się za kursorem.
  W środku stoi lalka w danej bluzie — można ją obracać palcem/myszką; tapnięcie (albo „przymierz na lalce”) otwiera
  przymierzalnię z tą bluzą. Drop 02 to zamknięta trumna z taśmą i odliczaniem. Wszystkie gabloty rysuje jeden renderer
  i jedna lalka (`js/boxes.js`), a lalka ładuje się dopiero, gdy gabloty zbliżają się do ekranu
- lalka: `assets/model/doll-lite.glb` (3,1 MB, lżejsza tekstura)
- **po zakupie** — czarne pudełko wysyłkowe dead12: produkty wpadają do środka, wieko się zamyka, różowa taśma,
  naklejka z numerem zamówienia i kodem kreskowym, wybuch gwiazdek (`js/celebrate.js`, `css/celebrate.css`).
  Tapnięcie / Esc pomija; przy „ogranicz ruch” od razu zamknięte pudełko

## Przymierzalnia 3D

W oknie przymierzalni lalka na stojaku ma na sobie wybraną bluzę (bez przełączania na inny model — wchodzisz w konkretny produkt).
Przeciągnięcie obraca ją o 360°, przyciski przód / bok / tył, kółko myszy / podwójne kliknięcie / ⤢ przybliża
(kółko nad lalką nie przewija strony pod spodem). Bluza jest budowana w przeglądarce z kawałków (korpus, rękawy dopasowane
do pozy lalki, kaptur, ściągacze, zamek, sznurki), a nadruk na przodzie to zdjęcie produktu rzutowane na korpus.

Nowa bluza w 3D = obiekt `garment` w `js/products.js`:
`front: [x0, y0, x1, y1]` (prostokąt przodu na zdjęciu PNG), `zip` (x zamka), kolory `sleeve`, `rib`, `hood`,
opcjonalnie `pattern: [x0, y0, x1, y1]` (kawałek wzoru, np. kraty, powielany na boki) i `backLogo`.
Produkty bez `garment` (np. naklejki) pokazują się w pudełku jako obracająca się karta ze zdjęciem.

Nowa bluza z `garment` od razu pojawia się w pudełku na lalce — nic nie trzeba wypiekać.
(Opcjonalnie `tools/bake.html` eksportuje samą bluzę jako GLB, np. do social mediów.)

## Co jest w środku

**Koszyk:** pasek do darmowej dostawy, zmiana rozmiaru i ilości (limit = stan magazynu), kody rabatowe,
„cofnij” po usunięciu, podpowiedź dorzucenia produktu, podsumowanie liczone przez serwer.

**Kasa (4 kroki):** dane (walidacja, maska kodu pocztowego, zapamiętywanie danych) → dostawa
(InPost z kodem paczkomatu / DPD / ekspres) → płatność (BLIK, karta, przelew, pobranie + opłata) → podsumowanie.
Zamówienie zdejmuje stan magazynu i nalicza użycie kodu. Ceny zawsze liczy serwer — klient nie może ich podmienić.

**Panel „Kostnica” (`/admin`):**
- pulpit: przychód, zamówienia, AOV, sztuki, klienci powracający, rabaty — z porównaniem do poprzedniego okresu;
  wykres dzienny (z tabelą), dziś vs średnia, bestsellery, rozmiary, płatności/dostawy, kody, miasta, alerty (do wysyłki, nieopłacone, niski stan)
- zamówienia: wyszukiwarka, filtry statusu i strefy, szczegóły (status, tracking, notatka, historia, kopiuj adres, druk slipu), eksport CSV (Excel)
- kody rabatowe: % / kwota / darmowa dostawa, minimum, limit użyć, data ważności, włącz/wyłącz
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
js/app.js           — sklep (przymierzalnia, wybór modelu/rozmiaru, kolekcja, pasek „do koszyka” na mobile)
js/viewer.js        — przymierzalnia: scena 3D + budowanie bluzy na lalce
js/hero.js          — czaszka 3D w hero
js/boxes.js         — lalki w trumienkach (jeden wspólny renderer + jedna lalka)
js/celebrate.js     — animacja po zakupie (pudełko wysyłkowe)
tools/bake.html     — wypiekanie małych modeli bluz do pudełek
js/products.js      — katalog startowy + opis bluz do 3D
css/main.css        — wygląd sklepu
css/shop.css       — koszyk + kasa · css/admin.css — panel · css/celebrate.css — animacja po zakupie

Nieużywane po redesignie (można usunąć): css/base.css, css/ona.css, css/on.css, js/doll.js, js/coin.js.
```

## Przed produkcją

Płatności BLIK/karta są symulowane (zamówienie od razu „opłacone”). Do podpięcia: Przelewy24 / Stripe / PayU
(w `createOrder` w `js/core.js` zamiast `status: paid` → przekierowanie do bramki + webhook).
Maile z potwierdzeniem i integracja z InPost/DPD — do zrobienia na serwerze.
Uruchom za HTTPS (np. Caddy/nginx) i ustaw własne `ADMIN_PASSWORD`.

// dead12 — katalog. Sklep używa pól `ona` (nazwy/opisy) — `on` zostaje tylko dla zgodności ze starymi zamówieniami.
// `garment` = jak zdjęcie bluzy jest nakładane na lalkę 3D (crop przodu, x zamka, kolory rękawów/ściągaczy).
// Dodając nowy produkt, wystarczy dopisać obiekt do tablicy.
export const PRODUCTS = [
  {
    id: 'stars',
    img: 'assets/img/hoodie-stars.png',
    price: 349,
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    // 3D: how the photo is wrapped on the doll (crop = torso front in the PNG, zip = x of the zipper)
    model: 'assets/model/hoodie-stars.glb', // mały model do pudełka (wypieczony z przymierzalni: _dev/bake)
    garment: { img: 'assets/img/hoodie-stars.png', front: [120, 330, 580, 1050], zip: 350, frontTop: 0.985, frontBottom: 0.0,
      base: '#201724', sleeve: '#231c27', rib: '#1a141c', hood: '#1f1722', hoodIn: '#2a2230', cord: '#d8d2cc', backLogo: 'assets/img/logo-dark.png' },
    ona: {
      name: 'gwiazdkowa trumna',
      kicker: 'zip hoodie · 450 g · czarna',
      note: 'osiem gwiazdek w kamuflażu. każda za jedną noc bez snu.',
      desc: 'Czarna bluza na zamek z ośmioma gwiazdami w camo i panterkę. Szyta w ciemności, noszona przy pełni. Pasuje do bladej cery i złamanych serc.',
    },
    on: {
      ticker: 'D12.STAR',
      name: 'Star Portfolio',
      sub: 'zip hoodie, 450 g, onyx',
      desc: 'Zdywersyfikowany portfel ośmiu gwiazd: camo, panterka, flaga. Niska zmienność, wysoka stopa zwrotu spojrzeń. Rekomendacja analityków: KUPUJ.',
      chg: 12.4,
    },
  },
  {
    id: 'plaid',
    img: 'assets/img/hoodie-plaid.png',
    price: 389,
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    model: 'assets/model/hoodie-plaid.glb',
    garment: { img: 'assets/img/hoodie-plaid.png', front: [130, 350, 690, 985], zip: 410, frontTop: 0.985, frontBottom: 0.0,
      pattern: [500, 320, 660, 460], base: '#4e5d6f', sleeve: '#1a55a8', rib: '#1d3f7b', hood: '#1a55a8', hoodIn: '#e1ceca', cord: '#e1ceca', backLogo: 'assets/img/logo-color.png' },
    ona: {
      name: 'kratka wdowy',
      kicker: 'zip hoodie · krata + kobalt',
      note: 'dla wdów, które wygrały spadek. czaszka w ramce z lustra.',
      desc: 'Błękitna krata, kobaltowe rękawy, czaszka w barokowej ramie lustra i kaptur z różowym graffiti w środku. Babcina zasłona, ale po pogrzebie.',
    },
    on: {
      ticker: 'D12.PLD',
      name: 'Plaid Capital',
      sub: 'zip hoodie, tartan / cobalt',
      desc: 'Tartan zarządu, rękawy w kolorze niebieskich chipów. Czaszka w złotej ramie — jak portret założyciela w sali konferencyjnej. Aktywo defensywne.',
      chg: 8.1,
    },
  },
  {
    id: 'stickers',
    img: 'assets/img/stickers.png',
    price: 39,
    sizes: null,
    ona: {
      name: 'naklejki na trumnę',
      kicker: 'sticker pack · 8 szt. · winyl',
      note: 'przyklej na laptop, lusterko albo nagrobek byłego.',
      desc: 'Osiem winylowych naklejek: logo, czaszki, gwiazdy i mini-bluza. Wodoodporne, łzoodporne, wieczne.',
    },
    on: {
      ticker: 'D12.STK',
      name: 'Pakiet Akcji',
      sub: 'sticker pack, 8 walorów',
      desc: 'Osiem walorów w jednym pakiecie. Idealne na teczkę, laptopa firmowego i drzwi gabinetu prezesa. Najniższy próg wejścia na rynek dead12.',
      chg: -2.7,
    },
  },
];

export const LOCKED = {
  ona: { title: 'drop 02', label: 'wkrótce wykopiemy', date: '2026-12-13T00:00:00+01:00' },
  on: { ticker: 'D12.IPO', name: 'Drop 02', sub: 'debiut giełdowy 13.12', date: '2026-12-13T00:00:00+01:00' },
};

export const INDICES = [
  ['WIG-ZMARŁYCH', 1212.12],
  ['S&P 666', 666.66],
  ['TRUMNY 3M', 84.2],
  ['ZNICZE FUT', 12.9],
  ['DUSZE/PLN', 0.012],
];

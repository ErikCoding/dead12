// dead12 — wspólna logika sklepu (przeglądarka + serwer Node).
// Czyste funkcje na obiekcie `db`. Ceny liczone zawsze tutaj — klient nie decyduje o kwocie.
import { PRODUCTS } from './products.js';

export const r2 = (n) => Math.round((+n + Number.EPSILON) * 100) / 100;
export const ONE = 'one';

export const STATUSES = [
  { id: 'new', label: 'nowe', hint: 'czeka na płatność' },
  { id: 'paid', label: 'opłacone', hint: 'do spakowania' },
  { id: 'packing', label: 'pakowanie', hint: 'w trumnie' },
  { id: 'shipped', label: 'wysłane', hint: 'w drodze' },
  { id: 'delivered', label: 'dostarczone', hint: 'zakończone' },
  { id: 'cancelled', label: 'anulowane', hint: 'zwrot / anulacja' },
];

export const DEFAULT_SETTINGS = {
  freeShipFrom: 300,
  lowStock: 3,
  shipping: [
    { id: 'inpost', name: { ona: 'paczkomat inpost', on: 'InPost Paczkomat' }, price: 14.99, eta: '1–2 dni', locker: true },
    { id: 'dpd', name: { ona: 'kurier dpd', on: 'Kurier DPD' }, price: 19.99, eta: '1–2 dni' },
    { id: 'express', name: { ona: 'trumna ekspres', on: 'Kurier premium 24 h' }, price: 29.99, eta: '24 h', noFree: true },
  ],
  payments: [
    { id: 'blik', name: { ona: 'blik', on: 'BLIK' }, fee: 0, instant: true },
    { id: 'card', name: { ona: 'karta', on: 'Karta płatnicza' }, fee: 0, instant: true },
    { id: 'transfer', name: { ona: 'przelew tradycyjny', on: 'Przelew tradycyjny' }, fee: 0 },
    { id: 'cod', name: { ona: 'za pobraniem', on: 'Za pobraniem' }, fee: 5 },
  ],
};

const DEFAULT_STOCK = { XS: 6, S: 14, M: 20, L: 18, XL: 9, XXL: 3 };

export function seedDB() {
  return {
    version: 1,
    seq: 1000,
    products: PRODUCTS.map((p, i) => ({
      ...structuredClone(p),
      active: true,
      order: i,
      stock: p.sizes ? Object.fromEntries(p.sizes.map((s) => [s, DEFAULT_STOCK[s] ?? 10])) : { [ONE]: 150 },
    })),
    orders: [],
    discounts: [
      { code: 'ZZAGROBU', type: 'percent', value: 15, minOrder: 0, limit: 0, used: 0, mode: 'all', expires: null, active: true, note: 'kod startowy drop 01' },
      { code: 'BUSINESS12', type: 'amount', value: 40, minOrder: 200, limit: 0, used: 0, mode: 'on', expires: null, active: true, note: 'tylko strefa ON' },
      { code: 'DARMOWATRUMNA', type: 'ship', value: 0, minOrder: 0, limit: 0, used: 0, mode: 'all', expires: null, active: true, note: 'darmowa dostawa' },
      { code: 'ZOMBIE10', type: 'percent', value: 10, minOrder: 0, limit: 100, used: 0, mode: 'ona', expires: null, active: true, note: 'tylko strefa ONA, 100 użyć' },
    ],
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

/* ---------- catalog for the storefront ---------- */
export function publicCatalog(db) {
  return {
    products: db.products.filter((p) => p.active).sort((a, b) => a.order - b.order).map((p) => ({
      id: p.id, img: p.img, price: p.price, compareAt: p.compareAt || null, sizes: p.sizes, ona: p.ona, on: p.on,
      stock: p.stock, // storefront shows "ostatnie sztuki" / "brak"
    })),
    settings: { freeShipFrom: db.settings.freeShipFrom, shipping: db.settings.shipping, payments: db.settings.payments, lowStock: db.settings.lowStock },
  };
}

/* ---------- discounts ---------- */
export function findDiscount(db, code, { subtotal = 0, mode = 'ona', now = Date.now() } = {}) {
  if (!code) return { ok: false, error: 'pusty kod' };
  const d = db.discounts.find((x) => x.code.toUpperCase() === String(code).trim().toUpperCase());
  if (!d || !d.active) return { ok: false, error: 'nie ma takiego kodu' };
  if (d.expires && new Date(d.expires).getTime() < now) return { ok: false, error: 'kod wygasł' };
  if (d.limit && d.used >= d.limit) return { ok: false, error: 'limit użyć wyczerpany' };
  if (d.mode !== 'all' && d.mode !== mode) return { ok: false, error: d.mode === 'on' ? 'kod działa tylko w strefie ON' : 'kod działa tylko w strefie ONA' };
  if (subtotal < (d.minOrder || 0)) return { ok: false, error: `minimalna kwota zamówienia: ${d.minOrder} zł` };
  return { ok: true, discount: d };
}

export function describeDiscount(d) {
  if (!d) return '';
  if (d.type === 'percent') return `−${d.value}%`;
  if (d.type === 'amount') return `−${d.value} zł`;
  return 'darmowa dostawa';
}

/* ---------- totals ---------- */
// items: [{ id, size, q }]
export function calcTotals(db, { items = [], shippingId = null, paymentId = null, code = null, mode = 'ona' } = {}) {
  const errors = [];
  const lines = [];
  for (const it of items) {
    const p = db.products.find((x) => x.id === it.id);
    if (!p || !p.active) { errors.push(`produkt ${it.id} niedostępny`); continue; }
    const size = p.sizes ? it.size : ONE;
    if (p.sizes && !p.sizes.includes(size)) { errors.push(`zły rozmiar ${size}`); continue; }
    const q = Math.max(1, Math.min(99, parseInt(it.q, 10) || 1));
    const stock = p.stock?.[size] ?? 0;
    if (q > stock) errors.push(`${p.ona.name} ${size === ONE ? '' : size}: dostępne ${stock} szt.`);
    lines.push({ id: p.id, size: p.sizes ? size : null, q, price: p.price, sum: r2(p.price * q), stock, name: { ona: p.ona.name, on: p.on.name }, ticker: p.on.ticker, img: p.img });
  }
  const subtotal = r2(lines.reduce((s, l) => s + l.sum, 0));

  let discount = null, discountAmt = 0, codeError = null;
  if (code) {
    const res = findDiscount(db, code, { subtotal, mode });
    if (res.ok) {
      discount = res.discount;
      if (discount.type === 'percent') discountAmt = r2(subtotal * discount.value / 100);
      if (discount.type === 'amount') discountAmt = Math.min(subtotal, discount.value);
    } else codeError = res.error;
  }
  const afterDiscount = r2(subtotal - discountAmt);

  const S = db.settings;
  const method = S.shipping.find((m) => m.id === shippingId) || null;
  const freeShip = (discount?.type === 'ship') || (afterDiscount >= S.freeShipFrom);
  let shipping = 0;
  if (method) shipping = (freeShip && !method.noFree) ? 0 : method.price;
  const cheapest = Math.min(...S.shipping.map((m) => m.price));
  const pay = S.payments.find((p) => p.id === paymentId) || null;
  const payFee = pay ? pay.fee || 0 : 0;
  const total = r2(afterDiscount + shipping + payFee);

  return {
    lines, subtotal, discount: discount ? { code: discount.code, type: discount.type, value: discount.value, label: describeDiscount(discount) } : null,
    discountAmt, codeError, afterDiscount, shipping, shippingFrom: freeShip ? 0 : cheapest, freeShip,
    freeShipLeft: Math.max(0, r2(S.freeShipFrom - afterDiscount)), freeShipFrom: S.freeShipFrom,
    payFee, total, units: lines.reduce((s, l) => s + l.q, 0), errors,
  };
}

/* ---------- orders ---------- */
const clean = (v, max = 120) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, max);
export function validateCustomer(c = {}) {
  const e = {};
  if (clean(c.name).length < 3) e.name = 'podaj imię i nazwisko';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean(c.email))) e.email = 'niepoprawny e-mail';
  if (!/^(\+?\d[\d\s-]{7,})$/.test(clean(c.phone))) e.phone = 'niepoprawny telefon';
  if (clean(c.street).length < 3) e.street = 'podaj ulicę i numer';
  if (!/^\d{2}-\d{3}$/.test(clean(c.zip))) e.zip = 'format: 00-000';
  if (clean(c.city).length < 2) e.city = 'podaj miasto';
  return e;
}

export function createOrder(db, payload, { now = Date.now(), demo = false } = {}) {
  const { items, shippingId, paymentId, code, mode = 'ona', customer = {}, locker = '', note = '', newsletter = false } = payload || {};
  const t = calcTotals(db, { items, shippingId, paymentId, code, mode });
  if (!t.lines.length) return { ok: false, error: 'koszyk jest pusty' };
  if (t.errors.length) return { ok: false, error: t.errors.join(' · ') };
  if (code && t.codeError) return { ok: false, error: 'kod rabatowy: ' + t.codeError };
  const method = db.settings.shipping.find((m) => m.id === shippingId);
  const pay = db.settings.payments.find((p) => p.id === paymentId);
  if (!method) return { ok: false, error: 'wybierz dostawę' };
  if (!pay) return { ok: false, error: 'wybierz płatność' };
  if (method.locker && !/^[A-Z]{3}\d{2,3}[A-Z]{0,2}$/i.test(clean(locker))) return { ok: false, error: 'podaj kod paczkomatu (np. GDY01M)' };
  if (!demo) {
    const ce = validateCustomer(customer);
    if (Object.keys(ce).length) return { ok: false, error: Object.values(ce).join(' · '), fields: ce };
  }

  // reserve stock
  for (const l of t.lines) {
    const p = db.products.find((x) => x.id === l.id);
    p.stock[l.size || ONE] = Math.max(0, (p.stock[l.size || ONE] ?? 0) - l.q);
  }
  if (t.discount) { const d = db.discounts.find((x) => x.code === t.discount.code); if (d) d.used++; }

  db.seq = (db.seq || 1000) + 1;
  const status = pay.instant ? 'paid' : 'new';
  const order = {
    id: 'D12-' + db.seq,
    createdAt: new Date(now).toISOString(),
    status,
    mode,
    customer: {
      name: clean(customer.name), email: clean(customer.email).toLowerCase(), phone: clean(customer.phone, 30),
      street: clean(customer.street), zip: clean(customer.zip, 6), city: clean(customer.city, 60), newsletter: !!newsletter,
    },
    items: t.lines.map(({ id, size, q, price, sum, name, ticker }) => ({ id, size, q, price, sum, name, ticker })),
    shipping: { id: method.id, name: method.name.on, price: t.shipping, locker: method.locker ? clean(locker, 12).toUpperCase() : null, tracking: '' },
    payment: { id: pay.id, name: pay.name.on, fee: t.payFee },
    totals: { subtotal: t.subtotal, discount: t.discountAmt, shipping: t.shipping, fee: t.payFee, total: t.total },
    code: t.discount?.code || null,
    note: clean(note, 500),
    history: [{ at: new Date(now).toISOString(), status, by: 'klient' }],
    adminNote: '',
  };
  db.orders.unshift(order);
  return { ok: true, order };
}

export function updateOrder(db, id, patch = {}, by = 'admin') {
  const o = db.orders.find((x) => x.id === id);
  if (!o) return { ok: false, error: 'brak zamówienia' };
  if (patch.status && patch.status !== o.status && STATUSES.some((s) => s.id === patch.status)) {
    // returning stock on cancel / taking back on un-cancel
    if (patch.status === 'cancelled' && o.status !== 'cancelled') restock(db, o, +1);
    if (o.status === 'cancelled' && patch.status !== 'cancelled') restock(db, o, -1);
    o.status = patch.status;
    o.history.push({ at: new Date().toISOString(), status: patch.status, by });
  }
  if (typeof patch.tracking === 'string') o.shipping.tracking = clean(patch.tracking, 60);
  if (typeof patch.adminNote === 'string') o.adminNote = clean(patch.adminNote, 1000);
  return { ok: true, order: o };
}
function restock(db, o, dir) {
  for (const it of o.items) {
    const p = db.products.find((x) => x.id === it.id); if (!p) continue;
    const k = it.size || ONE; p.stock[k] = Math.max(0, (p.stock[k] ?? 0) + dir * it.q);
  }
}

/* ---------- discounts admin ---------- */
export function upsertDiscount(db, d, originalCode = null) {
  const code = clean(d.code, 30).toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return { ok: false, error: 'kod: 3–30 znaków A–Z, 0–9, - _' };
  if (!['percent', 'amount', 'ship'].includes(d.type)) return { ok: false, error: 'zły typ' };
  const value = r2(d.value || 0);
  if (d.type === 'percent' && (value <= 0 || value > 100)) return { ok: false, error: 'procent 1–100' };
  if (d.type === 'amount' && value <= 0) return { ok: false, error: 'kwota > 0' };
  const clash = db.discounts.find((x) => x.code === code && x.code !== originalCode);
  if (clash) return { ok: false, error: 'taki kod już istnieje' };
  const rec = {
    code, type: d.type, value: d.type === 'ship' ? 0 : value, minOrder: Math.max(0, r2(d.minOrder || 0)),
    limit: Math.max(0, parseInt(d.limit, 10) || 0), mode: ['all', 'ona', 'on'].includes(d.mode) ? d.mode : 'all',
    expires: d.expires || null, active: d.active !== false, note: clean(d.note, 120),
  };
  const i = db.discounts.findIndex((x) => x.code === (originalCode || code));
  if (i >= 0) db.discounts[i] = { ...db.discounts[i], ...rec };
  else db.discounts.unshift({ ...rec, used: 0 });
  return { ok: true, discount: db.discounts.find((x) => x.code === code) };
}
export function deleteDiscount(db, code) {
  const n = db.discounts.length; db.discounts = db.discounts.filter((x) => x.code !== code);
  return { ok: db.discounts.length < n };
}

/* ---------- products admin ---------- */
export function updateProduct(db, id, patch = {}) {
  const p = db.products.find((x) => x.id === id);
  if (!p) return { ok: false, error: 'brak produktu' };
  if (patch.price != null) { const v = r2(patch.price); if (v <= 0) return { ok: false, error: 'cena > 0' }; p.price = v; }
  if (patch.compareAt !== undefined) p.compareAt = patch.compareAt ? r2(patch.compareAt) : null;
  if (typeof patch.active === 'boolean') p.active = patch.active;
  if (patch.stock && typeof patch.stock === 'object') {
    for (const [k, v] of Object.entries(patch.stock)) if (k in p.stock) p.stock[k] = Math.max(0, parseInt(v, 10) || 0);
  }
  for (const side of ['ona', 'on']) {
    if (patch[side] && typeof patch[side] === 'object') {
      for (const k of ['name', 'kicker', 'note', 'desc', 'sub', 'ticker']) if (typeof patch[side][k] === 'string') p[side][k] = clean(patch[side][k], 400);
      if (patch[side].chg != null) p[side].chg = r2(patch[side].chg);
    }
  }
  if (typeof patch.img === 'string' && /^[\w./-]+\.(png|jpe?g|webp)$/i.test(patch.img)) p.img = patch.img;
  return { ok: true, product: p };
}
export function createProduct(db, d = {}) {
  const id = clean(d.id, 24).toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!id || db.products.some((p) => p.id === id)) return { ok: false, error: 'id produktu zajęte lub puste' };
  const sizes = d.hasSizes === false ? null : ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const p = {
    id, img: /^[\w./-]+\.(png|jpe?g|webp)$/i.test(d.img || '') ? d.img : 'assets/img/star-pink.png', price: r2(d.price || 99), sizes,
    ona: { name: clean(d.name || 'nowa rzecz'), kicker: 'nowość', note: '', desc: '' },
    on: { ticker: 'D12.' + id.slice(0, 4).toUpperCase(), name: clean(d.name || 'Nowy walor'), sub: 'nowość', desc: '', chg: 0 },
    active: false, order: db.products.length, stock: sizes ? Object.fromEntries(sizes.map((s) => [s, 0])) : { [ONE]: 0 },
  };
  db.products.push(p);
  return { ok: true, product: p };
}

/* ---------- stats ---------- */
const DAY = 86400000;
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function stats(db, { days = 30, now = Date.now() } = {}) {
  const from = now - days * DAY, prevFrom = from - days * DAY;
  const live = (o) => o.status !== 'cancelled';
  const inR = db.orders.filter((o) => +new Date(o.createdAt) >= from && +new Date(o.createdAt) <= now);
  const inPrev = db.orders.filter((o) => +new Date(o.createdAt) >= prevFrom && +new Date(o.createdAt) < from);
  const sum = (arr) => r2(arr.filter(live).reduce((s, o) => s + o.totals.total, 0));
  const cnt = (arr) => arr.filter(live).length;
  const units = (arr) => arr.filter(live).reduce((s, o) => s + o.items.reduce((a, i) => a + i.q, 0), 0);

  const byDay = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(now - i * DAY);
    byDay.push({ day: k, revenue: 0, orders: 0, ona: 0, on: 0 });
  }
  const idx = Object.fromEntries(byDay.map((d, i) => [d.day, i]));
  const byMode = { ona: { revenue: 0, orders: 0 }, on: { revenue: 0, orders: 0 } };
  const prod = {}, sizes = {}, codes = {}, pays = {}, ships = {}, cities = {};
  const statusCounts = Object.fromEntries(STATUSES.map((s) => [s.id, 0]));
  for (const o of db.orders) statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
  for (const o of inR) {
    if (!live(o)) continue;
    const i = idx[dayKey(o.createdAt)];
    if (i != null) { byDay[i].revenue = r2(byDay[i].revenue + o.totals.total); byDay[i].orders++; byDay[i][o.mode] = r2((byDay[i][o.mode] || 0) + o.totals.total); }
    const m = byMode[o.mode] || byMode.ona; m.revenue = r2(m.revenue + o.totals.total); m.orders++;
    for (const it of o.items) {
      prod[it.id] = prod[it.id] || { id: it.id, name: it.name?.ona || it.id, ticker: it.ticker, units: 0, revenue: 0 };
      prod[it.id].units += it.q; prod[it.id].revenue = r2(prod[it.id].revenue + it.sum);
      if (it.size) sizes[it.size] = (sizes[it.size] || 0) + it.q;
    }
    if (o.code) { codes[o.code] = codes[o.code] || { code: o.code, orders: 0, discount: 0 }; codes[o.code].orders++; codes[o.code].discount = r2(codes[o.code].discount + o.totals.discount); }
    pays[o.payment.id] = (pays[o.payment.id] || 0) + 1;
    ships[o.shipping.id] = (ships[o.shipping.id] || 0) + 1;
    const c = o.customer.city || '—'; cities[c] = (cities[c] || 0) + 1;
  }
  const revenue = sum(inR), orders = cnt(inR), prevRevenue = sum(inPrev), prevOrders = cnt(inPrev);
  const customers = new Set(inR.filter(live).map((o) => o.customer.email)).size;
  const allEmails = {}; for (const o of db.orders.filter(live)) allEmails[o.customer.email] = (allEmails[o.customer.email] || 0) + 1;
  const returning = new Set(inR.filter((o) => live(o) && allEmails[o.customer.email] > 1).map((o) => o.customer.email)).size;
  const delta = (a, b) => (b ? r2(((a - b) / b) * 100) : null);
  const lowStock = [];
  for (const p of db.products) for (const [k, v] of Object.entries(p.stock)) if (v <= db.settings.lowStock) lowStock.push({ id: p.id, name: p.ona.name, size: k === ONE ? null : k, left: v });
  return {
    days, revenue, orders, aov: orders ? r2(revenue / orders) : 0, units: units(inR), customers, returning,
    discountGiven: r2(inR.filter(live).reduce((s, o) => s + o.totals.discount, 0)),
    deltas: { revenue: delta(revenue, prevRevenue), orders: delta(orders, prevOrders), aov: delta(orders ? revenue / orders : 0, prevOrders ? prevRevenue / prevOrders : 0) },
    byDay, byMode, statusCounts,
    topProducts: Object.values(prod).sort((a, b) => b.revenue - a.revenue),
    sizes, codes: Object.values(codes).sort((a, b) => b.orders - a.orders), pays, ships,
    cities: Object.entries(cities).sort((a, b) => b[1] - a[1]).slice(0, 6),
    toShip: db.orders.filter((o) => o.status === 'paid' || o.status === 'packing').length,
    unpaid: db.orders.filter((o) => o.status === 'new').length,
    lowStock,
  };
}

/* ---------- demo data ---------- */
const FIRST = ['Ola', 'Zuza', 'Wiktoria', 'Maja', 'Lena', 'Julia', 'Kuba', 'Szymon', 'Antek', 'Igor', 'Natalia', 'Bartek', 'Oskar', 'Hania', 'Filip'];
const LAST = ['Nowak', 'Kowalska', 'Wiśniewski', 'Mroczna', 'Kamińska', 'Zieliński', 'Grobowska', 'Lewandowski', 'Wójcik', 'Czarnecka', 'Krawczyk', 'Dąbrowski'];
const CITIES = [['Gdańsk', '80-001'], ['Gdynia', '81-301'], ['Sopot', '81-701'], ['Warszawa', '00-001'], ['Kraków', '30-001'], ['Wrocław', '50-001'], ['Poznań', '60-001'], ['Łódź', '90-001'], ['Rumia', '84-230']];
export function seedDemoOrders(db, n = 60, { now = Date.now() } = {}) {
  let rnd = 12345; const R = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(R() * a.length)];
  // demo orders must not touch real stock: snapshot, top up, restore afterwards
  const snap = db.products.map((p) => [p, { ...p.stock }]);
  for (const p of db.products) for (const k of Object.keys(p.stock)) p.stock[k] += 1000;
  const made = [];
  for (let i = 0; i < n; i++) {
    const mode = R() < 0.62 ? 'ona' : 'on';
    const items = [];
    const k = R() < 0.7 ? 1 : 2;
    for (let j = 0; j < k; j++) {
      const p = pick(db.products.filter((x) => x.active));
      items.push({ id: p.id, size: p.sizes ? pick(['S', 'M', 'M', 'L', 'L', 'XL', 'XS']) : null, q: R() < 0.85 ? 1 : 2 });
    }
    const [city, zip] = pick(CITIES);
    const fn = pick(FIRST), ln = pick(LAST);
    const ago = Math.pow(R(), 1.4) * 44 * DAY;
    const codePool = [null, null, null, 'ZZAGROBU', mode === 'on' ? 'BUSINESS12' : 'ZOMBIE10', 'DARMOWATRUMNA'];
    const res = createOrder(db, {
      items, mode, shippingId: pick(['inpost', 'inpost', 'dpd', 'express']), paymentId: pick(['blik', 'blik', 'card', 'transfer', 'cod']),
      code: pick(codePool), locker: 'GDY' + String(Math.floor(R() * 90 + 10)) + 'M',
      customer: { name: `${fn} ${ln}`, email: `${fn}.${ln}${Math.floor(R() * 9)}@example.com`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace('ł', 'l'), phone: '500 100 ' + String(100 + i), street: 'ul. Cmentarna ' + (i + 1), zip, city },
    }, { now: now - ago, demo: true });
    if (!res.ok) continue;
    const o = res.order;
    const age = ago / DAY;
    o.status = age > 7 ? (R() < 0.08 ? 'cancelled' : 'delivered') : age > 3 ? 'shipped' : age > 1 ? pick(['paid', 'packing', 'shipped']) : pick(['new', 'paid']);
    if (o.status === 'shipped' || o.status === 'delivered') o.shipping.tracking = '6' + Math.floor(R() * 1e11);
    o.history.push({ at: new Date(now - ago + 3600e3).toISOString(), status: o.status, by: 'demo' });
    o.demo = true;
    made.push(o);
  }
  for (const [p, st] of snap) p.stock = st;
  db.orders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return made.length;
}

/* ---------- CSV ---------- */
export function ordersCSV(orders) {
  const head = ['nr', 'data', 'status', 'strefa', 'klient', 'email', 'telefon', 'ulica', 'kod', 'miasto', 'produkty', 'suma produktów', 'rabat', 'kod rabatowy', 'dostawa', 'metoda dostawy', 'paczkomat', 'płatność', 'razem', 'tracking'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = orders.map((o) => [
    o.id, o.createdAt, o.status, o.mode, o.customer.name, o.customer.email, o.customer.phone, o.customer.street, o.customer.zip, o.customer.city,
    o.items.map((i) => `${i.name?.ona || i.id}${i.size ? ' ' + i.size : ''} x${i.q}`).join('; '),
    o.totals.subtotal, o.totals.discount, o.code || '', o.totals.shipping, o.shipping.name, o.shipping.locker || '', o.payment.name, o.totals.total, o.shipping.tracking || '',
  ].map(esc).join(';'));
  return '﻿' + [head.map(esc).join(';'), ...rows].join('\n');
}

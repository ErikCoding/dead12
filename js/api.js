// dead12 — warstwa danych dla sklepu i panelu.
// Jeśli działa server.mjs → prawdziwe API (/api/*).
// Jeśli strona stoi na zwykłym hostingu statycznym → tryb lokalny (localStorage, tylko demo).
import * as core from './core.js';

const LS_DB = 'dead12-db', LS_TOKEN = 'dead12-admin-token';
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};

let modePromise = null;
export function backend() {
  if (!modePromise) {
    modePromise = (async () => {
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 1500);
        const r = await fetch('/api/health', { signal: ctl.signal, cache: 'no-store' }); clearTimeout(t);
        if (r.ok && (await r.json()).ok) return 'server';
      } catch { /* no server */ }
      return 'local';
    })();
  }
  return modePromise;
}

/* ---------- local driver ---------- */
let memDB = null;
function localDB() {
  if (memDB) return memDB;
  const raw = ls.get(LS_DB);
  try { memDB = raw ? JSON.parse(raw) : null; } catch { memDB = null; }
  if (!memDB || !memDB.products) { memDB = core.seedDB(); saveLocal(); }
  return memDB;
}
function saveLocal() { ls.set(LS_DB, JSON.stringify(memDB)); }
const LOCAL_PASSWORD = 'dead12admin';

/* ---------- remote driver ---------- */
async function call(method, url, data, auth = false) {
  const headers = { 'content-type': 'application/json' };
  if (auth) headers.authorization = 'Bearer ' + (ls.get(LS_TOKEN) || '');
  const r = await fetch('/api' + url, { method, headers, body: data ? JSON.stringify(data) : undefined });
  if (r.status === 401 && auth) { ls.del(LS_TOKEN); const e = new Error('unauthorized'); e.code = 401; throw e; }
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}

/* ---------- storefront API ---------- */
export async function getCatalog() {
  return (await backend()) === 'server' ? call('GET', '/catalog') : core.publicCatalog(localDB());
}
export async function quote(payload) {
  return (await backend()) === 'server' ? call('POST', '/quote', payload) : core.calcTotals(localDB(), payload);
}
export async function checkCode(code, subtotal, mode) {
  if ((await backend()) === 'server') return call('POST', '/discount', { code, subtotal, mode });
  const r = core.findDiscount(localDB(), code, { subtotal, mode });
  return r.ok ? { ok: true, code: r.discount.code, label: core.describeDiscount(r.discount) } : r;
}
export async function placeOrder(payload) {
  if ((await backend()) === 'server') return call('POST', '/orders', payload);
  const r = core.createOrder(localDB(), payload);
  if (r.ok) saveLocal();
  return r;
}

/* ---------- admin API ---------- */
export const admin = {
  hasToken: () => !!ls.get(LS_TOKEN),
  logout: () => ls.del(LS_TOKEN),
  async login(password) {
    if ((await backend()) === 'server') {
      const r = await call('POST', '/admin/login', { password });
      if (r.ok) ls.set(LS_TOKEN, r.token);
      return r;
    }
    if (password !== LOCAL_PASSWORD) return { ok: false, error: 'złe hasło (tryb lokalny: dead12admin)' };
    ls.set(LS_TOKEN, 'local'); return { ok: true, token: 'local', defaultPassword: true, local: true };
  },
  async req(method, url, data) {
    if ((await backend()) === 'server') return call(method, '/admin' + url, data, true);
    return localAdmin(method, url, data);
  },
  stats: (days) => admin.req('GET', '/stats?days=' + days),
  orders: () => admin.req('GET', '/orders'),
  updateOrder: (id, patch) => admin.req('PATCH', '/orders/' + encodeURIComponent(id), patch),
  discounts: () => admin.req('GET', '/discounts'),
  saveDiscount: (d, original) => admin.req(original ? 'PATCH' : 'POST', '/discounts' + (original ? '/' + encodeURIComponent(original) : ''), d),
  deleteDiscount: (code) => admin.req('DELETE', '/discounts/' + encodeURIComponent(code)),
  products: () => admin.req('GET', '/products'),
  updateProduct: (id, patch) => admin.req('PATCH', '/products/' + encodeURIComponent(id), patch),
  createProduct: (d) => admin.req('POST', '/products', d),
  settings: () => admin.req('GET', '/settings'),
  saveSettings: (s) => admin.req('PATCH', '/settings', s),
  demo: (n) => admin.req('POST', '/demo', { n }),
  reset: () => admin.req('POST', '/reset'),
  async exportCSV() {
    if ((await backend()) === 'server') {
      const r = await fetch('/api/admin/export', { headers: { authorization: 'Bearer ' + ls.get(LS_TOKEN) } });
      return r.text();
    }
    return core.ordersCSV(localDB().orders);
  },
};

function localAdmin(method, url, data) {
  if (ls.get(LS_TOKEN) !== 'local') { const e = new Error('unauthorized'); e.code = 401; throw e; }
  const db = localDB();
  const [pathPart, qs] = url.split('?');
  const [, what, rawId] = pathPart.split('/');
  const id = rawId && decodeURIComponent(rawId);
  const key = `${method} ${what}${id ? '/:id' : ''}`;
  let r;
  switch (key) {
    case 'GET stats': return core.stats(db, { days: +new URLSearchParams(qs).get('days') || 30 });
    case 'GET orders': return structuredClone(db.orders);
    case 'PATCH orders/:id': r = core.updateOrder(db, id, data); break;
    case 'GET discounts': return structuredClone(db.discounts);
    case 'POST discounts': r = core.upsertDiscount(db, data); break;
    case 'PATCH discounts/:id': r = core.upsertDiscount(db, data, id); break;
    case 'DELETE discounts/:id': r = core.deleteDiscount(db, id); break;
    case 'GET products': return structuredClone(db.products);
    case 'POST products': r = core.createProduct(db, data); break;
    case 'PATCH products/:id': r = core.updateProduct(db, id, data); break;
    case 'GET settings': return structuredClone(db.settings);
    case 'PATCH settings': {
      if (data.freeShipFrom != null) db.settings.freeShipFrom = Math.max(0, core.r2(data.freeShipFrom));
      if (data.lowStock != null) db.settings.lowStock = Math.max(0, parseInt(data.lowStock, 10) || 0);
      for (const s of data.shipping || []) { const t = db.settings.shipping.find((x) => x.id === s.id); if (t && s.price != null) t.price = Math.max(0, core.r2(s.price)); }
      for (const s of data.payments || []) { const t = db.settings.payments.find((x) => x.id === s.id); if (t && s.fee != null) t.fee = Math.max(0, core.r2(s.fee)); }
      r = { ok: true, settings: db.settings }; break;
    }
    case 'POST demo': r = { ok: true, added: core.seedDemoOrders(db, data?.n || 60) }; break;
    case 'POST reset': memDB = core.seedDB(); saveLocal(); return { ok: true };
    default: return { ok: false, error: 'not found' };
  }
  if (r.ok) saveLocal();
  return structuredClone(r);
}

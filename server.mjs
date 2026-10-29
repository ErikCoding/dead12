// dead12 — serwer sklepu: pliki statyczne + REST API + baza w data/db.json.
// Start:  node server.mjs            (port 8012)
//         ADMIN_PASSWORD=tajne PORT=8080 node server.mjs
import http from 'node:http';
import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as core from './js/core.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA, 'db.json');
const PORT = +process.env.PORT || 8012;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'dead12admin';
const SESSION_MS = 12 * 3600e3;

/* ---------- db ---------- */
let db;
async function loadDB() {
  await mkdir(DATA, { recursive: true });
  if (existsSync(DB_FILE)) db = JSON.parse(await readFile(DB_FILE, 'utf8'));
  else { db = core.seedDB(); await saveDB(); }
}
let saving = Promise.resolve();
function saveDB() {
  saving = saving.then(async () => {
    const tmp = DB_FILE + '.tmp';
    await writeFile(tmp, JSON.stringify(db, null, 1));
    await rename(tmp, DB_FILE);
  }).catch((e) => console.error('save failed', e));
  return saving;
}

/* ---------- auth ---------- */
const sessions = new Map();
const attempts = new Map();
function safeEq(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}
function authed(req) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const s = t && sessions.get(t);
  if (!s || s < Date.now()) { if (t) sessions.delete(t); return false; }
  sessions.set(t, Date.now() + SESSION_MS);
  return true;
}

/* ---------- helpers ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8' };
function send(res, code, body, headers = {}) {
  const isStr = typeof body === 'string' || Buffer.isBuffer(body);
  res.writeHead(code, { 'content-type': isStr ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(isStr ? body : JSON.stringify(body));
}
async function body(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 1e6) throw new Error('too big'); chunks.push(c); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

/* ---------- API ---------- */
async function api(req, res, url) {
  const p = url.pathname.replace(/^\/api/, '');
  const m = req.method;

  // public
  if (p === '/health') return send(res, 200, { ok: true, mode: 'server' });
  if (p === '/catalog' && m === 'GET') return send(res, 200, core.publicCatalog(db));
  if (p === '/quote' && m === 'POST') return send(res, 200, core.calcTotals(db, await body(req)));
  if (p === '/discount' && m === 'POST') {
    const b = await body(req); const r = core.findDiscount(db, b.code, b);
    return send(res, 200, r.ok ? { ok: true, label: core.describeDiscount(r.discount), code: r.discount.code } : r);
  }
  if (p === '/orders' && m === 'POST') {
    const r = core.createOrder(db, await body(req));
    if (!r.ok) return send(res, 400, r);
    await saveDB();
    console.log(`[order] ${r.order.id} ${r.order.totals.total} zł (${r.order.mode})`);
    const o = r.order;
    return send(res, 201, { ok: true, order: { id: o.id, status: o.status, totals: o.totals, items: o.items, shipping: o.shipping, payment: o.payment, email: o.customer.email } });
  }

  // admin
  if (p === '/admin/login' && m === 'POST') {
    const ip = req.socket.remoteAddress; const a = attempts.get(ip) || { n: 0, t: 0 };
    if (a.n >= 5 && Date.now() - a.t < 60e3) return send(res, 429, { ok: false, error: 'za dużo prób — odczekaj minutę' });
    const b = await body(req);
    if (!safeEq(b.password || '', ADMIN_PASSWORD)) { attempts.set(ip, { n: a.n + 1, t: Date.now() }); return send(res, 401, { ok: false, error: 'złe hasło' }); }
    attempts.delete(ip);
    const token = crypto.randomBytes(24).toString('hex'); sessions.set(token, Date.now() + SESSION_MS);
    return send(res, 200, { ok: true, token, defaultPassword: ADMIN_PASSWORD === 'dead12admin' });
  }
  if (!p.startsWith('/admin/')) return send(res, 404, { ok: false, error: 'not found' });
  if (!authed(req)) return send(res, 401, { ok: false, error: 'zaloguj się' });

  const seg = p.split('/').filter(Boolean).slice(1); // after 'admin'
  const [what, id] = [seg[0], seg[1] && decodeURIComponent(seg[1])];
  let r;
  switch (`${m} ${what}${id ? '/:id' : ''}`) {
    case 'GET stats': return send(res, 200, core.stats(db, { days: Math.min(365, +url.searchParams.get('days') || 30) }));
    case 'GET orders': return send(res, 200, db.orders);
    case 'PATCH orders/:id': r = core.updateOrder(db, id, await body(req)); break;
    case 'GET discounts': return send(res, 200, db.discounts);
    case 'POST discounts': r = core.upsertDiscount(db, await body(req)); break;
    case 'PATCH discounts/:id': r = core.upsertDiscount(db, await body(req), id); break;
    case 'DELETE discounts/:id': r = core.deleteDiscount(db, id); break;
    case 'GET products': return send(res, 200, db.products);
    case 'POST products': r = core.createProduct(db, await body(req)); break;
    case 'PATCH products/:id': r = core.updateProduct(db, id, await body(req)); break;
    case 'GET settings': return send(res, 200, db.settings);
    case 'PATCH settings': {
      const b = await body(req);
      if (b.freeShipFrom != null) db.settings.freeShipFrom = Math.max(0, core.r2(b.freeShipFrom));
      if (b.lowStock != null) db.settings.lowStock = Math.max(0, parseInt(b.lowStock, 10) || 0);
      if (Array.isArray(b.shipping)) for (const s of b.shipping) { const t = db.settings.shipping.find((x) => x.id === s.id); if (t && s.price != null) t.price = Math.max(0, core.r2(s.price)); }
      if (Array.isArray(b.payments)) for (const s of b.payments) { const t = db.settings.payments.find((x) => x.id === s.id); if (t && s.fee != null) t.fee = Math.max(0, core.r2(s.fee)); }
      r = { ok: true, settings: db.settings }; break;
    }
    case 'POST demo': r = { ok: true, added: core.seedDemoOrders(db, Math.min(300, (await body(req)).n || 60)) }; break;
    case 'POST reset': db = core.seedDB(); r = { ok: true }; break;
    case 'GET export': return send(res, 200, core.ordersCSV(db.orders), { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="dead12-zamowienia.csv"' });
    default: return send(res, 404, { ok: false, error: 'not found' });
  }
  if (r.ok) await saveDB();
  return send(res, r.ok ? 200 : 400, r);
}

/* ---------- static ---------- */
const BLOCK = [/^\/data(\/|$)/, /^\/server\.mjs$/, /^\/\.git/, /^\/node_modules/];
async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/admin' || rel === '/admin/') rel = '/admin.html';
  if (rel.endsWith('/')) rel += 'index.html';
  if (BLOCK.some((b) => b.test(rel))) return send(res, 404, 'not found');
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) return send(res, 403, 'forbidden');
  try {
    const st = await stat(file); if (!st.isFile()) throw 0;
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'content-length': st.size,
      'cache-control': /\.(png|jpe?g|webp|woff2|glb|svg)$/.test(ext) ? 'public, max-age=86400' : 'no-cache' });
    res.end(await readFile(file));
  } catch { send(res, 404, 'not found'); }
}

await loadDB();
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return await serveStatic(req, res, url);
  } catch (e) { console.error(e); send(res, 500, { ok: false, error: 'błąd serwera' }); }
}).listen(PORT, () => {
  console.log(`\n  dead12 ▸ sklep:  http://localhost:${PORT}\n  dead12 ▸ admin:  http://localhost:${PORT}/admin`);
  if (ADMIN_PASSWORD === 'dead12admin') console.log('  ⚠  domyślne hasło admina: dead12admin  (zmień: ADMIN_PASSWORD=… node server.mjs)\n');
});

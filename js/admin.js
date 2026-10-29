// dead12 — Kostnica (panel admina): pulpit, zamówienia, kody, produkty, ustawienia.
import * as api from './api.js';
import { STATUSES } from './core.js';

const A = api.admin;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const zl = (n) => (+n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
const zl0 = (n) => (+n || 0).toLocaleString('pl-PL', { maximumFractionDigits: 0 }) + ' zł';
const num = (n) => (+n || 0).toLocaleString('pl-PL');
const dt = (s) => new Date(s).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dshort = (k) => { const [, m, d] = k.split('-'); return `${+d}.${m}`; };
const ST = Object.fromEntries(STATUSES.map((s) => [s.id, s]));
const NEXT = { new: 'paid', paid: 'packing', packing: 'shipped', shipped: 'delivered' };
const PAYN = { blik: 'BLIK', card: 'karta', transfer: 'przelew', cod: 'pobranie' };
const SHIPN = { inpost: 'InPost', dpd: 'DPD', express: 'ekspres 24h' };

let toastT;
function toast(msg, bad = false) { const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : ''); clearTimeout(toastT); toastT = setTimeout(() => (t.className = 'toast'), 2800); }

async function guard(p) {
  try { return await p; }
  catch (e) { if (e.code === 401) { showLogin(); toast('sesja wygasła — zaloguj się', true); } else toast('błąd połączenia', true); throw e; }
}

/* ============ auth ============ */
async function showLogin() {
  $('#app').hidden = true; $('#login').hidden = false;
  const b = await api.backend();
  $('#loginHint').innerHTML = b === 'server' ? 'połączono z serwerem sklepu' : 'tryb lokalny (bez serwera) — dane w tej przeglądarce, hasło: <code>dead12admin</code>';
  setTimeout(() => $('#pw').focus(), 50);
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await A.login($('#pw').value);
  if (!r.ok) { $('#loginErr').textContent = r.error; $('#loginForm').classList.remove('shake'); void $('#loginForm').offsetWidth; $('#loginForm').classList.add('shake'); return; }
  $('#loginErr').textContent = ''; $('#pw').value = '';
  if (r.defaultPassword) setTimeout(() => toast('uwaga: używasz domyślnego hasła'), 800);
  boot();
});
$('#logout').addEventListener('click', () => { A.logout(); showLogin(); });

/* ============ shell / routing ============ */
const VIEWS = {
  dash: { t: 'pulpit', k: 'stan zwłok · na żywo' },
  orders: { t: 'zamówienia', k: 'kolejka do kostnicy' },
  codes: { t: 'kody rabatowe', k: 'zniżki zza grobu' },
  products: { t: 'produkty i magazyn', k: 'chłodnia' },
  settings: { t: 'ustawienia', k: 'konfiguracja' },
};
let view = 'dash';
function go(v) {
  if (!VIEWS[v]) v = 'dash';
  view = v; location.hash = v; drawer(false); $('#codeModal').hidden = true; $('#tip').classList.remove('show');
  $$('.view').forEach((s) => (s.hidden = s.dataset.v !== v));
  $$('[data-view]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.view === v)));
  $('#viewTitle').textContent = VIEWS[v].t; $('#viewKicker').textContent = VIEWS[v].k;
  const act = $('#topAct');
  act.innerHTML = v === 'orders' ? '<button class="btn" id="csvBtn">eksport CSV</button>'
    : v === 'codes' ? '<button class="btn pri" id="newCode">+ nowy kod</button>'
      : v === 'dash' ? '<button class="btn ghost" id="refresh">odśwież</button>' : '';
  load(v);
  window.scrollTo(0, 0);
}
$('#tabbar').innerHTML = $('#nav').innerHTML;
addEventListener('hashchange', () => { const v = location.hash.slice(1); if (!$('#app').hidden && v && v !== view) go(v); });
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]'); if (b) go(b.dataset.view);
  if (e.target.closest('#refresh')) load('dash');
  if (e.target.closest('#csvBtn')) exportCSV();
  if (e.target.closest('#newCode')) editCode(null);
});
async function load(v) {
  if (v === 'dash') return loadDash();
  if (v === 'orders') return loadOrders();
  if (v === 'codes') return loadCodes();
  if (v === 'products') return loadProducts();
  if (v === 'settings') return loadSettings();
}

/* ============ dashboard ============ */
let days = 30;
$('#range').addEventListener('click', (e) => {
  const b = e.target.closest('[data-d]'); if (!b) return;
  days = +b.dataset.d; $$('#range button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); loadDash();
});
const delta = (d) => d == null ? '<span class="dl">—</span>' : `<span class="dl ${d >= 0 ? 'up' : 'dn'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}%</span>`;

async function loadDash() {
  const s = await guard(A.stats(days));
  updateBadges(s);
  $('#kpis').innerHTML = [
    ['przychód', zl0(s.revenue), delta(s.deltas.revenue), 'vs poprzednie ' + days + ' dni'],
    ['zamówienia', num(s.orders), delta(s.deltas.orders), 'bez anulowanych'],
    ['średni koszyk', zl(s.aov), delta(s.deltas.aov), 'AOV'],
    ['sprzedane sztuki', num(s.units), '', `${num(s.customers)} klientów · ${num(s.returning)} wraca`],
    ['rabaty udzielone', zl0(s.discountGiven), '', s.revenue ? `${((s.discountGiven / (s.revenue + s.discountGiven)) * 100).toFixed(1)}% obrotu` : ''],
  ].map(([k, v, d, sub], i) => `<div class="kpi"><span class="drawer-no pix">szuflada 0${i + 1}</span><p class="k">${k}</p><p class="v">${v}</p><p class="sub">${d} <span>${sub}</span></p></div>`).join('');

  const al = [];
  if (s.toShip) al.push(`<button class="alert hot" data-jump="paid">📦 <b>${s.toShip}</b> do spakowania / wysłania</button>`);
  if (s.unpaid) al.push(`<button class="alert" data-jump="new">⏳ <b>${s.unpaid}</b> czeka na płatność</button>`);
  if (s.lowStock.length) al.push(`<button class="alert warn" data-view="products">⚠ niski stan: ${s.lowStock.slice(0, 4).map((l) => `${esc(l.name)}${l.size ? ' ' + l.size : ''} (${l.left})`).join(', ')}${s.lowStock.length > 4 ? ` +${s.lowStock.length - 4}` : ''}</button>`);
  $('#alerts').innerHTML = al.join('');

  if (!s.orders && !s.byDay.some((d) => d.orders)) {
    $('#revChart').innerHTML = `<div class="empty"><p>brak zamówień w tym okresie.</p><button class="btn" id="quickDemo">wygeneruj dane demo</button></div>`;
    $('#quickDemo').onclick = async () => { await guard(A.demo(60)); toast('dodano zamówienia demo'); loadDash(); };
  } else revChart(s.byDay);

  // today vs daily average
  const today = s.byDay[s.byDay.length - 1] || { revenue: 0, orders: 0 };
  const avgR = s.revenue / Math.max(1, s.days), avgO = s.orders / Math.max(1, s.days);
  const pr = avgR ? (today.revenue / avgR) * 100 : 0;
  $('#split').innerHTML = `
    <div class="splitbar"><i style="width:${Math.min(100, pr / 2)}%;background:var(--c-ona)"></i><i style="width:${100 - Math.min(100, pr / 2)}%;background:var(--s3)"></i></div>
    <div class="split-rows">
      <div><span class="sw" style="--c:var(--c-ona)"></span><b>dziś</b><span>${today.orders} zam.</span><span>${zl0(today.revenue)}</span><span class="muted">${avgR ? (pr >= 100 ? '▲ ' : '▼ ') + Math.abs(pr - 100).toFixed(0) + '% vs średnia' : 'brak danych'}</span></div>
      <div><span class="sw" style="--c:var(--s3)"></span><b>średnio / dzień</b><span>${avgO.toFixed(1)} zam.</span><span>${zl0(avgR)}</span><span class="muted">z ostatnich ${s.days} dni</span></div>
    </div>`;

  const max = Math.max(1, ...s.topProducts.map((p) => p.revenue));
  $('#top').innerHTML = s.topProducts.length ? `<ol class="hbars">${s.topProducts.slice(0, 6).map((p) => `
    <li><span class="hb-l">${esc(p.name)}<small>${esc(p.ticker || '')} · ${p.units} szt.</small></span><span class="hb-b"><i style="width:${(p.revenue / max) * 100}%"></i></span><span class="hb-v">${zl0(p.revenue)}</span></li>`).join('')}</ol>` : '<p class="muted">—</p>';

  const order = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const smax = Math.max(1, ...Object.values(s.sizes));
  const stot = Object.values(s.sizes).reduce((a, b) => a + b, 0) || 1;
  $('#sizes').innerHTML = `<div class="vbars">${order.map((k) => { const v = s.sizes[k] || 0; return `<div data-tip="${k}: ${v} szt. (${((v / stot) * 100).toFixed(0)}%)"><span class="vb"><i style="height:${(v / smax) * 100}%"></i></span><b>${k}</b><small>${v}</small></div>`; }).join('')}</div>`;

  const mrow = (obj, names, color) => { const t = Object.values(obj).reduce((a, b) => a + b, 0) || 1; return Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<li><span>${names[k] || k}</span><span class="hb-b"><i style="width:${(v / t) * 100}%;background:${color}"></i></span><span class="hb-v">${((v / t) * 100).toFixed(0)}%</span></li>`).join(''); };
  $('#methods').innerHTML = `<p class="mini-h pix">płatność</p><ol class="hbars sm">${mrow(s.pays, PAYN, 'var(--c-3)')}</ol><p class="mini-h pix">dostawa</p><ol class="hbars sm">${mrow(s.ships, SHIPN, 'var(--c-4)')}</ol>`;

  $('#codeStats').innerHTML = s.codes.length ? `<table class="mt"><thead><tr><th>kod</th><th>zam.</th><th>rabat</th></tr></thead><tbody>${s.codes.map((c) => `<tr><td><code>${esc(c.code)}</code></td><td>${c.orders}</td><td>${zl0(c.discount)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">nikt jeszcze nie użył kodu.</p>';
  const cmax = Math.max(1, ...s.cities.map((c) => c[1]));
  $('#cities').innerHTML = s.cities.length ? `<ol class="hbars sm">${s.cities.map(([c, n]) => `<li><span>${esc(c)}</span><span class="hb-b"><i style="width:${(n / cmax) * 100}%"></i></span><span class="hb-v">${n}</span></li>`).join('')}</ol>` : '<p class="muted">—</p>';
}
$('#alerts').addEventListener('click', (e) => { const b = e.target.closest('[data-jump]'); if (b) { oStatus = b.dataset.jump; go('orders'); } });

function revChart(byDay) {
  const el = $('#revChart');
  const W = Math.max(320, el.clientWidth || 800), H = 240, pl = 48, pr = 8, pt = 12, pb = 26;
  const iw = W - pl - pr, ih = H - pt - pb;
  const max = Math.max(1, ...byDay.map((d) => d.revenue));
  const step = niceStep(max / 4), top = Math.ceil(max / step) * step;
  const n = byDay.length, bw = iw / n, gap = n > 60 ? 0.5 : 2, w = Math.max(1, bw - gap);
  const y = (v) => pt + ih - (v / top) * ih;
  let g = '';
  for (let v = 0; v <= top; v += step) g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="gl"/><text x="${pl - 8}" y="${y(v) + 4}" class="ax" text-anchor="end">${v >= 1000 ? (v / 1000).toLocaleString('pl-PL') + 'k' : v}</text>`;
  let bars = '', hits = '';
  const every = Math.ceil(n / 8);
  byDay.forEach((d, i) => {
    const x = pl + i * bw + gap / 2;
    const ona = d.ona || 0, on = d.on || 0;
    const h1 = (ona / top) * ih, h2 = (on / top) * ih;
    const r = Math.min(4, w / 2);
    const hh = h1 + h2; if (hh) bars += `<path d="${barPath(x, y(0) - hh, w, hh, r)}" fill="var(--c-ona)"/>`;
    hits += `<rect x="${pl + i * bw}" y="${pt}" width="${bw}" height="${ih}" class="hit" data-i="${i}"/>`;
    if ((i % every === 0 && n - 1 - i >= every / 2) || i === n - 1) g += `<text x="${x + w / 2}" y="${H - 6}" class="ax" text-anchor="middle">${dshort(d.day)}</text>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="przychód dzienny, ostatnie ${n} dni">${g}<line x1="${pl}" x2="${W - pr}" y1="${y(0)}" y2="${y(0)}" class="base"/>${bars}<line class="cross" id="cross" y1="${pt}" y2="${pt + ih}" x1="-10" x2="-10"/>${hits}</svg>`;
  const tip = $('#tip');
  el.onpointermove = (e) => {
    const hit = e.target.closest('.hit'); if (!hit) return;
    const d = byDay[+hit.dataset.i], cx = +hit.getAttribute('x') + bw / 2;
    const c = $('#cross'); c.setAttribute('x1', cx); c.setAttribute('x2', cx);
    tip.innerHTML = `<b>${new Date(d.day).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })}</b>
      <span><i style="--c:var(--c-ona)"></i>przychód <em>${zl(d.revenue)}</em></span><span class="tt">${d.orders} zam.</span>`;
    placeTip(e);
  };
  el.onpointerleave = () => { tip.classList.remove('show'); const c = $('#cross'); if (c) { c.setAttribute('x1', -10); c.setAttribute('x2', -10); } };
  $('#revTable').innerHTML = `<table class="mt"><thead><tr><th>dzień</th><th>przychód</th><th>zam.</th></tr></thead><tbody>${byDay.filter((d) => d.orders).reverse().map((d) => `<tr><td>${d.day}</td><td>${zl(d.revenue)}</td><td>${d.orders}</td></tr>`).join('')}</tbody></table>`;
}
function barPath(x, yTop, w, h, r) {
  if (h <= 0) return '';
  r = Math.min(r, h);
  return `M${x},${yTop + h} L${x},${yTop + r} Q${x},${yTop} ${x + r},${yTop} L${x + w - r},${yTop} Q${x + w},${yTop} ${x + w},${yTop + r} L${x + w},${yTop + h} Z`;
}
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
function placeTip(e) {
  const tip = $('#tip'); tip.classList.add('show');
  const r = tip.getBoundingClientRect();
  let x = e.clientX + 14, yy = e.clientY + 14;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
  if (yy + r.height > innerHeight - 8) yy = e.clientY - r.height - 14;
  tip.style.transform = `translate(${Math.max(8, x)}px,${Math.max(8, yy)}px)`;
}
document.addEventListener('pointerover', (e) => {
  const t = e.target.closest('[data-tip]'); if (!t) return;
  $('#tip').innerHTML = esc(t.dataset.tip); placeTip(e);
  t.addEventListener('pointerleave', () => $('#tip').classList.remove('show'), { once: true });
});
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => view === 'dash' && loadDash(), 250); });

/* ============ orders ============ */
let orders = [], oStatus = 'all', oMode = 'all', oQuery = '', oLimit = 50, lastTopId = null;
async function loadOrders() {
  orders = await guard(A.orders());
  renderOrders();
}
function renderOrders() {
  const counts = Object.fromEntries(STATUSES.map((s) => [s.id, 0]));
  for (const o of orders) counts[o.status]++;
  $('#oStatus').innerHTML = [`<button data-st="all" aria-pressed="${oStatus === 'all'}">wszystkie <b>${orders.length}</b></button>`,
    ...STATUSES.map((s) => `<button data-st="${s.id}" aria-pressed="${oStatus === s.id}" class="st-${s.id}">${s.label} <b>${counts[s.id]}</b></button>`)].join('');
  const q = oQuery.toLowerCase();
  const list = orders.filter((o) => (oStatus === 'all' || o.status === oStatus) && (oMode === 'all' || o.mode === oMode)
    && (!q || [o.id, o.customer.name, o.customer.email, o.customer.city, o.code, o.shipping.tracking].join(' ').toLowerCase().includes(q)));
  if (!list.length) { $('#oTable').innerHTML = `<div class="empty"><p>${orders.length ? 'nic nie pasuje do filtrów.' : 'jeszcze żadnych zamówień. kostnica czeka.'}</p></div>`; $('#oMore').hidden = true; return; }
  $('#oTable').innerHTML = `<div class="orow ohead"><span>nr</span><span>data</span><span>klient</span><span>pozycje</span><span>kwota</span><span>płatność</span><span>status</span></div>` +
    list.slice(0, oLimit).map((o) => `
    <button class="orow" data-oid="${esc(o.id)}">
      <span class="o-id">${esc(o.id)}${o.demo ? ' <span class="tag">demo</span>' : ''}</span>
      <span class="o-dt">${dt(o.createdAt)}</span>
      <span class="o-cu"><b>${esc(o.customer.name)}</b><small>${esc(o.customer.city)}</small></span>
      <span class="o-it">${o.items.map((i) => `${esc(i.name?.ona || i.id)}${i.size ? ' ' + i.size : ''}${i.q > 1 ? ' ×' + i.q : ''}`).join(', ')}</span>
      <span class="o-tot">${zl(o.totals.total)}${o.code ? `<small>${esc(o.code)}</small>` : ''}</span>
      <span class="o-pay">${PAYN[o.payment.id] || ''}<small>${SHIPN[o.shipping.id] || ''}</small></span>
      <span class="o-st"><span class="pill st-${o.status}">${ST[o.status]?.label}</span></span>
    </button>`).join('');
  $('#oMore').hidden = list.length <= oLimit;
}
$('#oStatus').addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (b) { oStatus = b.dataset.st; oLimit = 50; renderOrders(); } });
$('#oMode').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (!b) return; oMode = b.dataset.m; $$('#oMode button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); renderOrders(); });
let sq; $('#oSearch').addEventListener('input', (e) => { clearTimeout(sq); sq = setTimeout(() => { oQuery = e.target.value.trim(); renderOrders(); }, 150); });
$('#oMore').addEventListener('click', () => { oLimit += 50; renderOrders(); });
$('#oTable').addEventListener('click', (e) => { const r = e.target.closest('[data-oid]'); if (r) openOrder(r.dataset.oid); });

function openOrder(id) {
  const o = orders.find((x) => x.id === id); if (!o) return;
  $('#dTitle').innerHTML = `${esc(o.id)} <span class="pill st-${o.status}">${ST[o.status].label}</span>`;
  $('#dDate').textContent = dt(o.createdAt);
  const c = o.customer;
  const nxt = NEXT[o.status];
  $('#dBody').innerHTML = `
    <div class="d-actions">
      ${nxt ? `<button class="btn pri" data-set="${nxt}">oznacz: ${ST[nxt].label} →</button>` : ''}
      <label class="fld inline">status<select id="dStatus">${STATUSES.map((s) => `<option value="${s.id}" ${s.id === o.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select></label>
      <button class="btn ghost" id="dPrint">list przewozowy / slip</button>
    </div>
    <section class="d-sec"><h4>klient</h4>
      <p><b>${esc(c.name)}</b><br>${esc(c.street)}<br>${esc(c.zip)} ${esc(c.city)}</p>
      <p><a href="mailto:${esc(c.email)}?subject=${encodeURIComponent('dead12 · zamówienie ' + o.id)}">${esc(c.email)}</a> · <a href="tel:${esc(c.phone.replace(/\s/g, ''))}">${esc(c.phone)}</a>${c.newsletter ? ' · <span class="tag">newsletter</span>' : ''}</p>
      <button class="btn ghost sm" data-copy="${esc(`${c.name}\n${c.street}\n${c.zip} ${c.city}\n${c.phone}`)}">kopiuj adres</button>
    </section>
    <section class="d-sec"><h4>pozycje</h4>
      <table class="mt"><tbody>${o.items.map((i) => `<tr><td>${esc(i.name?.ona || i.id)}<small> ${esc(i.ticker || '')}</small></td><td>${i.size || 'one'}</td><td>×${i.q}</td><td class="r">${zl(i.sum)}</td></tr>`).join('')}</tbody>
      <tfoot>
        <tr><td colspan="3">produkty</td><td class="r">${zl(o.totals.subtotal)}</td></tr>
        ${o.totals.discount ? `<tr class="disc"><td colspan="3">rabat ${esc(o.code || '')}</td><td class="r">−${zl(o.totals.discount)}</td></tr>` : ''}
        <tr><td colspan="3">dostawa · ${esc(o.shipping.name)}</td><td class="r">${zl(o.totals.shipping)}</td></tr>
        ${o.totals.fee ? `<tr><td colspan="3">opłata ${esc(o.payment.name)}</td><td class="r">${zl(o.totals.fee)}</td></tr>` : ''}
        <tr class="tot"><td colspan="3">razem · ${esc(o.payment.name)}</td><td class="r">${zl(o.totals.total)}</td></tr>
      </tfoot></table>
    </section>
    <section class="d-sec"><h4>wysyłka</h4>
      <p>${esc(o.shipping.name)}${o.shipping.locker ? ` · paczkomat <b>${esc(o.shipping.locker)}</b>` : ''}</p>
      <label class="fld">numer przesyłki<span class="inl"><input id="dTrack" value="${esc(o.shipping.tracking || '')}" placeholder="wpisz tracking"><button class="btn" id="dTrackSave">zapisz</button></span></label>
      ${o.note ? `<p class="note">„${esc(o.note)}”</p>` : ''}
    </section>
    <section class="d-sec"><h4>notatka wewnętrzna</h4>
      <textarea id="dNote" rows="3" placeholder="widoczna tylko w panelu">${esc(o.adminNote || '')}</textarea>
      <button class="btn ghost sm" id="dNoteSave">zapisz notatkę</button>
    </section>
    <section class="d-sec"><h4>historia</h4>
      <ol class="timeline">${[...o.history].reverse().map((h) => `<li><span class="pill st-${h.status}">${ST[h.status]?.label || h.status}</span><small>${dt(h.at)} · ${esc(h.by)}</small></li>`).join('')}</ol>
    </section>`;
  const set = async (patch, msg) => {
    const r = await guard(A.updateOrder(o.id, patch));
    if (!r.ok) return toast(r.error, true);
    Object.assign(o, r.order); toast(msg); renderOrders(); openOrder(o.id);
  };
  $('#dBody').querySelector('[data-set]')?.addEventListener('click', (e) => set({ status: e.target.dataset.set }, 'status zmieniony'));
  $('#dStatus').addEventListener('change', (e) => set({ status: e.target.value }, 'status zmieniony'));
  $('#dTrackSave').addEventListener('click', () => set({ tracking: $('#dTrack').value }, 'tracking zapisany'));
  $('#dNoteSave').addEventListener('click', () => set({ adminNote: $('#dNote').value }, 'notatka zapisana'));
  $('#dPrint').addEventListener('click', () => printSlip(o));
  $('#dBody').querySelector('[data-copy]').addEventListener('click', async (e) => { try { await navigator.clipboard.writeText(e.target.dataset.copy); toast('skopiowano adres'); } catch { toast('nie udało się skopiować', true); } });
  drawer(true);
}
function drawer(v) { $('#drawer').classList.toggle('open', v); $('#drawer').setAttribute('aria-hidden', String(!v)); document.body.classList.toggle('lock', v); }
$('#drawer').addEventListener('click', (e) => { if (e.target.closest('[data-dclose]')) drawer(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { drawer(false); $('#codeModal').hidden = true; } });

function printSlip(o) {
  $('#slip').innerHTML = `<div class="slip-in">
    <img src="assets/img/logo-color.png" alt="dead12"><h1>${esc(o.id)}</h1><p>${dt(o.createdAt)}</p>
    <h2>odbiorca</h2><p><b>${esc(o.customer.name)}</b><br>${esc(o.customer.street)}<br>${esc(o.customer.zip)} ${esc(o.customer.city)}<br>${esc(o.customer.phone)}</p>
    <h2>dostawa</h2><p>${esc(o.shipping.name)}${o.shipping.locker ? ' · ' + esc(o.shipping.locker) : ''}</p>
    <table>${o.items.map((i) => `<tr><td>☐</td><td>${esc(i.name?.ona || i.id)}</td><td>${i.size || 'one'}</td><td>×${i.q}</td></tr>`).join('')}</table>
    <p class="thx">dzięki, że wybrałaś/eś dead12 ♥ do zobaczenia zza grobu.</p></div>`;
  window.print();
}
async function exportCSV() {
  const csv = await guard(A.exportCSV());
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `dead12-zamowienia-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ============ codes ============ */
let codes = [];
async function loadCodes() {
  codes = await guard(A.discounts());
  const typeL = (c) => c.type === 'percent' ? `−${c.value}%` : c.type === 'amount' ? `−${c.value} zł` : 'darmowa dostawa';
  const modeL = { all: 'cały sklep', ona: 'cały sklep', on: 'cały sklep' };
  $('#codesList').innerHTML = codes.length ? codes.map((c) => {
    const expired = c.expires && new Date(c.expires) < new Date();
    const pct = c.limit ? Math.min(100, (c.used / c.limit) * 100) : 0;
    return `<article class="coupon ${c.active && !expired ? '' : 'off'}">
      <div class="cp-l"><code>${esc(c.code)}</code><p class="cp-v">${typeL(c)}</p></div>
      <div class="cp-m">
        <p>${modeL[c.mode]}${c.minOrder ? ` · min. ${c.minOrder} zł` : ''}${c.expires ? ` · do ${new Date(c.expires).toLocaleDateString('pl-PL')}` : ''}${expired ? ' · <b class="bad">wygasł</b>' : ''}</p>
        <p class="muted">${esc(c.note || '')}</p>
        <div class="use"><span>${c.used}${c.limit ? ' / ' + c.limit : ''} użyć</span>${c.limit ? `<span class="hb-b"><i style="width:${pct}%"></i></span>` : ''}</div>
      </div>
      <div class="cp-r">
        <label class="sw-t" title="aktywny"><input type="checkbox" data-toggle="${esc(c.code)}" ${c.active ? 'checked' : ''}><span></span></label>
        <button class="btn ghost sm" data-edit="${esc(c.code)}">edytuj</button>
        <button class="btn ghost sm bad" data-del="${esc(c.code)}">usuń</button>
      </div>
    </article>`;
  }).join('') : '<div class="empty"><p>brak kodów.</p></div>';
}
$('#codesList').addEventListener('click', async (e) => {
  const ed = e.target.closest('[data-edit]'); if (ed) return editCode(codes.find((c) => c.code === ed.dataset.edit));
  const del = e.target.closest('[data-del]');
  if (del) {
    if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'na pewno?'; setTimeout(() => { del.dataset.armed = ''; del.textContent = 'usuń'; }, 3000); return; }
    await guard(A.deleteDiscount(del.dataset.del)); toast('kod usunięty'); loadCodes();
  }
});
$('#codesList').addEventListener('change', async (e) => {
  const t = e.target.closest('[data-toggle]'); if (!t) return;
  const c = codes.find((x) => x.code === t.dataset.toggle);
  const r = await guard(A.saveDiscount({ ...c, active: t.checked }, c.code));
  toast(r.ok ? (t.checked ? 'kod aktywny' : 'kod wyłączony') : r.error, !r.ok); loadCodes();
});
let editing = null;
function editCode(c) {
  editing = c?.code || null;
  const f = $('#codeForm');
  f.reset();
  $('#codeTitle').textContent = c ? `edytuj ${c.code}` : 'nowy kod';
  if (c) { for (const k of ['code', 'type', 'value', 'minOrder', 'limit', 'mode', 'note']) f.elements[k].value = c[k] ?? ''; f.elements.expires.value = c.expires ? c.expires.slice(0, 10) : ''; f.elements.active.checked = c.active; }
  else { f.elements.value.value = 10; }
  $('#valFld').hidden = f.elements.type.value === 'ship';
  $('#codeErr').textContent = '';
  $('#codeModal').hidden = false; setTimeout(() => f.elements.code.focus(), 30);
}
$('#codeForm').elements.type.addEventListener('change', (e) => ($('#valFld').hidden = e.target.value === 'ship'));
$('#genCode').addEventListener('click', () => {
  const W = ['GROB', 'TRUMNA', 'ZOMBIE', 'CZASZKA', 'DUCH', 'WDOWA', 'CAPITAL', 'DEAD'];
  $('#codeForm').elements.code.value = W[Math.floor(Math.random() * W.length)] + Math.floor(Math.random() * 90 + 10);
});
$('#codeModal').addEventListener('click', (e) => { if (e.target.closest('[data-mclose]')) $('#codeModal').hidden = true; });
$('#codeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const d = { code: f.code.value, type: f.type.value, value: +f.value.value, minOrder: +f.minOrder.value, limit: +f.limit.value, mode: f.mode.value,
    expires: f.expires.value ? new Date(f.expires.value + 'T23:59:59').toISOString() : null, note: f.note.value, active: f.active.checked };
  const r = await guard(A.saveDiscount(d, editing));
  if (!r.ok) { $('#codeErr').textContent = r.error; return; }
  $('#codeModal').hidden = true; toast(`kod ${r.discount.code} zapisany`); loadCodes();
});

/* ============ products ============ */
let prods = [];
async function loadProducts() {
  prods = await guard(A.products());
  const low = (await guard(A.settings())).lowStock;
  $('#prodList').innerHTML = prods.map((p) => {
    const total = Object.values(p.stock).reduce((a, b) => a + b, 0);
    return `<form class="card prod ${p.active ? '' : 'off'}" data-pid="${esc(p.id)}">
      <div class="pr-img"><img src="${esc(p.img)}" alt=""></div>
      <div class="pr-main">
        <header><div><h3>${esc(p.ona.name)}</h3><p class="muted"><code>${esc(p.on.ticker)}</code> · ${esc(p.on.name)} · id: ${esc(p.id)}</p></div>
          <label class="sw-t" title="widoczny w sklepie"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}><span></span></label></header>
        <div class="row">
          <label class="fld">cena zł<input name="price" type="number" step="0.01" min="1" value="${p.price}"></label>
          <label class="fld">przekreślona cena<input name="compareAt" type="number" step="0.01" min="0" value="${p.compareAt || ''}" placeholder="—"></label>
          <label class="fld">nazwa ONA<input name="onaName" value="${esc(p.ona.name)}"></label>
          <label class="fld">nazwa ON<input name="onName" value="${esc(p.on.name)}"></label>
        </div>
        <p class="mini-h pix">stan magazynu · razem <b>${total}</b> szt.</p>
        <div class="stock">${Object.entries(p.stock).map(([k, v]) => `<label class="${v <= low ? 'low' : ''} ${v === 0 ? 'zero' : ''}"><span>${k === 'one' ? 'szt.' : k}</span><input name="st_${k}" type="number" min="0" step="1" value="${v}" inputmode="numeric"></label>`).join('')}</div>
        <details><summary>opisy</summary>
          <label class="fld">opis ONA<textarea name="onaDesc" rows="3">${esc(p.ona.desc)}</textarea></label>
          <label class="fld">opis ON<textarea name="onDesc" rows="3">${esc(p.on.desc)}</textarea></label>
          <label class="fld">zdjęcie<input name="img" value="${esc(p.img)}"></label>
        </details>
        <div class="row end"><button class="btn pri">zapisz</button></div>
      </div>
    </form>`;
  }).join('');
}
$('#prodList').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, id = f.dataset.pid, el = f.elements, p = prods.find((x) => x.id === id);
  const stock = {}; for (const k of Object.keys(p.stock)) stock[k] = +el['st_' + k].value;
  const r = await guard(A.updateProduct(id, {
    price: +el.price.value, compareAt: el.compareAt.value ? +el.compareAt.value : null, active: el.active.checked, stock, img: el.img.value,
    ona: { name: el.onaName.value, desc: el.onaDesc.value }, on: { name: el.onName.value, desc: el.onDesc.value },
  }));
  toast(r.ok ? 'produkt zapisany' : r.error, !r.ok); if (r.ok) { loadProducts(); refreshBadges(); }
});
$('#prodList').addEventListener('change', (e) => { if (e.target.name === 'active') e.target.form.requestSubmit(); });
$('#newProd').addEventListener('submit', async (e) => {
  e.preventDefault(); const el = e.target.elements;
  const r = await guard(A.createProduct({ id: el.id.value, name: el.name.value, price: +el.price.value, img: el.img.value, hasSizes: el.hasSizes.checked }));
  toast(r.ok ? 'dodano produkt (ukryty)' : r.error, !r.ok); if (r.ok) { e.target.reset(); loadProducts(); }
});

/* ============ settings ============ */
async function loadSettings() {
  const s = await guard(A.settings());
  const f = $('#setForm');
  f.elements.freeShipFrom.value = s.freeShipFrom; f.elements.lowStock.value = s.lowStock;
  $('#setShip').innerHTML = s.shipping.map((m) => `<label class="fld">${esc(m.name.on)} (zł)<input data-ship="${m.id}" type="number" min="0" step="0.01" value="${m.price}"></label>`).join('');
  $('#setPay').innerHTML = s.payments.map((m) => `<label class="fld">opłata: ${esc(m.name.on)} (zł)<input data-pay="${m.id}" type="number" min="0" step="0.01" value="${m.fee}"></label>`).join('');
}
$('#setForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target.elements;
  const r = await guard(A.saveSettings({
    freeShipFrom: +f.freeShipFrom.value, lowStock: +f.lowStock.value,
    shipping: $$('[data-ship]').map((i) => ({ id: i.dataset.ship, price: +i.value })), payments: $$('[data-pay]').map((i) => ({ id: i.dataset.pay, fee: +i.value })),
  }));
  toast(r.ok ? 'ustawienia zapisane' : r.error, !r.ok);
});
$('#demoBtn').addEventListener('click', async () => { const r = await guard(A.demo(+$('#demoN').value || 60)); toast(`dodano ${r.added} zamówień demo`); refreshBadges(); });
$('#resetTxt').addEventListener('input', (e) => ($('#resetBtn').disabled = e.target.value !== 'RESET'));
$('#resetBtn').addEventListener('click', async () => { await guard(A.reset()); $('#resetTxt').value = ''; $('#resetBtn').disabled = true; toast('baza wyczyszczona'); refreshBadges(); });

/* ============ badges + polling ============ */
function updateBadges(s) {
  $$('#navOrders, #tabbar [data-view=orders] b').forEach((b) => (b.textContent = s.toShip || ''));
  $$('#navStock, #tabbar [data-view=products] b').forEach((b) => (b.textContent = s.lowStock.length ? '!' : ''));
}
async function refreshBadges() { try { updateBadges(await A.stats(30)); } catch { /* */ } }
async function poll() {
  if (document.hidden || $('#app').hidden) return;
  try {
    const list = await A.orders();
    const top = list[0]?.id;
    if (lastTopId && top && top !== lastTopId) {
      const fresh = list.filter((o) => !orders.some((x) => x.id === o.id) && !o.demo);
      if (fresh.length) { toast(`🔔 nowe zamówienie ${fresh[0].id} · ${zl(fresh[0].totals.total)}`); document.title = `(${fresh.length}) Kostnica · panel dead12`; }
    }
    lastTopId = top; orders = list;
    if (view === 'orders') renderOrders();
    if (view === 'dash') loadDash();
  } catch { /* offline */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) document.title = 'Kostnica · panel dead12'; });

/* ============ boot ============ */
async function boot() {
  $('#login').hidden = true; $('#app').hidden = false;
  const b = await api.backend();
  $('#backendChip').textContent = b === 'server' ? '● serwer' : '● tryb lokalny';
  $('#backendChip').className = 'chip ' + (b === 'server' ? 'ok' : 'warn');
  $('#backendChip').title = b === 'server' ? 'dane z server.mjs (data/db.json)' : 'brak serwera — dane tylko w tej przeglądarce';
  try { orders = await A.orders(); lastTopId = orders[0]?.id; } catch { return; }
  go(location.hash.slice(1) || 'dash');
  setInterval(poll, 15000);
}
(async () => {
  if (!A.hasToken()) return showLogin();
  try { await A.stats(1); boot(); } catch { showLogin(); }
})();

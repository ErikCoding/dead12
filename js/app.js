// dead12 — sklep. Tryby ONA / ON, koszyk, modal produktu, efekty.
import { PRODUCTS as SEED, LOCKED, INDICES } from './products.js';
import * as api from './api.js';
import { initCart } from './cart.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const html = document.documentElement;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
// catalog comes from the API (prices, stock, active products); seed is the offline fallback
let CATALOG = { products: SEED.map((p) => ({ ...p, stock: p.sizes ? Object.fromEntries(p.sizes.map((x) => [x, 9])) : { one: 99 } })), settings: { freeShipFrom: 300, shipping: [], payments: [], lowStock: 3 } };
let PRODUCTS = CATALOG.products;
let byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, m = mode()) => m === 'on'
  ? n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' PLN'
  : n.toLocaleString('pl-PL', { maximumFractionDigits: 2 }) + ' zł';
const totalStock = (p) => Object.values(p.stock || {}).reduce((a, b) => a + b, 0);
const lowStock = () => CATALOG.settings.lowStock || 3;
const mode = () => html.dataset.mode;

/* ============ toast ============ */
let toastT, toastFn = null;
function toast(msg, action) {
  const t = $('#toast'), b = $('#toastAct');
  $('#toastTxt').textContent = msg;
  toastFn = action?.fn || null; b.hidden = !action; if (action) b.textContent = action.label;
  t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), action ? 5000 : 2600);
}
$('#toastAct').addEventListener('click', () => { toastFn && toastFn(); toastFn = null; $('#toast').classList.remove('show'); });

/* ============ render: ONA blisters ============ */
function renderOna() {
  const wrap = $('#onaProducts');
  wrap.innerHTML = PRODUCTS.map((p) => {
    const left = totalStock(p), out = left <= 0;
    const badge = out ? '<span class="bl-badge out">wyprzedane</span>' : left <= lowStock() * 2 ? `<span class="bl-badge">ostatnie ${left} szt.</span>` : '';
    return `
    <article class="blister ${out ? 'sold' : ''}" data-open="${esc(p.id)}" tabindex="0" aria-label="${esc(p.ona.name)}, ${fmt(p.price, 'ona')}">
      <div class="bl-brand"><img src="assets/img/logo-dark.png" alt=""><span class="pix">${esc((p.ona.kicker || '').split('·')[0])}</span></div>
      <h3 class="bl-name">${esc(p.ona.name)}</h3>
      <div class="bl-win"><img src="${esc(p.img)}" alt="${esc(p.ona.name)}" loading="lazy">${badge}</div>
      <div class="bl-price">${p.compareAt ? `<s>${p.compareAt}</s>` : ''}${p.price}<small>zł</small></div>
      <div class="bl-foot">
        <p class="bl-note">${esc(p.ona.note)}</p>
        <button class="bl-open" data-open="${esc(p.id)}">${out ? 'zobacz' : 'rozpakuj'}</button>
      </div>
    </article>`; }).join('') + `
    <article class="blister locked" aria-label="Drop 02 — wkrótce">
      <div class="locked-in">
        <img src="assets/img/skull-white.png" alt="" style="width:70px">
        <span class="fraktur">${LOCKED.ona.title}</span>
        <span class="pix">${LOCKED.ona.label}</span>
        <span class="cd" data-countdown="${LOCKED.ona.date}">--:--:--</span>
      </div>
    </article>`;

  // tilt + cellophane glare
  if (matchMedia('(hover:hover)').matches) $$('.blister:not(.locked)', wrap).forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.classList.add('tilting');
      el.style.setProperty('--ry', `${(x - 0.5) * 16}deg`);
      el.style.setProperty('--rx', `${(0.5 - y) * 12}deg`);
      el.style.setProperty('--sx', `${x * 100}%`);
    });
    el.addEventListener('pointerleave', () => {
      el.classList.remove('tilting'); el.style.removeProperty('--rx'); el.style.removeProperty('--ry');
    });
  });
}

/* ============ render: ON exchange ============ */
function sparkPath(seed, up, w = 200, h = 54) {
  let v = 0.5, pts = [];
  const rnd = mulberry(seed);
  for (let i = 0; i < 30; i++) {
    v += (rnd() - 0.5) * 0.18 + (up ? 0.012 : -0.012);
    v = Math.max(0.05, Math.min(0.95, v));
    pts.push([i / 29 * w, h - v * h]);
  }
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return { d, area: d + ` L ${w} ${h} L 0 ${h} Z` };
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function renderOn() {
  const wrap = $('#onProducts');
  wrap.innerHTML = `
    <div class="ex-head" role="row"><span>#</span><span>ticker</span><span>walor</span><span>nazwa</span><span class="h-spark">30 dni</span><span style="text-align:right">kurs</span><span style="text-align:right">zmiana</span><span></span></div>` +
    PRODUCTS.map((p, i) => {
      const sp = sparkPath(i * 97 + 12, p.on.chg > 0);
      const cls = p.on.chg > 0 ? 'up' : 'dn';
      const left = totalStock(p), out = left <= 0;
      return `
      <div class="ex-row ${out ? 'sold' : ''}" role="row" tabindex="0" data-open="${esc(p.id)}" aria-label="${esc(p.on.name)}, ${fmt(p.price, 'on')}">
        <span class="ex-n mono">0${i + 1}</span>
        <span class="ex-t">${esc(p.on.ticker)}${out ? '<small class="ex-halt">zawieszony</small>' : left <= lowStock() * 2 ? `<small class="ex-halt low">wolumen: ${left}</small>` : ''}</span>
        <img class="ex-img" src="${esc(p.img)}" alt="${esc(p.on.name)}" loading="lazy">
        <span class="ex-name">${esc(p.on.name)}<em>${esc(p.on.sub)}</em></span>
        <svg class="ex-spark ${cls}" viewBox="0 0 200 54" preserveAspectRatio="none"><path class="area" d="${sp.area}"/><path d="${sp.d}"/></svg>
        <span class="ex-price">${p.compareAt ? `<s>${fmt(p.compareAt, 'on')}</s>` : ''}${fmt(p.price, 'on')}</span>
        <span class="ex-chg ${cls}">${p.on.chg > 0 ? '▲' : '▼'} ${Math.abs(p.on.chg).toFixed(1)}%</span>
        <button class="ex-buy" data-open="${esc(p.id)}">${out ? 'podgląd' : 'kup · long'}</button>
      </div>`;
    }).join('') + `
      <div class="ex-row locked" role="row">
        <span class="ex-n mono">0${PRODUCTS.length + 1}</span>
        <span class="ex-t">${LOCKED.on.ticker}</span>
        <span class="ipo">IPO<br>soon</span>
        <span class="ex-name">${LOCKED.on.name}<em>${LOCKED.on.sub}</em></span>
        <span class="ex-spark"></span>
        <span class="ex-price">—</span>
        <span class="ex-chg mono" data-countdown="${LOCKED.on.date}">--:--:--</span>
        <span class="ex-buy" style="opacity:.5">zamknięte</span>
      </div>`;
}

/* ============ ticker + quotes (ON) ============ */
let quotes = [];
const buildQuotes = () => (quotes = [
  ...PRODUCTS.map((p) => ({ t: p.on.ticker, v: p.price, c: p.on.chg })),
  ...INDICES.map(([t, v]) => ({ t, v, c: (Math.random() - 0.4) * 6 })),
]);
buildQuotes();
const hist = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 8 + i * 0.6 + Math.random() * 4);
function qfmt(v) { return v < 1 ? v.toFixed(3) : v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function renderTicker() {
  const one = quotes.map((q) => `<span><b>${q.t}</b> ${qfmt(q.v)} <i class="${q.c >= 0 ? 'up' : 'dn'}">${q.c >= 0 ? '▲' : '▼'} ${Math.abs(q.c).toFixed(2)}%</i></span>`).join('');
  $('#tickerTrack').innerHTML = one + one;
  $('#quotesMini').innerHTML = quotes.slice(0, 7).map((q) => `<tr><td class="q-t">${q.t}</td><td>${qfmt(q.v)}</td><td class="${q.c >= 0 ? 'up' : 'dn'}">${q.c >= 0 ? '+' : ''}${q.c.toFixed(2)}%</td></tr>`).join('');
}
function renderBigChart() {
  const W = 300, H = 140, min = Math.min(...hist) - 4, max = Math.max(...hist) + 4;
  const pts = hist.map((v, i) => [i / (hist.length - 1) * W, H - (v - min) / (max - min) * H]);
  // candles
  let candles = '';
  for (let i = 1; i < hist.length; i += 2) {
    const o = pts[i - 1][1], c = pts[i][1], x = pts[i][0];
    const up = c < o; candles += `<rect x="${x - 1.6}" y="${Math.min(o, c)}" width="3.2" height="${Math.max(1, Math.abs(o - c))}" fill="${up ? '#0d3a2b' : '#5c0f17'}"/>`;
  }
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  $('#bigChart').innerHTML = `${candles}<path d="${d}" fill="none" stroke="#16110d" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
    <circle cx="${pts.at(-1)[0] - 2}" cy="${pts.at(-1)[1]}" r="3" fill="#5c0f17"/>`;
}
function tickMarket() {
  if (mode() !== 'on') return;
  const i = Math.floor(Math.random() * quotes.length), q = quotes[i];
  const d = (Math.random() - 0.45) * 1.2;
  q.c += d; q.v = Math.max(0.001, q.v * (1 + d / 100));
  hist.push(hist.at(-1) + (Math.random() - 0.42) * 5); hist.shift();
  renderTicker(); renderBigChart();
  const row = $('#quotesMini').rows[i]; if (row) row.classList.add('flash');
}

/* ============ countdowns ============ */
function countdowns() {
  $$('[data-countdown]').forEach((el) => {
    let s = Math.max(0, (new Date(el.dataset.countdown) - Date.now()) / 1000);
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60); s = Math.floor(s - m * 60);
    el.textContent = `${d}d ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  });
}

/* ============ cart (js/cart.js) ============ */
const cart = initCart({ getMode: () => mode(), fmt: (n) => fmt(n), toast, catalog: () => CATALOG });
const openCart = cart.open;

/* ============ product modal ============ */
let current = null, chosen = null;
function openProduct(id) {
  const p = byId[id]; if (!p) return;
  const m = mode(), d = p[m];
  current = p; chosen = p.sizes ? null : 'one';
  $('#pmImg').src = p.img; $('#pmImg').alt = m === 'ona' ? d.name : d.name;
  $('#pmKicker').textContent = m === 'ona' ? d.kicker : `${d.ticker} · ${d.sub}`;
  $('#pmName').textContent = d.name;
  $('#pmPrice').innerHTML = m === 'ona' ? fmt(p.price) : `${fmt(p.price)} <span class="${d.chg > 0 ? 'up' : 'dn'}" style="font-size:.7em">${d.chg > 0 ? '▲' : '▼'} ${Math.abs(d.chg)}%</span>`;
  $('#pmDesc').textContent = d.desc;
  $('#pmPrice').insertAdjacentHTML('afterbegin', p.compareAt ? `<s class="pm-was">${fmt(p.compareAt)}</s> ` : '');
  $('#pmSizes').innerHTML = p.sizes ? p.sizes.map((s) => {
    const left = p.stock?.[s] ?? 0;
    return `<button aria-pressed="false" data-size="${s}" ${left <= 0 ? 'disabled aria-disabled="true" title="brak"' : ''}>${s}${left > 0 && left <= lowStock() ? `<i>${left}</i>` : ''}</button>`;
  }).join('') + `<span class="pm-stock" id="pmStock"></span>` : '';
  if (!p.sizes && (p.stock?.one ?? 0) <= 0) chosen = null;
  updateAdd();
  $('#pmFine').textContent = m === 'ona' ? 'darmowy zwrot do 14 dni · wysyłka w 48 h · pakowane w różową trumnę' : 'rozliczenie T+2 · darmowy zwrot 14 dni · ryzyko inwestycyjne: wygląd';
  $('#pModal').hidden = false; document.body.classList.add('lock'); $('#pmAdd').focus({ preventScroll: true });
}
function updateAdd() {
  const m = mode(), btn = $('#pmAdd');
  const sold = current && totalStock(current) <= 0;
  btn.disabled = !chosen || sold;
  btn.textContent = sold ? (m === 'ona' ? 'wyprzedane — wróci w drop 02' : 'obrót zawieszony (brak wolumenu)')
    : !chosen ? (m === 'ona' ? 'wybierz rozmiar, kochanie' : 'wybierz wolumen (rozmiar)')
      : (m === 'ona' ? 'wrzuć do torebki ♥' : 'otwórz pozycję · long');
  const ps = $('#pmStock');
  if (ps && chosen && current) { const l = current.stock?.[chosen] ?? 0; ps.textContent = l <= lowStock() ? (m === 'ona' ? `zostały ${l} szt.!` : `wolumen: ${l} szt.`) : ''; }
}
$('#pmSizes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-size]'); if (!b) return;
  if (b.disabled) return;
  $$('#pmSizes button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  chosen = b.dataset.size; updateAdd();
});
$('#pmAdd').addEventListener('click', () => {
  if (!current || !chosen) return;
  cart.add(current.id, chosen === 'one' ? null : chosen);
  closeModals();
  toast(mode() === 'ona' ? `♥ ${current.ona.name} już w torebce` : `zlecenie przyjęte: ${current.on.ticker} ×1`, { label: 'zobacz', fn: () => openCart(true) });
});
function closeModals() { $$('.modal').forEach((m) => (m.hidden = true)); document.body.classList.remove('lock'); }
window.addEventListener('d12:open', (e) => openProduct(e.detail));
$$('[data-close]').forEach((el) => el.addEventListener('click', closeModals));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !cart.isOpen()) { closeModals(); openCart(false); } });
document.addEventListener('click', (e) => {
  const o = e.target.closest('[data-open]'); if (o) openProduct(o.dataset.open);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-open]')) openProduct(e.target.dataset.open);
});

/* ============ subscribe ============ */
$$('[data-sub]').forEach((f) => f.addEventListener('submit', (e) => {
  e.preventDefault();
  const msg = f.parentElement.querySelector('.tomb-msg');
  msg.textContent = f.classList.contains('on') ? 'Podpisano. Pierwszy raport w skrzynce przed otwarciem sesji.' : 'pochowane ♥ odezwiemy się zza grobu.';
  f.reset();
}));

/* ============ doll speech ============ */
const SAYS = [
  'mama mówi, że czarny wyszczupla duszę',
  'nie dotykaj włosów. no dobra, dotknij',
  'mam 12 lat po śmierci. i świetną bluzę',
  'w zestawie: 0 duszy, 1 drama',
  'ken odszedł. zabrał tylko krawat',
  'kup bluzę albo cię nawiedzę ♥',
  'róż to czerń, która się uśmiecha',
  'nie śpię. ja czekam na drop 02',
];
let sayI = 0, sayT;
function dollSay(txt) {
  const b = $('#dollSays'); b.textContent = txt || SAYS[sayI++ % SAYS.length];
  b.classList.add('show'); clearTimeout(sayT); sayT = setTimeout(() => b.classList.remove('show'), 2600);
  burst();
}
function burst() {
  const r = $('#dollCanvas').getBoundingClientRect();
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('i'); s.className = 'trail';
    const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 120;
    s.style.left = r.left + r.width / 2 + 'px'; s.style.top = r.top + r.height * 0.45 + 'px';
    s.style.width = s.style.height = 10 + Math.random() * 18 + 'px';
    s.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px) rotate(200deg) scale(0)` }], { duration: 900, easing: 'cubic-bezier(.2,.8,.2,1)' });
    document.body.appendChild(s); setTimeout(() => s.remove(), 900);
  }
}

/* ============ draggable stickers ============ */
$$('.stk.drag').forEach((el) => {
  let sx, sy, ox, oy;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('grab');
    const host = el.offsetParent.getBoundingClientRect();
    sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop;
    el._host = host;
  });
  el.addEventListener('pointermove', (e) => {
    if (!el.classList.contains('grab')) return;
    el.style.left = ox + e.clientX - sx + 'px'; el.style.top = oy + e.clientY - sy + 'px';
  });
  const up = () => el.classList.remove('grab');
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
});

/* ============ business card ============ */
const bcard = $('#bcard');
$('#cardName').addEventListener('input', (e) => ($('#bcName').textContent = e.target.value || ' '));
$('#cardRole').addEventListener('input', (e) => ($('#bcRole').textContent = e.target.value || ' '));
$('.bcard-stage').addEventListener('pointermove', (e) => {
  const r = bcard.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
  bcard.style.setProperty('--ry', `${x * 30}deg`); bcard.style.setProperty('--rx', `${-y * 24}deg`);
  bcard.style.setProperty('--gx', `${(x + 0.5) * 100}%`);
});
$('.bcard-stage').addEventListener('pointerleave', () => { bcard.style.removeProperty('--rx'); bcard.style.removeProperty('--ry'); });

/* ============ date ============ */
$('#mhDate').textContent = new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/* ============ cursor ============ */
const cur = $('#cur'), read = $('.c-read');
if (matchMedia('(pointer:fine)').matches && !matchMedia('(prefers-reduced-motion:reduce)').matches) {
  html.classList.add('has-cur');
  let lastTrail = 0;
  window.addEventListener('pointermove', (e) => {
    cur.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
    cur.classList.toggle('hover', !!e.target.closest('a,button,[data-open],input,.stk,canvas'));
    if (mode() === 'ona') {
      const now = performance.now();
      if (now - lastTrail > 45) {
        lastTrail = now;
        const s = document.createElement('i'); s.className = 'trail';
        s.style.left = e.clientX + 'px'; s.style.top = e.clientY + 'px';
        document.body.appendChild(s); setTimeout(() => s.remove(), 900);
      }
    } else {
      const v = (1000 - e.clientY / innerHeight * 1000 + e.clientX / innerWidth * 120).toFixed(2);
      read.textContent = `D12 ${v} ${e.movementY <= 0 ? '▲' : '▼'}`;
    }
  }, { passive: true });
}

/* ============ 3D ============ */
let dollStage = null, chairStage = null, coinStage = null;
async function boot3D(progress) {
  try {
    const { loadDoll, createDollStage } = await import('./doll.js');
    await loadDoll(progress);
    dollStage = await createDollStage($('#dollCanvas'), { theme: 'ona', onPoke: () => dollSay() });
    setTimeout(() => dollSay('pociągnij mnie za rękę…'), 1200);
  } catch (err) { console.warn('3D doll failed', err); $('#dollCanvas').closest('.db-window').classList.add('no3d'); }
}
async function bootOn3D() {
  if (coinStage) return;
  try {
    const { createCoin } = await import('./coin.js');
    coinStage = await createCoin($('#coinCanvas'));
    import('./doll.js').then(({ createDollStage }) => createDollStage($('#chairCanvas'), { theme: 'on' }))
      .then((s) => { chairStage = s; set3DActive(); });
  } catch (err) { console.warn('3D ON failed', err); }
}
function set3DActive() {
  const m = mode();
  dollStage?.setActive(m === 'ona');
  coinStage?.setActive(m === 'on'); chairStage?.setActive(m === 'on');
}

/* ============ mode switch ============ */
function applyMode(m) {
  html.dataset.mode = m;
  $('#world-ona').hidden = m !== 'ona';
  $('#world-on').hidden = m !== 'on';
  $$('.switch [data-go]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.go === m)));
  document.title = m === 'ona' ? 'dead12 — ONA · pokaz zza grobu' : 'dead12 — ON · The dead12 Journal';
  $('link[rel=icon]').href = m === 'ona' ? 'assets/img/star-pink.png' : 'assets/img/skull.png';
  store.set('dead12-mode', m);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', m === 'ona' ? '#0d060c' : '#efe1cd');
  history.replaceState(null, '', '#' + m);
  window.dispatchEvent(new Event('d12:mode'));
  if (m === 'on') { renderTicker(); renderBigChart(); bootOn3D(); }
  set3DActive();
}
const shutter = $('#shutter'), bars = $('.sh-bars');
bars.innerHTML = Array.from({ length: 12 }, (_, i) => `<i style="--i:${i}"></i>`).join('');
let switching = false;
function switchMode(m) {
  if (m === mode() || switching) return;
  switching = true;
  const word = $('.sh-word');
  if (m === 'on') {
    shutter.style.setProperty('--sh-c', '#16110d'); shutter.style.setProperty('--sh-t', '#e6c27a');
    word.className = 'sh-word on'; word.innerHTML = '<div>On.<small>dead12 capital · otwarcie sesji</small></div>';
  } else {
    shutter.style.setProperty('--sh-c', '#ff0a84'); shutter.style.setProperty('--sh-t', '#0d060c');
    word.className = 'sh-word ona'; word.innerHTML = '<div>Ona<small>★ pokaz zza grobu ★</small></div>';
  }
  shutter.classList.remove('outro'); shutter.classList.add('run');
  requestAnimationFrame(() => requestAnimationFrame(() => shutter.classList.add('in')));
  setTimeout(() => {
    applyMode(m); window.scrollTo({ top: 0, behavior: 'instant' });
    setTimeout(() => {
      shutter.classList.add('outro'); shutter.classList.remove('in');
      setTimeout(() => { shutter.classList.remove('run', 'outro'); switching = false; }, 950);
    }, 380);
  }, 820);
}
$$('.switch [data-go]').forEach((b) => b.addEventListener('click', () => switchMode(b.dataset.go)));

/* ============ header on scroll ============ */
const topEl = $('#top');
addEventListener('scroll', () => topEl.classList.toggle('scrolled', scrollY > 40), { passive: true });

/* ============ init ============ */
function renderShop() { PRODUCTS = CATALOG.products; byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p])); renderOna(); renderOn(); }
async function loadCatalog() {
  try { CATALOG = await api.getCatalog(); renderShop(); buildQuotes(); renderTicker(); cart.refresh(); }
  catch (e) { console.warn('catalog failed, using seed', e); }
}
// refresh stock after an order and when the tab comes back
window.addEventListener('d12:ordered', loadCatalog);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadCatalog(); });
renderShop(); renderTicker(); renderBigChart(); countdowns(); loadCatalog();
setInterval(countdowns, 1000); setInterval(tickMarket, 1800);
const initial = (location.hash.slice(1) === 'on' || location.hash.slice(1) === 'ona') ? location.hash.slice(1) : store.get('dead12-mode', 'ona');
applyMode(initial);

const loader = $('#loader'), bar = $('.ld-bar i'), pct = $('#ld-pct');
let shown = 0;
const setP = (v) => { const p = Math.max(shown, Math.round(v * 100)); shown = p; bar.style.width = p + '%'; pct.textContent = p; };
const done = () => { setP(1); setTimeout(() => loader.classList.add('out'), 250); };
const hardStop = setTimeout(done, 7000);
Promise.all([
  initial === 'ona' ? boot3D((f) => setP(f * 0.95)) : bootOn3D(),
  document.fonts.ready,
]).then(() => { clearTimeout(hardStop); done(); if (initial === 'on') boot3D(); });

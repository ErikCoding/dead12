// dead12 — sklep (jedna, neutralna strona nastawiona na sprzedaż).
import { PRODUCTS as SEED, LOCKED } from './products.js';
import * as api from './api.js';
import { initCart } from './cart.js';
const thumb = (s) => String(s || '').replace(/assets\/img\/(hoodie-stars|hoodie-plaid|stickers)\.png$/, 'assets/img/m/$1.webp');

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (+n).toLocaleString('pl-PL', { maximumFractionDigits: 2 }) + ' zł';
const MODE = 'ona'; // one storefront; kept for the order/stats format
const seedById = Object.fromEntries(SEED.map((p) => [p.id, p]));

/* ============ catalog ============ */
const withSeed = (p) => ({ ...p, garment: p.garment || seedById[p.id]?.garment || null, model: p.model || seedById[p.id]?.model || null });
let CATALOG = {
  products: SEED.map((p) => withSeed({ ...p, stock: p.sizes ? Object.fromEntries(p.sizes.map((x) => [x, 9])) : { one: 99 } })),
  settings: { freeShipFrom: 300, shipping: [], payments: [], lowStock: 3 },
};
const P = () => CATALOG.products;
const byId = (id) => P().find((p) => p.id === id);
const wearables = () => P().filter((p) => p.garment);
const total = (p) => Object.values(p.stock || {}).reduce((a, b) => a + b, 0);
const low = () => CATALOG.settings.lowStock || 3;

const lock = (v) => { document.documentElement.classList.toggle('lock', v); document.body.classList.toggle('lock', v); };

/* ============ toast ============ */
let toastT, toastFn = null;
function toast(msg, action) {
  const t = $('#toast'), b = $('#toastAct');
  $('#toastTxt').textContent = msg; toastFn = action?.fn || null; b.hidden = !action; if (action) b.textContent = action.label;
  t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), action ? 4500 : 2400);
}
$('#toastAct').addEventListener('click', () => { toastFn && toastFn(); toastFn = null; $('#toast').classList.remove('show'); });

/* ============ cart ============ */
const cart = initCart({ getMode: () => MODE, fmt, toast, catalog: () => CATALOG });

/* ============ 3D try-on ============ */
let viewer = null;
const pdp = { id: null, size: null };
async function bootViewer() {
  const { createViewer } = await import('./viewer.js');
  viewer = createViewer($('#viewer'), {
    onProgress: (f) => ($('#loadPct').style.width = Math.round(f * 100) + '%'),
    onReady: () => { $('#loadPct').style.width = '100%'; },
  });
  await viewer.ready;
  const cur = byId(pdp.id);
  if (cur?.garment) await viewer.wear(cur);
  $('#stageLoad').classList.add('done');
}
let viewerBoot = null;
function bootViewerSafe() {
  if (viewerBoot) return viewerBoot;
  viewerBoot = bootViewer().catch((e) => {
    console.warn('3D niedostępne', e);
    // fallback: show the product photo in the stage
    $('#stage').classList.add('no3d');
    $('#stageLoad').innerHTML = `<img src="${esc(thumb(byId(pdp.id)?.img))}" alt="" style="max-height:80%;max-width:80%">`;
  });
  return viewerBoot;
}

/* ============ try-on overlay ============ */
const tryon = $('#tryon');
function openTryon(id) {
  const p = byId(id) || byId(pdp.id) || wearables()[0]; if (!p) return;
  if (!p.garment) return openProduct(p.id);
  tryon.hidden = false; lock(true);
  requestAnimationFrame(() => tryon.classList.add('open'));
  selectProduct(p.id);
  $('#tryonBody').scrollTop = 0;
  bootViewerSafe(); viewer?.setActive(true);
  try { history.replaceState(null, '', '#' + p.id); } catch { /* */ }
}
function closeTryon() {
  if (tryon.hidden) return;
  tryon.classList.remove('open'); viewer?.setActive(false);
  setTimeout(() => { tryon.hidden = true; }, 320);
  lock(false); $('#sbar').classList.remove('show');
  try { history.replaceState(null, '', location.pathname); } catch { /* */ }
}
$('#tryClose').addEventListener('click', closeTryon);
document.addEventListener('click', (e) => { const t = e.target.closest('[data-tryon]'); if (t) { e.preventDefault(); openTryon(t.dataset.tryon || pdp.id); } });
$('#viewer').addEventListener('pointerdown', () => $('#stageHint').classList.add('gone'), { once: true });
$('.stage-ctl').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || !viewer) return;
  if (b.dataset.view) { viewer.view(b.dataset.view); $$('.stage-ctl [data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }
  if (b.hasAttribute('data-zoom')) { const z = viewer.zoom(b.getAttribute('aria-pressed') !== 'true'); b.setAttribute('aria-pressed', String(!!z)); }
  $('#stageHint').classList.add('gone');
});

/* ============ PDP (buy box) ============ */
function selectProduct(id, { scroll = false } = {}) {
  const p = byId(id); if (!p) return;
  pdp.id = id;
  if (pdp.size && !(p.stock?.[pdp.size] > 0)) pdp.size = null;
  renderPdp();
  if (viewer && p.garment) viewer.wear(p);
  if (scroll) openTryon(id);
  else if (!tryon.hidden) try { history.replaceState(null, '', '#' + id); } catch { /* */ }
}
function renderPdp() {
  const p = byId(pdp.id); if (!p) return;
  const [kind, ...rest] = (p.ona.kicker || '').split('·');
  $('#pName').textContent = p.ona.name;
  $('#pSub').textContent = kind.trim();
  $('#pPrice').textContent = fmt(p.price);
  $('#pWas').textContent = p.compareAt ? fmt(p.compareAt) : '';
  const fs = CATALOG.settings.freeShipFrom;
  $('#pShip').textContent = p.price >= fs ? '· darmowa dostawa' : `· darmowa dostawa od ${fmt(fs)}`;
  $('#pDesc').textContent = p.ona.desc;
  if ($('#pickName')) $('#pickName').textContent = rest.join('·').trim();
  if ($('#swatches')) $('#swatches').innerHTML = wearables().map((w) => `
    <button class="sw" role="radio" aria-checked="${w.id === p.id}" data-pick="${esc(w.id)}" aria-label="${esc(w.ona.name)}" title="${esc(w.ona.name)}">
      <img src="${esc(thumb(w.img))}" alt="" loading="lazy"></button>`).join('');
  if (!p.sizes) pdp.size = (p.stock?.one ?? 0) > 0 ? 'one' : null;
  $('#sizes').innerHTML = (p.sizes || ['one']).map((s) => {
    const left = p.stock?.[s] ?? 0;
    return `<button role="radio" aria-checked="${pdp.size === s}" data-size="${s}" ${left <= 0 ? 'disabled aria-disabled="true"' : ''}>${s === 'one' ? 'one size' : s}${left > 0 && left <= low() ? `<i>${left}</i>` : ''}</button>`;
  }).join('');
  updateBuy();
  $('#sbImg').src = thumb(p.img); $('#sbName').textContent = p.ona.name; $('#sbPrice').textContent = fmt(p.price);
}
function updateBuy() {
  const p = byId(pdp.id), sold = total(p) <= 0, btn = $('#addBtn');
  btn.disabled = sold; btn.classList.remove('ok');
  btn.textContent = sold ? 'wyprzedane' : pdp.size ? `dodaj do koszyka · ${fmt(p.price)}` : 'wybierz rozmiar';
  $('#nowBtn').disabled = sold;
  const left = pdp.size ? p.stock?.[pdp.size] ?? 0 : null;
  $('#stock').textContent = sold ? 'wyprzedane — zapisz się na drop 02 niżej'
    : left != null && left <= low() ? `zostało tylko ${left} szt. ${pdp.size === 'one' ? 'w magazynie' : 'w rozmiarze ' + pdp.size}` : '';
  $('#sbAdd').textContent = sold ? 'wyprzedane' : pdp.size ? 'do koszyka' : 'wybierz rozmiar';
}
$('#swatches')?.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) selectProduct(b.dataset.pick); });
$('#sizes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-size]'); if (!b || b.disabled) return;
  pdp.size = b.dataset.size;
  $$('#sizes button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  updateBuy();
});
function addCurrent() {
  const p = byId(pdp.id);
  if (!pdp.size) {
    $('#sizes').animate([{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 300 });
    toast('najpierw wybierz rozmiar');
    $('#sizes').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }
  cart.add(p.id, pdp.size === 'one' ? null : pdp.size);
  const btn = $('#addBtn'); btn.classList.add('ok'); btn.textContent = 'dodano ✓';
  setTimeout(updateBuy, 1600);
  toast(`${p.ona.name}${pdp.size !== 'one' ? ' · ' + pdp.size : ''} w koszyku`, { label: 'zobacz koszyk', fn: () => cart.open(true) });
  return true;
}
$('#addBtn').addEventListener('click', addCurrent);
$('#sbAdd').addEventListener('click', addCurrent);
$('#nowBtn').addEventListener('click', () => { if (addCurrent()) setTimeout(() => cart.checkout(), 250); });

// sticky buy bar (mobile): visible once the main button scrolled away
const sbar = $('#sbar');
new IntersectionObserver(([en]) => {
  const on = !en.isIntersecting && en.boundingClientRect.top < 0;
  sbar.classList.toggle('show', on); sbar.setAttribute('aria-hidden', String(!on));
}, { threshold: 0 }).observe($('#addBtn'));

/* ============ drop 01: products in boxes ============ */
let boxesApi = null, boxesBuilt = '';
async function renderBoxes() {
  const list = P(), sig = list.map((p) => p.id + total(p) + p.price).join('|');
  if (sig === boxesBuilt) return; boxesBuilt = sig;
  const wrap = $('#boxes');
  const FRAME = 'M30 0H70L100 37L81 160H19L0 37ZM33.5 9H66.5L91 39.5L75 151H25L9 39.5Z';
  const SOLID = 'M30 0H70L100 37L81 160H19L0 37Z';
  const rings = (d) => Array.from({ length: 9 }, (_, k) => `<svg class="cf-ring" style="--k:${k + 1}" viewBox="0 0 100 160" preserveAspectRatio="none" aria-hidden="true"><path fill-rule="evenodd" d="${d}" fill="${['#2b2129', '#271e26', '#241b23', '#211920', '#1e171d', '#1b151a', '#181317', '#151114', '#120f11'][k]}"/></svg>`).join('');
  const frontSvg = (d, win = true) => `<svg class="cf-frame" viewBox="0 0 100 160" preserveAspectRatio="none" aria-hidden="true">
      <path fill-rule="evenodd" d="${d}" fill="url(#cfLac)" stroke="rgba(236,230,225,.22)" stroke-width="1" vector-effect="non-scaling-stroke"/>
      ${win ? '<path d="M33.5 9H66.5L91 39.5L75 151H25L9 39.5Z" fill="none" stroke="#ff2e88" stroke-width="1.5" vector-effect="non-scaling-stroke"/>' : ''}</svg>`;
  const defs = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
      <linearGradient id="cfLac" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3039"/><stop offset=".28" stop-color="#151116"/><stop offset=".55" stop-color="#231c24"/><stop offset=".62" stop-color="#3b313b"/><stop offset=".7" stop-color="#141015"/><stop offset="1" stop-color="#0c0a0d"/></linearGradient></defs></svg>`;
  wrap.innerHTML = defs + list.map((p, i) => {
    const left = total(p), sold = left <= 0;
    const [kind] = (p.ona.kicker || '').split('·');
    const flag = sold ? '<span class="bx-flag out">wyprzedane</span>' : left <= low() * 2 ? `<span class="bx-flag hot">ostatnie ${left}</span>` : '';
    return `<article class="box rv ${sold ? 'sold' : ''}" style="--d:${i * 90}ms" data-box="${esc(p.id)}">
      <div class="cf-stage">
        <div class="cf">
          <div class="cf-back" aria-hidden="true"></div>
          <div class="cf-win">
            <canvas aria-label="${esc(p.ona.name)} — przeciągnij, aby obrócić${p.garment ? ', kliknij, aby przymierzyć' : ''}"></canvas>
            <img class="bx-fallback" src="${esc(thumb(p.img))}" alt="" loading="lazy">
          </div>
          ${rings(FRAME)}
          <div class="cf-lid" aria-hidden="true">${frontSvg(FRAME)}<span class="cf-glass"></span><img class="cf-skl" src="assets/img/m/skull-white.webp" alt=""></div>
          ${flag}
        </div>
        <div class="cf-shadow" aria-hidden="true"></div>
      </div>
      <div class="cf-plate"><span class="pix">drop 01 · nr ${String(i + 1).padStart(3, '0')}/120 · ${esc(kind.trim())}</span><b>${esc(p.ona.name)}</b></div>
      <div class="bx-actions">
        <div class="bx-price">${p.compareAt ? `<s>${fmt(p.compareAt)}</s>` : ''}${fmt(p.price)}</div>
        ${p.garment ? `<button class="bx-btn pri" data-tryon="${esc(p.id)}">przymierz na lalce</button>`
          : `<button class="bx-btn pri" data-quickadd="${esc(p.id)}" ${sold ? 'disabled' : ''}>+ do koszyka</button>`}
        <button class="bx-btn" data-quick="${esc(p.id)}" aria-label="szczegóły">i</button>
      </div>
    </article>`;
  }).join('') + `
    <article class="box sealed rv" style="--d:${list.length * 90}ms" aria-label="Drop 02 — wkrótce">
      <div class="cf-stage"><div class="cf">
        ${rings(SOLID)}
        <div class="cf-lid">${frontSvg(SOLID, false)}
          <div class="seal-in"><img src="assets/img/m/skull-white.webp" alt=""><span class="frak">${esc(LOCKED.ona.title)}</span><b data-countdown="${LOCKED.ona.date}">—</b></div>
          <span class="tape-x" aria-hidden="true">nie otwierać ✶ nie otwierać ✶ nie otwierać</span>
        </div>
      </div><div class="cf-shadow" aria-hidden="true"></div></div>
      <div class="cf-plate"><span class="pix">drop 02 · zaplombowane · lista 24 h wcześniej</span><b>wkrótce</b></div>
      <div class="bx-actions"><div class="bx-price">13.12</div><a class="bx-btn pri" href="#drop02">zapisz mnie</a></div>
    </article>`;
  // tilt the coffin towards the pointer
  if (matchMedia('(hover:hover)').matches) $$('.cf-stage', wrap).forEach((st) => {
    st.addEventListener('pointermove', (e) => {
      const r = st.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      st.style.setProperty('--ry', `${-12 + x * 22}deg`); st.style.setProperty('--rx', `${3 - y * 10}deg`);
    });
    st.addEventListener('pointerleave', () => { st.style.removeProperty('--ry'); st.style.removeProperty('--rx'); });
  });
  reveal();
  // silnik 3D dociągamy dopiero, gdy trumienki zbliżają się do ekranu
  const go3d = async () => {
    try {
      if (!boxesApi) { const { createBoxes } = await import('./boxes.js'); boxesApi = createBoxes({ onOpen: (id) => { const p = byId(id); p?.garment ? openTryon(id) : openProduct(id); } }); }
      $$('.box[data-box]', wrap).forEach((el) => boxesApi.add(el, byId(el.dataset.box)));
    } catch (e) { console.warn('3D w trumienkach niedostępne', e); wrap.classList.add('no3d'); }
  };
  if (boxesApi) return go3d();
  const coarse = matchMedia('(pointer:coarse)').matches;
  const io = new IntersectionObserver((ens) => { if (ens.some((e) => e.isIntersecting)) { io.disconnect(); go3d(); } }, { rootMargin: coarse ? '250px 0px' : '900px 0px' });
  // telefon: nic ciężkiego, dopóki ktoś nie zacznie przewijać
  if (coarse && scrollY < 40) addEventListener('scroll', () => io.observe(wrap), { once: true, passive: true });
  else io.observe(wrap);
}
$('#boxes').addEventListener('click', (e) => {
  const q = e.target.closest('[data-quick]'), a = e.target.closest('[data-quickadd]');
  if (q) return openProduct(q.dataset.quick);
  if (a) { const p = byId(a.dataset.quickadd); cart.add(p.id, null); toast(`${p.ona.name} w koszyku`, { label: 'zobacz koszyk', fn: () => cart.open(true) }); }
});

/* ============ scroll reveal ============ */
const rvIO = new IntersectionObserver((ens) => ens.forEach((en) => { if (en.isIntersecting) { const el = en.target; el.classList.add('in'); rvIO.unobserve(el); setTimeout(() => el.classList.remove('rv', 'in'), 1400); } }), { threshold: 0.12 });
function reveal() { $$('.rv:not(.in)').forEach((el) => rvIO.observe(el)); }

/* ============ quick view modal ============ */
let current = null, chosen = null;
function openProduct(id) {
  const p = byId(id); if (!p) return;
  current = p; chosen = p.sizes ? null : 'one';
  $('#pmImg').src = thumb(p.img); $('#pmImg').alt = p.ona.name;
  $('#pmKicker').textContent = p.ona.kicker;
  $('#pmName').textContent = p.ona.name;
  $('#pmPrice').innerHTML = `${p.compareAt ? `<s class="pm-was">${fmt(p.compareAt)}</s> ` : ''}${fmt(p.price)}`;
  $('#pmDesc').textContent = p.ona.desc;
  $('#pmSizes').innerHTML = p.sizes ? p.sizes.map((s) => { const l = p.stock?.[s] ?? 0; return `<button aria-pressed="false" data-size="${s}" ${l <= 0 ? 'disabled' : ''}>${s}${l > 0 && l <= low() ? `<i>${l}</i>` : ''}</button>`; }).join('') + '<span class="pm-stock" id="pmStock"></span>' : '';
  if (!p.sizes && (p.stock?.one ?? 0) <= 0) chosen = null;
  $('#pmFine').innerHTML = p.garment ? '<button class="link" id="pmTry">obejrzyj na lalce w 3D →</button>' : 'zwrot 14 dni · wysyłka 48 h';
  updatePm();
  $('#pModal').hidden = false; lock(true);
}
function updatePm() {
  const sold = current && total(current) <= 0, b = $('#pmAdd');
  b.disabled = !chosen || sold;
  b.textContent = sold ? 'wyprzedane' : chosen ? `dodaj do koszyka · ${fmt(current.price)}` : 'wybierz rozmiar';
  const ps = $('#pmStock'); if (ps && chosen) { const l = current.stock?.[chosen] ?? 0; ps.textContent = l <= low() ? `zostało ${l} szt.` : ''; }
}
$('#pmSizes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-size]'); if (!b || b.disabled) return;
  $$('#pmSizes button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); chosen = b.dataset.size; updatePm();
});
$('#pmAdd').addEventListener('click', () => {
  if (!current || !chosen) return;
  cart.add(current.id, chosen === 'one' ? null : chosen); closeModals();
  toast(`${current.ona.name} w koszyku`, { label: 'zobacz koszyk', fn: () => cart.open(true) });
});
$('#pModal').addEventListener('click', (e) => { if (e.target.closest('#pmTry')) { closeModals(); openTryon(current.id); } });
function closeModals() { $$('.modal').forEach((m) => (m.hidden = true)); if (tryon.hidden) lock(false); }
$$('[data-close]').forEach((el) => el.addEventListener('click', closeModals));
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || cart.isOpen()) return;
  if (!$('#pModal').hidden || !$('#sizeModal').hidden) return closeModals();
  if (!tryon.hidden) return closeTryon();
  cart.open(false);
});
window.addEventListener('d12:open', (e) => { const p = byId(e.detail); if (p?.garment) openTryon(p.id); else openProduct(e.detail); });
$('#sizeGuideBtn').addEventListener('click', () => { $('#sizeModal').hidden = false; lock(true); });

/* ============ countdowns / misc ============ */
function countdowns() {
  const target = new Date(LOCKED.ona.date).getTime();
  let s = Math.max(0, (target - Date.now()) / 1000);
  const d = Math.floor(s / 86400); s -= d * 86400; const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60); const sec = Math.floor(s - m * 60);
  const pad = (n) => String(n).padStart(2, '0');
  $$('[data-countdown]').forEach((el) => (el.textContent = `${d}d ${pad(h)}:${pad(m)}`));
  const b = $$('#cd02 b'); if (b.length) { b[0].textContent = d; b[1].textContent = pad(h); b[2].textContent = pad(m); b[3].textContent = pad(sec); }
}
$$('[data-sub]').forEach((f) => f.addEventListener('submit', (e) => {
  e.preventDefault(); f.parentElement.querySelector('.sub-msg').textContent = 'jesteś na liście ✶ dostaniesz drop 02 24 h wcześniej.'; f.reset();
}));

/* ============ init ============ */
function renderAll() {
  const h = location.hash.slice(1);
  if (!byId(pdp.id)) pdp.id = byId(h)?.garment ? h : wearables()[0]?.id;
  if (!booted && byId(h)?.garment) { booted = true; openTryon(h); } booted = true;
  renderPdp(); renderBoxes(); countdowns();
  $$('[data-free]').forEach((el) => (el.textContent = fmt(CATALOG.settings.freeShipFrom)));
}
async function loadCatalog() {
  try {
    const c = await api.getCatalog();
    CATALOG = { ...c, products: c.products.map(withSeed) };
    renderAll(); cart.refresh();
  } catch (e) { console.warn('katalog: używam danych startowych', e); }
}
let booted = false;
renderAll();
setInterval(countdowns, 1000);
// hero 3D
// telefon: lekki kolaż zamiast czaszki 3D (bez ładowania three.js na starcie)
if (matchMedia('(max-width:860px)').matches) {
  const hc = document.createElement('div');
  hc.className = 'hero-col';
  hc.innerHTML = `<span class="hc-glow"></span>
    <span class="hc-word frak" aria-hidden="true">dead</span>
    <button class="hc-item hc-plaid" data-tryon="plaid" aria-label="Przymierz Kratkę Wdowy"><img src="assets/img/m/hoodie-plaid.webp" alt="" fetchpriority="high"></button>
    <button class="hc-item hc-stars" data-tryon="stars" aria-label="Przymierz Gwiazdkową Trumnę"><img src="assets/img/m/hoodie-stars.webp" alt="" fetchpriority="high"></button>
    <img class="hc-skull" src="assets/img/m/skull-white.webp" alt="">
    <img class="hc-st a" src="assets/img/m/star-pink.webp" alt=""><img class="hc-st b" src="assets/img/m/star-pink.webp" alt=""><img class="hc-st c" src="assets/img/m/star-pink.webp" alt="">
    <button class="hc-stamp" data-tryon aria-label="Przymierz na lalce 3D">
      <svg viewBox="0 0 100 100" aria-hidden="true"><defs><path id="hcC" d="M50 50m-38 0a38 38 0 1 1 76 0a38 38 0 1 1-76 0"/></defs>
      <text><textPath href="#hcC">przymierz na lalce ✶ 3D ✶ przymierz na lalce ✶ 3D ✶</textPath></text></svg><b>3D</b></button>`;
  $('#heroCanvas').replaceWith(hc);
  $('.hero').classList.add('static');
} else {
  import('./hero.js').then(({ createHero }) => createHero($('#heroCanvas'))).then(() => $('.hero').classList.add('live')).catch((e) => console.warn('hero 3D', e));
}
reveal();
loadCatalog();
window.addEventListener('d12:ordered', loadCatalog);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadCatalog(); });

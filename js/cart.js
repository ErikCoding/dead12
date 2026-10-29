// dead12 — koszyk + 4-krokowa kasa. Kwoty liczy zawsze api.quote (serwer albo core lokalnie).
import * as api from './api.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const LS_CART = 'dead12-cart-v2', LS_CUST = 'dead12-customer';
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private */ } },
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function initCart({ getMode, fmt, toast, catalog, onChange }) {
  const mode = getMode;
  let state = store.get(LS_CART, { items: [], code: null });
  if (!Array.isArray(state.items)) state = { items: [], code: null };
  let q = null; // last quote
  const byId = () => Object.fromEntries(catalog().products.map((p) => [p.id, p]));
  const S = () => catalog().settings;

  /* ---------- state ---------- */
  const save = () => { store.set(LS_CART, state); refresh(); };
  const lineKey = (l) => l.id + '|' + (l.size || '-');
  function stockOf(id, size) { const p = byId()[id]; return p ? (p.stock?.[size || 'one'] ?? 0) : 0; }

  function add(id, size, n = 1) {
    const ex = state.items.find((l) => l.id === id && (l.size || null) === (size || null));
    const max = stockOf(id, size);
    if (ex) ex.q = Math.min(max, ex.q + n); else state.items.push({ id, size: size || null, q: Math.min(max, n) });
    save(); bump();
  }
  function bump() { const b = $('#cartBtn'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  const count = () => state.items.reduce((s, l) => s + l.q, 0);

  /* ---------- quote ---------- */
  let qSeq = 0;
  async function requote(extra = {}) {
    const my = ++qSeq;
    const res = await api.quote({ items: state.items, code: state.code, mode: mode(), ...extra });
    if (my !== qSeq) return q;
    q = res;
    return q;
  }

  /* ---------- render drawer ---------- */
  async function refresh() {
    // drop lines whose product disappeared
    const ids = byId(); state.items = state.items.filter((l) => ids[l.id]);
    $('#cartCount').textContent = count();
    onChange && onChange(count());
    await requote(co.open ? coExtra() : {});
    renderDrawer();
    if (co.open) renderSide();
  }

  function renderDrawer() {
    const m = mode(), P = byId(), list = $('#cartList');
    $('#cartUnits').textContent = count() ? `(${count()})` : '';
    if (!state.items.length) {
      list.innerHTML = `<li class="cart-empty">${m === 'ona'
        ? '<img src="assets/img/skull-white.png" alt="">pusto jak w trumnie po zmartwychwstaniu.<a href="#ona-shop" data-cclose>zajrzyj do katalogu →</a>'
        : '<img src="assets/img/skull.png" alt="">brak otwartych pozycji.<a href="#on-market" data-cclose>przejdź na parkiet →</a>'}</li>`;
    } else {
      list.innerHTML = state.items.map((l) => {
        const p = P[l.id]; const st = stockOf(l.id, l.size);
        const sizes = p.sizes ? `<select class="ci-size" aria-label="rozmiar">${p.sizes.map((s) => {
          const left = p.stock?.[s] ?? 0;
          return `<option value="${s}" ${s === l.size ? 'selected' : ''} ${left <= 0 && s !== l.size ? 'disabled' : ''}>${s}${left <= 0 ? ' — brak' : ''}</option>`;
        }).join('')}</select>` : '<span class="ci-one">one size</span>';
        const low = st <= (S().lowStock || 3) ? `<span class="ci-low">${st <= 0 ? 'wyprzedane' : `zostało ${st} szt.`}</span>` : '';
        return `<li data-key="${esc(lineKey(l))}">
          <img src="${esc(p.img)}" alt="">
          <div class="ci-body">
            <div class="ci-n">${esc(m === 'ona' ? p.ona.name : p.on.name)}</div>
            <div class="ci-m">${m === 'on' ? esc(p.on.ticker) + ' · ' : ''}${sizes}${low}</div>
            <div class="ci-q" role="group" aria-label="ilość">
              <button data-q="-1" aria-label="mniej">−</button><span>${l.q}</span><button data-q="1" aria-label="więcej" ${l.q >= st ? 'disabled' : ''}>+</button>
            </div>
          </div>
          <div class="ci-p">${fmt(p.price * l.q)}<button class="ci-rm" data-rm>${m === 'ona' ? 'pochowaj' : 'sprzedaj'}</button></div>
        </li>`;
      }).join('');
    }

    // free shipping meter
    const meter = $('#shipMeter');
    meter.hidden = !state.items.length;
    if (q && state.items.length) {
      const pct = Math.min(100, (q.afterDiscount / q.freeShipFrom) * 100);
      $('#shipBar').style.width = (q.freeShip ? 100 : pct) + '%';
      meter.classList.toggle('full', q.freeShip);
      $('#shipMsg').innerHTML = q.freeShip
        ? (m === 'ona' ? '♥ darmowa dostawa odblokowana' : 'próg darmowej dostawy osiągnięty ✓')
        : (m === 'ona' ? `do darmowej dostawy brakuje <b>${fmt(q.freeShipLeft)}</b>` : `do progu darmowej dostawy: <b>${fmt(q.freeShipLeft)}</b>`);
    }

    // upsell (something cheap that's not in the bag yet)
    const inBag = new Set(state.items.map((l) => l.id));
    const up = catalog().products.filter((p) => !inBag.has(p.id) && !p.sizes && (p.stock?.one ?? 0) > 0)[0]
      || catalog().products.filter((p) => !inBag.has(p.id))[0];
    const upEl = $('#upsell');
    if (up && state.items.length) {
      upEl.hidden = false;
      upEl.innerHTML = `<img src="${esc(up.img)}" alt=""><div><small>${m === 'ona' ? 'pasuje do zestawu' : 'dywersyfikacja portfela'}</small><b>${esc(m === 'ona' ? up.ona.name : up.on.name)}</b><span>${fmt(up.price)}</span></div>
        <button data-up="${esc(up.id)}" aria-label="dodaj">${up.sizes ? 'wybierz' : '+ dodaj'}</button>`;
    } else upEl.hidden = true;

    // code
    const cm = $('#codeMsg'), ci = $('#codeInput');
    if (state.code && q?.discount) { cm.className = 'code-msg ok'; cm.innerHTML = `kod <b>${esc(q.discount.code)}</b> · ${esc(q.discount.label)} <button type="button" data-uncode>usuń</button>`; ci.value = ''; }
    else if (state.code && q?.codeError) { cm.className = 'code-msg bad'; cm.innerHTML = `${esc(state.code)}: ${esc(q.codeError)} <button type="button" data-uncode>usuń</button>`; }
    else if (!cm.classList.contains('bad')) { cm.textContent = ''; cm.className = 'code-msg'; }

    $('#cartSum').innerHTML = sumRows(q, false);
    $('#checkoutBtn').disabled = !state.items.length || !!q?.errors?.length;
  }

  function sumRows(t, withShip) {
    if (!t || !t.lines.length) return '';
    const m = mode();
    let shipTxt;
    if (withShip && co.ship) shipTxt = t.shipping === 0 ? (m === 'ona' ? 'gratis ♥' : '0,00 PLN') : fmt(t.shipping);
    else shipTxt = t.freeShip ? (m === 'ona' ? 'gratis ♥' : 'gratis') : 'od ' + fmt(t.shippingFrom);
    return `
      <div><dt>${m === 'ona' ? 'produkty' : 'wartość walorów'}</dt><dd>${fmt(t.subtotal)}</dd></div>
      ${t.discountAmt ? `<div class="disc"><dt>rabat ${esc(t.discount.code)}</dt><dd>−${fmt(t.discountAmt)}</dd></div>` : ''}
      <div><dt>dostawa</dt><dd>${shipTxt}</dd></div>
      ${t.payFee ? `<div><dt>opłata za pobranie</dt><dd>${fmt(t.payFee)}</dd></div>` : ''}
      <div class="tot"><dt>${m === 'ona' ? 'razem' : 'do zapłaty'}</dt><dd>${fmt(withShip ? t.total : t.afterDiscount)}</dd></div>
      ${t.errors?.length ? `<p class="sum-err">${t.errors.map(esc).join('<br>')}</p>` : ''}`;
  }

  /* ---------- drawer events ---------- */
  function openCart(v = true) {
    const c = $('#cart'); c.classList.toggle('open', v); c.setAttribute('aria-hidden', String(!v));
    document.body.classList.toggle('lock', v);
    if (v) document.getElementById('toast')?.classList.remove('show');
    if (v) { refresh(); setTimeout(() => $('.cart-panel .x').focus({ preventScroll: true }), 50); }
  }
  $('#cartBtn').addEventListener('click', () => openCart(true));
  $('#cart').addEventListener('click', (e) => { if (e.target.closest('[data-cclose]')) openCart(false); });

  $('#cartList').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-key]'); if (!li) return;
    const i = state.items.findIndex((l) => lineKey(l) === li.dataset.key); if (i < 0) return;
    const line = state.items[i];
    const qb = e.target.closest('[data-q]');
    if (qb) {
      line.q += +qb.dataset.q;
      if (line.q < 1) return remove(i);
      line.q = Math.min(line.q, stockOf(line.id, line.size)); save();
    }
    if (e.target.closest('[data-rm]')) remove(i);
  });
  $('#cartList').addEventListener('change', (e) => {
    if (!e.target.matches('.ci-size')) return;
    const li = e.target.closest('li[data-key]');
    const line = state.items.find((l) => lineKey(l) === li.dataset.key);
    const other = state.items.find((l) => l !== line && l.id === line.id && l.size === e.target.value);
    if (other) { other.q += line.q; state.items = state.items.filter((l) => l !== line); }
    else line.size = e.target.value;
    save();
  });
  function remove(i) {
    const [gone] = state.items.splice(i, 1); save();
    const P = byId()[gone.id];
    toast(`${mode() === 'ona' ? 'pochowano' : 'sprzedano'}: ${mode() === 'ona' ? P.ona.name : P.on.ticker}`, {
      label: 'cofnij', fn: () => { state.items.splice(i, 0, gone); save(); },
    });
  }
  $('#upsell').addEventListener('click', (e) => {
    const b = e.target.closest('[data-up]'); if (!b) return;
    const p = byId()[b.dataset.up];
    if (p.sizes) { openCart(false); window.dispatchEvent(new CustomEvent('d12:open', { detail: p.id })); }
    else { add(p.id, null); toast(mode() === 'ona' ? `♥ ${p.ona.name} dorzucone` : `dokupiono ${p.on.ticker}`); }
  });

  $('#codeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('#codeInput').value.trim(); if (!code) return;
    const cm = $('#codeMsg');
    const t = await requote();
    const r = await api.checkCode(code, t?.subtotal || 0, mode());
    if (r.ok) { state.code = r.code; cm.className = 'code-msg'; save(); toast(`kod ${r.code} aktywny · ${r.label}`); }
    else { cm.className = 'code-msg bad'; cm.textContent = `${code.toUpperCase()}: ${r.error}`; $('#codeForm').classList.remove('shake'); void cm.offsetWidth; $('#codeForm').classList.add('shake'); }
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-uncode]')) { state.code = null; $('#codeMsg').className = 'code-msg'; save(); }
  });

  /* =====================================================
     CHECKOUT
     ===================================================== */
  const co = { open: false, step: 1, ship: null, pay: null };
  const form = $('#coForm');
  const coExtra = () => ({ shippingId: co.ship, paymentId: co.pay });

  function fillCustomer() {
    const c = store.get(LS_CUST, {});
    for (const k of ['email', 'name', 'phone', 'street', 'zip', 'city', 'locker']) if (c[k] && form.elements[k]) form.elements[k].value = c[k];
    if (c.ship) co.ship = c.ship;
    if (c.pay) co.pay = c.pay;
  }
  function saveCustomer() {
    const f = form.elements;
    store.set(LS_CUST, { email: f.email.value, name: f.name.value, phone: f.phone.value, street: f.street.value, zip: f.zip.value, city: f.city.value, locker: f.locker.value, ship: co.ship, pay: co.pay });
  }

  function openCheckout() {
    openCart(false);
    co.open = true; co.step = 1;
    fillCustomer(); renderOpts();
    $('#checkout').hidden = false; $('#coDone').hidden = true; $('.co-body').hidden = false; $('.co-shell').classList.remove('is-done');
    document.body.classList.add('lock');
    goStep(1);
    refresh();
  }
  function closeCheckout() {
    co.open = false; $('#checkout').hidden = true; document.body.classList.remove('lock');
  }
  $('#checkoutBtn').addEventListener('click', openCheckout);
  $('#coClose').addEventListener('click', closeCheckout);
  $('#doneBack').addEventListener('click', closeCheckout);
  $('#coBack').addEventListener('click', () => (co.step > 1 ? goStep(co.step - 1) : (closeCheckout(), openCart(true))));
  $('#coSideToggle').addEventListener('click', () => {
    const s = $('#coSide'); const v = !s.classList.contains('open'); s.classList.toggle('open', v);
    $('#coSideToggle').setAttribute('aria-expanded', String(v));
  });
  $('#coSteps').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-s]'); if (!li) return;
    const s = +li.dataset.s; if (s < co.step) goStep(s);
  });

  function goStep(n) {
    co.step = n;
    $$('.co-step', form).forEach((s) => (s.hidden = +s.dataset.step !== n));
    $$('#coSteps li').forEach((li) => { const s = +li.dataset.s; li.classList.toggle('done', s < n); li.classList.toggle('cur', s === n); });
    const m = mode();
    const labels = { 1: m === 'ona' ? 'dalej: dostawa' : 'dalej: dostawa', 2: 'dalej: płatność', 3: m === 'ona' ? 'sprawdź zamówienie' : 'weryfikuj zlecenie' };
    $('#coNext').innerHTML = n < 4 ? labels[n] + ' →' : `${m === 'ona' ? 'zamawiam i płacę' : 'podpisuję zlecenie'} · <b id="payTotal">${q ? fmt(q.total) : ''}</b>`;
    $('#coNext').classList.toggle('final', n === 4);
    if (n === 4) renderReview();
    $('.co-main').scrollTop = 0; $('.co-shell').scrollTop = 0;
    const first = $(`.co-step[data-step="${n}"] input:not([type=checkbox]):not([type=radio])`, form);
    if (first && matchMedia('(pointer:fine)').matches) setTimeout(() => first.focus({ preventScroll: true }), 60);
  }

  function renderOpts() {
    const m = mode(), s = S();
    $('#shipOpts').innerHTML = s.shipping.map((o) => `
      <label class="opt"><input type="radio" name="ship" value="${o.id}" ${co.ship === o.id ? 'checked' : ''}>
        <span class="opt-in"><b>${esc(o.name[m])}</b><small>${esc(o.eta)}${o.noFree ? ' · zawsze płatna' : ''}</small><i data-ship-price="${o.id}">${fmt(o.price)}</i></span></label>`).join('');
    $('#payOpts').innerHTML = s.payments.map((o) => `
      <label class="opt"><input type="radio" name="pay" value="${o.id}" ${co.pay === o.id ? 'checked' : ''}>
        <span class="opt-in"><b>${esc(o.name[m])}</b><small>${o.instant ? (m === 'ona' ? 'od razu opłacone' : 'księgowanie natychmiast') : o.id === 'transfer' ? 'dane do przelewu w mailu' : 'płacisz kurierowi'}</small><i>${o.fee ? '+' + fmt(o.fee) : ''}</i></span></label>`).join('');
    $('#lockerBox').hidden = !s.shipping.find((x) => x.id === co.ship)?.locker;
  }
  form.addEventListener('change', (e) => {
    if (e.target.name === 'ship') { co.ship = e.target.value; $('#lockerBox').hidden = !S().shipping.find((x) => x.id === co.ship)?.locker; refresh(); }
    if (e.target.name === 'pay') { co.pay = e.target.value; refresh(); }
  });
  // zip mask 00-000
  form.elements.zip.addEventListener('input', (e) => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 5);
    e.target.value = d.length > 2 ? d.slice(0, 2) + '-' + d.slice(2) : d;
  });
  form.elements.locker.addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  form.addEventListener('input', (e) => { const f = e.target.closest('.f'); if (f) f.classList.remove('err'); });

  function fieldErr(name, msg) {
    const el = form.elements[name]; const f = el.closest('.f');
    f.classList.toggle('err', !!msg); f.querySelector('em').textContent = msg || '';
    return !msg;
  }
  function validateStep(n) {
    const f = form.elements; let ok = true; let firstBad = null;
    const check = (name, cond, msg) => { const good = fieldErr(name, cond ? '' : msg); if (!good && !firstBad) firstBad = f[name]; ok = ok && good; };
    if (n === 1) {
      check('email', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.value.trim()), 'sprawdź e-mail');
      check('name', f.name.value.trim().split(/\s+/).length >= 2, 'imię i nazwisko');
      check('phone', /^(\+?\d[\d\s-]{7,})$/.test(f.phone.value.trim()), 'min. 9 cyfr');
      check('street', f.street.value.trim().length >= 3 && /\d/.test(f.street.value), 'ulica + numer');
      check('zip', /^\d{2}-\d{3}$/.test(f.zip.value), 'format 00-000');
      check('city', f.city.value.trim().length >= 2, 'miasto');
    }
    if (n === 2) {
      if (!co.ship) { ok = false; toast(mode() === 'ona' ? 'wybierz dostawę ♥' : 'wybierz metodę dostawy'); }
      else if (S().shipping.find((x) => x.id === co.ship)?.locker) check('locker', /^[A-Z]{3}\d{2,3}[A-Z]{0,2}$/.test(f.locker.value), 'np. GDY01M');
    }
    if (n === 3) {
      if (!co.pay) { ok = false; toast(mode() === 'ona' ? 'wybierz płatność ♥' : 'wybierz instrument płatniczy'); }
      $('#termsErr').textContent = f.terms.checked ? '' : 'zaakceptuj regulamin';
      if (!f.terms.checked) ok = false;
    }
    if (firstBad) firstBad.focus();
    return ok;
  }

  $('#coNext').addEventListener('click', async () => {
    if (co.step < 4) { if (validateStep(co.step)) { saveCustomer(); goStep(co.step + 1); } return; }
    await place();
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); $('#coNext').click(); });

  function renderSide() {
    const m = mode();
    if (!q) return;
    $('#coItems').innerHTML = q.lines.map((l) => `<li><img src="${esc(l.img)}" alt=""><span><b>${esc(m === 'ona' ? l.name.ona : l.name.on)}</b><small>${l.size || 'one size'} · ×${l.q}</small></span><i>${fmt(l.sum)}</i></li>`).join('');
    $('#coSum').innerHTML = sumRows(q, true);
    $('#coSideTotal').textContent = fmt(q.total);
    $$('[data-ship-price]').forEach((el) => {
      const o = S().shipping.find((x) => x.id === el.dataset.shipPrice);
      el.textContent = q.freeShip && !o.noFree ? (m === 'ona' ? 'gratis ♥' : 'gratis') : fmt(o.price);
    });
    const pt = $('#payTotal'); if (pt) pt.textContent = fmt(q.total);
  }

  function renderReview() {
    const f = form.elements, m = mode(), s = S();
    const ship = s.shipping.find((x) => x.id === co.ship), pay = s.payments.find((x) => x.id === co.pay);
    $('#review').innerHTML = `
      <div><h5>${m === 'ona' ? 'odbiorczyni / odbiorca' : 'kontrahent'}</h5><p>${esc(f.name.value)}<br>${esc(f.street.value)}<br>${esc(f.zip.value)} ${esc(f.city.value)}<br>${esc(f.email.value)} · ${esc(f.phone.value)}</p><button type="button" data-go-step="1">zmień</button></div>
      <div><h5>dostawa</h5><p>${esc(ship?.name[m])} · ${esc(ship?.eta)}${ship?.locker ? `<br>paczkomat <b>${esc(f.locker.value)}</b>` : ''}${f.note.value ? `<br><i>„${esc(f.note.value)}”</i>` : ''}</p><button type="button" data-go-step="2">zmień</button></div>
      <div><h5>płatność</h5><p>${esc(pay?.name[m])}</p><button type="button" data-go-step="3">zmień</button></div>`;
  }
  form.addEventListener('click', (e) => { const b = e.target.closest('[data-go-step]'); if (b) goStep(+b.dataset.goStep); });

  let placing = false;
  async function place() {
    if (placing) return; placing = true;
    const btn = $('#coNext'); btn.disabled = true; btn.classList.add('busy');
    const f = form.elements;
    const payload = {
      items: state.items, code: state.code, mode: mode(), shippingId: co.ship, paymentId: co.pay,
      locker: f.locker.value, note: f.note.value, newsletter: f.newsletter.checked,
      customer: { name: f.name.value, email: f.email.value, phone: f.phone.value, street: f.street.value, zip: f.zip.value, city: f.city.value },
    };
    let r;
    try { r = await api.placeOrder(payload); } catch { r = { ok: false, error: 'brak połączenia — spróbuj ponownie' }; }
    placing = false; btn.disabled = false; btn.classList.remove('busy');
    if (!r.ok) { $('#placeErr').textContent = r.error || 'coś poszło nie tak'; return; }
    $('#placeErr').textContent = '';
    saveCustomer();
    const o = r.order, m = mode();
    $('#doneNo').textContent = o.id;
    const payLine = o.status === 'paid'
      ? (m === 'ona' ? 'opłacone ♥ pakujemy do różowej trumny.' : 'płatność zaksięgowana. przygotowujemy wysyłkę.')
      : o.payment.id === 'transfer' ? `przelej ${fmt(o.totals.total)} — dane do przelewu wysłaliśmy na ${esc(o.email || f.email.value)} (tytuł: ${o.id}).`
        : (m === 'ona' ? 'zapłacisz kurierowi przy odbiorze.' : 'płatność przy odbiorze przesyłki.');
    $('#doneMsg').innerHTML = payLine;
    $('#doneReview').innerHTML = `<div><h5>${m === 'ona' ? 'w paczce' : 'pozycje'}</h5><p>${o.items.map((i) => `${esc(m === 'ona' ? i.name.ona : i.name.on)}${i.size ? ' · ' + i.size : ''} ×${i.q}`).join('<br>')}</p></div>
      <div><h5>razem</h5><p><b>${fmt(o.totals.total)}</b>${o.totals.discount ? `<br>w tym rabat −${fmt(o.totals.discount)}` : ''}</p></div>`;
    $('.co-body').hidden = true; $('#coDone').hidden = false; $('.co-shell').classList.add('is-done');
    const imgs = (q?.lines || []).flatMap((l) => Array(Math.min(l.q, 2)).fill(l.img)).slice(0, 4);
    import('./celebrate.js').then((c) => c.celebrate(m, o, imgs)).catch(() => {});
    state = { items: [], code: null }; save();
    window.dispatchEvent(new CustomEvent('d12:ordered', { detail: o }));
  }

  // re-render texts when the mode flips
  window.addEventListener('d12:mode', () => { renderOpts(); refresh(); if (co.open) goStep(co.step); });

  refresh();
  return { add, open: openCart, refresh, count, isOpen: () => co.open };
}

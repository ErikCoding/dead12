// dead12 — animacja po zakupie: czarne pudełko wysyłkowe (mailer box) w CSS 3D.
// Rzeczy wpadają do środka → wieko się zamyka → różowa taśma → naklejka z numerem i kodem kreskowym
// → pudełko podskakuje, wybuch gwiazdek, napis „zamówienie przyjęte”.
// celebrate(mode, order, imgs) → Promise (kończy się sama albo po tapnięciu / Esc).

const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = (ms, P) => new Promise((r) => { const t = setTimeout(r, ms); if (P) P.timers.push(() => { clearTimeout(t); r(); }); });
const zl = (n) => n.toLocaleString('pl-PL', { maximumFractionDigits: 2 }) + ' zł';
const EASE_DROP = 'cubic-bezier(.5,0,.75,0)';
const SPRING = 'cubic-bezier(.34,1.56,.64,1)';

/* ---------- star / skull burst on a 2D canvas ---------- */
function burst(canvas) {
  const ctx = canvas.getContext('2d'), dpr = Math.min(devicePixelRatio || 1, 2);
  let W = 0, H = 0, list = [], raf = 0, last = performance.now();
  const size = () => { W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  size(); addEventListener('resize', size);
  const skull = new Image(); skull.src = 'assets/img/skull-white.png';
  const star = (r) => { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); };
  function frame(now) {
    const dt = Math.min(0.04, (now - last) / 1000); last = now;
    ctx.clearRect(0, 0, W, H);
    list = list.filter((p) => (p.life -= dt) > 0);
    for (const p of list) {
      p.vy += 900 * dt * p.g; p.vx *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, p.life / 0.5);
      ctx.fillStyle = p.c;
      if (p.k === 'skull' && skull.complete && skull.naturalWidth) ctx.drawImage(skull, -p.r * 0.6, -p.r, p.r * 1.2, p.r * 2); else star(p.r);
      ctx.restore();
    }
    raf = list.length ? requestAnimationFrame(frame) : 0;
  }
  return {
    fire(x, y, n = 70) {
      const cols = ['#ff2e88', '#ff7ab4', '#ece6e1', '#ffffff', '#d6e8c4'];
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5, v = 260 + Math.random() * 560;
        list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.55 + Math.random() * 0.4, r: 4 + Math.random() * 8, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10,
          life: 1.4 + Math.random() * 1.2, c: cols[i % cols.length], k: i % 9 === 0 ? 'skull' : 'star' });
      }
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    },
    stop() { cancelAnimationFrame(raf); removeEventListener('resize', size); },
  };
}

/* ---------- barcode (deterministic from the order id) ---------- */
function barcode(id) {
  let h = 2166136261, s = '';
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let x = 0;
  for (let i = 0; i < 44 && x < 196; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const w = 1 + (h >>> 3) % 3, gap = 1 + (h >>> 7) % 2;
    s += `<rect x="${x}" y="0" width="${w}" height="40"/>`; x += w + gap;
  }
  return `<svg viewBox="0 0 ${x} 40" preserveAspectRatio="none" aria-hidden="true">${s}</svg>`;
}

function markup(order, imgs) {
  const c = order.customer || {};
  const items = (imgs.length ? imgs : ['assets/img/skull-white.png']).slice(0, 4)
    .map((src, i) => `<div class="mb-item" style="--i:${i}"><img src="${esc(src)}" alt=""></div>`).join('');
  const qty = (order.items || []).reduce((a, i) => a + i.q, 0);
  return `
  <canvas class="cel-fx"></canvas>
  <button class="cel-skip pix" type="button">pomiń ✕</button>
  <div class="cel-stage">
    <div class="mb-cam"><div class="mb-hop"><div class="mb">
      <div class="mb-f mb-bottom"></div>
      <div class="mb-f mb-back"></div>
      <div class="mb-f mb-left"><span>dead12</span></div>
      <div class="mb-f mb-right"><span>handle with dread</span></div>
      ${items}
      <div class="mb-f mb-front"><span class="mb-logo"><img src="assets/img/logo-dark.png" alt=""></span><i class="mb-skl"></i></div>
      <div class="mb-hinge"><div class="mb-lid">
        <div class="mb-face mb-lid-out">
          <div class="mb-tape"><span>dead12 ✶ dead12 ✶ dead12 ✶ dead12 ✶</span></div>
          <div class="mb-label">
            <div class="mb-l-top"><b>dead12</b><span>${esc(order.shipping?.name || 'kurier')}</span></div>
            <div class="mb-l-to"><small>do:</small>${esc(c.name || '—')}<br>${esc(c.zip || '')} ${esc(c.city || '')}</div>
            <div class="mb-l-bc">${barcode(order.id)}</div>
            <div class="mb-l-id">${esc(order.id)}<span>${qty} szt.</span></div>
          </div>
        </div>
        <div class="mb-face mb-lid-in"><img src="assets/img/skull-white.png" alt=""><span>dzięki, że kupujesz u umarłych</span></div>
        <div class="mb-flap"><div class="mb-face mb-flap-out"><div class="mb-tape mb-tape2"></div></div><div class="mb-face mb-flap-in"></div></div>
      </div>
    </div></div></div><div class="mb-shadow"></div></div>
    <div class="cel-title">
      <p class="pix"><span class="dot"></span>zamówienie przyjęte</p>
      <h2>spakowane<br><em class="frak">zza grobu.</em></h2>
      <p class="cel-meta"><b>${esc(order.id)}</b> · ${zl(order.totals?.total || 0)} · wysyłka w 48 h</p>
      <p class="cel-tap pix">tapnij, żeby zamknąć</p>
    </div>
  </div>`;
}

async function play(root, order, imgs, P) {
  const $ = (s) => root.querySelector(s), $$ = (s) => [...root.querySelectorAll(s)];
  const an = (el, kf, o) => { if (!el || P.skip) return Promise.resolve(); const a = el.animate(kf, { fill: 'both', ...o }); P.anims.push(a); return a.finished.catch(() => {}); };
  const fx = burst($('.cel-fx')); P.fx = fx;
  const lid = $('.mb-lid'), flap = $('.mb-flap'), cam = $('.mb-cam'), hop = $('.mb-hop');

  // 0 — box flies in, lid open
  an(cam, [{ transform: 'translateY(80px) scale(.6)' }, { transform: 'none' }], { duration: 650, easing: SPRING });
  await wait(450, P);
  // 1 — items fall in one by one
  const items = $$('.mb-item');
  const SLOTS = [[-62, -30, -5], [54, 18, 6], [-6, 42, -3], [76, -42, 9]];
  for (const [i, it] of items.entries()) {
    const [x, z, rz] = SLOTS[i], sg = i % 2 ? 1 : -1;
    an(it, [
      { transform: `translate3d(${x}px,-560px,${z}px) rotateZ(${sg * 24}deg)`, opacity: 0 },
      { transform: `translate3d(${x}px,-170px,${z}px) rotateZ(${sg * 10}deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate3d(${x}px,8px,${z}px) rotateZ(${rz}deg)`, opacity: 1 },
    ], { duration: 560, easing: EASE_DROP });
    await wait(260, P);
    an(hop, [{ transform: 'none' }, { transform: 'translateY(6px) scaleY(.97)' }, { transform: 'none' }], { duration: 260, delay: 220 });
  }
  await wait(420, P);
  // 2 — lid closes, tuck flap folds in
  an(flap, [{ transform: 'rotateX(-14deg)' }, { transform: 'rotateX(-90deg)' }], { duration: 520, delay: 260, easing: 'cubic-bezier(.6,0,.3,1)' });
  await an(lid, [{ transform: 'rotateX(205deg)' }, { transform: 'rotateX(92deg)', offset: 0.85 }, { transform: 'rotateX(90deg)' }], { duration: 700, easing: 'cubic-bezier(.55,0,.3,1)' });
  an(hop, [{ transform: 'none' }, { transform: 'translateY(8px) scaleY(.94) scaleX(1.03)' }, { transform: 'none' }], { duration: 300, easing: SPRING });
  if (navigator.vibrate) try { navigator.vibrate(18); } catch { /* */ }
  // 3 — tape runs across the lid and down the front
  await an($('.mb-tape'), [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 420, easing: 'cubic-bezier(.3,0,.2,1)' });
  await an($('.mb-tape2'), [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 200 });
  // 4 — shipping label slaps on
  await an($('.mb-label'), [
    { transform: 'translateZ(60px) rotate(-18deg) scale(1.6)', opacity: 0 },
    { transform: 'translateZ(1px) rotate(-5deg) scale(.96)', opacity: 1, offset: 0.7 },
    { transform: 'translateZ(1px) rotate(-6deg) scale(1)', opacity: 1 },
  ], { duration: 380, easing: 'cubic-bezier(.2,.8,.3,1)' });
  if (navigator.vibrate) try { navigator.vibrate([25, 40, 25]); } catch { /* */ }
  // 5 — hop + burst + title, camera tilts to show the label
  const r = $('.mb').getBoundingClientRect();
  an(cam, [{ transform: 'none' }, { transform: 'rotateX(-18deg) rotateY(14deg) translateY(-10px)' }], { duration: 900, easing: SPRING });
  an(hop, [{ transform: 'none' }, { transform: 'translateY(-70px) rotateZ(-4deg)', offset: 0.4 }, { transform: 'translateY(6px) scaleY(.92)', offset: 0.75 }, { transform: 'none' }], { duration: 760, easing: 'ease-out' });
  await wait(260, P);
  if (!P.skip) fx.fire(r.left + r.width / 2, r.top + r.height / 2, innerWidth < 600 ? 60 : 90);
  root.classList.add('done');
  an($('.cel-title'), [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: 150, easing: 'cubic-bezier(.2,.8,.2,1)' });
  an($('.mb-shadow'), [{ opacity: 1 }, { opacity: 0.4, offset: 0.4 }, { opacity: 1 }], { duration: 760 });
  await wait(3600, P);
}

/* ---------------- entry ---------------- */
export async function celebrate(mode, order, imgs = []) {
  const root = document.createElement('div');
  root.className = 'cel';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-label', `zamówienie ${order.id} przyjęte`);
  root.innerHTML = markup(order, imgs);
  document.body.appendChild(root);
  const P = { skip: false, fx: null, anims: [], timers: [] };
  let done;
  const finished = new Promise((r) => (done = r));
  const end = async () => {
    if (P.ended) return; P.ended = true; P.skip = true;
    P.timers.forEach((f) => f());
    await root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, fill: 'both' }).finished.catch(() => {});
    P.fx?.stop(); root.remove(); removeEventListener('keydown', onKey); done();
  };
  const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') end(); };
  root.addEventListener('click', end);
  addEventListener('keydown', onKey);
  if (navigator.vibrate) try { navigator.vibrate(20); } catch { /* */ }

  if (reduce()) {
    root.classList.add('static', 'done');
    await wait(2600, P);
  } else {
    root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'both' });
    await play(root, order, imgs, P);
  }
  await end();
  return finished;
}

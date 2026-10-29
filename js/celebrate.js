// dead12 — animacja po zakupie.
//  ONA: rzeczy wpadają do różowej trumny → wieko się zatrzaskuje → stempel → wieko odlatuje, wybuch gwiazdek.
//  ON:  wykres wystrzeliwuje w górę → licznik transakcji → pieczęć lakowa „zaksięgowano” → deszcz złotych monet.
// celebrate(mode, order, imgs) → Promise (kończy się sama albo po tapnięciu).

const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (n, m) => m === 'on'
  ? n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' PLN'
  : n.toLocaleString('pl-PL', { maximumFractionDigits: 2 }) + ' zł';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const img = (src) => { const i = new Image(); i.src = src; return i; };

/* ---------------- particles ---------------- */
function particles(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let W = 0, H = 0, list = [], raf = 0, last = performance.now();
  const size = () => { W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  size(); addEventListener('resize', size);
  const skull = img('assets/img/skull-white.png'), skullDark = img('assets/img/skull.png');

  function star(r) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }
  function heart(r) { ctx.beginPath(); ctx.moveTo(0, r * 0.35); ctx.bezierCurveTo(-r * 1.1, -r * 0.4, -r * 0.45, -r * 1.05, 0, -r * 0.45); ctx.bezierCurveTo(r * 0.45, -r * 1.05, r * 1.1, -r * 0.4, 0, r * 0.35); ctx.fill(); }

  function draw(p) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.4));
    if (p.kind === 'coin') {
      const sx = Math.cos(p.spin);
      ctx.scale(Math.max(0.08, Math.abs(sx)), 1);
      const g = ctx.createRadialGradient(-p.r * 0.3, -p.r * 0.3, 1, 0, 0, p.r);
      g.addColorStop(0, sx > 0 ? '#fff1c4' : '#e9c77d'); g.addColorStop(0.6, '#d4a752'); g.addColorStop(1, '#8a6226');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(70,45,10,.6)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, p.r * 0.78, 0, Math.PI * 2); ctx.stroke();
      if (skullDark.complete && sx > 0) ctx.drawImage(skullDark, -p.r * 0.42, -p.r * 0.62, p.r * 0.84, p.r * 1.24);
    } else {
      ctx.fillStyle = p.color;
      if (p.kind === 'star') star(p.r);
      else if (p.kind === 'heart') heart(p.r);
      else if (p.kind === 'skull' && skull.complete) ctx.drawImage(skull, -p.r * 0.6, -p.r, p.r * 1.2, p.r * 2);
      else if (p.kind === 'ink') { ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.fillRect(-p.r, -p.r * 0.35, p.r * 2, p.r * 0.7); } // confetti strip
    }
    ctx.restore();
  }
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ctx.clearRect(0, 0, W, H);
    list = list.filter((p) => p.life > 0 && p.y < H + 80);
    for (const p of list) {
      p.vy += p.g * dt; p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.spin += p.vs * dt;
      p.life -= dt * p.decay;
      draw(p);
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  return {
    burst(x, y, n, opt = {}) {
      const kinds = opt.kinds || ['star'];
      const colors = opt.colors || ['#ff0a84'];
      for (let i = 0; i < n; i++) {
        const a = opt.angle != null ? opt.angle + (Math.random() - 0.5) * (opt.spread ?? Math.PI * 2) : Math.random() * Math.PI * 2;
        const v = (opt.speed || 700) * (0.35 + Math.random() * 0.75);
        list.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: opt.gravity ?? 900, drag: opt.drag ?? 0.985,
          r: (opt.size || 10) * (0.5 + Math.random()), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10,
          spin: Math.random() * 6, vs: 6 + Math.random() * 8,
          kind: kinds[Math.floor(Math.random() * kinds.length)], color: colors[Math.floor(Math.random() * colors.length)],
          life: opt.life || 2.4 + Math.random(), decay: 1,
        });
      }
    },
    rain(n, opt = {}) {
      for (let i = 0; i < n; i++) {
        list.push({
          x: Math.random() * W, y: -40 - Math.random() * H * 0.9, vx: (Math.random() - 0.5) * 60, vy: 120 + Math.random() * 220,
          g: opt.gravity ?? 420, drag: 0.995, r: (opt.size || 14) * (0.7 + Math.random() * 0.6), rot: (Math.random() - 0.5) * 0.6, vr: (Math.random() - 0.5) * 1.5,
          spin: Math.random() * 6, vs: 5 + Math.random() * 7, kind: opt.kind || 'coin', color: '#d4a752', life: 5, decay: 0.6,
        });
      }
    },
    stop() { cancelAnimationFrame(raf); removeEventListener('resize', size); },
  };
}

/* ---------------- ONA: trumna ---------------- */
async function ona(root, order, imgs, P) {
  root.innerHTML = `
    <canvas class="cel-fx"></canvas>
    <div class="cel-stage">
      <div class="coffin">
        <div class="coffin-box"><div class="coffin-in"></div></div>
        <div class="coffin-items">${imgs.slice(0, 4).map((s, i) => `<img src="${esc(s)}" alt="" style="--i:${i}">`).join('')}</div>
        <div class="coffin-lid"><img src="assets/img/logo-dark.png" alt=""><span class="lid-cross" aria-hidden="true"></span></div>
        <div class="cel-stamp pix">zapakowane ♥</div>
      </div>
      <div class="cel-title">
        <p class="pix">zamówienie wykopane</p>
        <h2>${esc(order.id)}</h2>
        <p class="cel-sum">${fmt(order.totals.total, 'ona')} · już w drodze zza grobu</p>
      </div>
    </div>
    <p class="cel-skip pix">dotknij, aby pominąć</p>`;
  const fx = particles(root.querySelector('.cel-fx')); P.fx = fx;
  const $ = (s) => root.querySelector(s);
  const coffin = $('.coffin'), lid = $('.coffin-lid'), stamp = $('.cel-stamp'), title = $('.cel-title');
  const E = 'cubic-bezier(.2,.9,.25,1)';

  coffin.animate([{ transform: 'translateY(40px) scale(.7)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 500, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'both' });
  root.querySelectorAll('.coffin-items img').forEach((el, i) => {
    el.animate([
      { transform: `translate(${(i % 2 ? 1 : -1) * 40}px,-75vh) rotate(${i % 2 ? 40 : -50}deg)`, opacity: 1 },
      { transform: `translate(${(i - 1.5) * 18}px,6px) rotate(${(i - 1.5) * 8}deg)`, opacity: 1, offset: 0.8 },
      { transform: `translate(${(i - 1.5) * 18}px,0) rotate(${(i - 1.5) * 6}deg)`, opacity: 1 },
    ], { duration: 650, delay: 180 + i * 130, easing: 'cubic-bezier(.55,0,.75,.2)', fill: 'both' });
  });
  await wait(260 + Math.min(4, imgs.length) * 130 + 520);
  if (P.skip) return;

  // lid slams
  await lid.animate([
    { transform: 'translateY(-90vh) rotate(-14deg) scale(1.15)', opacity: 1 },
    { transform: 'translateY(0) rotate(0) scale(1)', opacity: 1, offset: 0.75 },
    { transform: 'translateY(-14px) rotate(1.5deg)', offset: 0.88 },
    { transform: 'none', opacity: 1 },
  ], { duration: 620, easing: 'cubic-bezier(.6,0,.9,.4)', fill: 'both' }).finished;
  if (P.skip) return;
  root.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-9px,6px)' }, { transform: 'translate(8px,-5px)' }, { transform: 'translate(-4px,3px)' }, { transform: 'none' }], { duration: 380 });
  const r = coffin.getBoundingClientRect();
  fx.burst(r.left + r.width / 2, r.top + r.height * 0.8, 26, { kinds: ['ink'], colors: ['#ff74b8', '#ff0a84'], speed: 360, gravity: 700, size: 4, life: 1.2, angle: -Math.PI / 2, spread: Math.PI * 1.4 });
  stamp.animate([{ transform: 'translate(-50%,-50%) scale(3) rotate(-30deg)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1) rotate(-12deg)', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'both', delay: 120 });
  await wait(900);
  if (P.skip) return;

  // lid flies off, burst
  stamp.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'both' });
  lid.animate([{ transform: 'none' }, { transform: 'translate(40vw,-110vh) rotate(70deg) scale(1.3)' }], { duration: 900, easing: 'cubic-bezier(.4,0,.9,.6)', fill: 'both' });
  coffin.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(.6) translateY(30px)', opacity: 0 }], { duration: 600, delay: 250, easing: E, fill: 'both' });
  const cx = r.left + r.width / 2, cy = r.top + r.height * 0.45;
  fx.burst(cx, cy, 120, { kinds: ['star', 'star', 'heart', 'strip', 'skull'], colors: ['#ff0a84', '#ff74b8', '#ffd6ea', '#e3efcf', '#b99ad6'], speed: 1000, size: 11 });
  setTimeout(() => !P.skip && fx.burst(cx, cy, 60, { kinds: ['star', 'heart'], colors: ['#ff0a84', '#ffd6ea'], speed: 750, size: 8 }), 260);
  title.animate([{ transform: 'translateY(30px) scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 650, delay: 300, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'both' });
  await wait(2300);
}

/* ---------------- ON: transakcja ---------------- */
async function on(root, order, imgs, P) {
  // chart path that rockets up at the end
  const N = 28; let v = 60; const pts = [];
  for (let i = 0; i < N; i++) { v += (Math.random() - 0.5) * 14 - (i > N - 8 ? 16 : 0); v = Math.max(8, Math.min(92, v)); pts.push([i / (N - 1) * 600, v * 2.2]); }
  pts[N - 1][1] = 6;
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const candles = pts.filter((_, i) => i % 2).map((p, i) => {
    const up = i > N / 2 - 4 || Math.random() > 0.45; const h = 10 + Math.random() * 26;
    return `<rect x="${p[0] - 4}" y="${p[1] - (up ? h : 0)}" width="8" height="${h}" fill="${up ? '#2e9e6a' : '#a3121f'}" style="--d:${i * 40}ms"/>`;
  }).join('');
  root.innerHTML = `
    <canvas class="cel-fx"></canvas>
    <div class="cel-stage">
      <div class="deal">
        <p class="deal-k mono">D12 · sesja nadzwyczajna · ${new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</p>
        <svg class="deal-chart" viewBox="-10 -10 620 220" preserveAspectRatio="none" aria-hidden="true">
          ${[0, 1, 2, 3].map((k) => `<line x1="0" x2="600" y1="${k * 66}" y2="${k * 66}" class="dg"/>`).join('')}
          <g class="dc">${candles}</g>
          <path class="dl" d="${d}"/>
          <circle class="dp" cx="600" cy="6" r="7"/>
        </svg>
        <div class="deal-num mono"><span class="up">▲</span> <b id="celNum">0,00</b> PLN</div>
        <div class="seal" aria-hidden="true">
          <svg viewBox="0 0 200 200">
            <defs><path id="sealRing" d="M100,100 m-66,0 a66,66 0 1,1 132,0 a66,66 0 1,1 -132,0"/></defs>
            <path class="seal-wax" d="${sealPath()}"/>
            <circle cx="100" cy="100" r="78" class="seal-in"/>
            <text class="seal-t"><textPath href="#sealRing" startOffset="0">ZAKSIĘGOWANO · DEAD12 CAPITAL · ZAKSIĘGOWANO ·</textPath></text>
            <image href="assets/img/skull.png" x="76" y="62" width="48" height="76" class="seal-skull"/>
          </svg>
        </div>
      </div>
      <div class="cel-title">
        <p class="mono">transakcja zawarta</p>
        <h2>${esc(order.id)}</h2>
        <p class="cel-sum">${fmt(order.totals.total, 'on')} · rozliczenie T+2</p>
      </div>
    </div>
    <p class="cel-skip mono">dotknij, aby pominąć</p>`;
  const fx = particles(root.querySelector('.cel-fx')); P.fx = fx;
  const $ = (s) => root.querySelector(s);
  const deal = $('.deal'), path = $('.dl'), seal = $('.seal'), title = $('.cel-title');
  deal.animate([{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'none' }], { duration: 400, fill: 'both' });
  const len = path.getTotalLength();
  path.style.strokeDasharray = len;
  path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 1300, easing: 'cubic-bezier(.6,0,.4,1)', fill: 'both', delay: 200 });
  root.querySelectorAll('.dc rect').forEach((r, i) => r.animate([{ transform: 'scaleY(0)', opacity: 0 }, { transform: 'scaleY(1)', opacity: 1 }], { duration: 300, delay: 250 + i * 80, fill: 'both' }));
  $('.dp').animate([{ opacity: 0, r: 0 }, { opacity: 1, r: 7 }], { duration: 300, delay: 1450, fill: 'both' });
  // counter
  const target = order.totals.total, t0 = performance.now() + 200, el = $('#celNum');
  (function count(now) {
    const k = Math.min(1, Math.max(0, (now - t0) / 1300)), e = 1 - Math.pow(1 - k, 3);
    el.textContent = (target * e).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (k < 1 && !P.skip) requestAnimationFrame(count);
  })(performance.now());
  await wait(1600);
  if (P.skip) return;

  // wax seal slam
  await seal.animate([
    { transform: 'translate(-50%,-50%) scale(3.2) rotate(-40deg)', opacity: 0 },
    { transform: 'translate(-50%,-50%) scale(.92) rotate(-8deg)', opacity: 1, offset: 0.8 },
    { transform: 'translate(-50%,-50%) scale(1) rotate(-10deg)', opacity: 1 },
  ], { duration: 380, easing: 'cubic-bezier(.6,0,.9,.3)', fill: 'both' }).finished;
  if (P.skip) return;
  root.animate([{ transform: 'none' }, { transform: 'translate(7px,-6px)' }, { transform: 'translate(-6px,5px)' }, { transform: 'translate(3px,-2px)' }, { transform: 'none' }], { duration: 340 });
  const r = seal.getBoundingClientRect();
  fx.burst(r.left + r.width / 2, r.top + r.height / 2, 34, { kinds: ['ink'], colors: ['#7d0f1a', '#a3121f', '#5c0f17'], speed: 520, gravity: 500, size: 5, life: 1.4 });
  fx.burst(r.left + r.width / 2, r.top + r.height / 2, 40, { kinds: ['coin'], speed: 900, gravity: 1300, size: 13, angle: -Math.PI / 2, spread: Math.PI * 1.2 });
  fx.rain(70, { kind: 'coin', size: 15 });
  setTimeout(() => !P.skip && fx.rain(50, { kind: 'coin', size: 12 }), 700);
  title.animate([{ transform: 'translateY(24px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 600, delay: 250, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'both' });
  await wait(2500);
}
function sealPath() {
  let s = '';
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2, rr = 92 + (i % 2 ? 6 : -2) + Math.sin(i * 1.7) * 3;
    s += (i ? 'L' : 'M') + (100 + Math.cos(a) * rr).toFixed(1) + ' ' + (100 + Math.sin(a) * rr).toFixed(1) + ' ';
  }
  return s + 'Z';
}

/* ---------------- entry ---------------- */
export async function celebrate(mode, order, imgs = []) {
  const root = document.createElement('div');
  root.className = `cel cel-${mode}`;
  root.setAttribute('role', 'status');
  root.setAttribute('aria-label', mode === 'ona' ? `zamówienie ${order.id} przyjęte` : `transakcja ${order.id} zaksięgowana`);
  document.body.appendChild(root);
  const P = { skip: false, fx: null };
  let done;
  const finished = new Promise((r) => (done = r));
  const end = async () => {
    if (P.ended) return; P.ended = true; P.skip = true;
    await root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, fill: 'both' }).finished.catch(() => {});
    P.fx?.stop(); root.remove(); done();
  };
  root.addEventListener('click', end);
  const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') end(); };
  addEventListener('keydown', onKey);
  if (navigator.vibrate) try { navigator.vibrate(mode === 'ona' ? [30, 60, 30] : [50]); } catch { /* */ }

  if (reduce()) {
    root.innerHTML = `<div class="cel-stage"><div class="cel-title" style="opacity:1"><p class="pix">${mode === 'ona' ? 'zamówienie wykopane' : 'transakcja zawarta'}</p><h2>${esc(order.id)}</h2></div></div>`;
    await wait(1200);
  } else {
    root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'both' });
    await (mode === 'on' ? on : ona)(root, order, imgs, P);
  }
  removeEventListener('keydown', onKey);
  await end();
  return finished;
}

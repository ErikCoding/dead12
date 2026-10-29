// dead12 — lalki w pudełkach. Jeden renderer WebGL + jedna lalka: dla każdego widocznego pudełka
// zakładamy jej właściwą bluzę, obracamy, renderujemy i kopiujemy klatkę do <canvas> tego pudełka.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createRig } from './viewer.js';

const coarse = matchMedia('(pointer:coarse)').matches;
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
const texLoader = new THREE.TextureLoader();

export function createBoxes({ onOpen } = {}) {
  const W = coarse ? 280 : 360, H = Math.round(W * 1.732);
  const glCanvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environmentIntensity = 0.32;
  scene.add(new THREE.HemisphereLight(0xf2ece8, 0x140f14, 0.95));
  const key = new THREE.DirectionalLight(0xfff4ec, 2.2); key.position.set(1.5, 2.6, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffb3d6, 1.3); rim.position.set(-2, 1.5, -2); scene.add(rim);
  const camera = new THREE.PerspectiveCamera(24, W / H, 0.05, 30);

  const turntable = new THREE.Group(); scene.add(turntable);
  // small display plinth
  const plinth = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.07, 64), new THREE.MeshStandardMaterial({ color: 0x0f0d0f, roughness: 0.5 }));
  top.position.y = -0.035;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.465, 0.007, 6, 96), new THREE.MeshBasicMaterial({ color: 0xff2e88 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.001;
  plinth.add(top, ring); turntable.add(plinth); plinth.visible = false;
  const slot = new THREE.Group(); turntable.add(slot);

  let rig = null, rigReady = false;
  function ensureRig() {
    if (rig) return;
    rig = createRig({ maxAniso: 4 });
    rig.ready.then(async (doll) => {
      slot.add(doll); rigReady = true;
      for (const b of boxes) if (b.p.garment) rig.get(b.p).then(() => { b.el.classList.add('ready'); kick(); });
    });
  }

  async function flatModel(p) {
    const front = await texLoader.loadAsync(p.img); front.colorSpace = THREE.SRGBColorSpace;
    const back = await texLoader.loadAsync('assets/img/logo-dark.png'); back.colorSpace = THREE.SRGBColorSpace;
    const ar = front.image.width / front.image.height, w = 0.82, h = w / ar;
    const g = new THREE.Group();
    const card = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, h + 0.05, 0.02), new THREE.MeshStandardMaterial({ color: 0x17141a, roughness: 0.5 }));
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: front, transparent: true, roughness: 0.35 }));
    f.position.z = 0.0105;
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, w * 0.7 * (back.image.height / back.image.width)), new THREE.MeshStandardMaterial({ map: back, transparent: true }));
    b.position.z = -0.0105; b.rotation.y = Math.PI;
    g.add(card, f, b); g.position.y = 0.1 + h / 2 + 0.08;
    return g;
  }

  const boxes = [];
  let rafOn = false;
  function add(el, product) {
    const cv = el.querySelector('canvas'); cv.width = W; cv.height = H;
    const b = { el, cv, ctx: cv.getContext('2d'), p: product, flat: null, yaw: -0.5 + Math.random() * 0.3, vel: 0.45, drag: false, lx: 0, moved: 0, visible: false, hover: 0 };
    boxes.push(b);
    if (product.garment) { if (rigReady) rig.get(product).then(() => { el.classList.add('ready'); kick(); }); }
    else flatModel(product).then((m) => { b.flat = m; el.classList.add('ready'); kick(); }).catch(() => el.classList.add('no3d'));
    cv.addEventListener('pointerdown', (e) => { b.drag = true; b.lx = e.clientX; b.moved = 0; cv.setPointerCapture(e.pointerId); el.classList.add('grabbing'); });
    cv.addEventListener('pointermove', (e) => {
      if (!b.drag) return; const dx = e.clientX - b.lx; b.lx = e.clientX; b.moved += Math.abs(dx);
      b.yaw += dx * 0.014; b.vel = dx * 0.9; if (b.moved > 6) el.classList.add('touched');
    });
    const up = () => {
      if (!b.drag) return; b.drag = false; el.classList.remove('grabbing');
      if (b.moved < 6) onOpen && onOpen(product.id); // tap = open the try-on
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', () => { b.drag = false; el.classList.remove('grabbing'); });
    el.addEventListener('pointerenter', () => (b.hover = 1));
    el.addEventListener('pointerleave', () => (b.hover = 0));
    io.observe(el); near.observe(el);
  }
  // load the doll a little before the boxes scroll into view
  const near = new IntersectionObserver((ens) => { if (ens.some((e) => e.isIntersecting)) { ensureRig(); near.disconnect(); } }, { rootMargin: '600px' });
  const io = new IntersectionObserver((ens) => {
    for (const en of ens) { const b = boxes.find((x) => x.el === en.target); if (b) b.visible = en.isIntersecting; }
    kick();
  }, { rootMargin: '60px' });

  function kick() { if (!rafOn) { rafOn = true; last = performance.now(); requestAnimationFrame(frame); } }
  let last = performance.now(), acc = 0;
  const step = coarse ? 1 / 30 : 1 / 50;
  function frame(now) {
    const vis = boxes.filter((b) => b.visible && b.el.classList.contains('ready'));
    if (!vis.length || document.hidden) { rafOn = false; return; }
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; acc += dt;
    if (acc < step) return; const d = acc; acc = 0;
    const t = now / 1000;
    for (const b of vis) {
      if (!b.drag) {
        const target = reduce ? 0.1 : b.hover ? 1.2 : 0.42;
        b.vel += (target - b.vel) * Math.min(1, d * 1.5);
        b.yaw += b.vel * d;
      }
      turntable.rotation.y = b.yaw;
      if (b.p.garment) {
        if (!rigReady || !rig.show(b.p.id)) continue;
        if (b.flatOn) { slot.remove(b.flatOn); b.flatOn = null; }
        rig.doll.visible = true; rig.pose(t + boxes.indexOf(b) * 2, 0, 0);
        camera.position.set(0, 0.98, 4.2); camera.lookAt(0, 0.8, 0);
      } else {
        if (rig?.doll) rig.doll.visible = false;
        slot.add(b.flat); b.flatOn = b.flat;
        camera.position.set(0, 0.6, 3.5); camera.lookAt(0, 0.56, 0);
      }
      renderer.render(scene, camera);
      if (!b.p.garment) { slot.remove(b.flat); b.flatOn = null; }
      b.ctx.clearRect(0, 0, W, H); b.ctx.drawImage(glCanvas, 0, 0);
    }
  }
  return { add };
}

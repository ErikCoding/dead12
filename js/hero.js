// dead12 — hero 3D: czaszka z piszczelami wyciągnięta z logo (SVG → bryła), lakier z opalizacją,
// orbitujące chromowane gwiazdki i pył. Przeciągnij, aby zakręcić.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const coarse = matchMedia('(pointer:coarse)').matches;
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
const TAU = Math.PI * 2;

function starShape(R = 1, r = 0.42) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r : R;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  s.closePath(); return s;
}

export async function createHero(canvas) {
  const svgText = await fetch('assets/img/skull.svg').then((r) => r.text());
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.03).texture;
  scene.environmentIntensity = 1.25;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0, 6.2);

  // lights: pink rim from behind-left, cool fill, warm key
  const key = new THREE.DirectionalLight(0xfff2ea, 2.6); key.position.set(2.5, 3, 4); scene.add(key);
  const rimPink = new THREE.PointLight(0xff2e88, 70, 9); rimPink.position.set(-2.6, 1.2, -1.8); scene.add(rimPink);
  const rimBlue = new THREE.PointLight(0x3b7fe0, 40, 9); rimBlue.position.set(2.8, -1.4, -1.6); scene.add(rimBlue);

  /* ---- skull & bones from the logo ---- */
  const data = new SVGLoader().parse(svgText);
  const geos = [];
  for (const p of data.paths) for (const shape of SVGLoader.createShapes(p)) {
    geos.push(new THREE.ExtrudeGeometry(shape, { depth: 150, bevelEnabled: true, bevelThickness: 34, bevelSize: 22, bevelSegments: coarse ? 3 : 5, curveSegments: coarse ? 6 : 10 }));
  }
  const g = mergeGeometries(geos);
  g.computeBoundingBox();
  const bb = g.boundingBox, size = new THREE.Vector3(), c = new THREE.Vector3(); bb.getSize(size); bb.getCenter(c);
  g.translate(-c.x, -c.y, -c.z);
  const sc = 2.5 / Math.max(size.x, size.y);
  g.scale(sc, -sc, sc);
  // undo the winding flip caused by the mirrored Y
  const pos = g.attributes.position; const idx = g.index;
  if (idx) { for (let i = 0; i < idx.count; i += 3) { const t = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, t); } }
  else for (const name of ['position', 'normal', 'uv']) {
    const at = g.attributes[name]; if (!at) continue; const n = at.itemSize, arr = at.array;
    for (let i = 0; i < at.count; i += 3) for (let k = 0; k < n; k++) { const a1 = (i + 1) * n + k, a2 = (i + 2) * n + k; const tmp = arr[a1]; arr[a1] = arr[a2]; arr[a2] = tmp; }
  }
  g.computeVertexNormals(); pos.needsUpdate = true;

  const lacquer = new THREE.MeshPhysicalMaterial({
    color: 0x4a3c48, metalness: 0.85, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08,
    iridescence: coarse ? 0.6 : 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 650],
  });
  const skull = new THREE.Mesh(g, lacquer);
  const holder = new THREE.Group(); holder.add(skull); scene.add(holder);

  /* ---- orbiting stars ---- */
  const starGeo = new THREE.ExtrudeGeometry(starShape(1, 0.42), { depth: 0.28, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 2 });
  starGeo.center();
  const chrome = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.12 });
  const pink = new THREE.MeshPhysicalMaterial({ color: 0xff2e88, metalness: 0.2, roughness: 0.25, clearcoat: 1, emissive: 0x5a0a2c, emissiveIntensity: 0.4 });
  const orbit = new THREE.Group(); scene.add(orbit);
  const stars = [];
  const N = coarse ? 6 : 9;
  for (let i = 0; i < N; i++) {
    const m = new THREE.Mesh(starGeo, i % 3 === 0 ? pink : chrome);
    const s = 0.07 + Math.random() * 0.1; m.scale.setScalar(s);
    const r = 1.75 + Math.random() * 0.8, a = (i / N) * TAU, tilt = (Math.random() - 0.5) * 1.2;
    stars.push({ m, r, a, tilt, speed: 0.18 + Math.random() * 0.22, spin: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 1.6 });
    orbit.add(m);
  }
  /* ---- dust ---- */
  const D = coarse ? 120 : 260, dp = new Float32Array(D * 3);
  for (let i = 0; i < D; i++) dp.set([(Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 5 - 1], i * 3);
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xff7ab4, size: 0.018, transparent: true, opacity: 0.55, depthWrite: false }));
  scene.add(dust);

  /* ---- interaction ---- */
  const st = { yaw: -0.5, vel: 0.35, drag: false, lx: 0, ly: 0, mx: 0, my: 0, pitch: 0, visible: true, intro: 0 };
  canvas.addEventListener('pointerdown', (e) => { st.drag = true; st.lx = e.clientX; st.ly = e.clientY; canvas.setPointerCapture(e.pointerId); canvas.classList.add('grabbing'); });
  canvas.addEventListener('pointermove', (e) => {
    if (!st.drag) return;
    const dx = e.clientX - st.lx; st.lx = e.clientX; st.vel = dx * 0.6; st.yaw += dx * 0.012;
  });
  const up = () => { st.drag = false; canvas.classList.remove('grabbing'); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  addEventListener('pointermove', (e) => { st.mx = e.clientX / innerWidth - 0.5; st.my = e.clientY / innerHeight - 0.5; }, { passive: true });
  new IntersectionObserver(([en]) => (st.visible = en.isIntersecting), { threshold: 0.01 }).observe(canvas);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    const pr = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) {
      renderer.setSize(w, h, false); camera.aspect = w / h;
      // keep the skull inside narrow (mobile) viewports
      camera.position.z = camera.aspect < 0.9 ? 6.2 / Math.max(0.55, camera.aspect / 0.9) : 6.2;
      camera.updateProjectionMatrix();
    }
  }
  const clock = new THREE.Clock();
  (function frame() {
    requestAnimationFrame(frame);
    if (!st.visible || document.hidden) { clock.getDelta(); return; }
    resize();
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    st.intro = Math.min(1, st.intro + dt / 1.6);
    const e = 1 - Math.pow(1 - st.intro, 3);
    if (!st.drag) { st.vel += (0.35 - st.vel) * Math.min(1, dt * 0.8); st.yaw += st.vel * dt * (reduce ? 0.2 : 1); }
    holder.rotation.y = st.yaw;
    holder.rotation.x = THREE.MathUtils.lerp(holder.rotation.x, st.my * 0.35 + Math.sin(t * 0.6) * 0.06, 0.06);
    holder.rotation.z = THREE.MathUtils.lerp(holder.rotation.z, -st.mx * 0.2, 0.06);
    holder.position.y = Math.sin(t * 1.1) * 0.08;
    holder.scale.setScalar(0.6 + e * 0.4);
    for (const s of stars) {
      s.a += s.speed * dt;
      s.m.position.set(Math.cos(s.a) * s.r, s.y + Math.sin(s.a * 1.3) * 0.15, Math.sin(s.a) * s.r * 0.55);
      s.m.position.applyAxisAngle(new THREE.Vector3(1, 0, 0), s.tilt * 0.3);
      s.m.rotation.y += s.spin * dt; s.m.rotation.z = s.tilt;
    }
    orbit.rotation.x = st.my * 0.2;
    dust.rotation.y = t * 0.02; dust.position.x = st.mx * 0.3; dust.position.y = -st.my * 0.2;
    rimPink.position.x = -2.6 + Math.sin(t * 0.5) * 0.8;
    renderer.render(scene, camera);
  })();
  return { spin() { st.vel = 9; } };
}

// dead12 — złota moneta z wytłoczoną czaszką (SVG z logo → ekstruzja 3D).
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function faceTexture(top, bottom) {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S * .4, S * .35, 40, S / 2, S / 2, S / 2);
  grd.addColorStop(0, '#f0d495'); grd.addColorStop(.55, '#c99b4f'); grd.addColorStop(1, '#8a6226');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  // fine concentric lathe lines
  g.strokeStyle = 'rgba(80,50,10,.10)'; g.lineWidth = 1;
  for (let r = 30; r < S / 2; r += 5) { g.beginPath(); g.arc(S / 2, S / 2, r, 0, Math.PI * 2); g.stroke(); }
  // ring + text
  g.strokeStyle = 'rgba(60,36,6,.75)'; g.lineWidth = 6;
  g.beginPath(); g.arc(S / 2, S / 2, S * .385, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.arc(S / 2, S / 2, S * .37, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(60,36,6,.85)';
  g.font = '600 58px "Bodoni Moda", Georgia, serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const ring = (txt, startAng, dir) => {
    const R = S * .43, chars = [...txt];
    const per = 0.088;
    const total = per * (chars.length - 1);
    chars.forEach((ch, i) => {
      const a = startAng - dir * total / 2 + dir * i * per;
      g.save(); g.translate(S / 2 + Math.cos(a) * R, S / 2 + Math.sin(a) * R);
      g.rotate(a + (dir > 0 ? Math.PI / 2 : -Math.PI / 2)); g.fillText(ch, 0, 0); g.restore();
    });
  };
  ring(top, -Math.PI / 2, 1);
  ring(bottom, Math.PI / 2, -1);
  for (const a of [Math.PI, 0]) { // stars on sides
    g.save(); g.translate(S / 2 + Math.cos(a) * S * .43, S / 2 + Math.sin(a) * S * .43); g.font = '48px serif'; g.fillText('✦', 0, 0); g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export async function createCoin(canvas) {
  const svgText = await fetch('assets/img/skull.svg').then((r) => r.text());
  await document.fonts.ready;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.02).texture;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0, 5.2);

  const gold = new THREE.MeshStandardMaterial({ color: 0xffe2a0, metalness: 1, roughness: 0.12 });
  const skullMat = new THREE.MeshStandardMaterial({ color: 0x120c08, metalness: 0.3, roughness: 0.22 });
  const goldDark = new THREE.MeshStandardMaterial({ color: 0xb08a4e, metalness: 1, roughness: 0.4, flatShading: true });

  const coin = new THREE.Group();
  const R = 1, H = 0.16;
  // body with reeded edge (flat-shaded segments)
  const edge = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 140, 1, true), goldDark);
  edge.rotation.x = Math.PI / 2; coin.add(edge);
  const faceMatF = new THREE.MeshStandardMaterial({ map: faceTexture('DEAD12 CAPITAL', 'IN DEATH WE TRUST'), metalness: 1, roughness: 0.32 });
  const faceMatB = new THREE.MeshStandardMaterial({ map: faceTexture('JEDNA DUSZA', 'MMXII · ZA GROBEM'), metalness: 1, roughness: 0.32 });
  const front = new THREE.Mesh(new THREE.CircleGeometry(R, 140), faceMatF); front.position.z = H / 2; coin.add(front);
  const back = new THREE.Mesh(new THREE.CircleGeometry(R, 140), faceMatB); back.position.z = -H / 2; back.rotation.y = Math.PI; coin.add(back);
  // raised rims
  for (const z of [H / 2, -H / 2]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.035, 0.04, 16, 160), gold); rim.position.z = z; coin.add(rim);
  }

  // skull relief from SVG
  const data = new SVGLoader().parse(svgText);
  const geos = [];
  for (const p of data.paths) {
    for (const shape of SVGLoader.createShapes(p)) {
      geos.push(new THREE.ExtrudeGeometry(shape, { depth: 50, bevelEnabled: true, bevelThickness: 10, bevelSize: 6, bevelSegments: 3, curveSegments: 10 }));
    }
  }
  const skullGeo = mergeGeometries(geos);
  skullGeo.computeBoundingBox();
  const bb = skullGeo.boundingBox, size = new THREE.Vector3(); bb.getSize(size);
  const center = new THREE.Vector3(); bb.getCenter(center);
  skullGeo.translate(-center.x, -center.y, -bb.min.z);
  const s = (R * 1.18) / Math.max(size.x, size.y);
  skullGeo.scale(s, -s, s * 0.9); // flip svg Y
  // mirroring flips triangle winding — swap 2nd/3rd vertex of every triangle back
  for (const name of ['position', 'normal', 'uv']) {
    const at = skullGeo.attributes[name]; if (!at) continue;
    const n = at.itemSize, arr = at.array;
    for (let i = 0; i < at.count; i += 3) for (let k = 0; k < n; k++) {
      const a1 = (i + 1) * n + k, a2 = (i + 2) * n + k; const tmp = arr[a1]; arr[a1] = arr[a2]; arr[a2] = tmp;
    }
  }
  skullGeo.computeVertexNormals();
  const skullF = new THREE.Mesh(skullGeo, skullMat); skullF.position.z = H / 2 - 0.005; coin.add(skullF);
  const skullB = new THREE.Mesh(skullGeo, skullMat); skullB.rotation.y = Math.PI; skullB.position.z = -H / 2 + 0.005; skullB.scale.set(.82, .82, 1); coin.add(skullB);
  scene.add(coin);

  const key = new THREE.DirectionalLight(0xfff1d6, 2.5); key.position.set(2, 3, 4); scene.add(key);
  scene.add(new THREE.AmbientLight(0xffffff, 0.2));

  // shadow blob
  const sh = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0x16110d, transparent: true, opacity: 0.18 }));
  sh.position.set(0, -1.55, -0.5); sh.scale.set(0.9, 0.12, 1); scene.add(sh);

  const st = { spin: 0, v: 0.012, drag: false, lx: 0, mx: 0, my: 0, active: true, visible: true };
  canvas.addEventListener('pointerdown', (e) => { st.drag = true; st.lx = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    st.mx = ((e.clientX - r.left) / r.width) * 2 - 1; st.my = ((e.clientY - r.top) / r.height) * 2 - 1;
    if (st.drag) { const dx = e.clientX - st.lx; st.lx = e.clientX; st.v = dx * 0.01; st.spin += st.v; }
  });
  canvas.addEventListener('pointerup', () => { st.drag = false; });
  canvas.addEventListener('pointerleave', () => { st.mx = st.my = 0; });
  new IntersectionObserver(([en]) => { st.visible = en.isIntersecting; }).observe(canvas);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    const pr = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) {
      renderer.setSize(w, h, false); camera.aspect = w / h;
      camera.position.z = Math.max(4.4, 4.4 / Math.min(camera.aspect, 1)); camera.updateProjectionMatrix();
    }
  }
  const clock = new THREE.Clock();
  (function frame() {
    requestAnimationFrame(frame);
    if (!st.active || !st.visible) return;
    resize();
    const t = clock.getElapsedTime();
    if (!st.drag) { st.v += (0.012 - st.v) * 0.02; st.spin += st.v; }
    coin.rotation.y = st.spin;
    coin.rotation.x = THREE.MathUtils.lerp(coin.rotation.x, st.my * 0.35, 0.08);
    coin.rotation.z = THREE.MathUtils.lerp(coin.rotation.z, -st.mx * 0.15, 0.08);
    coin.position.y = Math.sin(t * 1.3) * 0.06 + 0.1;
    sh.scale.x = 0.8 + Math.abs(Math.cos(st.spin)) * 0.15;
    renderer.render(scene, camera);
  })();

  return { setActive(v) { st.active = v; } };
}

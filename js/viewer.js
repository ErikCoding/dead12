// dead12 — przymierzalnia 3D. Lalka na stoisku + bluza budowana z kawałków przypiętych do kości.
// createRig()   → lalka + bluzy (wspólne dla przymierzalni i pudełek)
// createViewer(canvas) → { wear(product), view('front'|'back'|'side'), zoom(bool), setActive(bool), ready }
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const MODEL_URL = 'assets/model/doll-lite.glb'; // 1536 px texture (doll.glb = full 2048 px original)
const coarse = matchMedia('(pointer:coarse)').matches;
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

/* ---------------- measured doll landmarks (bind pose, metres) ---------------- */
const Z0 = 0.095;                 // torso centre (depth)
const TORSO = [                   // y, half-width, half-depth (garment, already oversized)
  [0.905, 0.122, 0.104], [0.925, 0.130, 0.110], [0.95, 0.136, 0.113], [1.00, 0.134, 0.111], [1.06, 0.132, 0.109],
  [1.12, 0.140, 0.112], [1.18, 0.152, 0.113], [1.22, 0.166, 0.110], [1.25, 0.170, 0.102], [1.272, 0.150, 0.090], [1.29, 0.105, 0.078],
  [1.304, 0.072, 0.063], [1.314, 0.058, 0.054],
];
const ARM_L = [[0.17, 1.258, 0.074], [0.205, 1.175, 0.064], [0.262, 1.083, 0.060], [0.33, 1.005, 0.058], [0.385, 0.955, 0.062]];
const SLEEVE_R = (t) => lerp(0.050, 0.038, t) + Math.sin(t * Math.PI) * 0.004; // baggy, tapering to cuff

/* ---------------- geometry helpers ---------------- */
function torsoGeometry(seg = 96) {
  // elliptical/boxy rings, u wraps around (u=0 front centre = zipper seam), v bottom→top
  const pos = [], uv = [], idx = [];
  const rows = TORSO.length;
  for (let j = 0; j < rows; j++) {
    const [y, a, b] = TORSO[j];
    for (let i = 0; i <= seg; i++) {
      const u = i / seg, th = u * TAU;
      const s = Math.sin(th), c = Math.cos(th);
      const k = 0.82; // < 1 → boxier silhouette
      const x = a * Math.sign(s) * Math.pow(Math.abs(s), k);
      const z = Z0 + b * Math.sign(c) * Math.pow(Math.abs(c), k);
      pos.push(x, y, z); uv.push(u, j / (rows - 1));
    }
  }
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < seg; i++) {
    const a = j * (seg + 1) + i, b = a + seg + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1); // outward-facing
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function tubeGeometry(points, radiusAt, seg = 28, steps = 40) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const frames = curve.computeFrenetFrames(steps, false);
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= steps; j++) {
    const t = j / steps, P = curve.getPointAt(t), N = frames.normals[j], B = frames.binormals[j], r = radiusAt(t);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU;
      const v = new THREE.Vector3().addScaledVector(N, Math.cos(a) * r).addScaledVector(B, Math.sin(a) * r).add(P);
      pos.push(v.x, v.y, v.z); uv.push(i / seg, t);
    }
  }
  for (let j = 0; j < steps; j++) for (let i = 0; i < seg; i++) {
    const a = j * (seg + 1) + i, b = a + seg + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return { g, curve };
}
function ringAt(curve, t, r, tube, mat) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, 32), mat);
  const p = curve.getPointAt(t), d = curve.getTangentAt(t);
  m.position.copy(p); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
  return m;
}

/* ---------------- textures from the product photo ---------------- */
const imgCache = new Map();
function loadImg(src) {
  if (!imgCache.has(src)) imgCache.set(src, new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }));
  return imgCache.get(src);
}
async function torsoTexture(gm, maxAniso) {
  const W = 2048, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  // base: flat colour or tiled pattern cut from the photo
  g.fillStyle = gm.base; g.fillRect(0, 0, W, H);
  const photo = await loadImg(gm.img);
  if (gm.pattern) {
    const [x0, y0, x1, y1] = gm.pattern, pw = x1 - x0, ph = y1 - y0, s = 2.2;
    for (let y = 0; y < H; y += ph * s) for (let x = 0; x < W; x += pw * s) g.drawImage(photo, x0, y0, pw, ph, x, y, pw * s, ph * s);
  }
  // back print (u = 0.5)
  if (gm.backLogo) {
    const L = await loadImg(gm.backLogo), w = W * 0.2, h = w * (L.height / L.width);
    g.globalAlpha = 0.92; g.drawImage(L, W * 0.5 - w / 2, H * 0.28, w, h); g.globalAlpha = 1;
  }
  // front panel: column-by-column planar projection of the photo crop onto the curved front
  const [x0, y0, x1, y1] = gm.front, cx = gm.zip, half = Math.max(cx - x0, x1 - cx);
  const top = H * (1 - gm.frontTop), bot = H * (1 - gm.frontBottom);
  for (let px = 0; px < W; px++) {
    const th = (px / W) * TAU, s = Math.sin(th), cth = Math.cos(th);
    if (cth < 0.05) continue;                       // back half: skip
    const sx = cx + s * half;                       // source column
    if (sx < x0 || sx > x1) continue;
    g.globalAlpha = Math.min(1, (cth - 0.05) * 4);  // soft edge towards the sides
    g.drawImage(photo, sx, y0, 1.2, y1 - y0, px, top, 1.2, bot - top);
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.wrapS = THREE.RepeatWrapping;
  return t;
}
function knitTexture(color, stripes = 40) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 64, 256);
  g.fillStyle = 'rgba(0,0,0,.28)';
  for (let i = 0; i < stripes; i++) g.fillRect(0, (i / stripes) * 256, 64, 256 / stripes / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function patternTexture(gm, photo) {
  const [x0, y0, x1, y1] = gm.pattern; const c = document.createElement('canvas'); c.width = x1 - x0; c.height = y1 - y0;
  c.getContext('2d').drawImage(photo, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.5, 2.5);
  return t;
}

/* ---------------- fit sleeves to the posed arm ---------------- */
// Reads the real skinned positions of the arm skin (pale texels, arm bones) and returns
// a centre-line + radius per height slice in doll-root space.
function fitArms(doll) {
  let mesh = null; doll.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
  if (!mesh) return null;
  doll.updateMatrixWorld(true); mesh.skeleton.update();
  const names = mesh.skeleton.bones.map((b) => b.name);
  const g = mesh.geometry, P = g.attributes.position, UV = g.attributes.uv, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  // sample the texture to tell skin from hair
  const im = mesh.material.map?.image; let pix = null, TW = 256, TH = 256;
  if (im) { const c = document.createElement('canvas'); c.width = TW; c.height = TH; const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(im, 0, 0, TW, TH); pix = cx.getImageData(0, 0, TW, TH).data; }
  const rootInv = doll.matrixWorld.clone().invert();
  const toRoot = new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld);
  const v = new THREE.Vector3();
  const out = {};
  for (const [side, pre] of [[1, 'Left'], [-1, 'Right']]) {
    const want = new Set([`${pre}Shoulder`, `${pre}Arm`, `${pre}ForeArm`].map((n) => names.indexOf(n)));
    const pts = [];
    for (let i = 0; i < P.count; i++) {
      // dominant bone
      let bi = SI.getX(i), bw = SW.getX(i);
      for (const k of ['getY', 'getZ', 'getW']) if (SW[k](i) > bw) { bw = SW[k](i); bi = SI[k](i); }
      if (!want.has(bi)) continue;
      if (P.getX(i) * side < 0.1) continue;
      if (pix) {
        const tx = Math.min(TW - 1, Math.max(0, Math.floor(UV.getX(i) * TW))), ty = Math.min(TH - 1, Math.max(0, Math.floor(UV.getY(i) * TH))); // glTF: flipY = false
        const o = (ty * TW + tx) * 4, r = pix[o], gg = pix[o + 1], b = pix[o + 2];
        const lum = (r + gg + b) / 3;
        if (lum < 150 || Math.max(r, gg, b) - Math.min(r, gg, b) > 60 || gg - b > 14) continue; // pale skin only (no black / mint hair)
      }
      mesh.getVertexPosition(i, v); v.applyMatrix4(toRoot); pts.push(v.clone());
    }
    if (pts.length < 50) return null;
    // slice by height
    const ys = pts.map((p) => p.y), yTop = Math.max(...ys), yBot = Math.min(...ys);
    const slices = [];
    for (let y = yTop; y > yBot; y -= 0.03) {
      let s = pts.filter((p) => p.y <= y && p.y > y - 0.03);
      if (s.length < 6) continue;
      let c = s.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(s.length);
      // trim outliers (stray strands), recompute
      const d = s.map((p) => Math.hypot(p.x - c.x, p.z - c.z)).sort((a, b) => a - b), med = d[d.length >> 1];
      s = s.filter((p) => Math.hypot(p.x - c.x, p.z - c.z) < med * 1.8 + 0.005);
      c = s.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(s.length);
      const r = s.reduce((a, p) => a + Math.hypot(p.x - c.x, p.z - c.z), 0) / s.length;
      slices.push({ c: new THREE.Vector3(c.x, y - 0.015, c.z), r });
    }
    out[side] = slices;
  }
  return out;
}


/* ---------------- shared doll + garments ---------------- */
let gltfPromise = null;
export function loadDoll(onProgress) {
  if (!gltfPromise) gltfPromise = new Promise((res, rej) => new GLTFLoader().load(MODEL_URL, res, (e) => { if (onProgress && e.total) onProgress(e.loaded / e.total); }, rej));
  return gltfPromise;
}
export function createRig({ onProgress, maxAniso = 8 } = {}) {
  const R = { doll: null, bones: null, bind: null, arms: null, rig: null, rest: null, hx: 0, hy: 0 };
  const cache = new Map(), building = new Map();
  let shown = null, want = null;
  const ready = loadDoll(onProgress).then((gltf) => {
    const doll = SkeletonUtils.clone(gltf.scene);
    doll.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.material = o.material.clone(); o.material.metalness = 0; o.material.roughness = 0.55; } });
    doll.updateMatrixWorld(true);
    const b = (n) => doll.getObjectByName(n);
    R.rig = { lArm: b('LeftArm'), rArm: b('RightArm'), head: b('Head'), spine: b('Spine01') };
    R.rest = Object.fromEntries(Object.entries(R.rig).map(([k, v]) => [k, v.quaternion.clone()]));
    const rootInv = doll.matrixWorld.clone().invert();
    R.bind = Object.fromEntries(['Spine', 'Spine01', 'Spine02', 'LeftArm', 'RightArm'].map((n) => [n, rootInv.clone().multiply(b(n).matrixWorld)]));
    R.bones = { Spine: b('Spine'), Spine01: b('Spine01'), Spine02: b('Spine02'), LeftArm: b('LeftArm'), RightArm: b('RightArm') };
    R.doll = doll;
    pose(0);
    R.arms = fitArms(doll);
    return doll;
  });
  const _q = new THREE.Quaternion(), _e = new THREE.Euler();
  function setBone(k, x, y, z) { const bn = R.rig[k]; _e.set(x, y, z); _q.setFromEuler(_e); bn.quaternion.copy(R.rest[k]).multiply(_q); }
  function pose(t, hx = R.hx, hy = R.hy) {
    if (!R.rig) return;
    setBone('lArm', 0, -1.0, 0);
    setBone('rArm', 0, 1.0, 0);
    setBone('spine', Math.sin(t * 1.4) * 0.01, 0, 0);
    setBone('head', hy, Math.sin(t * 0.6) * 0.04, -hx);
  }
  function attach(mesh, boneName) {
    const inv = R.bind[boneName].clone().invert();
    mesh.geometry.applyMatrix4(inv);
    R.bones[boneName].add(mesh);
    return mesh;
  }
  async function buildGarment(p) {
    const gm = p.garment;
    const fabric = (opt) => new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0, envMapIntensity: 0.55, ...opt });
    const tex = await torsoTexture(gm, maxAniso);
    const photo = await loadImg(gm.img);
    const sleeveMap = gm.pattern && gm.patternSleeves ? patternTexture(gm, photo) : null;
    const mats = {
      torso: fabric({ map: tex, side: THREE.DoubleSide }),
      sleeve: fabric({ color: sleeveMap ? 0xffffff : gm.sleeve, map: sleeveMap }),
      rib: fabric({ map: knitTexture(gm.rib, 36), roughness: 1 }),
      hood: fabric({ color: gm.hood, side: THREE.DoubleSide }),
      hoodIn: fabric({ color: gm.hoodIn || gm.hood, side: THREE.BackSide }),
      metal: new THREE.MeshStandardMaterial({ color: 0xcfcac4, metalness: 1, roughness: 0.35 }),
      cord: fabric({ color: gm.cord || gm.hoodIn || '#d9d6d2' }),
    };
    const parts = [];
    // torso shell
    parts.push(attach(new THREE.Mesh(torsoGeometry(), mats.torso), 'Spine01'));
    // waistband ribbing
    const hem = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.02, 0.045, 64, 1, true), mats.rib);
    hem.geometry.scale(0.124, 1, 0.106); hem.geometry.translate(0, 0.9, Z0); parts.push(attach(hem, 'Spine02'));
    // zipper line + puller
    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.36, 0.004), mats.metal);
    zip.geometry.translate(0, 1.07, Z0 + 0.116); parts.push(attach(zip, 'Spine01'));
    const pull = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.006), mats.metal);
    pull.geometry.translate(0, 1.255, Z0 + 0.104); parts.push(attach(pull, 'Spine01'));
    // hood (down): soft collar roll + bulk on the upper back
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.03, 14, 48, Math.PI * 1.45), mats.hood);
    collar.geometry.rotateZ(-Math.PI * 0.225 + Math.PI / 2 + Math.PI);
    collar.geometry.rotateX(Math.PI / 2); collar.geometry.scale(1.1, 1, 0.92); collar.geometry.translate(0, 1.302, Z0 - 0.012);
    parts.push(attach(collar, 'Spine'));
    const hood = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20, 0, TAU, 0, Math.PI * 0.62), mats.hood);
    hood.geometry.scale(0.125, 0.15, 0.07); hood.geometry.rotateX(-Math.PI * 0.62); hood.geometry.translate(0, 1.255, Z0 - 0.105);
    parts.push(attach(hood, 'Spine'));
    const hoodIn = new THREE.Mesh(hood.geometry.clone(), mats.hoodIn); parts.push(R.bones.Spine.add(hoodIn) && hoodIn);
    // drawcords
    for (const s of [-1, 1]) {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.12, 6), mats.cord);
      cord.geometry.translate(s * 0.032, 1.235, Z0 + 0.115); cord.geometry.rotateZ(0); parts.push(attach(cord, 'Spine01'));
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.016, 8), mats.metal);
      tip.geometry.translate(s * 0.032, 1.17, Z0 + 0.115); parts.push(attach(tip, 'Spine01'));
    }
    // sleeves: fitted to the posed arm if possible
    if (R.arms) {
      for (const side of [1, -1]) {
        const sl = R.arms[side];
        // least-squares quadratic x(y), z(y) → smooth centre-line through noisy slices
        const fit = (key) => {
          let S = [0, 0, 0, 0, 0], T = [0, 0, 0];
          for (const q of sl) { const y = q.c.y, v = q.c[key]; S[0]++; S[1] += y; S[2] += y * y; S[3] += y ** 3; S[4] += y ** 4; T[0] += v; T[1] += v * y; T[2] += v * y * y; }
          const M = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
          const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
          const D = det(M), col = (k) => M.map((row, i) => row.map((x, j) => (j === k ? T[i] : x)));
          const a = [det(col(0)) / D, det(col(1)) / D, det(col(2)) / D];
          return (y) => a[0] + a[1] * y + a[2] * y * y;
        };
        const fx = fit('x'), fz = fit('z');
        const yTop = sl[0].c.y + 0.005, yBot = sl[sl.length - 1].c.y + 0.045;
        const rs = sl.map((q) => q.r).sort((a, b) => a - b), rMed = Math.min(0.04, Math.max(0.026, rs[rs.length >> 1]));
        const pts = [];
        const n = 10;
        for (let i = 0; i <= n; i++) { const y = lerp(yTop, yBot, i / n); pts.push([fx(y), y, fz(y)]); }
        pts[0][0] -= side * 0.012; pts[0][1] += 0.02;               // start a bit inside the shoulder
        const radiusAt = (t) => lerp(rMed * 1.25 + 0.022, rMed * 1.1 + 0.014, t) + Math.sin(t * Math.PI) * 0.005;
        const { g, curve } = tubeGeometry(pts, radiusAt, 28, 48);
        const sleeve = new THREE.Mesh(g, mats.sleeve); R.doll.add(sleeve); parts.push(sleeve);
        const e1 = curve.getPointAt(1), tan = curve.getTangentAt(1);
        const cuff = tubeGeometry([curve.getPointAt(0.94).toArray(), e1.toArray(), e1.clone().add(tan.multiplyScalar(0.03)).toArray()], () => rMed * 1.05 + 0.012, 24, 6);
        const cm = new THREE.Mesh(cuff.g, mats.rib); R.doll.add(cm); parts.push(cm);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(radiusAt(0) * 1.08, 24, 16), mats.sleeve);
        cap.position.set(...pts[0]); cap.position.y -= 0.01; R.doll.add(cap); parts.push(cap);
      }
    } else for (const [side, bone] of [[1, 'LeftArm'], [-1, 'RightArm']]) {
      const pts = ARM_L.map(([x, y, z]) => [x * side, y, z]);
      const { g, curve } = tubeGeometry(pts, SLEEVE_R);
      parts.push(attach(new THREE.Mesh(g, mats.sleeve), bone));
      const cuff = tubeGeometry([curve.getPointAt(0.9).toArray(), curve.getPointAt(1).toArray(), curve.getPointAt(1).clone().add(curve.getTangentAt(1).multiplyScalar(0.03)).toArray()], () => 0.034, 24, 6);
      parts.push(attach(new THREE.Mesh(cuff.g, mats.rib), bone));
      // shoulder cap so the sleeve blends into the torso
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.056, 24, 16), mats.sleeve);
      cap.geometry.scale(1.05, 0.95, 1.05); cap.geometry.translate(side * 0.172, 1.245, 0.074);
      parts.push(attach(cap, bone));
    }
    const group = { parts, mats, dispose() { parts.forEach((m) => { m.removeFromParent(); }); } };
    return group;
  }
  async function get(product) {
    await ready;
    if (cache.has(product.id)) return cache.get(product.id);
    if (!building.has(product.id)) building.set(product.id, buildGarment(product).then((g) => { g.parts.forEach((m) => (m.visible = false)); cache.set(product.id, g); return g; }));
    return building.get(product.id);
  }
  // synchronous swap for already-built garments (used per box, per frame)
  function show(id) {
    if (shown === id) return true;
    const g = cache.get(id); if (!g) return false;
    if (shown && cache.get(shown)) cache.get(shown).parts.forEach((m) => (m.visible = false));
    g.parts.forEach((m) => (m.visible = true)); shown = id; return true;
  }
  // race-safe: the last requested product wins even if an earlier one finishes building later
  async function wear(product) {
    if (!product?.garment) return false;
    want = product.id;
    await get(product);
    if (want !== product.id) return false;
    show(product.id); return true;
  }
  async function bake(product) {
    await wear(product);
    const g = cache.get(product.id); if (!g) return null;
    R.doll.updateMatrixWorld(true);
    const rootInv = R.doll.matrixWorld.clone().invert();
    const out = new THREE.Group(); out.name = 'hoodie-' + product.id;
    const inner = new THREE.MeshStandardMaterial({ color: 0x0c0a0c, roughness: 1, side: THREE.BackSide });
    for (const m of g.parts) {
      if (!m.isMesh) continue;
      const geo = m.geometry.clone().applyMatrix4(rootInv.clone().multiply(m.matrixWorld));
      const mat = m.material.clone(); mat.side = THREE.FrontSide;
      if (mat.map) { mat.map = mat.map.clone(); mat.map.userData.mimeType = 'image/jpeg'; mat.map.needsUpdate = true; }
      out.add(new THREE.Mesh(geo, mat));
      if (m.material.side !== THREE.BackSide) out.add(new THREE.Mesh(geo, inner));
    }
    return out;
  }
  return { ready, R, get, show, wear, pose, bake, get doll() { return R.doll; } };
}

/* ---------------- viewer ---------------- */
export function createViewer(canvas, { onReady, onProgress, onZoom } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const rig = createRig({ onProgress, maxAniso });

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environmentIntensity = 0.35;

  const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 30);
  const look = new THREE.Vector3(0, 0.86, 0);
  const cam = { dist: 4.9, y: 1.0, ty: 0.84, zoom: 0 };

  // lights: soft key, cool rim, accent from below
  scene.add(new THREE.HemisphereLight(0xf2ece8, 0x1a1418, 0.9));
  const key = new THREE.DirectionalLight(0xfff4ec, 2.3); key.position.set(1.6, 2.8, 2.8); scene.add(key);
  const rim = new THREE.DirectionalLight(0xc9d6ff, 1.4); rim.position.set(-2, 2, -2.5); scene.add(rim);
  const accent = new THREE.PointLight(0xff2e88, 2.2, 2); accent.position.set(0, 0.12, 0.9); scene.add(accent);

  // stand
  const turntable = new THREE.Group(); scene.add(turntable);
  const ped = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 96), new THREE.MeshStandardMaterial({ color: 0x0f0d0f, roughness: 0.55, metalness: 0.1, envMapIntensity: 0.3 }));
  top.position.y = -0.03;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.7, 0.16, 96), new THREE.MeshStandardMaterial({ color: 0x0c0b0c, roughness: 0.8 }));
  base.position.y = -0.14;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.605, 0.006, 8, 160), new THREE.MeshBasicMaterial({ color: 0xff2e88 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.0005;
  // tick marks on the stand rim (makes the rotation readable)
  const ticks = new THREE.Group();
  for (let i = 0; i < 48; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: i % 12 === 0 ? 0xece6e1 : 0x4a4448 }));
    const a = (i / 48) * TAU; m.position.set(Math.sin(a) * 0.645, -0.11, Math.cos(a) * 0.645); m.rotation.y = a; ticks.add(m);
  }
  ped.add(top, base, ring, ticks); turntable.add(ped);
  // contact shadow
  const sc = document.createElement('canvas'); sc.width = sc.height = 128; const sg = sc.getContext('2d');
  const gr = sg.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); sg.fillStyle = gr; sg.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002; turntable.add(shadow);


  const st = {
    active: true, visible: true, yaw: 0.3, vel: 0, target: null, drag: false, lastX: 0, lastT: 0, moved: 0,
    idle: 0, auto: true, swayT: 0, doll: null, pop: 0,
  };
  const ready = rig.ready.then((doll) => { st.doll = doll; turntable.add(doll); onReady && onReady(); });
  async function wear(product) {
    await ready;
    const ok = await rig.wear(product);
    if (!ok) return;
    st.pop = 1;
    st.spin = { from: st.target != null ? st.target : st.yaw, t: 0 }; st.target = null; st.vel = 0; // one full turn on swap
  }

  /* ---------- interaction ---------- */
  const onDown = (e) => { st.drag = true; st.lastX = e.clientX; st.lastT = performance.now(); st.moved = 0; st.auto = false; st.target = null; canvas.setPointerCapture(e.pointerId); canvas.classList.add('grabbing'); };
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    st.hx = THREE.MathUtils.clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1) * 0.5;
    st.hy = THREE.MathUtils.clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1) * 0.2;
    if (!st.drag) return;
    const dx = e.clientX - st.lastX, now = performance.now();
    st.yaw += dx * 0.011; st.vel = (dx * 0.011) / Math.max(0.008, (now - st.lastT) / 1000); st.spin = null;
    st.lastX = e.clientX; st.lastT = now; st.moved += Math.abs(dx); st.idle = 0;
  };
  const onUp = () => { st.drag = false; canvas.classList.remove('grabbing'); };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('dblclick', () => api.zoom(!cam.zoom));
  // wheel over the doll zooms instead of scrolling the page behind
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.zoom = THREE.MathUtils.clamp(cam.zoom + (e.deltaY < 0 ? 0.12 : -0.12), 0, 1); onZoom && onZoom(cam.zoom); }, { passive: false });

  new IntersectionObserver(([en]) => (st.visible = en.isIntersecting), { threshold: 0.01 }).observe(canvas);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    const pr = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) {
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
  }
  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    if (!st.active || !st.visible || document.hidden) { clock.getDelta(); return; }
    resize();
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    if (st.spin && !st.drag) {
      st.spin.t = Math.min(1, st.spin.t + dt / 1.1);
      const e = st.spin.t < 0.5 ? 4 * st.spin.t ** 3 : 1 - Math.pow(-2 * st.spin.t + 2, 3) / 2;
      st.yaw = st.spin.from + e * TAU; if (st.spin.t >= 1) { st.yaw = st.spin.from; st.spin = null; }
      st.idle = 0;
    } else if (!st.drag) {
      st.idle += dt;
      if (st.target != null) {
        // shortest path to a preset angle
        let d = ((st.target - st.yaw) % TAU + TAU * 1.5) % TAU - TAU / 2;
        st.yaw += d * Math.min(1, dt * 6); if (Math.abs(d) < 0.002) st.target = null; st.vel = 0;
      } else {
        st.vel *= Math.pow(0.03, dt); st.yaw += st.vel * dt;
        if (st.idle > 5 && !st.auto) { st.auto = true; st.swayT = 0; }
        if (st.auto) {
          // idle: ease back to the front, then sway gently (never shows the back on its own)
          st.swayT += dt;
          const near = ((st.yaw % TAU) + TAU * 1.5) % TAU - TAU / 2; // wrap to [-π, π]
          if (Math.abs(st.yaw - near) > 1e-6) st.yaw = near;
          const goal = Math.sin(st.swayT * 0.45) * 0.55;
          st.yaw = lerp(st.yaw, goal, Math.min(1, dt * 1.2));
        }
      }
    }
    turntable.rotation.y = st.yaw;
    if (st.doll) { rig.R.hx = st.hx || 0; rig.R.hy = st.hy || 0; rig.pose(t); }
    if (st.pop > 0) { st.pop = Math.max(0, st.pop - dt * 2.2); const s = 1 + Math.sin(st.pop * Math.PI) * 0.035; turntable.scale.set(s, s, s); }
    // camera: full body vs close-up on the chest; framing adapts to aspect
    const fitDist = camera.aspect < 0.8 ? 4.9 * (0.8 / camera.aspect) * 0.86 : 4.9;
    const tgtDist = lerp(fitDist, 1.6, cam.zoom), tgtY = lerp(0.84, 1.13, cam.zoom);
    cam.dist = lerp(cam.dist, tgtDist, Math.min(1, dt * 5)); cam.ty = lerp(cam.ty, tgtY, Math.min(1, dt * 5));
    camera.position.set(0, cam.ty + 0.12, cam.dist); look.set(0, cam.ty, 0); camera.lookAt(look);
    renderer.render(scene, camera);
  }
  frame();

  const api = {
    ready, wear, bake: (p) => rig.bake(p),
    view(which) { st.auto = false; st.idle = 0; st.target = { front: 0, back: Math.PI, side: Math.PI / 2 }[which] ?? 0; },
    zoom(v) { cam.zoom = v ? 1 : 0; return cam.zoom; },
    spin() { st.auto = false; st.idle = 0; st.target = null; st.spin = { from: st.yaw, t: 0 }; },
    setActive(v) { st.active = v; },
  };
  return api;
}

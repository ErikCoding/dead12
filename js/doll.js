// dead12 — lalka 3D. Jeden plik GLB, dwie sceny:
//  'ona' → lalka na różowym piedestale w pudełku (obrót, kliknięcie = skok)
//  'on'  → portret „Prezes Zarządu” w złotej ramie (popiersie, światło sepia)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const MODEL_URL = 'assets/model/doll.glb';
let gltfPromise = null;

export function loadDoll(onProgress) {
  if (!gltfPromise) {
    gltfPromise = new Promise((res, rej) => {
      new GLTFLoader().load(MODEL_URL, res, (e) => {
        if (onProgress && e.total) onProgress(e.loaded / e.total);
      }, rej);
    });
  }
  return gltfPromise;
}

const lerp = (a, b, t) => a + (b - a) * t;
const ARM = 1.0; // how far the arms drop from the rig's A-pose

function poseDoll(root) {
  const b = (n) => root.getObjectByName(n);
  const bones = {
    head: b('Head'), neck: b('neck'), spine: b('Spine01'), spine2: b('Spine02'), hips: b('Hips'),
    lArm: b('LeftArm'), rArm: b('RightArm'), lFore: b('LeftForeArm'), rFore: b('RightForeArm'),
    lHand: b('LeftHand'), rHand: b('RightHand'),
  };
  const rest = {};
  for (const [k, v] of Object.entries(bones)) if (v) rest[k] = v.quaternion.clone();
  return { bones, rest };
}

// add a local rotation (euler, radians) on top of the bone's rest pose
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
function setBone(rig, key, x = 0, y = 0, z = 0) {
  const bone = rig.bones[key]; if (!bone) return;
  _e.set(x, y, z, 'XYZ'); _q.setFromEuler(_e);
  bone.quaternion.copy(rig.rest[key]).multiply(_q);
}

function makeStarTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 12 : 30, a = -Math.PI / 2 + i * Math.PI / 5;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export async function createDollStage(canvas, { theme = 'ona', onPoke } = {}) {
  const gltf = await loadDoll();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = theme === 'ona' ? 1.15 : 1.0;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environmentIntensity = theme === 'ona' ? 0.55 : 0.35;

  const camera = new THREE.PerspectiveCamera(theme === 'ona' ? 28 : 24, 1, 0.1, 50);
  const target = new THREE.Vector3();

  // --- the doll
  const doll = SkeletonUtils.clone(gltf.scene);
  doll.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.frustumCulled = false;
      const m = o.material.clone();
      m.metalness = 0; m.roughness = theme === 'ona' ? 0.5 : 0.62;
      if (theme === 'on') m.color = new THREE.Color('#f1dcc0');
      o.material = m;
    }
  });
  const rig = poseDoll(doll);
  const turntable = new THREE.Group();
  turntable.add(doll);
  scene.add(turntable);

  // --- lights
  if (theme === 'ona') {
    scene.add(new THREE.HemisphereLight(0xffd6ea, 0x2a0b24, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2, 3, 3); scene.add(key);
    const rimL = new THREE.PointLight(0xff0a84, 18, 6); rimL.position.set(-1.6, 1.6, -1); scene.add(rimL);
    const rimR = new THREE.PointLight(0xb99ad6, 12, 6); rimR.position.set(1.6, 1.0, -1.2); scene.add(rimR);
    const under = new THREE.PointLight(0xff0a84, 6, 3); under.position.set(0, 0.15, 0.9); scene.add(under);

    // pedestal
    const ped = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.12, 96),
      new THREE.MeshPhysicalMaterial({ color: 0x3b0a2b, roughness: 0.25, metalness: 0.2, clearcoat: 1 }));
    base.position.y = -0.06;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.635, 0.012, 12, 128),
      new THREE.MeshBasicMaterial({ color: 0xff74b8 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.001;
    const ring2 = ring.clone(); ring2.scale.setScalar(1.07); ring2.position.y = -0.11;
    ped.add(base, ring, ring2);
    turntable.add(ped);

    // floating stars
    const N = 70, pos = new Float32Array(N * 3), seeds = [];
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.7 + Math.random() * 0.9;
      pos.set([Math.cos(a) * r, Math.random() * 2.1, Math.sin(a) * r - 0.2], i * 3); seeds.push(Math.random() * 10);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.07, map: makeStarTexture(), color: 0xff4fa3,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(stars);
    scene.userData.stars = { stars, seeds, base: pos.slice() };

    camera.position.set(0, 1.0, 4.0); target.set(0, 0.88, 0);
  } else {
    scene.add(new THREE.HemisphereLight(0xfff0d8, 0x1a120a, 0.7));
    const key = new THREE.SpotLight(0xffd59a, 40, 10, 0.5, 0.6); key.position.set(-1.6, 2.8, 2.4); key.target.position.set(0, 1.3, 0);
    scene.add(key, key.target);
    const rim = new THREE.PointLight(0xb08a4e, 10, 5); rim.position.set(1.4, 1.8, -1); scene.add(rim);
    camera.position.set(0, 1.36, 2.55); target.set(0, 1.28, 0);
  }
  camera.lookAt(target);

  // --- interaction state
  const st = {
    active: true, visible: true, mx: 0, my: 0, hx: 0, hy: 0,
    yaw: theme === 'ona' ? 0 : -0.25, yawV: 0, dragging: false, lastX: 0, moved: 0,
    jump: -1, t0: performance.now(),
  };

  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    st.mx = THREE.MathUtils.clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1.5, 1.5);
    st.my = THREE.MathUtils.clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1.5, 1.5);
    if (st.dragging) {
      const dx = e.clientX - st.lastX; st.lastX = e.clientX; st.moved += Math.abs(dx);
      st.yawV = dx * 0.012; st.yaw += st.yawV;
    }
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  if (theme === 'ona') {
    canvas.addEventListener('pointerdown', (e) => { st.dragging = true; st.lastX = e.clientX; st.moved = 0; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointerup', () => {
      st.dragging = false;
      if (st.moved < 6) { st.jump = 0; onPoke && onPoke(); }
    });
    canvas.addEventListener('pointercancel', () => { st.dragging = false; });
  }

  // render only when on screen
  new IntersectionObserver(([en]) => { st.visible = en.isIntersecting; }, { threshold: 0.01 }).observe(canvas);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // keep the full doll in frame on narrow boxes
      if (theme === 'ona') camera.position.z = Math.max(4.0, 4.0 * (0.6 / camera.aspect));
      camera.updateProjectionMatrix();
    }
  }

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    if (!st.active || !st.visible) return;
    resize();
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;

    // head follows pointer
    st.hx = lerp(st.hx, st.mx, 0.06); st.hy = lerp(st.hy, st.my, 0.06);
    const breathe = Math.sin(t * 1.6);

    if (theme === 'ona') {
      // arms down, slightly bent, doll-like stiffness with a tiny sway
      // bone axes (this rig): arm Y = raise/lower, head X = pitch, Z = yaw, Y = roll
      setBone(rig, 'lArm', 0, -ARM + breathe * 0.02, 0);
      setBone(rig, 'rArm', 0, ARM - breathe * 0.02, 0);
      setBone(rig, 'spine', breathe * 0.012, Math.sin(t * 0.8) * 0.02, 0);
      setBone(rig, 'head', st.hy * 0.3, Math.sin(t * 0.7) * 0.06 + st.hx * 0.08, -st.hx * 0.6 + st.yaw * 0.1);

      if (!st.dragging) { st.yawV *= 0.94; st.yaw += st.yawV; st.yaw = lerp(st.yaw, Math.sin(t * 0.35) * 0.35, 0.01); }
      turntable.rotation.y = st.yaw;

      // poke → hop + full spin
      if (st.jump >= 0) {
        st.jump += dt;
        const k = Math.min(st.jump / 0.9, 1);
        doll.position.y = Math.sin(k * Math.PI) * 0.35;
        doll.rotation.y = k * Math.PI * 2;
        setBone(rig, 'lArm', 0, -ARM + Math.sin(k * Math.PI) * 1.9, 0);
        setBone(rig, 'rArm', 0, ARM - Math.sin(k * Math.PI) * 1.9, 0);
        if (k >= 1) { st.jump = -1; doll.position.y = 0; doll.rotation.y = 0; }
      }

      const s = scene.userData.stars;
      if (s) {
        const p = s.stars.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          p.array[i * 3 + 1] = (s.base[i * 3 + 1] + t * 0.08 * (0.5 + (s.seeds[i] % 1))) % 2.2;
          p.array[i * 3] = s.base[i * 3] + Math.sin(t + s.seeds[i]) * 0.04;
        }
        p.needsUpdate = true;
        s.stars.rotation.y = t * 0.05;
      }
    } else {
      // portrait: arms down, regal, slow eyes-on-you
      setBone(rig, 'lArm', 0, -ARM, 0);
      setBone(rig, 'rArm', 0, ARM, 0);
      setBone(rig, 'spine', breathe * 0.008, 0, 0);
      setBone(rig, 'head', st.hy * 0.12 + 0.05, 0.08, -st.hx * 0.35 - 0.15);
      turntable.rotation.y = lerp(turntable.rotation.y, -0.28 + st.hx * 0.08, 0.04);
    }

    renderer.render(scene, camera);
  }
  frame();

  return {
    setActive(v) { st.active = v; if (v) clock.getDelta(); },
    poke() { st.jump = 0; },
  };
}

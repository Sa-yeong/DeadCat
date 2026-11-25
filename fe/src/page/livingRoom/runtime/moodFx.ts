import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { pickGroundSamples, type GroundSample } from './grounding';
import { cloudHeight, convexHull, JITTER, RAIN_CLOUD } from './motionFx';

/**
 * 감정 이펙트(거실모션 H-6) — 테스트 랩 template.html 의 puffTexture · RainCloud · zigzagTexture · hairColorOf · Jitter 를 앱 구조에 맞춘 것.
 * 값은 motionFx(RAIN_CLOUD · JITTER) 한 곳. 언제 켜고 끌지는 RoomScene(감정 · 엔진 모션)이 정한다.
 * 앱의 방 그룹(root)은 높이를 hs(H_STRETCH) 배 늘린다 — 먹구름은 장면에 바로 두고(스프라이트가 찌그러지지 않게) 방 높이(칸)만 hs 를 곱한다
 */

/* ── 공용 텍스처 — 렌더러 하나에 한 벌, 처음 쓸 때 만든다 ─────────────── */

/** 먹구름 뭉치 — 코드로 그린 둥근 혹 + 아랫단 어둡게(그림 파일 없음) */
function puffTexture(seed: number): THREE.CanvasTexture {
  const N = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d')!;
  let r = seed * 9301 + 49297;
  const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  const blob = (cx: number, cy: number, rr: number, a: number) => {
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(0.72, `rgba(255,255,255,${a * 0.92})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cy, rr, 0, Math.PI * 2);
    g.fill();
  };
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd() * 0.5;
    const d = N * (0.12 + rnd() * 0.06);
    blob(N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d * 0.8, N * (0.19 + rnd() * 0.06), 0.95);
  }
  blob(N / 2, N / 2, N * 0.34, 1);
  g.globalCompositeOperation = 'source-atop';
  const sh = g.createLinearGradient(0, N * 0.2, 0, N * 0.85);
  sh.addColorStop(0, 'rgba(255,255,255,0.10)');
  sh.addColorStop(0.45, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(10,0,30,0.45)');
  g.fillStyle = sh;
  g.fillRect(0, 0, N, N);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 저릿저릿 자국 — 검은 테두리 + 안쪽 색 지그재그 */
function zigzagTexture(peaks: number, color: string): THREE.CanvasTexture {
  const W = 40 + 40 * peaks;
  const H = 64;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const pts: [number, number][] = [];
  const n = peaks * 2;
  for (let i = 0; i <= n; i++) pts.push([14 + ((W - 28) * i) / n, i % 2 ? 12 : H - 12]);
  const path = () => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  };
  g.lineJoin = 'round';
  g.lineCap = 'round';
  if (JITTER.edgeAlpha > 0 && JITTER.edgeLine > 0) {
    path();
    g.strokeStyle = JITTER.edge;
    g.globalAlpha = JITTER.edgeAlpha;
    g.lineWidth = JITTER.edgeLine;
    g.stroke();
  }
  path();
  g.strokeStyle = color;
  g.globalAlpha = 1;
  g.lineWidth = JITTER.line;
  g.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class MoodAssets {
  private puffs: THREE.CanvasTexture[] | null = null;
  private readonly zig = new Map<string, [THREE.CanvasTexture, THREE.CanvasTexture]>();

  puffTex(): THREE.CanvasTexture[] {
    return (this.puffs ??= [1, 2, 3, 4].map(puffTexture));
  }

  /** 색별 지그재그 두 장(봉우리 수가 다른 것 — mix) */
  zigTex(color: string): [THREE.CanvasTexture, THREE.CanvasTexture] {
    let pair = this.zig.get(color);
    if (!pair) {
      pair = [zigzagTexture(JITTER.peaks, color), zigzagTexture(JITTER.mix ? JITTER.peaks + 1 : JITTER.peaks, color)];
      this.zig.set(color, pair);
    }
    return pair;
  }

  dispose(): void {
    for (const t of this.puffs ?? []) t.dispose();
    this.puffs = null;
    for (const pair of this.zig.values()) for (const t of pair) t.dispose();
    this.zig.clear();
  }
}

/* ── 머리카락 색 ───────────────────────────────────────────── */

/** 머리 재질(이름에 Hair, Outline 제외)이 쓰는 UV 자리만 텍스처에서 집어 밝기 60~90% 구간 평균 × 재질 색. 못 읽으면 null */
export function hairColorOf(vrm: VRM): string | null {
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  const imgData = new Map<unknown, Uint8ClampedArray>();
  const px: [number, number, number][] = [];
  vrm.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const uv = mesh.isMesh ? mesh.geometry?.getAttribute('uv') : undefined;
    if (!uv) return;
    const mats = ([] as THREE.Material[]).concat(mesh.material);
    const index = mesh.geometry.index;
    const groups = mesh.geometry.groups.length ? mesh.geometry.groups : [{ start: 0, count: index ? index.count : uv.count, materialIndex: 0 }];
    for (const gr of groups) {
      const m = mats[gr.materialIndex ?? 0] as THREE.Material & { map?: THREE.Texture | null; color?: THREE.Color };
      if (!m || !/hair/i.test(m.name) || /outline/i.test(m.name)) continue;
      const img = m.map?.image as CanvasImageSource | undefined;
      if (!img) continue;
      if (!imgData.has(img)) {
        try {
          g.clearRect(0, 0, N, N);
          g.drawImage(img, 0, 0, N, N);
          imgData.set(img, g.getImageData(0, 0, N, N).data);
        } catch {
          continue;
        }
      }
      const d = imgData.get(img)!;
      const fs = (m.color ?? new THREE.Color(1, 1, 1)).clone().convertLinearToSRGB();
      const seen = new Set<number>();
      for (let k = gr.start; k < gr.start + gr.count; k += 3) {
        const vi = index ? index.getX(k) : k;
        if (seen.has(vi)) continue;
        seen.add(vi);
        let u = uv.getX(vi) % 1;
        let v = uv.getY(vi) % 1;
        if (u < 0) u += 1;
        if (v < 0) v += 1;
        const x = Math.min(N - 1, Math.floor(u * N));
        const y = Math.min(N - 1, Math.floor(v * N));
        const q = (y * N + x) * 4;
        if (d[q + 3] > 128) px.push([d[q] * fs.r, d[q + 1] * fs.g, d[q + 2] * fs.b]);
      }
    }
  });
  if (!px.length) return null;
  const lum = (p: [number, number, number]) => p[0] * 0.3 + p[1] * 0.59 + p[2] * 0.11;
  px.sort((a, b) => lum(a) - lum(b));
  const from = Math.floor(px.length * 0.6);
  const band = px.slice(from, Math.max(from + 1, Math.floor(px.length * 0.9)));
  const avg = [0, 1, 2].map((k) => band.reduce((s, p) => s + p[k], 0) / band.length);
  return '#' + avg.map((v) => Math.round(Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

/* ── 먹구름(우울) ────────────────────────────────────────────── */

interface Puff {
  sp: THREE.Sprite;
  base: THREE.Vector3;
  s: number;
  flat: number;
  ph: number;
  f: number;
  k: number;
}
interface Drop {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  v: number;
  end: number;
}
const COL = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
const MAX_DROPS = 160;
const SPLASHES = 30;

/**
 * 머리 위 보라 먹구름 — 늘 따라다니고, 비는 엔진 모션 중에만. 위치 · 빗방울은 방 좌표(x, 높이 칸, z)로 들고 장면에 놓을 때 높이만 hs 를 곱한다.
 * 긴 쪽 = 화면 가로(camTh) · 맨 앞(depthTest false)
 */
export class RainCloud {
  private readonly hs: number;
  private readonly camTh: number;
  private readonly faceCam: THREE.Quaternion;
  private readonly root = new THREE.Group();
  private readonly puffs: Puff[] = [];
  private readonly shadeG = new THREE.Group();
  private readonly shade: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private readonly drops: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly D: Drop[];
  private readonly spl: { m: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; t: number }[] = [];
  private splI = 0;
  private readonly W: number;
  private readonly Dp: number;
  private readonly H: number;
  /** 방 좌표(x, 높이 칸, z) — 늦게 따라가는 지금 자리 */
  private readonly pos = new THREE.Vector3();
  private init = false;
  private t = Math.random() * 10;
  private rain = 0;

  constructor(parent: THREE.Object3D, assets: MoodAssets, hs: number, camTh: number, faceCam: THREE.Quaternion) {
    const C = RAIN_CLOUD;
    const S = C.size;
    this.hs = hs;
    this.camTh = camTh;
    this.faceCam = faceCam;
    this.W = 1.75 * S;
    this.Dp = 0.95 * S;
    this.H = 0.6 * S;
    this.root.rotation.y = camTh; // 긴 쪽 = 화면 가로
    parent.add(this.root);
    let r = C.seed * 7919 + 13;
    const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
    const tex = assets.puffTex();
    const add = (x: number, y: number, z: number, s: number, flat: number, layer: number) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex[(rnd() * 4) | 0], transparent: true, depthTest: false, depthWrite: false }));
      sp.renderOrder = 1100 + layer * 50 + this.puffs.length;
      sp.material.rotation = (rnd() - 0.5) * 0.6;
      this.root.add(sp);
      this.puffs.push({ sp, base: new THREE.Vector3(x, y, z), s, flat, ph: rnd() * 6.28, f: 0.6 + rnd() * 0.7, k: THREE.MathUtils.clamp((y + this.H * 0.25) / (this.H * 0.95), 0, 1) });
    };
    const n = C.puffs;
    const nb = Math.max(3, Math.round(n * 0.55));
    for (let i = 0; i < nb; i++) {
      const t = nb === 1 ? 0.5 : i / (nb - 1);
      add((t - 0.5) * this.W * 0.82 + (rnd() - 0.5) * 0.1 * S, -this.H * 0.12 + (rnd() - 0.5) * 0.04 * S, (rnd() - 0.5) * this.Dp * 0.5, (0.5 + rnd() * 0.12) * S, 0.62, 0);
    }
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const arc = 1 - Math.pow(2 * t - 1, 2);
      add((t - 0.5) * this.W * 0.78 + (rnd() - 0.5) * 0.12 * S, arc * this.H * 0.5 + (rnd() - 0.3) * 0.08 * S, (rnd() - 0.5) * this.Dp * 0.55, (0.42 + 0.36 * arc + rnd() * 0.14) * S, 1, 1);
    }
    // 바닥 그늘
    this.shadeG.rotation.y = camTh;
    parent.add(this.shadeG);
    this.shade = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: '#1A1030', transparent: true, opacity: 0, depthWrite: false }));
    this.shade.rotation.x = -Math.PI / 2;
    this.shadeG.add(this.shade);
    // 비 — 카메라를 보는 얇은 판(InstancedMesh)
    this.drops = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: C.rain.color, transparent: true, opacity: 0.62, depthWrite: false }), MAX_DROPS);
    this.drops.frustumCulled = false;
    parent.add(this.drops);
    this.D = Array.from({ length: MAX_DROPS }, () => ({ alive: false, x: 0, y: 0, z: 0, v: 0, end: 0 }));
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_DROPS; i++) this.drops.setMatrixAt(i, zero);
    for (let i = 0; i < SPLASHES; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 20), new THREE.MeshBasicMaterial({ color: C.rain.color, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      parent.add(m);
      this.spl.push({ m, t: 1 });
    }
  }

  setVisible(on: boolean): void {
    this.root.visible = on;
    this.shadeG.visible = on;
    this.drops.visible = on;
    if (on) return;
    for (const s of this.spl) s.m.visible = false;
    this.rain = 0;
    for (const d of this.D) d.alive = false;
  }

  private spawn(d: Drop, surfaceAt: (x: number, z: number) => number): void {
    const R = RAIN_CLOUD.rain;
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random());
    const c = Math.cos(this.camTh);
    const s = Math.sin(this.camTh);
    const lx = Math.cos(a) * rr * this.W * 0.42 * R.width;
    const lz = Math.sin(a) * rr * this.Dp * 0.4 * R.width;
    d.x = this.pos.x + lx * c + lz * s;
    d.z = this.pos.z - lx * s + lz * c;
    d.end = surfaceAt(d.x, d.z);
    d.y = this.pos.y - this.H * 0.15;
    d.v = 6.5 * R.speed * (0.85 + Math.random() * 0.3);
    d.alive = true;
  }

  /**
   * 매 프레임. head = 머리 뼈 장면 좌표, headUp = 머리 뼈 → 정수리(칸), charHeight = 서 있을 때 키(칸, 하한선),
   * surfaceAt(x, z) = 그 자리 가구 윗면 높이(칸, 가구 밖이면 0)
   */
  update(dt: number, raining: boolean, head: THREE.Vector3, headUp: number, charHeight: number, surfaceAt: (x: number, z: number) => number): void {
    if (!this.root.visible) return;
    const C = RAIN_CLOUD;
    const R = C.rain;
    const hs = this.hs;
    this.t += dt;
    const want = new THREE.Vector3(head.x, cloudHeight(head.y / hs + headUp, 0, charHeight) + this.H * 0.25, head.z);
    if (!this.init) {
      this.pos.copy(want);
      this.init = true;
    }
    this.pos.lerp(want, 1 - Math.exp(-dt / Math.max(0.01, C.lag)));
    this.root.position.set(this.pos.x, this.pos.y * hs + Math.sin(this.t * 1.4) * C.bob, this.pos.z);
    this.rain = THREE.MathUtils.clamp(this.rain + ((raining ? 1 : -1) * dt) / R.fade, 0, 1);
    COL[0].set(C.color.top);
    COL[1].set(C.color.mid);
    COL[2].set(C.color.bottom);
    const dark = R.darkenCloud ? 1 - 0.22 * this.rain : 1;
    const w = C.wobble * C.size;
    for (const p of this.puffs) {
      p.sp.position.set(
        p.base.x + Math.sin(this.t * p.f + p.ph) * 0.03 * w,
        p.base.y + Math.sin(this.t * p.f * 1.3 + p.ph) * 0.025 * w,
        p.base.z + Math.cos(this.t * p.f * 0.7 + p.ph) * 0.02 * w,
      );
      const sc = p.s * (1 + (0.045 * w * Math.sin(this.t * p.f * 0.8 + p.ph)) / Math.max(C.size, 0.5));
      p.sp.scale.set(sc * 1.08, sc * p.flat, 1);
      const c = p.sp.material.color;
      if (p.k < 0.5) c.copy(COL[2]).lerp(COL[1], p.k * 2);
      else c.copy(COL[1]).lerp(COL[0], (p.k - 0.5) * 2);
      c.multiplyScalar(dark);
      p.sp.material.opacity = C.opacity;
    }
    this.shadeG.position.set(this.pos.x, surfaceAt(this.pos.x, this.pos.z) * hs + 0.006, this.pos.z);
    this.shade.scale.set(this.W * 0.5, this.Dp * 0.55, 1);
    this.shade.material.opacity = C.shade * (0.7 + 0.3 * this.rain);
    // 비
    const active = Math.round(140 * R.amount * this.rain);
    const len = 0.32 * R.length;
    const th = 0.022 * R.thickness;
    const m = new THREE.Matrix4();
    const v = new THREE.Vector3();
    const sc3 = new THREE.Vector3();
    const top = this.pos.y - this.H * 0.15;
    for (let i = 0; i < MAX_DROPS; i++) {
      const d = this.D[i];
      if (!d.alive) {
        if (i < active) this.spawn(d, surfaceAt);
        else continue;
      }
      d.y -= d.v * dt;
      if (d.y - len * 0.5 <= d.end) {
        if (R.splash && Math.random() < 0.7) {
          const s = this.spl[this.splI++ % this.spl.length];
          s.t = 0;
          s.m.position.set(d.x, d.end * hs + 0.012, d.z);
          s.m.visible = true;
        }
        if (i < active) this.spawn(d, surfaceAt);
        else {
          d.alive = false;
          this.drops.setMatrixAt(i, m.makeScale(0, 0, 0));
          continue;
        }
      }
      const visLen = Math.min(len, Math.max(0.02, top - d.y + len * 0.5));
      v.set(d.x, d.y * hs, d.z);
      sc3.set(th, visLen * hs, 1);
      this.drops.setMatrixAt(i, m.compose(v, this.faceCam, sc3));
    }
    this.drops.instanceMatrix.needsUpdate = true;
    for (const s of this.spl) {
      if (s.t >= 1) continue;
      s.t += dt / 0.32;
      if (s.t >= 1) {
        s.m.visible = false;
        continue;
      }
      const k = 0.04 + 0.13 * (1 - Math.pow(1 - s.t, 2));
      s.m.scale.set(k, k * 0.75, 1);
      s.m.material.opacity = 0.55 * (1 - s.t);
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.shadeG.removeFromParent();
    this.drops.removeFromParent();
    for (const p of this.puffs) p.sp.material.dispose();
    this.shade.geometry.dispose();
    this.shade.material.dispose();
    this.drops.geometry.dispose();
    this.drops.material.dispose();
    this.drops.dispose();
    for (const s of this.spl) {
      s.m.removeFromParent();
      s.m.geometry.dispose();
      s.m.material.dispose();
    }
  }
}

/* ── 저릿저릿(불안) ──────────────────────────────────────────── */

interface Mark {
  sp: THREE.Sprite;
  x: number;
  y: number;
  a: number;
  init: boolean;
  jx: number;
  jy: number;
  ja: number;
  flip: number;
  on: boolean;
}

/**
 * 몸 테두리를 따라 지그재그 자국 — 화면 맨 앞(별도 화면 좌표 장면 hud 에, 렌더러가 마지막에 그림).
 * 매 프레임 캐릭터 정점 표본(약 500개)을 화면에 투영 → 볼록 껍질 → 테두리 24곳 중 발밑 쪽(skipDown)을 뺀 곳에 count 개.
 * 크기 · 거리는 화면 px(확대 1 기준) × 줌
 */
export class Jitter {
  private readonly marks: Mark[];
  private level = 0;
  private t = 0;
  private next = 0;
  private samples: GroundSample[] | null = null;
  private sampledFrom: VRM | null = null;

  constructor(hud: THREE.Scene, assets: MoodAssets, color: string) {
    const tex = assets.zigTex(color);
    this.marks = Array.from({ length: JITTER.count }, (_, i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex[i % 2], transparent: true, depthTest: false, depthWrite: false }));
      sp.visible = false;
      hud.add(sp);
      return { sp, x: 0, y: 0, a: 0, init: false, jx: 0, jy: 0, ja: 0, flip: 1, on: true };
    });
  }

  /** 보이는 자국이 있는가 — 렌더러가 화면 장면을 그릴지 정한다 */
  get visible(): boolean {
    return this.level > 0;
  }

  update(dt: number, active: boolean, vrm: VRM, camera: THREE.Camera, W: number, H: number, zoom: number): void {
    this.level = THREE.MathUtils.clamp(this.level + ((active ? 1 : -1) * dt) / JITTER.fade, 0, 1);
    if (this.level <= 0) {
      for (const m of this.marks) m.sp.visible = false;
      return;
    }
    if (this.sampledFrom !== vrm) {
      this.samples = pickGroundSamples(vrm.scene, 500); // 모델을 갈아 끼우면 다시 고른다
      this.sampledFrom = vrm;
    }
    const v = new THREE.Vector3();
    const pts: [number, number][] = [];
    for (const s of this.samples!) {
      for (const i of s.idx) {
        s.mesh.getVertexPosition(i, v);
        v.applyMatrix4(s.mesh.matrixWorld).project(camera);
        pts.push([(v.x + 1) * 0.5 * W, (1 - v.y) * 0.5 * H]);
      }
    }
    const hull = convexHull(pts);
    if (hull.length < 3) return;
    const seg: { a: [number, number]; b: [number, number]; l: number; s: number }[] = [];
    let L = 0;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i];
      const b = hull[(i + 1) % hull.length];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      seg.push({ a, b, l, s: L });
      L += l;
    }
    let cx = 0;
    let cy = 0;
    for (const q of hull) {
      cx += q[0];
      cy += q[1];
    }
    cx /= hull.length;
    cy /= hull.length;
    const top = hull.reduce((m, q, i) => (q[1] < hull[m][1] ? i : m), 0);
    const start = seg[top].s;
    const cand: { x: number; y: number; nx: number; ny: number; ang: number }[] = [];
    for (let k = 0; k < 24; k++) {
      const d = (start + (L * k) / 24) % L;
      const sg = seg.find((x) => d >= x.s && d <= x.s + x.l) ?? seg[seg.length - 1];
      const u = sg.l ? (d - sg.s) / sg.l : 0;
      const x = sg.a[0] + (sg.b[0] - sg.a[0]) * u;
      const y = sg.a[1] + (sg.b[1] - sg.a[1]) * u;
      let nx = sg.b[1] - sg.a[1];
      let ny = -(sg.b[0] - sg.a[0]);
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      if ((x - cx) * nx + (y - cy) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      if (ny > JITTER.skipDown) continue; // 발밑 쪽 테두리는 빼기
      cand.push({ x, y, nx, ny, ang: Math.atan2(sg.b[1] - sg.a[1], sg.b[0] - sg.a[0]) });
    }
    this.t += dt;
    const shake = this.t >= this.next;
    if (shake) this.next = this.t + JITTER.rate;
    const size = JITTER.size * zoom;
    this.marks.forEach((m, i) => {
      const c = cand[Math.floor(((i + 0.5) * cand.length) / this.marks.length)];
      if (!c) {
        m.sp.visible = false;
        return;
      }
      let a = c.ang;
      if (a > Math.PI / 2) a -= Math.PI;
      if (a < -Math.PI / 2) a += Math.PI; // 글자처럼 뒤집히지 않게
      const tx = c.x + c.nx * (JITTER.offset * zoom + size * 0.32);
      const ty = c.y + c.ny * (JITTER.offset * zoom + size * 0.32);
      if (!m.init) {
        m.x = tx;
        m.y = ty;
        m.a = a;
        m.init = true;
      }
      const k = 1 - Math.exp(-dt / 0.06);
      m.x += (tx - m.x) * k;
      m.y += (ty - m.y) * k;
      m.a += (a - m.a) * k;
      if (shake) {
        m.jx = (Math.random() - 0.5) * 2 * JITTER.amp * zoom;
        m.jy = (Math.random() - 0.5) * 2 * JITTER.amp * zoom;
        m.ja = (Math.random() - 0.5) * 2 * JITTER.spin;
        m.flip = Math.random() < 0.5 ? 1 : -1;
        m.on = Math.random() > JITTER.flicker;
      }
      m.sp.visible = m.on;
      m.sp.position.set(m.x + m.jx, -(m.y + m.jy), 0);
      const img = m.sp.material.map!.image as { width: number };
      const ar = img.width / 160;
      const pop = 0.75 + 0.25 * this.level;
      m.sp.scale.set(size * ar * pop * m.flip, size * JITTER.aspect * pop, 1);
      m.sp.material.rotation = -(m.a + m.ja);
      m.sp.material.opacity = this.level;
    });
  }

  dispose(): void {
    for (const m of this.marks) {
      m.sp.removeFromParent();
      m.sp.material.dispose();
    }
  }
}

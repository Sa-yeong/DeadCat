import * as THREE from 'three';
import { DUST } from './motionFx';

/**
 * 가구 박살 흙먼지(G-2) — 가구박살_먼지_미리보기.html 의 blobTexture · smash · updateBursts 를 앱에 옮긴 것. 값은 DUST(motionFx) 한 곳.
 * 작게 시작해 부풀며 피어올랐다(DUST.rise) 걷힌다(DUST.dur). 스프라이트는 깊이 검사 없이 맨 앞에 — 앞의 가구 · 캐릭터를 덮어도 된다(도휘 11-23).
 * 여러 개가 동시에 돌 수 있다. 끝나면 스프라이트 · 재질을 버린다(텍스처 3장은 처음 한 번 만들어 계속 쓴다)
 */

/** 코드로 그린 뭉게 얼룩(그림 파일 없음) — 둥근 혹 여러 개 + 꽉 찬 가운데 + 아래쪽을 살짝 어둡게 */
function blobTexture(seed: number): THREE.CanvasTexture {
  const N = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d')!;
  let r = seed * 9301 + 49297;
  const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  const lumps = 7;
  for (let i = 0; i < lumps; i++) {
    const a = (i / lumps) * Math.PI * 2 + rnd() * 0.6;
    const d = N * (0.13 + rnd() * 0.08);
    const cx = N / 2 + Math.cos(a) * d;
    const cy = N / 2 + Math.sin(a) * d;
    const rr = N * (0.2 + rnd() * 0.08);
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.75)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cy, rr, 0, Math.PI * 2);
    g.fill();
  }
  const gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N * 0.36);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.7, 'rgba(255,255,255,0.9)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(N / 2, N / 2, N * 0.36, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'source-atop';
  const sh = g.createLinearGradient(0, N * 0.25, 0, N);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(60,40,20,0.35)');
  g.fillStyle = sh;
  g.fillRect(0, 0, N, N);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const easeOutBack = (t: number) => 1 + 2.6 * (t - 1) ** 3 + 1.6 * (t - 1) ** 2;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
/** 먼지는 맨 앞에 — 캐릭터 몸(BODY_ORDER 2) · 테두리보다 늦게 */
const DUST_ORDER = 1000;

interface Puff {
  sp: THREE.Sprite;
  p0: THREE.Vector3;
  p1: THREE.Vector3;
  ground: boolean;
  delay: number;
  s1: number;
  spin: number;
  op: number;
}

export class DustBursts {
  private readonly parent: THREE.Object3D;
  /** 높이 보정(방 높이 1칸 → 장면 높이) — 스프라이트가 찌그러지지 않게 방 그룹 밖에 두고 높이만 곱한다 */
  private readonly hStretch: number;
  private blobs: THREE.CanvasTexture[] | null = null;
  private readonly bursts: { grp: THREE.Group; puffs: Puff[]; t: number }[] = [];

  constructor(parent: THREE.Object3D, hStretch: number) {
    this.parent = parent;
    this.hStretch = hStretch;
  }

  /**
   * 터뜨린다 — center 는 장면 좌표(설치 영역 가운데 바닥), rotY 는 가구 회전(장면 Y축), w · d · h 는 설치 영역 · 키(칸)
   */
  burst(center: THREE.Vector3, rotY: number, w: number, d: number, h: number): void {
    this.blobs ??= [blobTexture(1), blobTexture(2), blobTexture(3)];
    const grp = new THREE.Group();
    const puffs: Puff[] = [];
    const base = Math.max(w, d) * 0.42 * DUST.size;
    const n = DUST.count;
    for (let i = 0; i < n; i++) {
      const ground = i < Math.round(n * 0.3); // 30% 는 바닥을 따라 옆으로 퍼지는 낮은 뭉치
      const u = Math.random() - 0.5;
      const v = Math.random() - 0.5;
      const p0 = new THREE.Vector3(u * w * 0.8, ground ? 0.15 : 0.2 + Math.random() * h * 0.85, v * d * 0.8);
      const out = new THREE.Vector3(u, 0, v);
      if (out.lengthSq() < 1e-4) out.set(1, 0, 0);
      out.normalize();
      const reach = (ground ? 0.9 : 0.45) * DUST.spread * DUST.size * (0.6 + Math.random() * 0.6);
      const p1 = p0.clone().addScaledVector(out, reach * Math.max(w, d) * 0.5);
      p1.y += ground ? 0.05 : 0.25 + Math.random() * 0.45; // 위로 피어오름
      p0.y *= this.hStretch;
      p1.y *= this.hStretch;
      const mat = new THREE.SpriteMaterial({
        map: this.blobs[i % 3],
        color: DUST.colors[(Math.random() * DUST.colors.length) | 0],
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
      });
      mat.rotation = Math.random() * Math.PI * 2;
      const sp = new THREE.Sprite(mat);
      sp.renderOrder = DUST_ORDER + i;
      sp.visible = false;
      grp.add(sp);
      puffs.push({
        sp, p0, p1, ground,
        delay: Math.random() * 0.08 + (ground ? 0.04 : 0),
        s1: base * (ground ? 0.75 : 0.85 + Math.random() * 0.55),
        spin: (Math.random() - 0.5) * 0.8,
        op: DUST.dens * (0.85 + Math.random() * 0.15),
      });
    }
    grp.position.copy(center);
    grp.rotation.y = rotY;
    this.parent.add(grp);
    this.bursts.push({ grp, puffs, t: 0 });
  }

  /** 매 프레임 — 아직 도는 먼지가 있으면 true(계속 그려야 함) */
  update(dt: number): boolean {
    for (let k = this.bursts.length - 1; k >= 0; k--) {
      const b = this.bursts[k];
      b.t += dt;
      for (const p of b.puffs) {
        const t = b.t - p.delay;
        if (t < 0) {
          p.sp.visible = false;
          continue;
        }
        p.sp.visible = true;
        const tin = clamp01(t / DUST.rise); // 부풀기 0 → 1
        const tout = clamp01((t - DUST.rise) / Math.max(0.01, DUST.dur - DUST.rise)); // 걷히기 0 → 1
        const sc = p.s1 * (0.15 + 0.85 * easeOutBack(tin)) * (1 + 0.3 * easeOut(tout));
        p.sp.scale.set(sc, sc * (p.ground ? 0.7 : 1), 1);
        p.sp.position.lerpVectors(p.p0, p.p1, easeOut(clamp01(t / DUST.dur)));
        const mat = p.sp.material;
        mat.opacity = p.op * easeOut(tin) * (1 - tout * tout * (3 - 2 * tout)); // 걷힘은 부드럽게(smoothstep)
        mat.rotation += p.spin * dt;
      }
      if (b.t >= DUST.dur + 0.15) {
        this.drop(b);
        this.bursts.splice(k, 1);
      }
    }
    return this.bursts.length > 0;
  }

  private drop(b: { grp: THREE.Group; puffs: Puff[] }): void {
    b.grp.removeFromParent();
    for (const p of b.puffs) p.sp.material.dispose();
  }

  dispose(): void {
    for (const b of this.bursts.splice(0)) this.drop(b);
    for (const t of this.blobs ?? []) t.dispose();
    this.blobs = null;
  }
}

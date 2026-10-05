import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import {
  VRMAnimationLoaderPlugin,
  VRMLookAtQuaternionProxy,
  createVRMAnimationClip,
  type VRMAnimation,
} from '@pixiv/three-vrm-animation';
import {
  CROSSFADE_S,
  FACE_RISE_S,
  MOTIONS,
  faceValue,
  type FaceTrack,
  type MotionName,
} from './motionTable';
import { StageEnvironment } from './StageEnvironment';

/** 화면에서 캐릭터를 어디에 걸지 — 페이지 좌표(px). layout.ts 가 계산한다 */
export interface Framing {
  /** 캔버스 크기 = 무대 전체 */
  width: number;
  height: number;
  /** 머리 꼭대기가 올 높이 */
  headTop: number;
  /** 골반(hips 뼈)이 올 높이 */
  hips: number;
  /** 몸 가운데가 올 가로 위치 */
  centerX: number;
  /** 지평선(바닥이 무한히 멀어지는 선)이 올 높이 — 카메라 눈높이가 화면 어디에 걸리는가 */
  horizon: number;
  /** 소실점 가로 위치 — 바닥 세로선이 모이는 곳(창문 가운데) */
  vanishX: number;
}

/** 지금 얹혀 있는 표정 한 겹. 모션이 바뀌면 이전 겹은 서서히 빠진다 */
interface FaceLayer {
  tracks: FaceTrack[];
  start: number;
  fadeOutAt: number | null;
  /** 빠지는 데 걸리는 시간(초) — 다음 모션으로 넘어갈 때의 섞는 시간 */
  fadeDur: number;
  once: boolean;
}

/** 망원에 가까운 화각 — 원근 왜곡이 적어 정면 일러스트와 비슷하게 보인다 */
const FOV = 20;

/**
 * 창틀 안에서 보이는 1인 씬. **어떻게 그릴지만** 안다.
 * 무엇을 틀지(감정 → 모션, 클릭 반응)는 StockStageLoop 가 정한다.
 *
 * 한 번만 그린다. 창문 밖이 흐리게 보이는 것은 이 캔버스 위에 덮인 막
 * (CoverFilm) 이 뒤를 흐리게 하기 때문이다 — 씬을 두 번 그리지 않는다.
 */
export class StockScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400); // 먼 끝 — 지평선 안개 판(160m)까지 그려지게
  private readonly clock = new THREE.Clock();
  private readonly loader: GLTFLoader;

  private vrm: VRM | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private readonly clips = new Map<MotionName, THREE.AnimationClip>();
  private readonly pending = new Map<MotionName, Promise<THREE.AnimationClip | null>>();
  private current: THREE.AnimationAction | null = null;
  private currentName: MotionName | null = null;

  private faces: FaceLayer[] = [];
  /** 유지 표정 — idle 위에 얹는 감정 얼굴. 한 번 표정이 올라가는 만큼 내려간다 */
  private base: { expr: string; weight: number } | null = null;
  /** 유지 표정이 바뀔 때 뚝 끊기지 않게 — 표정별 지금 세기 */
  private readonly baseLevel = new Map<string, number>();
  private readonly touched = new Set<string>();

  /** 몸 치수 — 불러올 때 한 번 잰다 (골반·머리 꼭대기 높이) */
  private body = { hips: 0.9, headTop: 1.5 };
  private framing: Framing | null = null;
  /** 캐릭터 뒤 3D 공간(격자 바닥·지평선 안개) */
  private readonly env = new StageEnvironment();
  private motionBase = '';
  private disposed = false;

  /** 카메라 가로 이동(m) — 차트를 좌우로 밀면 창틀(카메라)이 같이 간다. 캐릭터는 제자리 */
  private panX = 0;
  /** 캐릭터 깊이에서 1m 가 화면 몇 px 인가 — applyFraming 이 갱신 */
  private pxPerM = 1;
  /** 캐릭터 위치(m, 가로)와 몸 방향(+ = 화면 오른쪽을 봄) */
  private rootX = 0;
  private rootYaw = 0;
  private baseYaw = 0;

  /** 매 프레임 그리기 직전 — 루프가 위치 이동(차트 슬라이드 연동)을 계산하는 자리 */
  beforeFrame: ((dt: number) => void) | null = null;

  /** 한 번 모션이 끝났을 때 — 루프가 유지 감정으로 돌려보낸다 */
  onMotionEnd: ((name: MotionName) => void) | null = null;

  // erasableSyntaxOnly 설정 때문에 생성자 매개변수 프로퍼티를 쓰지 않는다
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    // 무대 전체를 덮는 캔버스라 해상도를 조금 아낀다 — 내장 그래픽 기준
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setClearColor(0x000000, 0);

    // 조명 — 동작 테스트용 HTML 과 같은 값
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(1.2, 1.6, 1.0);
    this.scene.add(dir);

    this.scene.add(this.env.group);

    this.loader = new GLTFLoader();
    this.loader.register((p) => new VRMLoaderPlugin(p));
    this.loader.register((p) => new VRMAnimationLoaderPlugin(p));

    this.renderer.setAnimationLoop(() => this.frame());
  }

  /**
   * 모델과 첫 모션(유지 모션)을 불러온다. 첫 모션이 붙기 전에는 그리지 않는다 —
   * 불러온 직후의 두 팔 벌린 기본 자세(T자)가 보이지 않게.
   */
  async load(modelUrl: string, motionBase: string, first: MotionName): Promise<void> {
    this.motionBase = motionBase;
    const gltf = await this.loader.loadAsync(modelUrl);
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) throw new Error('VRM 확장이 없는 파일');
    if (this.disposed) {
      VRMUtils.deepDispose(gltf.scene); // 받는 사이에 화면을 떠났다
      return;
    }

    VRMUtils.combineSkeletons(gltf.scene);
    if (vrm.meta?.metaVersion === '0') VRMUtils.rotateVRM0(vrm);
    if (vrm.lookAt) {
      const proxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
      proxy.name = 'VRMLookAtQuaternionProxy';
      vrm.scene.add(proxy);
    }
    // 뼈로 움직이는 메시는 경계 상자가 실제 자세와 달라 화면 밖으로 잘못 판정된다
    vrm.scene.traverse((o) => {
      o.frustumCulled = false;
    });

    this.vrm = vrm;
    this.baseYaw = vrm.scene.rotation.y; // VRM0 은 이미 180° 돌아 있다
    this.measureBody(vrm);
    this.mixer = new THREE.AnimationMixer(vrm.scene);
    this.mixer.addEventListener('finished', (e) => {
      const action = (e as unknown as { action: THREE.AnimationAction }).action;
      if (action === this.current && this.currentName) this.onMotionEnd?.(this.currentName);
    });

    await this.clip(first);
    if (this.disposed) return;
    this.scene.add(vrm.scene);
    this.setRoot(this.rootX, this.rootYaw); // 불러오기 전에 정해 둔 위치가 있으면
    this.applyFraming();
  }

  /** 나머지 모션을 뒤에서 미리 받아 둔다 — 누르자마자 반응하게 */
  preload(names: MotionName[]) {
    for (const n of names) void this.clip(n);
  }

  /**
   * 모션 하나를 튼다. 이전 모션과 섞이며 넘어간다(매칭표 규칙 3).
   * 섞는 시간 = 이전 모션의 fadeOut → 새 모션의 fadeIn → CROSSFADE_S 순으로 먼저 있는 값.
   * 같은 반복 모션을 다시 요청하면 처음부터 다시 틀지 않는다.
   */
  async play(name: MotionName): Promise<void> {
    const def = MOTIONS[name as keyof typeof MOTIONS];
    if (!def || !this.mixer) return; // madness — 모션 파일이 아직 없다
    if (name === this.currentName && def.loop) return;

    const clip = await this.clip(name);
    if (!clip || !this.mixer) return;

    const action = this.mixer.clipAction(clip);
    const prev = this.current;
    action.reset();
    action.setLoop(def.loop ? THREE.LoopRepeat : THREE.LoopOnce, def.loop ? Infinity : 1);
    action.clampWhenFinished = !def.loop;
    action.play();
    action.timeScale = def.speed ?? 1;
    const prevDef = this.currentName ? MOTIONS[this.currentName] : undefined;
    const fade = prevDef?.fadeOut ?? def.fadeIn ?? CROSSFADE_S;
    if (prev && prev !== action) prev.crossFadeTo(action, fade, false);

    const now = this.clock.elapsedTime;
    for (const l of this.faces) {
      if (l.fadeOutAt === null) {
        l.fadeOutAt = now;
        l.fadeDur = fade;
      }
    }
    this.faces.push({ tracks: def.face, start: now, fadeOutAt: null, fadeDur: fade, once: !def.loop });

    this.current = action;
    this.currentName = name;
  }

  /** 유지 표정 — null 이면 뺀다 */
  setBase(base: { expr: string; weight: number } | null) {
    this.base = base;
  }

  get playing(): MotionName | null {
    return this.currentName;
  }

  setFraming(f: Framing) {
    this.framing = f;
    this.renderer.setSize(f.width, f.height, false);
    this.applyFraming();
  }

  /** 카메라 가로 이동(m) */
  setPan(x: number) {
    this.panX = x;
    this.applyFraming();
  }

  /** 캐릭터 위치(m)와 몸 방향(라디안, + = 화면 오른쪽을 봄) */
  setRoot(x: number, yaw: number) {
    this.rootX = x;
    this.rootYaw = yaw;
    if (this.vrm) {
      this.vrm.scene.position.x = x;
      this.vrm.scene.rotation.y = this.baseYaw + yaw;
    }
    this.env.setFocus(x);
  }

  /** 캐릭터 깊이에서 1m 가 화면 몇 px 인가 */
  get pixelsPerMeter(): number {
    return this.pxPerM;
  }

  /** 캐릭터가 카메라 가운데에 있을 때의 화면 가로 위치와 무대 폭(px) */
  get home(): { centerX: number; width: number } | null {
    return this.framing ? { centerX: this.framing.centerX, width: this.framing.width } : null;
  }

  /** 화면 좌표(캔버스 기준 px)가 캐릭터 몸에 닿는가 */
  pick(x: number, y: number): boolean {
    if (!this.vrm || !this.framing) return false;
    const ndc = new THREE.Vector2((x / this.framing.width) * 2 - 1, -(y / this.framing.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    return ray.intersectObject(this.vrm.scene, true).length > 0;
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    if (this.vrm) {
      this.scene.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
    }
    this.env.dispose();
    this.renderer.dispose();
    this.vrm = null;
    this.mixer = null;
  }

  /* ── 내부 ──────────────────────────────────────────────────── */

  private clip(name: MotionName): Promise<THREE.AnimationClip | null> {
    const have = this.clips.get(name);
    if (have) return Promise.resolve(have);
    const busy = this.pending.get(name);
    if (busy) return busy;
    const def = MOTIONS[name as keyof typeof MOTIONS];
    if (!def) return Promise.resolve(null);
    const job = this.loader
      .loadAsync(this.motionBase + def.file)
      .then((g) => {
        const anim = (g.userData.vrmAnimations as VRMAnimation[] | undefined)?.[0];
        if (!anim || !this.vrm) return null;
        const clip = createVRMAnimationClip(anim, this.vrm);
        this.clips.set(name, clip);
        return clip;
      })
      .catch((err) => {
        console.warn(`[StockScene] 모션 불러오기 실패: ${def.file}`, err);
        return null;
      })
      .finally(() => this.pending.delete(name));
    this.pending.set(name, job);
    return job;
  }

  /** 기본 자세에서 골반과 머리 꼭대기 높이를 잰다 — 화면에 걸 위치의 기준 */
  private measureBody(vrm: VRM) {
    vrm.scene.updateMatrixWorld(true);
    const hips = vrm.humanoid.getNormalizedBoneNode('hips');
    const head = vrm.humanoid.getNormalizedBoneNode('head');
    const box = new THREE.Box3().setFromObject(vrm.scene);
    const hipsY = hips ? hips.getWorldPosition(new THREE.Vector3()).y : box.min.y + (box.max.y - box.min.y) * 0.53;
    // 머리 꼭대기 — 머리카락까지 포함한 전체 상자의 윗면. 머리 뼈보다 아래면 머리 뼈 기준으로
    const headY = head ? head.getWorldPosition(new THREE.Vector3()).y : box.max.y;
    this.body = { hips: hipsY, headTop: Math.max(box.max.y, headY) };
  }

  /**
   * 카메라를 옮겨 캐릭터가 정해진 화면 위치에 걸리게 한다.
   *
   * 카메라는 수평으로 정면을 본다(세로선이 기울지 않게). 대신 **렌즈를 옆으로 미는**
   * 방식(시점 이동, view offset)으로 지평선·소실점을 화면 가운데가 아닌 원하는 자리에 둔다
   * — 건축 사진의 시프트 렌즈와 같은 원리. 그래서 바닥 원근은 그림 시안 자리 그대로,
   * 캐릭터는 머리 꼭대기·골반·가운데 x 가 목표 위치에 오도록 거리와 높이를 푼다.
   *
   * 화면 y = 지평선 − (높이 − 카메라높이) × s / 거리   (s = 거리 1m 에서 1m 가 몇 px)
   */
  private applyFraming() {
    const f = this.framing;
    if (!f) return;
    const { width: W, height: H } = f;
    const s = H / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const spanPx = f.hips - f.headTop;
    const spanM = this.body.headTop - this.body.hips;
    const d = (spanM * s) / Math.max(spanPx, 1);
    const camY = this.body.headTop - ((f.horizon - f.headTop) * d) / s;
    const camX = -((f.centerX - f.vanishX) * d) / s + this.panX;
    this.pxPerM = s / d;
    this.camera.position.set(camX, camY, d);
    this.camera.lookAt(camX, camY, 0);

    // 시점 이동 — 가상의 더 큰 화면 가운데가 (vanishX, horizon) 에 오도록 그중 일부만 그린다
    const ax = Math.abs(W / 2 - f.vanishX);
    const ay = Math.abs(H / 2 - f.horizon);
    const fullW = W + 2 * ax;
    const fullH = H + 2 * ay;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(fullH / 2 / s));
    this.camera.aspect = fullW / fullH;
    this.camera.setViewOffset(fullW, fullH, fullW / 2 - f.vanishX, fullH / 2 - f.horizon, W, H);
    this.camera.updateProjectionMatrix();
    this.env.update(this.camera);
  }

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (!this.vrm || !this.mixer) return;
    this.beforeFrame?.(dt);
    this.mixer.update(dt);
    this.applyFaces(dt);
    this.vrm.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * 표정 합성.
   *  · 모션 표정 — 겹마다 FACE_RISE_S 동안 올라오고, 모션이 바뀌면 CROSSFADE_S 동안 빠진다
   *  · 유지 표정 — 원래 세기 × (1 − 한 번 표정의 현재 세기)  (매칭표 재생 규칙 4)
   */
  private applyFaces(dt: number) {
    const em = this.vrm?.expressionManager;
    if (!em) return;
    const now = this.clock.elapsedTime;
    const val = new Map<string, number>();
    let shot = 0;

    this.faces = this.faces.filter((l) => l.fadeOutAt === null || now - l.fadeOutAt < l.fadeDur);
    for (const l of this.faces) {
      const t = now - l.start;
      const rise = Math.min(1, t / FACE_RISE_S);
      const fall = l.fadeOutAt === null ? 1 : Math.max(0, 1 - (now - l.fadeOutAt) / Math.max(l.fadeDur, 1e-3));
      for (const tr of l.tracks) {
        const v = faceValue(tr, t) * rise * fall;
        val.set(tr.expr, Math.max(val.get(tr.expr) ?? 0, v));
        if (l.once && (!this.base || tr.expr !== this.base.expr)) shot = Math.max(shot, v);
      }
    }
    // 유지 표정 — 목표 세기로 CROSSFADE_S 에 걸쳐 옮겨 간다
    const step = dt / CROSSFADE_S;
    if (this.base && !this.baseLevel.has(this.base.expr)) this.baseLevel.set(this.base.expr, 0);
    for (const [expr, level] of this.baseLevel) {
      const target = this.base && this.base.expr === expr ? this.base.weight : 0;
      const next = level < target ? Math.min(target, level + step) : Math.max(target, level - step);
      if (next <= 0 && target === 0) {
        this.baseLevel.delete(expr);
        continue;
      }
      this.baseLevel.set(expr, next);
      const v = next * (1 - shot);
      val.set(expr, Math.max(val.get(expr) ?? 0, v));
    }

    // 이번 프레임에 안 쓰인 표정은 0으로 — 이전에 켰던 것이 남지 않게
    for (const name of this.touched) if (!val.has(name)) em.setValue(name, 0);
    this.touched.clear();
    for (const [name, v] of val) {
      em.setValue(name, v);
      this.touched.add(name);
    }
  }
}

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
  faceOnModel,
  faceValue,
  type FaceTrack,
  type MotionDef,
  type MotionName,
  type MotionSet,
} from './motionTable';
import { StageEnvironment } from './StageEnvironment';
import { createHatDrop, type HatDrop } from './hatDrop';
import { rayHitsBody } from './bodyHit';
import { PERF_ON, downloadNote, memoryNote, perfNow, perfRow, shortName } from '../../../shared/perf';
import { fetchFile, isStored, parseFile } from '../../../shared/three/fileStore';
import { prepareDraw } from '../../../shared/three/prepareDraw';

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
  /** 창문 세로 가운데 — 드론 뷰(최대 각도)에서 캐릭터가 걸릴 높이 */
  winMid: number;
}

/** 가로 위치(캐릭터 가운데 · 소실점)만 다른가 — 그렇다면 캔버스를 다시 맞출 필요 없이 옮기기만 한다 */
export function onlyCenterMoved(a: Framing, b: Framing): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.headTop === b.headTop &&
    a.hips === b.hips &&
    a.horizon === b.horizon &&
    a.winMid === b.winMid &&
    a.centerX - a.vanishX === b.centerX - b.vanishX
  );
}

/** 레이아웃이 바뀌었을 때 무대가 할 일 — 3D 를 다시 맞춘다 / 캐릭터가 새 가운데로 간다 / 아무것도 안 한다 */
export type FramingStep = 'refit' | 'home' | 'none';

/**
 * 창문 가운데만 옮겨 갔을 때 캐릭터를 보내는 것은 글로벌 사이드바를 여닫았을 때뿐이다(fromSidebar).
 * 스크롤바가 생기고 없어지는 것처럼 칸 폭만 바뀐 경우는 캐릭터를 건드리지 않는다.
 * 다음에 여닫거나 창 크기가 바뀌면 그때 지금 가운데로 맞는다.
 *
 * 캐릭터가 아직 안 보이면(shown = false) 무엇 때문에 옮겨 갔든 바로 맞춘다 — 들어오자마자 창문 가운데에
 * 서 있게(첫 측정에 잠깐 생긴 스크롤바가 섞이는 경우). 여닫는 중에만 끝날 때까지 기다린다.
 */
export function framingStep(
  prev: Framing | null,
  next: Framing,
  sliding: boolean,
  fromSidebar: boolean,
  shown = true,
): FramingStep {
  if (!prev || !onlyCenterMoved(prev, next)) return 'refit';
  if (sliding || prev.centerX === next.centerX) return 'none';
  if (!shown) return 'refit';
  return fromSidebar ? 'home' : 'none';
}

/** 지금 얹혀 있는 표정 한 겹. 모션이 바뀌면 이전 겹은 서서히 빠진다 */
interface FaceLayer {
  tracks: FaceTrack[];
  start: number;
  fadeOutAt: number | null;
  /** 빠지는 데 걸리는 시간(초) — 다음 모션으로 넘어갈 때의 섞는 시간 */
  fadeDur: number;
  once: boolean;
  /** 잠깐 띄우는 표정(flashFace) — 이 시각(초)이 되면 빠지기 시작한다 */
  until?: number;
}

/** 모델 종류 — 등신대(종목 전용 모델) · 치비(거실과 같은 파일, 치비 지시서) */
export type ModelKind = 'full' | 'chibi';

/** 모델 한 벌을 띄우는 데 필요한 것 — 파일 주소 · 그 모델로 틀 모션 표 · 모자 장면 여부 */
export interface ModelSource {
  url: string;
  motions: MotionSet;
  hatDrop?: boolean;
}

/** 몸 치수 — 불러올 때 한 번 잰다(골반 · 머리 꼭대기 높이, 머리 길이) */
interface BodySize {
  hips: number;
  headTop: number;
  headLen: number;
}

/** 모델을 불러오기 전 몸 치수 — 대략 등신대 */
const DEFAULT_BODY: BodySize = { hips: 0.9, headTop: 1.5, headLen: 0.2 };

/**
 * 모델 한 벌 — 등신대 · 치비가 **따로** 갖는 것(VRM · 믹서 · 해석한 모션 · 몸 치수 · 모자).
 * 모션 클립은 VRM 마다 따로 만든다(createVRMAnimationClip 이 그 모델의 뼈에 맞춘다). 파일 바이트는 보관소(fileStore)에서 나눠 쓴다
 */
interface Rig {
  kind: ModelKind;
  vrm: VRM;
  mixer: THREE.AnimationMixer;
  motions: MotionSet;
  clips: Map<MotionName, THREE.AnimationClip>;
  pending: Map<MotionName, Promise<THREE.AnimationClip | null>>;
  /** 이 모델에서 지금 도는 모션 */
  current: THREE.AnimationAction | null;
  body: BodySize;
  /** 연타 반응(annoying) 동안의 모자 떨어뜨리기 — 그 캐릭터의 등신대만(assets hatDrop), 없으면 null */
  hat: HatDrop | null;
  /** 불러온 직후의 몸 방향 — VRM0 은 이미 180° 돌아 있다 */
  baseYaw: number;
}

/** 캐릭터 뒤 3D 공간(격자 바닥 · 지평선 안개)을 그릴지 — 2026-11-17 끔 */
const SHOW_STAGE_ENV = false;

/** 망원에 가까운 화각 — 원근 왜곡이 적어 정면 일러스트와 비슷하게 보인다 */
const FOV = 20;

/** 드론 뷰 — 가장 높이 떴을 때 내려다보는 각도(도, 지면 기준) */
const DRONE_PITCH = 30;

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

  /**
   * 들고 있는 모델(등신대 · 치비) — 한 번 받은 모델은 버리지 않고 들고 있어 다음 전환은 바로(치비 지시서 결정 8).
   * 화면에 보이는 것은 rig 하나, 나머지는 장면에 넣어 둔 채 숨겨 둔다(visible = false, 믹서도 멈춤)
   */
  private readonly rigs = new Map<ModelKind, Rig>();
  /** 받는 중인 모델 — 같은 모델을 두 번 받지 않게 */
  private readonly loading = new Map<ModelKind, Promise<Rig | null>>();
  /** 지금 보이는 모델 */
  private rig: Rig | null = null;
  /** 마지막으로 고른 모델 — 받는 사이에 반대쪽을 고르면 다 받아도 바꿔 끼지 않는다 */
  private want: ModelKind = 'full';
  /** 지금 틀고 있는 모션 이름 — 모델을 바꿔 껴도 이어진다(새 모델에서 같은 모션) */
  private currentName: MotionName | null = null;

  private faces: FaceLayer[] = [];
  /** 유지 표정 — idle 위에 얹는 감정 얼굴. 한 번 표정이 올라가는 만큼 내려간다 */
  private base: { expr: string; weight: number } | null = null;
  /** 유지 표정이 바뀔 때 뚝 끊기지 않게 — 표정별 지금 세기 */
  private readonly baseLevel = new Map<string, number>();
  private readonly touched = new Set<string>();

  private framing: Framing | null = null;
  /** 캐릭터 뒤 3D 공간(격자 바닥·지평선 안개) */
  private readonly env = new StageEnvironment();
  private disposed = false;
  /** ?perf 측정(L-1) — 모델을 장면에 올린 시각(첫 그리기를 재려고) · load 시작 시각 · 대상 파일. 평소엔 0 */
  private perfDraw = 0;
  private perfLoad = 0;
  private perfFile = '';

  /** 카메라 가로 이동(m) — 차트를 좌우로 밀면 창틀(카메라)이 같이 간다. 캐릭터는 제자리 */
  private panX = 0;
  /** 카메라 거리 배수 — 1 = 기본 구도, 클수록 뒤로 물러난다(차트 축소 연동) */
  private zoom = 1;
  /** 드론 정도(0 = 정면, 1 = DRONE_PITCH 로 내려다봄) — 차트 축소 연동 */
  private drone = 0;
  /** 캐릭터 깊이에서 1m 가 화면 몇 px 인가 — applyFraming 이 갱신 */
  private pxPerM = 1;
  /** 캐릭터 위치(m, 가로)와 몸 방향(+ = 화면 오른쪽을 봄) */
  private rootX = 0;
  /**
   * 캐릭터 자리가 카메라 가운데(framing.centerX)에서 떨어진 화면 거리(px) — 글로벌 사이드바를 여닫아
   * 창문 가운데가 옮겨 가도 카메라 · 바닥은 그대로 두고 캐릭터 자리만 옮긴다. 화면 거리로 들고 있어
   * 카메라가 물러나도(확대 축소 · 드론) 캐릭터는 창문 가운데에 남는다.
   */
  private charShift = 0;
  private rootYaw = 0;

  /** 매 프레임 그리기 직전 — 루프가 위치 이동(차트 슬라이드 연동)을 계산하는 자리 */
  beforeFrame: ((dt: number) => void) | null = null;

  /** 한 번 모션이 끝났을 때 — 루프가 유지 감정으로 돌려보낸다. 모델을 바꿔 끼느라 끊긴 한 번 모션도 끝난 것으로 알린다 */
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
    // 2026-11-17 도휘: 격자 바닥 · 지평선 안개를 끄고 본다(차트 가시성). 다시 켜려면 true
    this.env.group.visible = SHOW_STAGE_ENV;

    this.loader = new GLTFLoader();
    this.loader.register((p) => new VRMLoaderPlugin(p));
    this.loader.register((p) => new VRMAnimationLoaderPlugin(p));

    this.renderer.setAnimationLoop(() => this.frame());
  }

  /**
   * 첫 모델(등신대)과 첫 모션(유지 모션)을 불러온다. 첫 모션이 붙기 전에는 그리지 않는다 —
   * 불러온 직후의 두 팔 벌린 기본 자세(T자)가 보이지 않게.
   * 파일은 받은 파일 보관소(fileStore)에서 — 전에 받았으면 받지 않고 다시 해석만 한다(마무리 L-2).
   * 장면에 넣기 전에 그리기 준비(셰이더 · 텍스처, prepareDraw)를 끝낸다 — 끝나야 ready
   * also — 첫 화면 전에 같이 준비할 모션(첫 등장의 walk · greeting, 마무리 L-4). 파일은 모델과 같이 받기 시작한다
   */
  async load(
    modelUrl: string,
    motions: MotionSet,
    first: MotionName,
    also: MotionName[] = [],
    opts: { hatDrop?: boolean } = {},
  ): Promise<void> {
    const t0 = perfNow();
    this.want = 'full';
    const rig = await this.loadRig('full', { url: modelUrl, motions, hatDrop: opts.hatDrop }, [first, ...also]);
    if (!rig) return; // 받는 사이에 화면을 떠났다
    this.activate(rig);
    if (PERF_ON) {
      this.perfFile = shortName(modelUrl);
      this.perfLoad = t0;
      this.perfDraw = perfNow();
    }
  }

  /**
   * kind 모델로 바꿔 낀다(등신대 ↔ 치비). 처음 쓰는 모델이면 받는다 — 받는 동안은 지금 모델 그대로 보인다.
   * 받은 모델은 버리지 않고 들고 있어 다음 전환은 바로(치비 지시서 결정 8). 받다 실패하면 throw — 지금 모델 그대로.
   * 받는 사이에 반대쪽을 고르면 받기는 마저 하되(들고 있기) 바꿔 끼지는 않는다.
   * 처음 받을 때는 그 모델의 모션을 전부 해석해 둔 뒤 바꿔 낀다 — 바꿔 낀 순간 지금 모션을 바로 이어 틀 수 있게
   */
  async useModel(kind: ModelKind, src: ModelSource): Promise<void> {
    this.want = kind;
    let rig = this.rigs.get(kind) ?? null;
    if (!rig) {
      let job = this.loading.get(kind);
      if (!job) {
        job = this.loadRig(kind, src, Object.keys(src.motions) as MotionName[]).finally(() => this.loading.delete(kind));
        this.loading.set(kind, job);
      }
      rig = await job;
      if (!rig) return; // 받는 사이에 화면을 떠났다
    } else {
      // 들고 있던 모델 — 지금 모션 · 유지 모션 클립이 아직이면(뒤에서 받는 중) 붙을 때까지
      const have = rig;
      await Promise.all([this.currentName, 'idle' as const].map((n) => (n ? this.clip(have, n) : null)));
    }
    if (this.disposed || this.want !== kind) return;
    this.activate(rig);
  }

  /** 지금 보이는 모델 — 아직 없으면 null */
  get model(): ModelKind | null {
    return this.rig?.kind ?? null;
  }

  /** 지금 보이는 모델의 모션 표 — 아직 없으면 빈 표 */
  get motionSet(): MotionSet {
    return this.rig?.motions ?? {};
  }

  /**
   * 지금 자세 · 표정 · 위치 그대로 한 번 바로 그린다(마무리 L-4, 결정 7).
   * 캔버스가 숨어 있을 때(opacity 0) 불러, three 가 첫 render 때 만드는 것(표정 형태 키 · 뼈 텍스처 —
   * 공개 API 로 미리 못 만듦)을 보이기 전에 끝내 둔다. 화면 밖 자리여도 그려진다(frustumCulled = false)
   */
  drawNow() {
    const rig = this.rig;
    if (!rig) return;
    rig.mixer.update(0);
    this.updateHat();
    if (!this.vrmaFaceOn) this.applyFaces(0);
    rig.vrm.update(0);
    this.draw();
  }

  /** 나머지 모션을 뒤에서 미리 받아 둔다 — 누르자마자 반응하게 */
  preload(names: MotionName[]) {
    const rig = this.rig;
    if (!rig) return;
    for (const n of names) void this.clip(rig, n);
  }

  /**
   * 모션 하나를 튼다. 이전 모션과 섞이며 넘어간다(매칭표 규칙 3).
   * 섞는 시간 = 이전 모션의 fadeOut → 새 모션의 fadeIn → CROSSFADE_S 순으로 먼저 있는 값.
   * 같은 반복 모션을 다시 요청하면 처음부터 다시 틀지 않는다.
   */
  /** 모션을 튼다. 틀었으면(또는 이미 그 반복 모션이면) true — 표에 없거나 파일을 못 받으면 false */
  async play(name: MotionName): Promise<boolean> {
    const rig = this.rig;
    const def = rig?.motions[name];
    if (!rig || !def) return false;
    if (name === this.currentName && def.loop) return true;

    const clip = await this.clip(rig, name);
    if (this.disposed) return false;
    if (rig !== this.rig) return this.play(name); // 받는 사이에 모델을 바꿔 꼈다 — 새 모델에서
    if (!clip) return false;

    // 연타 반응이 다른 모션(또는 처음부터 다시)에 끊긴다 — 모자를 제자리에
    if (this.currentName === 'annoying') rig.hat?.reset();
    const prev = rig.current;
    const action = this.startAction(rig, clip, def);
    const prevDef = this.currentName ? rig.motions[this.currentName] : undefined;
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

    rig.current = action;
    this.currentName = name;
    return true;
  }

  /**
   * 모션은 그대로 두고 표정만 잠깐 — 반복 모션(idle)으로 오는 한 번 반응(예: 매수 → happy).
   * 한 번 표정으로 다루므로 그동안 유지 표정은 그만큼 내려간다(매칭표 재생 규칙 4).
   */
  flashFace(expr: string, weight: number, seconds: number) {
    const now = this.clock.elapsedTime;
    this.faces.push({
      tracks: [{ expr, value: weight }],
      start: now,
      fadeOutAt: null,
      fadeDur: CROSSFADE_S,
      once: true,
      until: now + seconds,
    });
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
    this.charShift = 0;
    this.renderer.setSize(f.width, f.height, false);
    this.applyFraming();
  }

  /** 지금 캐릭터를 걸어 둔 가로 위치(px, 창문 가운데) — 아직 안 정했으면 null */
  get centerX(): number | null {
    return this.framing ? this.framing.centerX + this.charShift : null;
  }

  /** 캐릭터를 걸 가로 위치만 x(px)로 옮긴다 — 카메라 · 바닥은 그대로 */
  setCharacterCenter(x: number) {
    if (!this.framing) return;
    this.charShift = x - this.framing.centerX;
    this.placeRoot();
  }

  /**
   * 캐릭터를 걸 가로 위치와 소실점을 같이 dx px 옮긴다 — 화면 전체가 그만큼 평행 이동한다
   * (카메라는 그대로, 렌즈만 옆으로 민다). 캔버스 크기는 안 바꾸므로 매 프레임 불러도 가볍다.
   */
  shiftCenter(dx: number) {
    const f = this.framing;
    if (!f || !dx) return;
    this.framing = { ...f, centerX: f.centerX + dx, vanishX: f.vanishX + dx };
    this.applyFraming();
  }

  /** 카메라 가로 이동(m) */
  setPan(x: number) {
    this.panX = x;
    this.applyFraming();
  }

  /** 카메라 상태 — 거리 배수(1 = 기본 구도)와 드론 정도(0 = 정면 ~ 1 = 최대 각도) */
  setView(zoom: number, drone: number) {
    if (Math.abs(zoom - this.zoom) < 1e-5 && Math.abs(drone - this.drone) < 1e-5) return;
    this.zoom = zoom;
    this.drone = drone;
    this.applyFraming();
  }

  /** 캐릭터 위치(m)와 몸 방향(라디안, + = 화면 오른쪽을 봄) */
  setRoot(x: number, yaw: number) {
    this.rootX = x;
    this.rootYaw = yaw;
    if (this.rig) this.rig.vrm.scene.rotation.y = this.rig.baseYaw + yaw;
    this.placeRoot();
  }

  /** 캐릭터의 3D 가로 위치 = 움직인 만큼 + 자리 옮긴 만큼(화면 px 을 지금 카메라 기준 m 로) */
  private placeRoot() {
    const x = this.rootX + this.charShift / this.pxPerM;
    if (this.rig) this.rig.vrm.scene.position.x = x;
    this.env.setFocus(x);
  }

  /** 캐릭터 깊이에서 1m 가 화면 몇 px 인가 */
  get pixelsPerMeter(): number {
    return this.pxPerM;
  }

  /** 캐릭터가 카메라 가운데에 있을 때의 화면 가로 위치와 무대 폭(px) */
  get home(): { centerX: number; width: number } | null {
    const f = this.framing;
    if (!f) return null;
    // 드론 뷰에서는 캐릭터가 창문 가운데(소실점 자리)에 온다
    return { centerX: f.centerX + this.charShift + (f.vanishX - f.centerX) * this.drone, width: f.width };
  }

  /** 화면 좌표(캔버스 기준 px)가 캐릭터 몸에 닿는가 */
  pick(x: number, y: number): boolean {
    const rig = this.rig;
    if (!rig || !this.framing) return false;
    const ndc = new THREE.Vector2((x / this.framing.width) * 2 - 1, -(y / this.framing.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    // 메시 레이캐스트는 클릭마다 60~290ms 멈춘다(스키닝 계산) — 뼈 캡슐로 본다(bodyHit.ts)
    const humanoid = rig.vrm.humanoid;
    const scale = rig.vrm.scene.scale.y || 1;
    return rayHitsBody(
      ray.ray,
      (name) => humanoid.getNormalizedBoneNode(name)?.getWorldPosition(new THREE.Vector3()) ?? null,
      rig.body.headTop * scale,
      rig.body.headLen * scale,
    );
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    for (const rig of this.rigs.values()) {
      rig.mixer.stopAllAction();
      this.scene.remove(rig.vrm.scene);
      VRMUtils.deepDispose(rig.vrm.scene);
    }
    this.rigs.clear();
    this.rig = null; // 받는 중인 모델은 받은 뒤 스스로 버린다(loadRig)
    this.env.dispose();
    this.renderer.dispose();
  }

  /* ── 내부 ──────────────────────────────────────────────────── */

  /** 지금 보이는 모델의 몸 치수 — 모델을 바꿔 끼면 그 모델 것 */
  private get body(): BodySize {
    return this.rig?.body ?? DEFAULT_BODY;
  }

  /**
   * 모델 한 벌을 받아 해석하고, first 모션을 붙이고, 그리기 준비까지 끝내 장면에 숨겨 넣는다(아직 안 보임 — activate 가 보인다).
   * 받는 사이에 화면을 떠났으면 만든 것을 버리고 null. 못 받으면 throw
   */
  private async loadRig(kind: ModelKind, src: ModelSource, first: MotionName[]): Promise<Rig | null> {
    const tag = kind === 'chibi' ? '개별종목(치비)' : '개별종목';
    const file = PERF_ON ? shortName(src.url) : '';
    const t0 = perfNow();
    const fromStore = PERF_ON && isStored(src.url);
    // 모션 파일은 모델과 나란히 받아 둔다(작고 몇 개 안 됨) — 해석은 모델이 선 뒤(clip)
    for (const m of first) {
      const url = src.motions[m]?.url;
      if (url) void fetchFile(url);
    }
    const buf = await fetchFile(src.url);
    if (!buf) throw new Error(`모델 파일을 못 받음: ${src.url}`);
    if (this.disposed) return null; // 받는 사이에 화면을 떠났다
    if (PERF_ON) perfRow(tag, '받기', file, t0, fromStore ? '보관소에서(받기 생략)' : downloadNote(src.url));
    const tParse = perfNow();
    const gltf = await this.loader.parseAsync(buf, '');
    if (PERF_ON) perfRow(tag, '해석(parseAsync)', file, tParse, `${(buf.byteLength / 1048576).toFixed(1)}MB`);
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) throw new Error('VRM 확장이 없는 파일');
    if (this.disposed) {
      VRMUtils.deepDispose(gltf.scene); // 받는 사이에 화면을 떠났다
      return null;
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

    const rig: Rig = {
      kind,
      vrm,
      mixer: new THREE.AnimationMixer(vrm.scene),
      motions: src.motions,
      clips: new Map(),
      pending: new Map(),
      current: null,
      body: measureBody(vrm),
      // 모자 떨어뜨리기 — VRM 을 불러온 직후 한 번(모자 노드 · 원래 자리를 기억한다)
      hat: src.hatDrop ? createHatDrop(vrm) : null,
      baseYaw: vrm.scene.rotation.y, // VRM0 은 이미 180° 돌아 있다
    };
    rig.mixer.addEventListener('finished', (e) => {
      const action = (e as unknown as { action: THREE.AnimationAction }).action;
      if (rig !== this.rig || action !== rig.current || !this.currentName) return;
      if (this.currentName === 'annoying') rig.hat?.reset(); // 연타 반응 끝 — 모자를 제자리에
      this.onMotionEnd?.(this.currentName);
    });
    const drop = () => {
      VRMUtils.deepDispose(vrm.scene);
      return null;
    };

    const t1 = perfNow();
    await Promise.all(first.map((m) => this.clip(rig, m)));
    if (this.disposed) return drop();
    if (PERF_ON) perfRow(tag, `첫 모션(${first[0]})`, shortName(src.motions[first[0]]?.url ?? ''), t1, downloadNote(src.motions[first[0]]?.url ?? ''));
    const t2 = perfNow();
    await prepareDraw(this.renderer, vrm.scene, this.camera, this.scene, () => !this.disposed);
    if (this.disposed) return drop();
    if (PERF_ON) perfRow(tag, '그리기 준비(셰이더·텍스처)', file, t2, `장면에 넣기 전 — 보이기 전에 끝남 · 렌더러 텍스처 ${this.renderer.info.memory.textures}개 · 셰이더 ${this.renderer.info.programs?.length ?? '?'}개`);
    vrm.scene.visible = false;
    this.scene.add(vrm.scene);
    this.rigs.set(kind, rig);
    return rig;
  }

  /**
   * next 모델을 보이고 앞 모델은 숨긴다 — 뚝 바꿔 낀다(두 모델의 메시가 달라 섞을 수 없다).
   * 위치 · 방향 · 구도(몸 치수)는 새 모델로 다시 맞추고, 지금 모션은 새 모델에서 이어 간다:
   *  · 반복 모션(idle · walk · sleep …) — 같은 모션을 같은 재생 시각부터(걷던 발이 끊기지 않게)
   *  · 한 번 모션(반응 · 인사 · 숨 고르기) — 새 모델은 idle 로 세우고 그 모션이 끝난 것으로 알린다(onMotionEnd).
   *    루프가 평소처럼 다음 단발 / 같은 감정의 유지 모션으로 이어 간다
   * 표정 겹(faces · 유지 표정)은 씬이 들고 있어 그대로 이어진다
   */
  private activate(next: Rig) {
    const prev = this.rig;
    if (prev === next) return;
    const name = this.currentName;
    const prevTime = prev?.current?.time ?? 0;
    if (prev) {
      prev.hat?.reset();
      prev.mixer.stopAllAction();
      prev.current = null;
      // 앞 모델에 켜 둔 표정을 전부 0으로 — 코드 표정 · VRMA 안 표정 둘 다. 다시 바꿔 낄 때 남아 있지 않게
      const em = prev.vrm.expressionManager;
      if (em) for (const ex of em.expressions) em.setValue(ex.expressionName, 0);
      prev.vrm.scene.visible = false;
    }
    this.touched.clear();
    this.rig = next;
    next.vrm.scene.visible = true;
    this.setRoot(this.rootX, this.rootYaw);
    this.applyFraming(); // 몸 치수가 바뀌었다
    if (!prev) return; // 첫 모델 — 모션은 루프가 튼다

    const def = name ? next.motions[name] : undefined;
    const clip = name && def?.loop ? next.clips.get(name) : undefined;
    if (name && def && clip) {
      const action = this.startAction(next, clip, def);
      action.time = prevTime % Math.max(clip.duration, 1e-3);
      next.current = action;
    } else {
      this.standIdle(next);
      if (name && def && !def.loop) {
        // 끊긴 한 번 모션의 표정도 빠지기 시작 — 루프가 다음 모션을 안 틀더라도 남지 않게
        const now = this.clock.elapsedTime;
        for (const l of this.faces) {
          if (l.once && l.fadeOutAt === null) {
            l.fadeOutAt = now;
            l.fadeDur = CROSSFADE_S;
          }
        }
        this.onMotionEnd?.(name);
      } else if (name && name !== 'idle') {
        void this.play(name); // 반복 모션인데 클립이 아직 — 붙는 대로 섞여 넘어간다
      }
    }
    next.mixer.update(0);
    next.vrm.scene.updateMatrixWorld(true);
    next.vrm.springBoneManager?.reset(); // 숨겨 둔 동안 옛 자리에 머문 머리카락 · 옷이 튀지 않게
  }

  /** 새 모델을 idle 로 바로 세운다(섞지 않음) — idle 클립이 없으면 아무것도 안 함 */
  private standIdle(rig: Rig) {
    const def = rig.motions.idle;
    const clip = rig.clips.get('idle');
    if (!def || !clip) return;
    rig.current = this.startAction(rig, clip, def);
    this.currentName = 'idle';
  }

  /** 모델 rig 의 믹서에서 clip 을 처음부터 튼다(섞기는 부르는 쪽이) */
  private startAction(rig: Rig, clip: THREE.AnimationClip, def: MotionDef): THREE.AnimationAction {
    const action = rig.mixer.clipAction(clip);
    action.reset();
    action.setLoop(def.loop ? THREE.LoopRepeat : THREE.LoopOnce, def.loop ? Infinity : 1);
    action.clampWhenFinished = !def.loop;
    action.play();
    action.timeScale = def.speed ?? 1;
    return action;
  }

  private clip(rig: Rig, name: MotionName): Promise<THREE.AnimationClip | null> {
    const have = rig.clips.get(name);
    if (have) return Promise.resolve(have);
    const busy = rig.pending.get(name);
    if (busy) return busy;
    const def = rig.motions[name];
    if (!def) return Promise.resolve(null);
    const job = parseFile(def.url, (buf) => this.loader.parseAsync(buf, ''))
      .then((g) => {
        if (!g) throw new Error('파일 없음(404 · HTML)');
        const anim = (g.userData.vrmAnimations as VRMAnimation[] | undefined)?.[0];
        if (!anim) return null;
        const clip = createVRMAnimationClip(anim, rig.vrm);
        // end — 파일은 그대로 두고 그 시각에서 끝난 것으로(LoopOnce 가 clip.duration 에서 finished)
        if (def.end !== undefined && def.end < clip.duration) clip.duration = def.end;
        rig.clips.set(name, clip);
        return clip;
      })
      .catch((err) => {
        console.warn(`[StockScene] 모션 불러오기 실패: ${def.url}`, err);
        return null;
      })
      .finally(() => rig.pending.delete(name));
    rig.pending.set(name, job);
    return job;
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
    // 앞뒤로만 물러난다 — 눈높이(camY)가 그대로라 지평선 자리는 변하지 않는다
    const dist = d * this.zoom;

    // 드론 자리 — 같은 거리에서 캐릭터 몸 가운데를 DRONE_PITCH 로 내려다보는 곳.
    // 정면 자리와 그 사이를 드론 정도만큼 섞는다. 옆에서 보면 아래로 볼록한 곡선
    // (앞뒤는 고르게, 높이는 제곱으로) — 처음엔 거의 안 뜨다가 멀어질수록 가파르게 떠오른다
    const u = this.drone;
    const cy = this.body.headTop / 2;
    const D = dist;
    const a = THREE.MathUtils.degToRad(DRONE_PITCH);
    const px = camX + (this.panX - camX) * u;
    const pz = dist + (D * Math.cos(a) - dist) * u;
    const py = camY + (cy + D * Math.sin(a) - camY) * u * u;
    // 고개 숙이기 — 지금 자리에서 캐릭터를 바로 보는 각도까지, 드론 정도만큼
    const pitch = Math.atan2(py - cy, pz) * u;
    this.camera.position.set(px, py, pz);
    this.camera.rotation.set(-pitch, 0, 0);
    // 캐릭터 깊이(시선 방향 거리) — 화면 px ↔ m 환산과 안개 거리에 쓴다
    const depth = (py - cy) * Math.sin(pitch) + pz * Math.cos(pitch);
    this.pxPerM = s / depth;
    this.placeRoot(); // 카메라가 물러나면 같은 화면 거리의 3D 거리도 달라진다

    // 시점 이동 — 가상의 더 큰 화면 가운데가 (vanishX, 기준 높이) 에 오도록 그중 일부만 그린다.
    // 기준 높이는 정면일 때 지평선, 드론일 때 창문 가운데(캐릭터를 바로 보므로 캐릭터가 거기 걸린다)
    const vy = f.horizon + (f.winMid - f.horizon) * u;
    const ax = Math.abs(W / 2 - f.vanishX);
    const ay = Math.abs(H / 2 - vy);
    const fullW = W + 2 * ax;
    const fullH = H + 2 * ay;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(fullH / 2 / s));
    this.camera.aspect = fullW / fullH;
    this.camera.setViewOffset(fullW, fullH, fullW / 2 - f.vanishX, fullH / 2 - vy, W, H);
    this.camera.updateProjectionMatrix();
    this.env.update(this.camera, depth);
  }

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const rig = this.rig;
    if (!rig) return;
    this.beforeFrame?.(dt);
    // 표정이 VRMA 안에 있는 모션 — 들어설 때 코드가 켜 둔 표정만 한 번 내리고(모션 표정이 그 위에 온다), 재생 중엔 쓰지 않는다
    const vrmaFace = this.vrmaFaceOn;
    if (vrmaFace) this.releaseCodeFaces();
    rig.mixer.update(dt);
    this.updateHat(); // mixer.update 다음 · vrm.update 전(hatDrop.ts 사용법)
    if (!vrmaFace) this.applyFaces(dt);
    rig.vrm.update(dt);
    this.draw();
  }

  /** 지금 재생 중인 모션이 표정을 VRMA 안에 든 것인가 — 끝나서 멈춘 뒤(clamp)는 아니다 */
  private get vrmaFaceOn(): boolean {
    const def = this.currentName ? this.rig?.motions[this.currentName] : undefined;
    return !!def?.vrmaFace && !!this.rig?.current?.isRunning();
  }

  /** 코드가 켜 둔 표정을 0으로 — 한 번만(그 뒤 touched 가 비어 아무것도 안 함) */
  private releaseCodeFaces() {
    const em = this.rig?.vrm.expressionManager;
    if (!em || this.touched.size === 0) return;
    for (const name of this.touched) em.setValue(name, 0);
    this.touched.clear();
  }

  /** 연타 반응(annoying) 재생 중이면 모자 — 30fps 프레임 번호로 */
  private updateHat() {
    const rig = this.rig;
    if (!rig?.hat || this.currentName !== 'annoying' || !rig.current?.isRunning()) return;
    rig.hat.update(Math.floor(rig.current.time * 30));
  }

  private draw() {
    if (this.perfDraw && this.rig) {
      // 모델이 처음 그려지는 render — 남은 첫 그리기 준비(형태 키 · 뼈 텍스처)가 이 render 호출 안에서 일어난다
      const s = performance.now();
      this.renderer.render(this.scene, this.camera);
      perfRow('개별종목', '첫 그리기(render 1회)', this.perfFile, s, `장면에 올린 뒤 ${Math.round(s - this.perfDraw)}ms 만에 시작`);
      perfRow('개별종목', '전체(load 시작→첫 그림)', this.perfFile, this.perfLoad);
      perfRow('개별종목', '메모리', this.perfFile, null, memoryNote(this.rig.vrm.scene, this.renderer));
      this.perfDraw = 0;
      return;
    }
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * 표정 합성.
   *  · 모션 표정 — 겹마다 FACE_RISE_S 동안 올라오고, 모션이 바뀌면 CROSSFADE_S 동안 빠진다
   *  · 유지 표정 — 원래 세기 × (1 − 한 번 표정의 현재 세기)  (매칭표 재생 규칙 4)
   *  · 치비 모델이면 치비에 없는 표정(NOT_ON_CHIBI — 그늘 두 개)은 건너뛴다(치비 지시서 결정 5)
   */
  private applyFaces(dt: number) {
    const em = this.rig?.vrm.expressionManager;
    if (!em) return;
    const chibi = this.rig?.kind === 'chibi';
    const now = this.clock.elapsedTime;
    const val = new Map<string, number>();
    let shot = 0;

    for (const l of this.faces) if (l.until !== undefined && l.fadeOutAt === null && now >= l.until) l.fadeOutAt = l.until;
    this.faces = this.faces.filter((l) => l.fadeOutAt === null || now - l.fadeOutAt < l.fadeDur);
    for (const l of this.faces) {
      const t = now - l.start;
      const rise = Math.min(1, t / FACE_RISE_S);
      const fall = l.fadeOutAt === null ? 1 : Math.max(0, 1 - (now - l.fadeOutAt) / Math.max(l.fadeDur, 1e-3));
      for (const tr of l.tracks) {
        if (!faceOnModel(tr.expr, chibi)) continue;
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
      if (!faceOnModel(expr, chibi)) continue;
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

/** 기본 자세에서 골반과 머리 꼭대기 높이를 잰다 — 화면에 걸 위치의 기준. 모델마다 한 번(바꿔 끼면 그 모델 것) */
function measureBody(vrm: VRM): BodySize {
  vrm.scene.updateMatrixWorld(true);
  const hips = vrm.humanoid.getNormalizedBoneNode('hips');
  const head = vrm.humanoid.getNormalizedBoneNode('head');
  const box = new THREE.Box3().setFromObject(vrm.scene);
  const hipsY = hips ? hips.getWorldPosition(new THREE.Vector3()).y : box.min.y + (box.max.y - box.min.y) * 0.53;
  // 머리 꼭대기 — 머리카락까지 포함한 전체 상자의 윗면. 머리 뼈보다 아래면 머리 뼈 기준으로
  const headY = head ? head.getWorldPosition(new THREE.Vector3()).y : box.max.y;
  const headTop = Math.max(box.max.y, headY);
  // headLen — 머리 뼈에서 머리 꼭대기까지. 누르기 판정(bodyHit)의 머리 캡슐 크기
  return { hips: hipsY, headTop, headLen: headTop - headY };
}

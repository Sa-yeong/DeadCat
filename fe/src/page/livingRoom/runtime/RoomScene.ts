import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';
import { createVRMAnimationClip, VRMAnimationLoaderPlugin, VRMLookAtQuaternionProxy, type VRMAnimation } from '@pixiv/three-vrm-animation';
import type { CharacterDef } from '../types';
import { wornOutfit, type FurnitureCatalog } from './catalogs';
import { shapeOf, type Part } from './furnitureShape';
import { Projection, ROOM, VIEW, type Pt } from './projection';
import type { DropTarget, MotionStep, RoomRenderer } from './RoomRenderer';
import { CHAR } from './characterSize';
import { Swing } from './swing';
import { ROOM_ASSETS } from './roomAssets';
import { SHELL, WALL_H, WALL_LINES, WALL_PANELS, WALL_T } from './roomShell';

/**
 * **3D 렌더러** — three.js 로 아트보드 H안을 그대로 세운다. RoomRenderer 의 두 번째 구현.
 *
 * 카메라 — 원근 없는 직교 카메라를 방에서 TH(20°) 돌려 asin(K)(23.6°) 내려다보게 둔다.
 *   평면 더미의 투영식과 같은 구도라서, 높이만 H_STRETCH 배 늘리면 **화면 좌표가 평면 더미와 픽셀 단위로 겹친다.**
 *   그래서 바닥 좌표(toFloor)·HUD 자리(screenOf)·캐릭터 클릭은 평면 더미와 같은 식(Projection)을 쓰고,
 *   가구 클릭만 실제 3D 모양에 광선을 쏴서 판정한다.
 * 색 — 면마다 아트보드의 [윗면, 앞면, 옆면] 3색을 그대로 칠한다(조명 계산 없음). 조명은 VRM 캐릭터용으로만 켜 둔다.
 *   예외 — 카탈로그에 3D 모델(glb)이 있는 가구(슬롯머신 등)는 그 모델을 세운다. 모델은 금속·광택 재질이라 조명 + 반사 환경을 받는다.
 * 좌표 — 방 좌표 (x, y, z) 를 three 의 (X, Y, Z) = (x, z, y) 로 둔다. 1칸 = 1.
 *
 * 캐릭터 — 치비 VRM(지금은 다섯 종목 모두 같은 모델, roomAssets.ts). 모델을 받기 전·못 받았을 땐 도형(캡슐 + 구)으로 선다.
 *   모션은 아직 없다 — 팔만 내린 기본 자세로 서서, 걷는 쪽을 바라보고, 머리카락만 흔들린다.
 */

const ACCENT = '#F2564C';
/** 높이 보정 — 투영식의 높이 1칸(Z)과 직교 카메라의 높이 1칸(√(1−K²))의 비 */
const H_STRETCH = VIEW.Z / Math.sqrt(1 - VIEW.K * VIEW.K);
/** 하이라이트 외곽선 두께(px) */
const OUTLINE_PX = 2.5;
/** 선택 테 두께(px) — VRM 캐릭터 */
const SELECT_PX = 2;
/**
 * 그리기는 두 번 — ① 바닥에 붙은 것(방 껍데기·러그, 이 레이어) ② 깊이를 지우고 나머지(가구·캐릭터·외곽선).
 * 외곽선은 대상을 px 만큼 부풀린 모양의 **뒷면**을 흰색으로 그린다(깊이 검사 함). 대상 자신이 앞에서 덮어 테두리만 남고,
 * 뒤에 있는 가구 위에는 남고, 앞을 가리는 가구에는 가려진다(평면 더미의 SVG 외곽선과 같은 모양).
 * 벽·바닥은 ①에서 끝나고 깊이가 지워지므로 벽에 붙은 가구도 테두리가 벽에 묻히지 않는다.
 */
const GROUND_LAYER = 1;

/** 서 있을 때 바라보는 쪽 — 카메라 쪽(방을 돌린 각과 같다) */
const FACE_CAMERA = VIEW.TH;
/** 도는 빠르기 — 1초에 남은 각의 이만큼씩 */
const TURN_RATE = 10;

/**
 * 몸 동작(VRMA) — 2026-10-12 도휘가 만든 셋.
 *   idle   멈춰 서 있을 때 반복
 *   walk   걷는 동안 반복(제자리 걸음 — 앞으로 나가는 건 RoomLoop 이 옮긴다)
 *   pickup 들려 있는 동안 — 2026-10-12 밤에 두 버전을 비교 시험 중(PICKUP40_TEST):
 *          pickup40 버둥거림 반복 / pickup60 40프레임 버둥거리다 20프레임 동안 축 처지고 마지막 프레임 유지
 * 무엇을 틀지는 렌더러가 캐릭터 상태로 정한다 — 들림 → pickup, 방금 움직였음 → walk, 그 밖 → idle.
 * 동작 파일을 받기 전이면 기본 자세(REST_POSE, 'rest').
 * 엔진 모션(play)은 같은 재생기로 튼다(2026-10-18 — 재생기는 캐릭터마다 하나). 순서: 들림 > 엔진 모션 > 걷기·대기
 */
type Pose = 'rest' | 'idle' | 'walk' | 'pickup' | 'engine'; // 'engine' = 엔진이 맡긴 모션을 트는 중 — wantPose 가 idle·walk 로 바꾸지 않는다
/**
 * 엔진 모션 파일 자리. 클립 이름 = 파일 이름(확장자 빼고). 없는 파일은 건너뛴다.
 * 미리보기 한 장(vite.preview-room.config.ts)은 아직 이 폴더를 넣지 않는다 — 모션 파일이 생기면 그쪽도 넣을 것
 */
const MOTION_URL = (clip: string) => `${import.meta.env.BASE_URL}characters/chibi/motions/${clip}.vrma`;

/** 엔진 요청 하나 — 몇 번째 단계를 틀고 있는지, 끝나면 부를 것 */
interface EngineRun {
  token: number;
  steps: MotionStep[];
  /** 지금 단계 — 파일을 받는 중이면 action 이 null */
  i: number;
  action: THREE.AnimationAction | null;
  onFinish: () => void;
}
/** 마지막으로 움직인 뒤 이만큼 지나면 멈춘 것으로 본다(ms) — 걷는 동안 매 프레임 move 가 온다 */
const STILL_MS = 150;
/** 동작이 바뀔 때 섞는 시간(초) — 집어 들 때는 들기 동작이 바로 보이게 짧게 */
const POSE_FADE_S = 0.3;
const PICKUP_FADE_S = 0.08;
/**
 * 들기 동작 비교 시험(2026-10-12 도휘) — 이 종목들은 pickup40, 나머지는 pickup60.
 * 기본 거실 다섯 중 둘(삼성전자·SK하이닉스)이 40, 셋(카카오·NAVER·엔비디아)이 60. 하나로 정하면 이 표를 지운다
 */
const PICKUP40_TEST = new Set(['005930', '000660']);
/** pickup60 에서 힘이 빠지기 시작하는 때(초) — 40프레임째(30fps). 여기부터 끝까지 대롱대롱이 점점 헐거워진다(swing.ts limp) */
const PICKUP60_LIMP_FROM_S = 40 / 30;

/** 기본 자세 — T자로 벌린 팔을 내린다(정규화 뼈 기준, 모델은 +Z 를 본다). 동작이 다 빠지면 이 자세로 돌아온다 */
const REST_POSE: [VRMHumanBoneName, number][] = [
  ['leftUpperArm', -1.2],
  ['rightUpperArm', 1.2],
  ['leftLowerArm', -0.15],
  ['rightLowerArm', 0.15],
];

/**
 * VRM 캐릭터 테두리 — 스키닝된 모양을 법선 방향으로 width(모델 좌표) 만큼 부풀려 뒷면을 그린다.
 * 순서가 핵심이다: 가구(0) → 테두리(RIM_ORDER, 깊이는 검사만) → 캐릭터 몸(BODY_ORDER).
 *   테두리는 뒤 가구 위에는 남고 앞 가구에는 가려지며, 깊이를 안 남기므로 뒤이어 그리는 몸이 실루엣 안쪽을 전부 덮는다.
 *   (양면 머리카락·눈처럼 얇은 면이 많아 깊이만으로는 안쪽에 테두리 색이 비친다)
 * 셰이더에 붙이는 값(width)이 재질마다 따로 걸리도록 프로그램 key 를 다르게 준다.
 */
const RIM_ORDER = 1;
const BODY_ORDER = 2;
function rimMaterial(color: string, width: { value: number }, key: string): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, depthWrite: false });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.rimWidth = width;
    sh.vertexShader = 'uniform float rimWidth;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed += normalize( normal ) * rimWidth;');
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/** 방 좌표 → three 좌표 */
const v3 = (x: number, y: number, z = 0) => new THREE.Vector3(x, z, y);

/** CSS 색 문자열 → three 색 + 불투명도 ('rgba(…)' 의 알파를 살린다) */
function paint(style: string): { color: THREE.Color; opacity: number } {
  const m = /^rgba?\(([^)]+)\)$/.exec(style.trim());
  if (m) {
    const [r, g, b, a = '1'] = m[1].split(',').map((t) => t.trim());
    return { color: new THREE.Color().setRGB(+r / 255, +g / 255, +b / 255, THREE.SRGBColorSpace), opacity: +a };
  }
  if (!style) return { color: new THREE.Color('#000'), opacity: 0 };
  return { color: new THREE.Color(style), opacity: 1 };
}

/**
 * 슬롯머신 한 판(초) {잠정 — 보면서 맞출 것}. 레버를 당겼다 놓으면 릴 셋이 돌다가 왼쪽부터 차례로 선다.
 * 레버 · 릴은 모델 안의 Lever · Reel_L/M/R 노드를 X축으로 돌린다(build_slot.py — 레버 +100° 가 끝까지 당긴 모양,
 * 릴은 둘레 6칸이라 k×60° 면 k번 그림이 정면 — reel_symbols.py)
 */
const SLOT = {
  pull: 0.22,
  back: 0.4,
  leverMax: (100 * Math.PI) / 180,
  reelStart: 0.18,
  /** 릴마다 서는 시각과 그때까지 도는 바퀴 수 */
  reelStop: [1.1, 1.5, 1.9],
  turns: [3, 4, 5],
  /** 설 때 살짝 튕기는 정도(라디안) · 시간 */
  bounce: 0.14,
  bounceT: 0.25,
} as const;
const easeIn = (u: number) => u * u;
const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;
const easeOutBack = (u: number, k = 1.6) => 1 + (k + 1) * (u - 1) ** 3 + k * (u - 1) ** 2;
const clamp01 = (u: number) => Math.min(1, Math.max(0, u));

interface SlotRun {
  t: number;
  lever: THREE.Object3D | null;
  reels: { node: THREE.Object3D; from: number; to: number; t1: number }[];
}

interface FurnNode {
  furnitureId: number;
  pos: Pt;
  rotation: number;
  group: THREE.Group;
  /** 클릭 판정 대상(선·외곽선 제외) */
  meshes: THREE.Mesh[];
  /** 드롭 하이라이트 외곽선 — 켤 때만 만든다 */
  hull: THREE.Group | null;
  /** 다시 지을 때마다 올라간다 — 늦게 도착한 모델이 옛 모양에 붙지 않게 */
  build: number;
  /** 3D 모델을 세웠으면 그 배율(모델 1m → 칸)과 외곽선 재질 — 외곽선은 캐릭터처럼 모양을 부풀려 그린다 */
  model: { scale: number } | null;
  rim: { width: { value: number }; mat: THREE.MeshBasicMaterial } | null;
  /** 슬롯머신 한 판이 도는 중(pullLever) */
  anim: SlotRun | null;
}

interface CharNode {
  /** 이 캐릭터의 id(spawn 때 받은 것) — 치워졌는지 확인할 때 종목 코드를 id 로 가정하지 않게 */
  id: string;
  def: CharacterDef;
  pos: Pt;
  clothesId: number | null;
  group: THREE.Group;
  figure: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  shadow: THREE.Mesh;
  /** 선택 표시 — 머리 둘레 강조색 테 */
  ring: THREE.Mesh;
  /** 드롭 하이라이트 — 머리+몸 둘레 흰 테 */
  hull: THREE.Group;
  materials: { body: THREE.MeshBasicMaterial; head: THREE.MeshBasicMaterial; shadow: THREE.MeshBasicMaterial };
  /** VRM 을 담는 자리 — 크기·발 높이·방향을 여기서 맞춘다 */
  holder: THREE.Group;
  vrm: VRM | null;
  /** 몸 동작 — 모션 파일을 받기 전이면 null(기본 자세로 선다) */
  mixer: THREE.AnimationMixer | null;
  actions: Partial<Record<Exclude<Pose, 'rest'>, THREE.AnimationAction>>;
  /** 기본 자세(idle_chibi · walk_chibi) — 엔진이 준 자세(setBasePose) 파일이 없을 때 돌아올 자리 */
  defaultActions: { idle?: THREE.AnimationAction; walk?: THREE.AnimationAction };
  /** 엔진이 준 자세 클립별 동작 · 요청 번호(새 자세가 오면 올라감 — 늦게 온 파일을 버리는 데) */
  poseActions: Map<string, THREE.AnimationAction>;
  poseToken: number;
  pose: Pose;
  /** 마지막으로 걸은 시각(performance.now) — 멈춘 걸 알아보는 데 쓴다 */
  movedAt: number;
  /** 엔진이 맡긴 모션(없으면 null) · 요청 번호(새 요청·취소마다 올라감 — 늦게 온 파일·신호를 버리는 데) · 클립별 동작 */
  engine: EngineRun | null;
  engineToken: number;
  /** 클립마다 동작 두 벌 — 같은 클립을 이어 틀거나 사라지는 중에 다시 틀 때 번갈아 써서 섞이게 */
  engineActions: Map<string, [THREE.AnimationAction, THREE.AnimationAction]>;
  /** 모델·기본 동작을 다 받았는가(true) / 못 받았거나 치워졌는가(false). 그 전에 온 엔진 요청은 이걸 기다린다 */
  whenReady: Promise<boolean>;
  setReady: (ok: boolean) => void;
  /** 들고 있을 때 대롱대롱(swing.ts) — VRMA 자세 위에 얹는 기울기 */
  swing: Swing;
  /** VRM 테두리 — 메시마다 같은 뼈를 쓰는 복제본 하나씩(선택 = 강조색, 드롭 하이라이트 = 흰색) */
  rims: THREE.Mesh[];
  /** 걷는 쪽(라디안) · 지금 몸 방향 */
  heading: number;
  yaw: number;
  selected: boolean;
  lifted: boolean;
  /** 배치 모드 — 그림자까지 통째로 숨긴다 */
  hidden: boolean;
  outlined: boolean;
}

export class RoomScene implements RoomRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly furniture: FurnitureCatalog;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 400);
  /** 방 전체 — 높이 보정(H_STRETCH)을 여기 한 번만 건다 */
  private readonly root = new THREE.Group();
  private readonly furnLayer = new THREE.Group();
  private readonly charLayer = new THREE.Group();
  private readonly overlay = new THREE.Group();
  private proj = new Projection(30, 600, 100);
  private size = { w: 0, h: 0 };
  private readonly chars = new Map<string, CharNode>();
  private readonly furn = new Map<number, FurnNode>();
  private highlighted: number | null = null;
  private dropTarget: DropTarget | null = null;
  private ghost: { furnitureId: number; pos: Pt; rotation: number } | null = null;
  private raf = 0;
  private readonly raycaster = new THREE.Raycaster();
  /** 같은 색 재질은 하나로 — 그리기 명령과 메모리를 아낀다 */
  private readonly meshMats = new Map<string, THREE.MeshBasicMaterial>();
  private readonly lineMats = new Map<string, THREE.LineBasicMaterial>();
  private readonly hullMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', side: THREE.BackSide });
  /** VRM 테두리 두께(모델 좌표) · 재질 */
  private readonly rimWidth = { white: { value: 0 }, accent: { value: 0 } };
  private readonly rimWhite = rimMaterial('#FFFFFF', this.rimWidth.white, 'rim-white');
  private readonly rimAccent = rimMaterial(ACCENT, this.rimWidth.accent, 'rim-accent');
  private readonly loader = new GLTFLoader().register((p) => new VRMLoaderPlugin(p)).register((p) => new VRMAnimationLoaderPlugin(p));
  /** 가구 모델(glb) — VRM 확장 없이 받는다. 주소별로 한 번 받아 원본을 두고, 놓을 때마다 복제한다 */
  private readonly furnLoader = new GLTFLoader();
  private readonly furnModels = new Map<string, Promise<THREE.Object3D | null>>();
  private readonly modelSources: THREE.Object3D[] = [];
  /** 모델 원본의 도형 — 복제본이 같이 쓰므로 가구를 다시 지을 때 지우지 않는다 */
  private readonly modelGeos = new Set<THREE.BufferGeometry>();
  /** 모델 가구용 반사 환경 — 처음 모델을 받을 때 만든다 */
  private envMap: THREE.Texture | null = null;
  /** 엔진 모션 파일 — 클립 이름별로 처음 한 번 받아 모든 캐릭터가 같이 쓴다. 없는 파일은 null */
  private readonly engineFiles = new Map<string, Promise<VRMAnimation | null>>();
  /** 동작 파일 — 처음 한 번 받아 모든 캐릭터가 같이 쓴다. 들기는 비교 시험 중이라 둘(pickup40 · pickup60) */
  private motionFiles: Promise<Partial<Record<'idle' | 'walk' | 'pickup40' | 'pickup60', VRMAnimation>>> | null = null;
  /** 모델 파일 — 주소별로 한 번 받아 캐릭터마다 따로 푼다(뼈·머리카락 흔들림이 캐릭터마다 따로라서). 없는 파일은 null */
  private readonly modelFiles = new Map<string, Promise<ArrayBuffer | null>>();
  /** 개발 모드 — 파일 없는 엔진 단계를 이만큼(ms) 대기 자세로 채운다(holdMissingClips). null 이면 건너뜀 */
  private holdMs: number | null = null;
  /** 모델 크기 맞춤 — 첫 캐릭터에서 한 번 잰다 */
  private fit: { scale: number; footY: number } | null = null;
  private lastFrame = 0;
  private disposed = false;
  private readonly ringMat = new THREE.MeshBasicMaterial({ color: ACCENT, side: THREE.BackSide });
  private readonly owned: { dispose(): void }[] = [];
  /** 화면 가로(오른쪽) — 바닥과 나란하다. 대롱대롱이 마디 끝을 미는 쪽 */
  private readonly screenRight = new THREE.Vector3(Math.cos(VIEW.TH), 0, -Math.sin(VIEW.TH));

  constructor(canvas: HTMLCanvasElement, furniture: FurnitureCatalog) {
    this.canvas = canvas;
    this.furniture = furniture;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    this.raycaster.layers.enableAll();
    this.root.scale.y = H_STRETCH;
    this.root.add(this.furnLayer, this.charLayer, this.overlay);
    this.scene.add(this.root);
    // VRM(MToon) 캐릭터용 조명 — 개별종목 화면과 같은 값. 면색 재질(방·가구)에는 영향이 없다
    const sun = new THREE.DirectionalLight('#FFFFFF', 1.5);
    sun.position.set(1.2, 1.6, 1.0);
    this.scene.add(new THREE.AmbientLight('#FFFFFF', 0.55), sun);
    this.buildShell();
    // 미리보기·테스트가 화면 상태를 읽는 손잡이 — 앱 동작에는 쓰지 않는다
    (canvas as HTMLCanvasElement & { roomScene?: RoomScene }).roomScene = this;
  }

  /* ── 크기 · 카메라 ─────────────────────────────────────── */

  resize(scale: number, ox: number, oy: number, width: number, height: number): void {
    this.proj = new Projection(scale, ox, oy);
    if (this.size.w !== width || this.size.h !== height) this.renderer.setSize(width, height); // 줌·끌기 때는 캔버스를 다시 만들지 않는다
    this.size = { w: width, h: height };
    const { TH, K } = VIEW;
    const c = Math.cos(TH);
    const s = Math.sin(TH);
    const right = new THREE.Vector3(c, 0, -s);
    const up = new THREE.Vector3(-K * s, Math.sqrt(1 - K * K), -K * c);
    const back = new THREE.Vector3().crossVectors(right, up);
    const cam = this.camera;
    cam.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, back));
    cam.position.copy(back).multiplyScalar(150);
    // 화면 x = ox + (right·P)·scale, 화면 y = oy − (up·P)·scale 이 되도록 시야를 자른다
    cam.left = -ox / scale;
    cam.right = (width - ox) / scale;
    cam.top = oy / scale;
    cam.bottom = (oy - height) / scale;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // 픽셀 두께를 쓰는 것들(외곽선·점선)은 축척이 바뀌면 다시 만든다
    this.sizeRims();
    for (const ch of this.chars.values()) this.drawChar(ch);
    this.highlightFurniture(this.highlighted);
    this.applyDropTarget();
    this.invalidate();
  }

  /** 다음 프레임에 한 번 그린다 — 바뀐 게 없으면 그리지 않는다(VRM 캐릭터가 있으면 매 프레임) */
  private invalidate(): void {
    if (this.raf || this.size.w === 0 || this.disposed) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private frame(t: number): void {
    this.raf = 0;
    const dt = this.lastFrame ? Math.min((t - this.lastFrame) / 1000, 0.05) : 0;
    let live = false;
    for (const c of this.chars.values()) {
      if (!c.vrm) continue;
      this.animate(c, dt);
      live = true;
    }
    for (const f of this.furn.values()) {
      if (!f.anim) continue;
      this.animateSlot(f, dt);
      live = true;
    }
    this.render();
    // VRM 은 머리카락 흔들림·도는 동작이 프레임마다 바뀐다 — 계속 그린다
    this.lastFrame = live ? t : 0;
    if (live) this.invalidate();
  }

  /** ① 바닥 레이어 → 깊이 지움 → ② 나머지 (GROUND_LAYER 설명 참고) */
  private render(): void {
    const r = this.renderer;
    const cam = this.camera;
    r.clear();
    cam.layers.set(GROUND_LAYER);
    r.render(this.scene, cam);
    r.clearDepth();
    cam.layers.set(0);
    r.render(this.scene, cam);
  }

  /* ── 재질 ──────────────────────────────────────────────── */

  private meshMat(style: string): THREE.MeshBasicMaterial {
    let m = this.meshMats.get(style);
    if (!m) {
      const { color, opacity } = paint(style);
      // 면을 살짝 뒤로 밀어 모서리 선이 면에 묻히지 않게
      m = new THREE.MeshBasicMaterial({ color, opacity, transparent: opacity < 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      this.meshMats.set(style, m);
    }
    return m;
  }

  private lineMat(style: string): THREE.LineBasicMaterial {
    let m = this.lineMats.get(style);
    if (!m) {
      const { color, opacity } = paint(style);
      m = new THREE.LineBasicMaterial({ color, opacity, transparent: opacity < 1 });
      this.lineMats.set(style, m);
    }
    return m;
  }

  private line(points: THREE.Vector3[], style: string, loop = false): THREE.Line {
    const g = new THREE.BufferGeometry().setFromPoints(points);
    return loop ? new THREE.LineLoop(g, this.lineMat(style)) : new THREE.Line(g, this.lineMat(style));
  }

  /* ── 방 껍데기 ─────────────────────────────────────────── */

  private buildShell(): void {
    const shell = new THREE.Group();
    const T = VIEW.SLAB;

    // 바닥 판 — 윗면은 타일, 앞면·옆면은 두께 색
    const floorTex = this.floorTexture();
    const floorTop = new THREE.MeshBasicMaterial({ map: floorTex, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    this.owned.push(floorTex, floorTop);
    const right = this.meshMat(SHELL.slabRight);
    const front = this.meshMat(SHELL.slabFront);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(ROOM, T, ROOM), [right, right, floorTop, front, front, front]);
    slab.position.set(ROOM / 2, -T / 2, ROOM / 2);
    const slabEdges = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), this.lineMat(SHELL.slabEdge));
    slabEdges.position.copy(slab.position);
    shell.add(slab, slabEdges, this.line([v3(0, 0), v3(ROOM, 0), v3(ROOM, ROOM), v3(0, ROOM)], SHELL.floorEdge, true));

    // 벽 두 장 — 위로 갈수록 어둡게(아트보드의 그라데이션을 꼭짓점 색으로). 이음선 없이 한 장씩
    shell.add(this.wall('back'), this.wall('left'));
    // 벽 두께 — 윗면과 열린 쪽 끝 단면만 보인다(모형처럼)
    const capBack = new THREE.Mesh(new THREE.BoxGeometry(ROOM + WALL_T, WALL_H + T, WALL_T), [
      this.meshMat(SHELL.backEnd), this.meshMat(SHELL.backEnd), this.meshMat(SHELL.backTop), this.meshMat(SHELL.backEnd), this.meshMat(SHELL.backEnd), this.meshMat(SHELL.backEnd),
    ]);
    capBack.position.copy(v3((ROOM - WALL_T) / 2, -WALL_T / 2 - 0.01, (WALL_H - T) / 2)); // 벽 면과 겹치지 않게 살짝 뒤로
    const capLeft = new THREE.Mesh(new THREE.BoxGeometry(WALL_T, WALL_H + T, ROOM), [
      this.meshMat(SHELL.leftEnd), this.meshMat(SHELL.leftEnd), this.meshMat(SHELL.leftTop), this.meshMat(SHELL.leftEnd), this.meshMat(SHELL.leftEnd), this.meshMat(SHELL.leftEnd),
    ]);
    capLeft.position.copy(v3(-WALL_T / 2 - 0.01, ROOM / 2, (WALL_H - T) / 2));
    for (const cap of [capBack, capLeft]) {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(cap.geometry), this.lineMat(SHELL.wallEdge));
      edges.position.copy(cap.position);
      shell.add(cap, edges);
    }

    // 걸레받이 · 몰딩 선
    const panel = (wall: 'back' | 'left', a0: number, a1: number, z0: number, z1: number, style: string, off: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(a1 - a0, z1 - z0), this.meshMat(style));
      if (wall === 'back') m.position.set((a0 + a1) / 2, (z0 + z1) / 2, off);
      else {
        m.rotation.y = Math.PI / 2;
        m.position.set(off, (z0 + z1) / 2, (a0 + a1) / 2);
      }
      return m;
    };
    const onWall = (wall: 'back' | 'left', a: number, z: number, off: number) => (wall === 'back' ? v3(a, off, z) : v3(off, a, z));
    shell.add(panel('back', 0, ROOM, 0, SHELL.baseH, SHELL.backBase, 0.01), panel('left', 0, ROOM, 0, SHELL.baseH, SHELL.leftBase, 0.01));
    for (const m of SHELL.moldings) {
      shell.add(this.line([onWall('back', 0, m.z, 0.02), onWall('back', ROOM, m.z, 0.02)], m.stroke), this.line([onWall('left', 0, m.z, 0.02), onWall('left', ROOM, m.z, 0.02)], m.stroke));
    }

    // 벽 소품 — 창·TV·선반·액자 (평면 더미와 같은 데이터)
    for (const w of WALL_PANELS) {
      shell.add(panel(w.wall, w.a0, w.a1, w.z0, w.z1, w.fill, 0.015));
      const q = (a: number, z: number) => onWall(w.wall, a, z, 0.02);
      shell.add(this.line([q(w.a0, w.z0), q(w.a1, w.z0), q(w.a1, w.z1), q(w.a0, w.z1)], w.stroke, true));
    }
    for (const l of WALL_LINES) shell.add(this.line([onWall(l.wall, l.a0, l.z0, 0.025), onWall(l.wall, l.a1, l.z1, 0.025)], l.stroke));

    shell.traverse((o) => o.layers.set(GROUND_LAYER));
    this.root.add(shell);
  }

  /** 벽 한 장 — 높이에 따라 검게 섞은 색을 꼭짓점마다 칠한다 */
  private wall(which: 'back' | 'left'): THREE.Mesh {
    const g = new THREE.PlaneGeometry(ROOM, WALL_H, 1, 60);
    const base = new THREE.Color(which === 'back' ? SHELL.backWall : SHELL.leftWall);
    const srgb = { r: 0, g: 0, b: 0 };
    base.getRGB(srgb, THREE.SRGBColorSpace);
    const pos = g.getAttribute('position');
    const colors: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getY(i) + WALL_H / 2;
      const fromTop = (WALL_H - z) / WALL_H;
      const dark = SHELL.fadeTop * Math.max(0, 1 - fromTop / SHELL.fadeTo);
      c.setRGB(srgb.r * (1 - dark), srgb.g * (1 - dark), srgb.b * (1 - dark), THREE.SRGBColorSpace);
      colors.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    // 벽에 붙은 소품·걸레받이와 같은 만큼 뒤로 민다 — 비스듬히 보이는 왼벽에서 소품이 벽 뒤로 숨지 않게
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    this.owned.push(mat);
    const m = new THREE.Mesh(g, mat);
    if (which === 'back') m.position.set(ROOM / 2, WALL_H / 2, 0);
    else {
      m.rotation.y = Math.PI / 2;
      m.position.set(0, WALL_H / 2, ROOM / 2);
    }
    return m;
  }

  /** 바닥 타일 — 캔버스에 그려 붙인다. 캔버스 왼쪽 위 = 방 (0, 0) */
  private floorTexture(): THREE.CanvasTexture {
    const T = 48; // 1칸 = 48px — 30×30 방이면 1440px 한 장
    const cv = document.createElement('canvas');
    cv.width = cv.height = ROOM * T;
    const ctx = cv.getContext('2d')!;
    for (let i = 0; i < ROOM; i++) {
      for (let j = 0; j < ROOM; j++) {
        ctx.fillStyle = SHELL.tiles[(i + j) % 2];
        ctx.fillRect(i * T, j * T, T, T);
        ctx.strokeStyle = SHELL.tileLine;
        ctx.lineWidth = 2;
        ctx.strokeRect(i * T + 1, j * T + 1, T - 2, T - 2);
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    return tex;
  }

  /* ── 가구 ──────────────────────────────────────────────── */

  placeFurniture(placementId: number, furnitureId: number, pos: Pt, rotation: number): void {
    const def = this.furniture.def(furnitureId);
    if (!def) return;
    let f = this.furn.get(placementId);
    if (!f) {
      f = { furnitureId, pos, rotation, group: new THREE.Group(), meshes: [], hull: null, build: 0, model: null, rim: null, anim: null };
      this.furnLayer.add(f.group);
      this.furn.set(placementId, f);
    }
    f.furnitureId = furnitureId;
    f.pos = pos;
    f.rotation = rotation;
    this.buildFurniture(placementId, f);
    if (this.highlighted === placementId) this.highlightFurniture(placementId);
    if (this.dropTarget?.kind === 'furniture' && this.dropTarget.placementId === placementId) this.applyDropTarget();
    this.invalidate();
  }

  removeFurniture(placementId: number): void {
    const f = this.furn.get(placementId);
    if (!f) return;
    this.clearGroup(f.group);
    f.group.removeFromParent();
    f.rim?.mat.dispose();
    this.furn.delete(placementId);
    if (this.highlighted === placementId) this.highlightFurniture(null);
    this.invalidate();
  }

  /** 가구 하나를 상자들로 — 모양은 평면 더미와 같은 shapeOf */
  private buildFurniture(placementId: number, f: FurnNode): void {
    const def = this.furniture.def(f.furnitureId)!;
    this.clearGroup(f.group);
    f.meshes = [];
    f.hull = null;
    f.model = null;
    f.anim = null; // 다시 지으면 새 복제본이라 돌던 노드가 없어진다
    const build = ++f.build;
    const isRug = def.kind === 'rug';
    const shape = shapeOf(def, f.pos, f.rotation);
    for (const pt of shape.parts) {
      const objs = isRug || pt.z1 - pt.z0 < 0.05 ? this.flatPart(pt, def.colors[1]) : this.boxPart(pt, (style) => this.meshMat(style), 'rgba(255,255,255,0.09)');
      for (const o of objs) {
        f.group.add(o);
        if (o instanceof THREE.Mesh) f.meshes.push(o);
      }
    }
    for (const b of shape.blobs) {
      const mat = this.meshMat(b.opacity < 1 ? this.withAlpha(b.color, b.opacity) : b.color);
      const geo = b.flat ? new THREE.CircleGeometry(b.r, 28) : new THREE.SphereGeometry(b.r, 20, 14);
      const m = new THREE.Mesh(geo, mat);
      if (b.flat) m.rotation.x = -Math.PI / 2;
      m.position.copy(v3(b.x, b.y, b.z));
      m.userData.blob = { r: b.r, flat: !!b.flat };
      f.group.add(m);
      f.meshes.push(m);
    }
    for (const m of f.meshes) m.userData.placementId = placementId;
    for (const m of f.meshes) m.userData.rug = isRug;
    if (isRug) f.group.traverse((o) => o.layers.set(GROUND_LAYER));
    // 모델이 있으면 받는 동안은 위 상자로 두고, 받으면 바꿔 끼운다
    if (def.model) void this.attachFurnitureModel(placementId, f, def.model, def.h, build);
  }

  /**
   * 가구 모델(glb)을 상자와 바꿔 끼운다 — 못 받으면 상자 그대로.
   * 키(h 칸)에 맞춰 고르게 늘리고 바닥 자리 가운데에 세운다. 회전 0 = 모델 정면(+Z)이 방 앞쪽(+y) — 등이 뒷벽 쪽(shapeOf 와 같은 규칙)
   */
  private async attachFurnitureModel(placementId: number, f: FurnNode, url: string, height: number, build: number): Promise<void> {
    const src = await this.furnitureModel(url);
    if (!src || this.disposed || this.furn.get(placementId) !== f || f.build !== build) return;
    const box = new THREE.Box3().setFromObject(src);
    const scale = height / Math.max(box.max.y - box.min.y, 1e-3);
    const obj = src.clone(true);
    obj.scale.setScalar(scale);
    obj.position.set(-((box.min.x + box.max.x) / 2) * scale, -box.min.y * scale, -((box.min.z + box.max.z) / 2) * scale);
    const holder = new THREE.Group();
    holder.add(obj);
    holder.position.copy(v3(f.pos.x, f.pos.y, 0));
    holder.rotation.y = -(f.rotation * Math.PI) / 180;
    this.clearGroup(f.group);
    f.meshes = [];
    f.hull = null;
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.userData.placementId = placementId;
      m.userData.rug = false;
      m.renderOrder = BODY_ORDER; // 외곽선(RIM_ORDER)이 깊이를 안 남기니 모델이 뒤에 그려 안쪽을 덮는다
      f.meshes.push(m);
    });
    f.group.add(holder);
    f.model = { scale };
    if (this.highlighted === placementId) this.highlightFurniture(placementId);
    if (this.dropTarget?.kind === 'furniture' && this.dropTarget.placementId === placementId) this.applyDropTarget();
    this.invalidate();
  }

  /**
   * 가구 모델 원본 — 주소마다 한 번 받는다. 모델은 금속·광택 재질이라 반사 환경을 준다
   * (방에는 캐릭터용 조명만 있고 비칠 주변이 없어서, 안 주면 금속 부분이 거의 검게 나온다)
   */
  private furnitureModel(url: string): Promise<THREE.Object3D | null> {
    let p = this.furnModels.get(url);
    if (!p) {
      p = (async () => {
        try {
          const r = await fetch(url);
          if (!r.ok) throw new Error(`${r.status} ${url}`);
          const g = await this.furnLoader.parseAsync(await r.arrayBuffer(), '');
          if (this.disposed) return null;
          const env = this.environment();
          g.scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            this.modelGeos.add(m.geometry);
            for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
              if (mat instanceof THREE.MeshStandardMaterial) mat.envMap = env;
            }
          });
          g.scene.updateMatrixWorld(true);
          this.modelSources.push(g.scene);
          return g.scene;
        } catch (e) {
          console.warn('[RoomScene] 가구 모델을 못 불러와 상자로 둡니다', url, e);
          return null;
        }
      })();
      this.furnModels.set(url, p);
    }
    return p;
  }

  /**
   * 슬롯머신 한 판 — 레버를 당겼다 놓고, 릴 셋이 돌다가 왼쪽부터 차례로 선다(서는 그림은 무작위).
   * 지금은 미리보기 버튼만 부른다 {잠정 — 캐릭터가 당기는 상호작용(엔진 명령)이 정해지면 RoomRenderer 약속으로 올린다}.
   * 모델을 아직 못 받았거나 Lever · Reel_* 이 없으면 false. 도는 중이면 새로 시작하지 않는다
   */
  pullLever(placementId: number): boolean {
    const f = this.furn.get(placementId);
    if (!f?.model || f.anim) return false;
    const lever = f.group.getObjectByName('Lever') ?? null;
    const nodes = ['Reel_L', 'Reel_M', 'Reel_R'].map((n) => f.group.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o);
    if (!lever && nodes.length === 0) return false;
    const turn = 2 * Math.PI;
    const reels = nodes.map((node, i) => {
      const from = node.rotation.x % turn;
      node.rotation.x = from;
      // 앞면이 아래로 굴러가는 쪽(+X)으로 몇 바퀴 돌고 k번 그림에서 선다
      const k = Math.floor(Math.random() * 6);
      const least = from + SLOT.turns[i] * turn;
      let to = Math.floor(least / turn) * turn + (k * Math.PI) / 3;
      if (to < least) to += turn;
      return { node, from, to, t1: SLOT.reelStop[i] };
    });
    f.anim = { t: 0, lever, reels };
    this.invalidate();
    return true;
  }

  private animateSlot(f: FurnNode, dt: number): void {
    const a = f.anim!;
    a.t += dt;
    const t = a.t;
    if (a.lever) {
      const pulled = t < SLOT.pull ? easeIn(clamp01(t / SLOT.pull)) : 1 - easeOutBack(clamp01((t - SLOT.pull) / SLOT.back));
      a.lever.rotation.x = SLOT.leverMax * pulled;
    }
    let done = t >= SLOT.pull + SLOT.back;
    for (const r of a.reels) {
      if (t < r.t1) {
        r.node.rotation.x = r.from + (r.to - r.from) * easeOutCubic(clamp01((t - SLOT.reelStart) / (r.t1 - SLOT.reelStart)));
        done = false;
      } else if (t < r.t1 + SLOT.bounceT) {
        // 서는 순간 살짝 넘었다 돌아온다
        const u = (t - r.t1) / SLOT.bounceT;
        r.node.rotation.x = r.to + SLOT.bounce * Math.sin(Math.PI * u) * (1 - u);
        done = false;
      } else r.node.rotation.x = r.to;
    }
    if (done) {
      if (a.lever) a.lever.rotation.x = 0;
      f.anim = null;
    }
  }

  private environment(): THREE.Texture {
    if (!this.envMap) {
      const pm = new THREE.PMREMGenerator(this.renderer);
      const room = new RoomEnvironment();
      this.envMap = pm.fromScene(room, 0.04).texture;
      room.dispose();
      pm.dispose();
    }
    return this.envMap;
  }

  /** 높이가 있는 상자 — [윗면, 앞면, 옆면] 3색 + 옅은 모서리 선 */
  private boxPart(pt: Part, mat: (style: string) => THREE.Material, edge: string): THREE.Object3D[] {
    const { x0, x1, y0, y1, z0, z1, colors } = pt;
    const [top, front, side] = colors;
    // three 상자 면 순서: +X, −X, +Y(위), −Y, +Z(방 앞쪽), −Z
    const mats = [mat(side), mat(side), mat(top), mat(side), mat(front), mat(side)];
    const box = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, z1 - z0, y1 - y0), mats);
    box.position.copy(v3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
    box.userData.part = pt;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), this.lineMat(edge));
    edges.position.copy(box.position);
    return [box, edges];
  }

  /** 납작한 판(러그) — 윗면 색 + 테두리 */
  private flatPart(pt: Part, border: string): THREE.Object3D[] {
    const { x0, x1, y0, y1, z1, colors } = pt;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), this.meshMat(colors[0]));
    plane.rotation.x = -Math.PI / 2;
    plane.position.copy(v3((x0 + x1) / 2, (y0 + y1) / 2, z1));
    const h = z1 + 0.002;
    return [plane, this.line([v3(x0, y0, h), v3(x1, y0, h), v3(x1, y1, h), v3(x0, y1, h)], border || colors[0], true)];
  }

  private withAlpha(style: string, a: number): string {
    const { color } = paint(style);
    const s = { r: 0, g: 0, b: 0 };
    color.getRGB(s, THREE.SRGBColorSpace);
    return `rgba(${Math.round(s.r * 255)},${Math.round(s.g * 255)},${Math.round(s.b * 255)},${a})`;
  }

  pickFurniture(x: number, y: number): number | null {
    const hits = this.rayHits(x, y, [...this.furn.values()].flatMap((f) => f.meshes));
    // 앞에 보이는 것부터 — 러그는 다른 가구가 없을 때만
    const solid = hits.find((h) => !h.object.userData.rug);
    const hit = solid ?? hits[0];
    return hit ? (hit.object.userData.placementId as number) : null;
  }

  private rayHits(x: number, y: number, targets: THREE.Object3D[]): THREE.Intersection[] {
    if (this.size.w === 0) return [];
    const ndc = new THREE.Vector2((x / this.size.w) * 2 - 1, -((y / this.size.h) * 2 - 1));
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObjects(targets, false);
  }

  /** 배치 모드 — 고른 가구의 바닥 자리에 빨간 점선. 가구 위로 보이게 깊이 검사를 끈다(평면 더미와 같게) */
  highlightFurniture(placementId: number | null): void {
    this.highlighted = placementId;
    for (const o of [...this.overlay.children]) if (o.userData.role === 'hl') this.dropObject(o);
    const f = placementId === null ? undefined : this.furn.get(placementId);
    const def = f && this.furniture.def(f.furnitureId);
    if (!f || !def) {
      this.invalidate();
      return;
    }
    const parts = shapeOf(def, f.pos, f.rotation).parts;
    const x0 = Math.min(...parts.map((q) => q.x0));
    const x1 = Math.max(...parts.map((q) => q.x1));
    const y0 = Math.min(...parts.map((q) => q.y0));
    const y1 = Math.max(...parts.map((q) => q.y1));
    const g = new THREE.Group();
    g.userData.role = 'hl';
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(x1 - x0, y1 - y0),
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.1, depthTest: false }),
    );
    fill.rotation.x = -Math.PI / 2;
    fill.position.copy(v3((x0 + x1) / 2, (y0 + y1) / 2, 0.01));
    const s = this.proj.scale;
    const dash = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([v3(x0, y0, 0.01), v3(x1, y0, 0.01), v3(x1, y1, 0.01), v3(x0, y1, 0.01)]),
      new THREE.LineDashedMaterial({ color: ACCENT, dashSize: 6 / s, gapSize: 5 / s, depthTest: false }),
    );
    dash.computeLineDistances();
    for (const o of [fill, dash]) o.renderOrder = 10;
    g.add(fill, dash);
    this.overlay.add(g);
    this.invalidate();
  }

  /** 배치 모드 — 놓일 자리 미리보기(반투명) */
  showGhost(furnitureId: number | null, pos?: Pt, rotation = 0): void {
    for (const o of [...this.overlay.children]) if (o.userData.role === 'ghost') this.dropObject(o);
    this.ghost = furnitureId !== null && pos ? { furnitureId, pos, rotation } : null;
    const def = this.ghost && this.furniture.def(this.ghost.furnitureId);
    if (this.ghost && def) {
      const g = new THREE.Group();
      g.userData.role = 'ghost';
      const mat = (style: string) => new THREE.MeshBasicMaterial({ color: paint(style).color, transparent: true, opacity: 0.55, depthWrite: false });
      for (const pt of shapeOf(def, this.ghost.pos, this.ghost.rotation).parts) {
        for (const o of this.boxPart(pt, mat, '#EDEDEA')) g.add(o);
      }
      this.overlay.add(g);
    }
    this.invalidate();
  }

  furnitureAnchor(placementId: number): Pt | null {
    const f = this.furn.get(placementId);
    const def = f && this.furniture.def(f.furnitureId);
    if (!f || !def) return null;
    // 평면 더미와 같은 자리 — 가구가 화면에서 가장 높이 닿는 점, 가로는 가구 가운데 위
    const shape = shapeOf(def, f.pos, f.rotation);
    let top = Infinity;
    for (const q of shape.parts) {
      for (const x of [q.x0, q.x1]) for (const y of [q.y0, q.y1]) top = Math.min(top, this.proj.p(x, y, q.z1).y);
    }
    for (const b of shape.blobs) top = Math.min(top, this.proj.p(b.x, b.y, b.z).y - b.r * this.proj.scale);
    return { x: this.proj.p(f.pos.x, f.pos.y, def.h).x, y: top };
  }

  /* ── 캐릭터 ────────────────────────────────────────────── */

  spawn(charId: string, def: CharacterDef, pos: Pt): void {
    const mats = {
      body: new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.82 }),
      head: new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 1 }),
      shadow: new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.45, depthWrite: false }),
    };
    const bodyLen = Math.max(0.01, CHAR.bodyTop - CHAR.bodyBottom - 2 * CHAR.bodyR);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(CHAR.bodyR, bodyLen, 6, 16), mats.body);
    body.position.y = (CHAR.bodyTop + CHAR.bodyBottom) / 2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(CHAR.headR, 28, 20), mats.head);
    head.position.y = CHAR.headZ;
    const ring = new THREE.Mesh(head.geometry, this.ringMat);
    ring.position.copy(head.position);
    ring.visible = false;
    // 드롭 하이라이트 — 머리와 몸을 조금 부풀린 흰 실루엣을 먼저 깔아 테두리만 남긴다
    const hull = new THREE.Group();
    const hullBody = new THREE.Mesh(body.geometry, this.hullMat);
    hullBody.position.copy(body.position);
    const hullHead = new THREE.Mesh(head.geometry, this.hullMat);
    hullHead.position.copy(head.position);
    hull.add(hullBody, hullHead);
    hull.visible = false;
    const holder = new THREE.Group();
    const figure = new THREE.Group();
    figure.add(body, head, ring, hull, holder);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 28), mats.shadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.004;
    const group = new THREE.Group();
    group.add(shadow, figure);
    this.charLayer.add(group);
    let setReady: (ok: boolean) => void = () => {};
    const whenReady = new Promise<boolean>((ok) => (setReady = ok));
    const c: CharNode = {
      id: charId, whenReady, setReady, def, pos, clothesId: null, group, figure, body, head, shadow, ring, hull, materials: mats,
      holder, vrm: null, mixer: null, actions: {}, defaultActions: {}, poseActions: new Map(), poseToken: 0, pose: 'rest', movedAt: 0, engine: null, engineToken: 0, engineActions: new Map(), swing: new Swing(), rims: [], heading: FACE_CAMERA, yaw: FACE_CAMERA,
      selected: false, lifted: false, hidden: false, outlined: false,
    };
    this.chars.set(charId, c);
    this.drawChar(c);
    this.invalidate();
    this.attachModel(charId, c).catch((e: unknown) => {
      console.warn('[RoomScene] 캐릭터 모델을 못 불러와 도형으로 둡니다', e);
      c.setReady(false);
    });
  }

  /**
   * 캐릭터를 치운다 — 프리셋을 바꿨을 때. 모델을 받는 중이었으면 받은 뒤에 버려진다(attachModel 이 chars 를 다시 본다).
   * 테두리 복제본은 같이 쓰는 재질이라 먼저 떼고, 모델(텍스처 포함)과 이 캐릭터만의 도형·재질을 버린다
   */
  despawn(charId: string): void {
    const c = this.chars.get(charId);
    if (!c) return;
    this.chars.delete(charId);
    if (this.dropTarget?.kind === 'character' && this.dropTarget.charId === charId) this.dropTarget = null;
    this.dropEngine(c); // 치우면 엔진 요청도 버린다(onFinish 없음)
    c.setReady(false); // 모델을 기다리던 요청도 풀어 준다
    c.mixer?.stopAllAction();
    for (const r of c.rims) r.removeFromParent();
    if (c.vrm) VRMUtils.deepDispose(c.vrm.scene);
    c.vrm = null; // 동작 파일이 늦게 와도 붙이지 않게(attachMotions)
    c.mixer = null;
    c.group.removeFromParent();
    for (const g of [c.body.geometry, c.head.geometry, c.shadow.geometry]) g.dispose();
    for (const m of Object.values(c.materials)) m.dispose();
    this.invalidate();
  }

  /** 모델 파일 한 벌 — 없으면(404 · 개발 서버가 대신 준 HTML) null */
  private modelBytes(url: string): Promise<ArrayBuffer | null> {
    let file = this.modelFiles.get(url);
    if (!file) {
      file = fetch(url).then(
        (r) => (r.ok && !r.headers.get('content-type')?.includes('text/html') ? r.arrayBuffer() : null),
        () => null,
      );
      this.modelFiles.set(url, file);
    }
    return file;
  }

  /**
   * VRM 을 풀어 도형 자리에 세운다 — 종목별 모델(def.modelUrl, 지시서 3-③)이 없으면 기본 치비 모델.
   * 받는 사이 캐릭터가 치워졌거나 화면을 떠났으면 버린다
   */
  private async attachModel(charId: string, c: CharNode): Promise<void> {
    const buf = (c.def.modelUrl && (await this.modelBytes(c.def.modelUrl))) || (await this.modelBytes(ROOM_ASSETS.chibi));
    if (!buf) throw new Error(`모델 파일 없음 ${ROOM_ASSETS.chibi}`);
    if (this.disposed || this.chars.get(charId) !== c) return;
    const gltf = await this.loader.parseAsync(buf, '');
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) throw new Error('VRM 확장이 없는 파일');
    if (this.disposed || this.chars.get(charId) !== c) {
      VRMUtils.deepDispose(gltf.scene);
      return;
    }
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    if (vrm.meta?.metaVersion === '0') VRMUtils.rotateVRM0(vrm);
    for (const [bone, z] of REST_POSE) {
      const n = vrm.humanoid.getNormalizedBoneNode(bone);
      if (n) n.rotation.z = z;
    }
    vrm.update(0);
    vrm.scene.updateMatrixWorld(true);
    if (!this.fit) {
      const box = new THREE.Box3().setFromObject(vrm.scene);
      this.fit = { scale: CHAR.height / Math.max(box.max.y - box.min.y, 1e-3), footY: box.min.y };
      this.sizeRims();
    }
    const meshes: THREE.Mesh[] = [];
    vrm.scene.traverse((o) => {
      o.frustumCulled = false; // 뼈로 움직인 모양은 원래 경계 상자를 벗어난다
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    c.rims = meshes.map((m) => {
      m.renderOrder = BODY_ORDER;
      const rim = m.clone(false);
      rim.material = this.rimWhite;
      rim.renderOrder = RIM_ORDER;
      rim.visible = false;
      m.parent!.add(rim);
      return rim;
    });
    c.holder.scale.setScalar(this.fit.scale);
    c.holder.position.y = -this.fit.footY * this.fit.scale;
    c.holder.add(vrm.scene);
    c.vrm = vrm;
    c.body.visible = false;
    c.head.visible = false;
    this.drawChar(c);
    this.invalidate();
    // 동작은 모델이 선 뒤에 붙는다 — 못 받으면 기본 자세로 둔다
    this.attachMotions(c, vrm).catch((e: unknown) => {
      console.warn('[RoomScene] 캐릭터 동작을 못 불러와 기본 자세로 둡니다', e);
      c.setReady(false);
    });
  }

  /** 몸 동작 파일을 받아(처음 한 번) 이 캐릭터의 뼈에 맞춘 클립을 만든다. 기본 자세를 잡은 뒤라 동작이 빠지면 그 자세로 돌아온다 */
  private async attachMotions(c: CharNode, vrm: VRM): Promise<void> {
    this.motionFiles ??= (async () => {
      const one = async (url: string) => {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`${r.status} ${url}`);
        const g = await this.loader.parseAsync(await r.arrayBuffer(), '');
        return (g.userData.vrmAnimations as VRMAnimation[] | undefined)?.[0];
      };
      const [idle, walk, pickup40, pickup60] = await Promise.all([one(ROOM_ASSETS.idle), one(ROOM_ASSETS.walk), one(ROOM_ASSETS.pickup40), one(ROOM_ASSETS.pickup60)]);
      return { idle, walk, pickup40, pickup60 };
    })();
    const files = await this.motionFiles;
    if (this.disposed || c.vrm !== vrm) return;
    // 시선 트랙용 손잡이 — 없으면 클립을 만들 때마다 경고가 뜬다(개별종목 화면과 같은 방식)
    if (vrm.lookAt && !vrm.scene.getObjectByName('VRMLookAtQuaternionProxy')) {
      const proxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
      proxy.name = 'VRMLookAtQuaternionProxy';
      vrm.scene.add(proxy);
    }
    const mixer = new THREE.AnimationMixer(vrm.scene);
    const idle = files.idle && mixer.clipAction(createVRMAnimationClip(files.idle, vrm));
    idle?.setLoop(THREE.LoopRepeat, Infinity);
    const walk = files.walk && mixer.clipAction(createVRMAnimationClip(files.walk, vrm));
    walk?.setLoop(THREE.LoopRepeat, Infinity);
    // 들기 — 40 은 버둥거림을 계속 되풀이, 60 은 한 번 틀고 축 처진 마지막 프레임 유지
    const loops = PICKUP40_TEST.has(c.def.stockCode);
    const pickupFile = loops ? files.pickup40 : files.pickup60;
    const pickup = pickupFile && mixer.clipAction(createVRMAnimationClip(pickupFile, vrm));
    if (pickup && loops) pickup.setLoop(THREE.LoopRepeat, Infinity);
    else if (pickup) {
      pickup.setLoop(THREE.LoopOnce, 1);
      pickup.clampWhenFinished = true;
    }
    // 한 번 틀고 끝나는 동작이 끝나면 재생기가 알려 준다 — 엔진 모션이면 다음 단계로
    mixer.addEventListener('finished', (e) => this.onActionFinished(c, e.action as THREE.AnimationAction));
    c.mixer = mixer;
    c.defaultActions = { idle: idle ?? undefined, walk: walk ?? undefined };
    c.actions = { idle: idle ?? undefined, walk: walk ?? undefined, pickup: pickup ?? undefined };
    c.pose = 'rest';
    c.setReady(true); // 이제 엔진 모션을 틀 수 있다
  }

  /**
   * 대롱대롱 얹기(swing.ts) — 골반을 쥐고 있으니 몸 통째로는 안 돌리고, 골반에서 뻗은 두 덩어리(다리 · 윗몸)를 관성 쪽으로 민다.
   * 들기 동작마다 자세가 다르다(pickup40·60 은 골반을 쥔 채 몸이 옆으로 눕는다) — 그래서 방향을 박아 두지 않고 매 프레임 잰다:
   *   마디마다 '뼈 → 그 덩어리 끝'(허벅지 → 발, 등뼈 → 머리) 방향을 재고, 그 끝이 화면 가로로 밀리게 돈다.
   *   회전축 = 마디 방향 × 화면 가로. 마디가 가로와 수직일수록 많이, 나란할수록 적게 돈다(나란하면 당겨질 뿐 흔들리지 않는다).
   *   아래로 늘어진 마디와 위로 뻗은 마디는 같은 '밀림'에 반대로 돌아 끝이 같은 쪽에 남는다(C 자) — 따로 정하지 않아도 된다.
   * 캐릭터가 어느 쪽을 보든, 어떤 자세든 같은 규칙. 더하기 전 뼈 각을 돌려주고, 부르는 쪽이 그리고 나서 되돌린다(쌓이지 않게)
   */
  private applySwing(c: CharNode, dt: number): [THREE.Object3D, THREE.Quaternion][] {
    const vrm = c.vrm!;
    const s = c.swing;
    s.step(dt, c.pos.x * Math.cos(VIEW.TH) - c.pos.y * Math.sin(VIEW.TH), this.limpOf(c)); // 화면 가로(칸) — 줌·끌기와 무관
    c.figure.quaternion.identity();
    c.group.updateMatrixWorld(true);
    const at = (bone: VRMHumanBoneName) => vrm.humanoid.getNormalizedBoneNode(bone)?.getWorldPosition(new THREE.Vector3()) ?? null;
    // 이번 프레임 자세(VRMA)에서 마디 방향을 먼저 다 잰다 — 돌리는 도중의 자세로 재지 않게
    const plan: [VRMHumanBoneName, VRMHumanBoneName, number][] = [
      ['leftUpperLeg', 'leftFoot', s.hip],
      ['rightUpperLeg', 'rightFoot', s.hip],
      ['leftLowerLeg', 'leftFoot', s.knee],
      ['rightLowerLeg', 'rightFoot', s.knee],
      ['spine', 'head', s.upper / 2],
      ['chest', 'head', s.upper / 2],
    ];
    const moves = plan.flatMap(([bone, end, push]) => {
      const p0 = at(bone);
      const p1 = at(end);
      if (!p0 || !p1 || push === 0) return [];
      const axis = p1.sub(p0).normalize().cross(this.screenRight); // 끝을 화면 오른쪽으로 미는 축 — 길이 = 수직인 정도
      return axis.lengthSq() < 1e-8 ? [] : [{ bone, axis, angle: push }];
    });
    const saved: [THREE.Object3D, THREE.Quaternion][] = [];
    for (const { bone, axis, angle } of moves) {
      const n = vrm.humanoid.getNormalizedBoneNode(bone);
      if (!n?.parent) continue;
      saved.push([n, n.quaternion.clone()]);
      const k = axis.length();
      const local = axis.normalize().applyQuaternion(n.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
      n.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(local, angle * k));
    }
    return saved;
  }

  /** 힘 빠진 정도(0~1) — pickup60 이 축 처지기 시작해서 끝날 때까지 0 → 1. pickup40 은 늘 0 */
  private limpOf(c: CharNode): number {
    const act = c.actions.pickup;
    if (!act || act.loop !== THREE.LoopOnce) return 0;
    const dur = act.getClip().duration;
    return Math.max(0, Math.min(1, (act.time - PICKUP60_LIMP_FROM_S) / Math.max(1e-3, dur - PICKUP60_LIMP_FROM_S)));
  }

  /**
   * 들려 있을 때 — 골반 뼈(J_Bip_C_Hips)를 발 바로 위 CHAR.grab 높이에 맞춘다(2026-10-12 밤 — 목에서 골반으로). RoomLoop 이
   * 그 점이 커서 끝에 오도록 발 자리를 정하므로(grabFloor) 커서 끝 = 골반이 된다. 버둥거리는 동안에도 골반은 커서에 붙어 있다
   */
  private pinGrab(c: CharNode): void {
    const vrm = c.vrm!;
    const hips = vrm.humanoid.getRawBoneNode('hips');
    if (!hips) return;
    vrm.humanoid.update(); // 이번 프레임 동작을 실제 뼈에 옮긴 뒤 잰다
    c.group.updateMatrixWorld(true);
    const p = c.group.worldToLocal(hips.getWorldPosition(new THREE.Vector3()));
    c.figure.position.x -= p.x;
    c.figure.position.y += CHAR.grab - p.y;
    c.figure.position.z -= p.z;
  }

  /** 지금 상태에 맞는 동작 — 들림 → pickup, 엔진 모션 → engine, 방금 걸었음 → walk, 그 밖 → idle */
  private wantPose(c: CharNode, now: number): Pose {
    if (c.lifted) return 'pickup'; // 엔진 요청은 들리는 순간 setCharacterState 가 버렸다
    if (c.engine?.action) return 'engine'; // 파일을 받는 동안은 하던 동작(idle·walk) 그대로
    return now - c.movedAt < STILL_MS ? 'walk' : 'idle';
  }

  /** 동작을 바꾼다 — 이전 것은 빼고 새 것은 처음부터. 집어 들 때마다 들기 동작을 처음부터 다시 튼다 */
  private setPose(c: CharNode, pose: Pose): void {
    const fade = pose === 'pickup' ? PICKUP_FADE_S : POSE_FADE_S;
    // 'engine' 은 engineStep 이 직접 틀고 여기로 오지 않는다(wantPose 가 engine 을 내면 이미 c.pose === 'engine')
    const next = pose === 'rest' || pose === 'engine' ? undefined : c.actions[pose];
    this.fadeOthers(c, next, fade); // 엔진 모션도 같이 내려놓는다
    if (next) next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    c.pose = pose;
  }

  /**
   * keep 말고 재생기에 걸린 동작을 전부 내린다(기본 동작 + 엔진 모션).
   * isRunning() 은 끝나서 멈춘(마지막 프레임 유지) 동작을 '안 도는 중'으로 본다 — 그래서 놓아도 그 자세가 남았었다.
   * 믹서에 걸려 있기만 하면(isScheduled) 빼야 한다
   */
  private fadeOthers(c: CharNode, keep: THREE.AnimationAction | undefined, fade: number): void {
    for (const act of [...Object.values(c.actions), ...[...c.engineActions.values()].flat()]) {
      if (act && act !== keep && act.isScheduled()) act.fadeOut(fade);
    }
  }

  /* ── 엔진 모션 — 약속은 RoomRenderer.play · cancel 주석 ── */

  play(charId: string, steps: MotionStep[], onFinish: () => void): void {
    const c = this.chars.get(charId);
    if (!c) return;
    if (c.lifted) return; // 들려 있는 동안 온 요청은 받지 않는다(onFinish 없음)
    const token = ++c.engineToken; // 앞 요청은 여기서 끝 — onFinish 없이
    c.engine = { token, steps, i: -1, action: null, onFinish };
    void this.engineStep(c, token, 0);
  }

  cancel(charId: string): void {
    const c = this.chars.get(charId);
    if (c?.engine) this.dropEngine(c); // 다음 프레임에 wantPose 가 idle·walk 로 섞어 돌아간다
  }

  /**
   * 평소 자세를 바꿔 끼운다(지시서 1-8) — 파일을 받은 뒤에 바꾼다. 없거나 null 이면 기본 자세.
   * 지금 대기·걷기 중이면 옛 자세를 내리고 새 자세를 섞어 넣는다
   */
  setBasePose(charId: string, pose: { idle: string | null; walk: string | null }): void {
    const c = this.chars.get(charId);
    if (!c) return;
    const token = ++c.poseToken;
    void this.applyBasePose(c, pose, token);
  }

  private async applyBasePose(c: CharNode, pose: { idle: string | null; walk: string | null }, token: number): Promise<void> {
    if (!(await c.whenReady)) return;
    const live = () => token === c.poseToken && this.chars.get(c.id) === c && !!c.vrm && !!c.mixer;
    const make = async (clip: string | null): Promise<THREE.AnimationAction | null> => {
      if (!clip) return null;
      const anim = await this.motionFile(clip);
      if (!anim || !live()) return null;
      let act = c.poseActions.get(clip);
      if (!act) {
        act = c.mixer!.clipAction(createVRMAnimationClip(anim, c.vrm!));
        act.setLoop(THREE.LoopRepeat, Infinity);
        c.poseActions.set(clip, act);
      }
      return act;
    };
    const [idle, walk] = await Promise.all([make(pose.idle), make(pose.walk)]);
    if (!live()) return;
    const next = { idle: idle ?? c.defaultActions.idle, walk: walk ?? c.defaultActions.walk };
    if (next.idle === c.actions.idle && next.walk === c.actions.walk) return;
    for (const old of [c.actions.idle, c.actions.walk]) if (old && old !== next.idle && old !== next.walk && old.isScheduled()) old.fadeOut(POSE_FADE_S);
    c.actions = { ...c.actions, ...next };
    if (c.pose === 'idle' || c.pose === 'walk') this.setPose(c, c.pose);
    this.invalidate();
  }

  /** 표정 — 표정 데이터(블렌드셰이프 표)가 아직 없어 창구만 둔다(지시서 1-1) */
  setExpression(): void {}

  holdMissingClips(ms: number | null): void {
    this.holdMs = ms;
  }

  /** 엔진 요청을 버린다 — onFinish 를 부르지 않는다. 늦게 오는 파일·끝 신호는 요청 번호로 걸러진다 */
  private dropEngine(c: CharNode): void {
    c.engine = null;
    c.engineToken++;
  }

  /** i 번째 단계를 튼다. 다 끝났으면 onFinish. 파일을 받는 동안 다른 요청이 오면 조용히 그만둔다 */
  private async engineStep(c: CharNode, token: number, i: number): Promise<void> {
    await Promise.resolve(); // onFinish 는 늘 비동기로 — 부른 쪽이 play 를 다 마친 뒤에 오게
    const run = c.engine;
    if (!run || run.token !== token) return;
    if (i >= run.steps.length) {
      c.engine = null; // 다음 프레임에 wantPose 가 idle·walk 로 섞어 돌아간다
      run.onFinish();
      return;
    }
    run.i = i;
    const step = run.steps[i];
    const action = step.clip ? await this.engineAction(c, step.clip) : null;
    if (c.engine !== run || run.token !== token) return;
    if (!action) {
      // 파일 없음 — 개발 모드면 대기 자세로 시간을 채운다(반복 마지막 단계는 cancel 까지), 아니면 건너뜀(까닭은 engineAction 이 남긴다)
      if (this.holdMs === null) return this.engineStep(c, token, i + 1);
      if (i === run.steps.length - 1 && step.loop) return;
      window.setTimeout(() => void this.engineStep(c, token, i + 1), this.holdMs);
      return;
    }
    // 반복은 마지막 단계에서만 — 반복이면 끝나지 않는다(끝 신호 없음 — 반복 모션을 언제 끝낼지는 엔진과 미정)
    if (i === run.steps.length - 1 && step.loop) action.setLoop(THREE.LoopRepeat, Infinity);
    else {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true; // 다음 단계와 섞이는 동안 마지막 자세를 붙잡는다
    }
    run.action = action;
    this.fadeOthers(c, action, POSE_FADE_S);
    action.reset().setEffectiveWeight(1).fadeIn(POSE_FADE_S).play(); // 쉬고 있던 쪽이라 0 부터 올려도 튀지 않는다
    c.pose = 'engine';
    this.invalidate();
  }

  /** 한 번 틀고 끝나는 동작이 끝났다 — 지금 엔진 단계의 것이면 다음 단계로 */
  private onActionFinished(c: CharNode, action: THREE.AnimationAction): void {
    const run = c.engine;
    if (run && run.action === action) void this.engineStep(c, run.token, run.i + 1);
  }

  /**
   * 클립 이름 → 이 캐릭터 뼈에 맞춘 동작. 파일은 한 번만 받고, 동작은 캐릭터마다 클립당 두 벌 만든다.
   * 두 벌 중 지금 화면에 안 걸린 쪽을 준다(같은 클립을 이어 틀어도 앞 것이 사라지며 새 것이 섞여 들어옴).
   * 모델·기본 동작을 아직 받는 중이면 기다린다. 못 받았으면 null(건너뜀) — 까닭은 여기서 남긴다
   */
  private async engineAction(c: CharNode, clip: string): Promise<THREE.AnimationAction | null> {
    if (!(await c.whenReady)) {
      console.warn(`[RoomScene] 캐릭터 모델·동작이 없어 엔진 모션을 건너뜁니다: ${c.id} ${clip}`);
      return null;
    }
    // 쉬는 쪽 먼저 — 둘 다 걸려 있으면(아주 빠르게 세 번 이어 틀 때) 지금 트는 것이 아닌 쪽
    const busy = (a: THREE.AnimationAction) => a.enabled && a.getEffectiveWeight() > 0;
    const pick = ([a, b]: [THREE.AnimationAction, THREE.AnimationAction]) =>
      !busy(a) ? a : !busy(b) ? b : a === c.engine?.action ? b : a;
    const have = c.engineActions.get(clip);
    if (have) return pick(have);
    const anim = await this.motionFile(clip);
    if (!anim) {
      console.warn(`[RoomScene] 엔진 모션 파일이 없습니다: ${clip}`);
      return null;
    }
    const vrm = c.vrm;
    if (!vrm || !c.mixer || this.chars.get(c.id) !== c) return null; // 받는 사이 치워졌다 — 요청도 이미 버려졌다
    const made = c.engineActions.get(clip); // 기다리는 사이 다른 단계가 먼저 만들었을 수 있다
    if (made) return pick(made);
    const one = createVRMAnimationClip(anim, vrm);
    const pair: [THREE.AnimationAction, THREE.AnimationAction] = [c.mixer.clipAction(one), c.mixer.clipAction(one.clone())];
    c.engineActions.set(clip, pair);
    return pair[0];
  }

  /** 모션 파일(VRMA) — 클립 이름별로 처음 한 번 받아 모든 캐릭터가 같이 쓴다. 없거나 못 읽으면 null */
  private motionFile(clip: string): Promise<VRMAnimation | null> {
    let file = this.engineFiles.get(clip);
    if (!file) {
      file = (async () => {
        try {
          const r = await fetch(MOTION_URL(clip));
          if (!r.ok || r.headers.get('content-type')?.includes('text/html')) return null;
          const g = await this.loader.parseAsync(await r.arrayBuffer(), '');
          return (g.userData.vrmAnimations as VRMAnimation[] | undefined)?.[0] ?? null;
        } catch {
          return null;
        }
      })();
      this.engineFiles.set(clip, file);
    }
    return file;
  }

  /**
   * 매 프레임 — 걷는 쪽으로 돌고 VRM(머리카락 흔들림)을 갱신한다.
   * 들려 있을 땐 집힌 순간 보던 쪽 그대로 — 카메라 쪽으로 돌려 세우지 않는다(2026-10-12 도휘). 대롱대롱은 화면 축 기준이라 방향과 무관
   */
  private animate(c: CharNode, dt: number): void {
    const target = c.lifted ? c.yaw : c.heading; // 들려 있으면 돌던 중이어도 그 자리에서 멈춘다
    const d = Math.atan2(Math.sin(target - c.yaw), Math.cos(target - c.yaw));
    c.yaw += d * Math.min(1, dt * TURN_RATE);
    c.holder.rotation.y = c.yaw;
    if (c.mixer) {
      const want = this.wantPose(c, performance.now());
      if (want !== c.pose) this.setPose(c, want);
      c.mixer.update(dt);
    }
    // 대롱대롱 → 골반 맞추기 → 흔들림(spring bone) 순서 — 골반을 먼저 맞춰야 머리카락이 매 프레임 튀지 않는다
    const swung = c.lifted ? this.applySwing(c, dt) : [];
    if (c.lifted) this.pinGrab(c);
    c.vrm!.update(dt);
    // 대롱대롱으로 더한 뼈 각을 원래대로 — 이번 프레임 모양은 이미 실제 뼈에 옮겨졌다(vrm.update).
    // 믹서는 값이 안 바뀌면(끝나서 멈춘 pickup) 뼈를 다시 쓰지 않아서, 안 되돌리면 더한 각이 프레임마다 쌓여 꺾인 채 남는다
    for (const [n, q] of swung) n.quaternion.copy(q);
  }

  /** VRM 테두리 두께 — px 를 모델 좌표로 */
  private sizeRims(): void {
    if (!this.fit) return;
    const perPx = 1 / (this.proj.scale * this.fit.scale);
    this.rimWidth.white.value = OUTLINE_PX * perPx;
    this.rimWidth.accent.value = SELECT_PX * perPx;
  }

  move(charId: string, pos: Pt): void {
    const c = this.chars.get(charId);
    if (!c) return;
    const dx = pos.x - c.pos.x;
    const dy = pos.y - c.pos.y;
    if (!c.hidden && !c.lifted && dx * dx + dy * dy > 1e-8) c.movedAt = performance.now();
    if (c.hidden) {
      // 숨어 있는 동안 옮긴 건 걸은 게 아니라 다시 세운 것 — 카메라를 보고 나타난다
      c.heading = FACE_CAMERA;
      c.yaw = FACE_CAMERA;
      c.holder.rotation.y = c.yaw;
    } else if (!c.lifted && dx * dx + dy * dy > 1e-8) c.heading = Math.atan2(dx, dy); // 방 y 가 three 의 +Z(모델이 보는 쪽). 들고 끄는 동안은 방향을 바꾸지 않는다
    c.pos = pos;
    this.drawChar(c);
    this.invalidate();
  }

  setOutfit(charId: string, clothesId: number | null): void {
    const c = this.chars.get(charId);
    if (!c) return;
    c.clothesId = clothesId;
    // 옷 입히기 창의 미리보기와 같은 규칙(wornOutfit) — 도형은 몸통만 옷 색. VRM 은 옷 모델이 생기면 여기서 갈아 끼운다
    c.materials.body.color.set(wornOutfit(c.def, clothesId)?.color ?? c.def.color);
    this.invalidate();
  }

  setCharacterState(charId: string, s: { selected?: boolean; lifted?: boolean; hidden?: boolean }): void {
    const c = this.chars.get(charId);
    if (!c) return;
    if (s.selected !== undefined) c.selected = s.selected;
    if (s.lifted !== undefined) c.lifted = s.lifted;
    if (s.hidden !== undefined) c.hidden = s.hidden;
    // 들리면 엔진 요청을 바로 버린다(onFinish 없음). 다음 프레임이 아니라 지금 버려서, 파일을 받던 요청이 그 사이 시작되는 일도 없다(engineStep 이 요청 번호로 걸러 냄)
    if (c.lifted && c.engine) this.dropEngine(c);
    this.drawChar(c);
    this.invalidate();
  }

  setDropTarget(target: DropTarget | null): void {
    this.dropTarget = target;
    this.applyDropTarget();
  }

  /** 드롭 하이라이트를 지금 대상에 맞춘다 — 외곽선 두께가 px 라 축척이 바뀌어도 다시 부른다 */
  private applyDropTarget(): void {
    for (const f of this.furn.values()) {
      if (f.hull) this.dropObject(f.hull);
      f.hull = null;
    }
    const t = this.dropTarget;
    for (const [id, c] of this.chars) {
      c.outlined = t?.kind === 'character' && t.charId === id;
      this.drawChar(c);
    }
    const e = OUTLINE_PX / this.proj.scale;
    if (t?.kind === 'furniture') {
      const f = this.furn.get(t.placementId);
      if (f) {
        const hull = new THREE.Group();
        if (f.model) {
          // 모델 — 캐릭터 외곽선과 같은 방식(모양을 법선 쪽으로 부풀린 뒷면). 두께는 모델 좌표로 바꿔 준다
          f.rim ??= (() => {
            const width = { value: 0 };
            return { width, mat: rimMaterial('#FFFFFF', width, `rim-furn-${t.placementId}`) };
          })();
          f.rim.width.value = e / f.model.scale;
          f.group.updateMatrixWorld(true);
          const inv = f.group.matrixWorld.clone().invert();
          for (const m of f.meshes) {
            const r = new THREE.Mesh(m.geometry, f.rim.mat);
            r.matrixAutoUpdate = false;
            r.matrix.multiplyMatrices(inv, m.matrixWorld);
            r.renderOrder = RIM_ORDER;
            hull.add(r);
          }
        }
        for (const m of f.meshes) {
          const pt = m.userData.part as Part | undefined;
          const blob = m.userData.blob as { r: number; flat: boolean } | undefined;
          if (pt) {
            const h = new THREE.Mesh(new THREE.BoxGeometry(pt.x1 - pt.x0 + 2 * e, pt.z1 - pt.z0 + 2 * e, pt.y1 - pt.y0 + 2 * e), this.hullMat);
            h.position.copy(m.position);
            hull.add(h);
          } else if (blob && !blob.flat) {
            const h = new THREE.Mesh(new THREE.SphereGeometry(blob.r + e, 20, 14), this.hullMat);
            h.position.copy(m.position);
            hull.add(h);
          }
        }
        f.group.add(hull);
        f.hull = hull;
      }
    }
    this.invalidate();
  }

  /** 캐릭터 외곽선·선택 테 크기 — 픽셀 두께를 칸으로 바꿔 부풀린다 */
  private sizeHull(c: CharNode): void {
    const e = OUTLINE_PX / this.proj.scale;
    const [hullBody, hullHead] = c.hull.children;
    const bodyH = CHAR.bodyTop - CHAR.bodyBottom;
    hullBody.scale.set((CHAR.bodyR + e) / CHAR.bodyR, (bodyH + 2 * e) / bodyH, (CHAR.bodyR + e) / CHAR.bodyR);
    hullHead.scale.setScalar((CHAR.headR + e) / CHAR.headR);
    c.ring.scale.setScalar((CHAR.headR + 1.5 / this.proj.scale) / CHAR.headR);
  }

  private drawChar(c: CharNode): void {
    c.group.position.copy(v3(c.pos.x, c.pos.y));
    // 들린 VRM 은 매 프레임 골반을 맞춘다(pinGrab) — 여기서 되돌리면 머리카락이 출렁인다
    if (!(c.lifted && c.vrm)) {
      c.figure.position.set(0, c.lifted ? CHAR.lift : 0, 0);
      c.figure.quaternion.identity(); // 대롱대롱 기울기도 내려놓으면 0
      c.swing.reset();
    }
    c.shadow.scale.setScalar(c.lifted ? CHAR.shadowLiftR : CHAR.shadowR);
    const model = c.vrm !== null;
    c.ring.visible = c.selected && !model;
    c.hull.visible = c.outlined && !model;
    for (const r of c.rims) {
      r.visible = c.outlined || c.selected;
      r.material = c.outlined ? this.rimWhite : this.rimAccent;
    }
    this.sizeHull(c);
    c.group.visible = !c.hidden;
  }

  /** 캐릭터 클릭 — 머리부터 발까지의 화면 상자. 카메라가 같은 투영이라 그대로 맞는다 */
  pick(x: number, y: number, except?: string): string | null {
    const k = this.proj.scale;
    const list = [...this.chars.entries()].sort((a, b) => Projection.depth(b[1].pos.x, b[1].pos.y) - Projection.depth(a[1].pos.x, a[1].pos.y));
    for (const [id, c] of list) {
      if (c.hidden || id === except) continue;
      const f = this.proj.p(c.pos.x, c.pos.y);
      if (Math.abs(x - f.x) <= CHAR.pickHalfW * k && y >= f.y - CHAR.pickTop * k && y <= f.y + CHAR.pickBottom * k) return id;
    }
    return null;
  }

  screenOf(charId: string): Pt | null {
    const c = this.chars.get(charId);
    if (!c) return null;
    const f = this.proj.p(c.pos.x, c.pos.y);
    return { x: f.x, y: f.y - CHAR.hudAbove * this.proj.scale };
  }

  toFloor(x: number, y: number): Pt {
    return this.proj.toFloor(x, y);
  }

  grabFloor(x: number, y: number): Pt {
    // 높이 h 칸은 화면에서 h·Z·축척 px 위 — 목이 커서에 오려면 발은 그만큼 아래
    return this.proj.toFloor(x, y + CHAR.grab * VIEW.Z * this.proj.scale);
  }

  /** 미리보기·테스트용 — 캐릭터마다 지금 동작·화면 자리·상태 */
  inspect(): { id: string; clip: string | null; screen: Pt; lifted: boolean; selected: boolean; outlined: boolean; clothesId: number | null; model: boolean }[] {
    return [...this.chars.entries()].map(([id, c]) => ({
      id,
      clip: c.engine?.action ? c.engine.steps[c.engine.i].clip : null,
      screen: this.screenOf(id)!,
      lifted: c.lifted,
      selected: c.selected,
      outlined: c.outlined,
      clothesId: c.clothesId,
      model: c.vrm !== null,
    }));
  }

  /** 미리보기·테스트용 — 지금 외곽선이 켜진 가구 */
  outlinedFurniture(): number[] {
    return [...this.furn.entries()].filter(([, f]) => f.hull).map(([id]) => id);
  }

  /* ── 정리 ──────────────────────────────────────────────── */

  /** 그룹 안의 도형을 비운다 — 재질은 공유라 두고 도형만 버린다 */
  private clearGroup(g: THREE.Object3D): void {
    for (const o of [...g.children]) this.dropObject(o);
  }

  private dropObject(o: THREE.Object3D): void {
    o.traverse((n) => {
      const geo = (n as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (geo && !this.isSharedGeometry(geo)) geo.dispose();
      // 오버레이(점선·고스트)는 자기 재질을 갖고 있다 — 같이 쓰는 재질(캐시)은 두고 그것만 버린다
      if (o.userData.role) {
        const mat = (n as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) if (!this.isCached(m)) m.dispose();
      }
    });
    o.removeFromParent();
  }

  private isCached(m: THREE.Material): boolean {
    return m === this.hullMat || m === this.ringMat || m === this.rimWhite || m === this.rimAccent || [...this.meshMats.values()].includes(m as THREE.MeshBasicMaterial) || [...this.lineMats.values()].includes(m as THREE.LineBasicMaterial);
  }

  /** 캐릭터의 선택 테·외곽선은 머리·몸 도형을 같이 쓴다 — 지우지 않는다 */
  private isSharedGeometry(geo: THREE.BufferGeometry): boolean {
    if (this.modelGeos.has(geo)) return true;
    for (const c of this.chars.values()) if (geo === c.head.geometry || geo === c.body.geometry) return true;
    return false;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const c of this.chars.values()) {
      // 받던 엔진 모션 · 모델을 기다리던 요청을 버린다 — 거실을 나간 뒤 엔진에 끝 신호가 가지 않게
      this.dropEngine(c);
      c.setReady(false);
      if (c.vrm) VRMUtils.deepDispose(c.vrm.scene);
    }
    this.scene.traverse((n) => {
      const geo = (n as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      geo?.dispose();
    });
    for (const c of this.chars.values()) for (const m of Object.values(c.materials)) m.dispose();
    // 가구 모델 원본(장면 밖에 둔 것) · 외곽선 재질 · 반사 환경
    for (const src of this.modelSources) {
      src.traverse((n) => {
        const m = n as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture && v !== this.envMap) v.dispose();
          mat.dispose();
        }
      });
    }
    for (const f of this.furn.values()) f.rim?.mat.dispose();
    this.envMap?.dispose();
    for (const m of [...this.meshMats.values(), ...this.lineMats.values(), this.hullMat, this.ringMat, this.rimWhite, this.rimAccent]) m.dispose();
    for (const o of this.owned) o.dispose();
    this.chars.clear();
    this.furn.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    delete (this.canvas as HTMLCanvasElement & { roomScene?: RoomScene }).roomScene;
  }
}


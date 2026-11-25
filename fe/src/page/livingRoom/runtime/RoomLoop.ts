import { SLOT_MACHINE, SOFA_2SEAT } from '../furnitureCatalog';
import { charIdOf, type InteractionMode, type PlacementDto, type RoomCharacterDto, type RoomSnapshot, type SlotTimer } from '../types';
import type { CharacterCatalog, FurnitureCatalog } from './catalogs';
import type { CharacterEngine, Emotion, EngineCommand, EngineFactory } from './CharacterEngine';
import { createHandle, type ActRun, type CharacterHandle } from './CharacterHandle';
import { WalkGrid } from './occupancy';
import { clothesKindOf, OutfitStates, type OutfitState } from './outfitState';
import { findPath } from './pathfinding';
import { syncPlacements } from './placementSync';
import { PressGesture } from './PressGesture';
import { ProximityField } from './ProximityField';
import { ROOM, type Pt } from './projection';
import { footprint } from './furnitureShape';
import type { DropTarget, RoomRenderer } from './RoomRenderer';
import { ROOM_RULES, type MotionTable } from './roomEngine';
import { Perception, type Obstacle } from '../engine/perception';
import type { RoomDemo } from './roomDemo';
import { BREAK_FX, BreakRun, EFFECT_ONLY_STEPS, EndHold, furnitureAxes, MOTION_SPOTS, NO_SPOT, PAIR_GAP, PAIR_SPOTS, pairSpotOf, spotOf } from './motionFx';

/**
 * 슬롯머신 앞 자리(2026-11-14 도휘 — Cascadeur 에서 모션을 만들 때 둔 거리 0.41m 를 칸으로 옮긴 값).
 * 슬롯머신 모델 가운데(설치 영역 가운데 = 모델 경계 상자 가운데) 기준, 모델 좌표로
 *   front  정면(+Z) 쪽으로 — 0.41m − 경계 상자 가운데 치우침 0.022m = 0.388m ÷ (0.731m / 2.5칸)
 *   side   모델 +X(레버 쪽) — 경계 상자 가운데가 레버 쪽으로 0.030m 치우쳐 있어서 캐릭터는 그만큼 반대쪽
 * 캐릭터는 슬롯머신 정면을 마주 본다 — 레버가 오른손 쪽
 */
const SLOT_STAND = { front: 1.327, side: -0.103 };
/**
 * 소파 좌석 — 노말 소파(2) 모델에서 잰 값(모델 좌표 = 칸, 모델 가운데 기준). 2026-11-14
 *   y     좌석 윗면 높이
 *   back  등받이 앞면(좌석이 시작되는 곳) — 뒤쪽이 −
 * 소파류(2 · 8 · 14 · 20)는 모델 기준 수치를 통일해서(furniture_v1 README 「기준 수치 통일」, 2026-11-23) 모든 소파가 이 한 값을 쓴다(가구 마무리 G-1)
 */
const SOFA_SEAT = { y: 0.47, back: -0.47 };
/**
 * play_sofa.vrma 앉은 자세(캐릭터 발 원점 기준, 칸) — char_chibi_2 에 걸어 잰 값. 모션을 바꾸면 다시 잴 것
 *   buttY     엉덩이 아랫면 높이
 *   buttBack  엉덩이 뒷면 — 뒤쪽이 −
 */
const SIT_POSE = { buttY: 0.667, buttBack: -0.327 };
/** 엉덩이 뒷면과 등받이 사이 틈(칸) — 등이 등받이에 파묻히지 않게 */
const SOFA_BACK_GAP = 0.03;
// 둘이 마주 보고 하는 모션의 거리(PAIR_GAP) · 보정(PAIR_SPOTS)은 motionFx 한 곳(거실모션 H-5).
// 놀리기(2026-11-14 도휘): 너무 붙지 않게 사이에 캐릭터 1.5명이 들어갈 만큼 — 캐릭터 몸 폭이 약 1칸이라 발 사이 2.5칸
/** 앉는 소파 모션 이름(motions.json) */
const SIT_SOFA = 'sit_sofa';
/** 슬롯머신 모션 — 앞 자리(SLOT_STAND)에 따로 세운다 */
const PLAY_SLOT = 'play_slot';
/** 가구 모션이 끝나고 설치 영역 밖으로 나올 때 정면 끝에서 더 띄우는 거리(칸) */
const STEP_OUT_GAP = 0.5;

/** 슬롯머신 앞에 세운 뒤 모션까지 뜸(초) — 모션이 휙 나가지 않게 (2026-11-14 도휘 — 0.5 → 0.75초) */
const SLOT_PAUSE_S = 0.75;

/** 슬롯머신 앞에 서서 뜸을 들이는 중 — wait 초 뒤 엔진에 알린다 */
interface SlotWait {
  placementId: number;
  wait: number;
}

/** 박살 하나(G-2) — 누가 · 어느 명령으로 · 어느 가구를 */
interface BreakEntry {
  charId: string;
  fx: BreakRun;
  run: ActRun;
  placementId: number;
}

/** 방 배치 저장 — 배치 모드의 「저장」과 같은 길(PUT /rooms/layout, 보내는 목록 = 저장 뒤 방에 있어야 할 가구 전부) */
export type SaveLayout = (placements: readonly PlacementDto[]) => Promise<PlacementDto[]>;

export interface RoomLoopEvents {
  /** 짧게 누름 — 페이지가 RoomHud.onSelect 에 잇는다. 화면 좌표는 방 기준 */
  onPicked(charId: string, screen: Pt): void;
  /** 빈 바닥을 눌렀다 — 스탯 링 닫기 */
  onEmptyPick(): void;
  /** 캐릭터를 들기 시작하려고 누르고 있다 — ms 뒤 들린다. 머리 위 게이지용 (추가) */
  onLiftCharge(charId: string, ms: number): void;
  /** 들기 준비가 끝났다 — 들렸거나 취소됐다. 게이지를 지운다 (추가) */
  onLiftChargeEnd(charId: string): void;
  /** 캐릭터를 길게 눌러 들었다 — 그 캐릭터에 열린 스탯 링은 닫는다 (추가) */
  onLifted(charId: string): void;
  /**
   * 캐릭터를 끌어 슬롯머신에 놓았다 — 뽑기 시도(마무리 M-4). 뽑을지(주인인지 · 타이머) · 서버 호출은 HUD 가 한다.
   * 엔진이 스스로 고른 play_slot(캐릭터가 혼자 슬롯머신에 감)은 여기로 오지 않는다 — 뽑기가 아니다
   */
  onSlotDrop?(charId: string, placementId: number): void;
  /**
   * 슬롯머신 앞에 세워 뜸을 들인 뒤 엔진에 알렸다 — playing 이면 지금 play_slot 모션이 시작됐다(레버 · 결과 창 타이밍의 기준).
   * 그사이 다시 들었거나 배치 모드로 갔거나 엔진이 반응하지 않으면 playing = false (2026-11-14)
   */
  onSlotStart?(charId: string, placementId: number, playing: boolean): void;
}

/** 개발 모드 머리 위 글자의 지금 단계 — 엔진 이름 · 몇 번째(1부터) / 전체 단계 수 · 남은 시간 */
export interface DebugMotion {
  name: string;
  step: number;
  of: number;
  /** 남은 초 · 반복 · behavior 로 걷는 중 · 모름(파일을 받는 중) */
  left: number | 'loop' | 'moving' | null;
}

/** 개발 모드(?debug=motion) 머리 위 글자 한 명분 — 지금 단계 모션 · 감정(지시서 1-3) */
export interface DebugLabel {
  id: string;
  /** 머리 위 화면 자리 */
  at: Pt;
  /** 지금 단계 — 엔진 모션이 없으면 null */
  motion: DebugMotion | null;
  emotion: Emotion | undefined;
  /** 거실에 섰지만 감정을 아직 모름(지시서 1-5) */
  waiting: boolean;
}

const SPEED = 0.9; //   칸/초
/**
 * 멈춰 서기 {잠정 값 — 보면서 맞출 것}. 멈춰 있는 동안 렌더러가 idle 동작을 튼다(2026-10-12)
 *   목적지에 닿으면 REST_MIN~+REST_SPAN 초 쉬고, 걷는 도중에도 WALK_MIN~+WALK_SPAN 초마다 PAUSE_MIN~+PAUSE_SPAN 초 멈췄다 이어 걷는다
 */
const REST_MIN = 2.5;
const REST_SPAN = 5;
const WALK_MIN = 4;
const WALK_SPAN = 6;
const PAUSE_MIN = 1.5;
const PAUSE_SPAN = 2.5;
const between = (min: number, span: number) => min + Math.random() * span;
const PLAN_TRIES = 8; // 목적지를 다시 고르는 횟수 — 막힌 곳만 고르면 잠깐 쉬었다 다시
const MARGIN = 0.3; //  들어 옮길 때 벽에서 띄우는 거리
const CHAR_REACH = 0.9; // 칸 — 들고 있는 캐릭터가 이만큼 가까우면 그 캐릭터가 상대
const FURN_REACH = 0.35; // 칸 — 상호작용 가구 바닥 자리에서 이만큼 안이면 그 가구가 상대
const SPAWN_GAP = 2; //    칸 — 새로 세울 때 다른 캐릭터와 이만큼은 떨어지게 (안 되면 그냥 세운다)
const SPAWN_TRIES = 12;
/** behavior move_away — 상대 반대쪽으로 이만큼(칸) 비켜, 평소 속도의 이 배로 걷는다(팀원 mover.ts 기본값, 지시서 1-2) */
const AWAY_DISTANCE = 1.5;
const AWAY_SPEED_SCALE = 1.6;

const targetKey = (t: DropTarget | null) => (!t ? '' : t.kind === 'furniture' ? `f${t.placementId}` : `c${t.charId}`);

/**
 * 거실에서 **언제 무슨 일이 일어났는지**를 엔진에 알리고, 엔진 명령을 렌더러로 넘긴다 (2026-10-18 역할 분리).
 *   여기   근접 판정(자기장) · 들기/놓기 · 걷기 · 배치 — 감정을 계산하거나 기억하지 않는다
 *   엔진   감정 · 상호작용 판단 · 쿨다운 (CharacterEngine)
 *   렌더러 그리기 · 재생 — 재생기는 렌더러 하나, 순서는 들림 > 엔진 모션 > 걷기·대기
 * 엔진 명령의 단계는 하나씩 튼다 — clip 은 렌더러에 맡기고(그동안 제자리), behavior 는 여기서 움직임으로 처리한다(지시서 1-2).
 * 시점 mode(주인/방문자)는 모른다. 상호작용 모드(NORMAL/PLACEMENT)는 안다 —
 * 같은 클릭이 모드에 따라 스탯 링 / (배치 모드에선 무시) 로 갈리기 때문이다.
 */
export class RoomLoop {
  private readonly renderer: RoomRenderer;
  private readonly engine: CharacterEngine;
  private readonly chars: CharacterCatalog;
  private readonly furniture: FurnitureCatalog;
  private readonly motions: MotionTable;
  private readonly events: RoomLoopEvents;
  private readonly field = new ProximityField();
  /** 캐릭터 ↔ 가구 근접 — 엔진의 감지기를 가구 판정에만 쓴다(캐릭터끼리는 field). 들어올 때 한 번, 반경 + 틈 밖으로 나가야 다시 */
  private readonly nearFurniture = new Perception();
  private readonly gesture: PressGesture;

  private readonly handles = new Map<string, CharacterHandle>();
  private readonly demo: () => RoomDemo | null;
  /** 엔진이 마지막으로 준 기본 자세(모션 이름) — 데모 제자리 모션을 켜고 끌 때 되돌릴 값 */
  private readonly basePoses = new Map<string, { idle: string; walk: string }>();
  /** 데모 제자리 모션을 건 캐릭터 → 건 모션 */
  private readonly stillOn = new Map<string, string>();
  /** 옷 상태(수익률로 헤진 · 일반 · 좋은, 3-⑩) — 판정은 outfitState 한 곳, 여기는 캐릭터별로 들고 렌더러에 알린다 */
  private readonly outfits = new OutfitStates();
  /** 고른 옷(서버 equipped_clothes_id) — null = 기본 */
  private readonly clothes = new Map<string, number | null>();
  private placements: PlacementDto[] = [];
  /** 엔진에 알린 가구 — 배치 id → 엔진 이름 */
  private readonly engineFurniture = new Map<number, string>();
  private grid = WalkGrid.empty();
  /** 들고 있는 캐릭터를 지금 놓으면 만나는 상대 — 하이라이트 중 */
  private dropTarget: DropTarget | null = null;
  private mode: InteractionMode = 'NORMAL';
  /** 배치 편집에 들어갈 때의 배치 — 나올 때 이것과 다르면(저장했으면) 캐릭터를 다시 세운다 */
  private editFrom: PlacementDto[] | null = null;
  private raf = 0;
  private last = 0;
  private fieldTimer = 0;
  /** 소파에 앉아 있는(앉기 높이를 건) 캐릭터 */
  private readonly seated = new Set<string>();
  /** 가구 모션 자리(MOTION_SPOTS, H-2)에 세운 캐릭터 → 그 가구 배치 id — 끝나면 높이를 풀고 설치 영역 밖으로 */
  private readonly spotted = new Map<string, number>();
  /**
   * 둘이 하는 모션(H-5) — 캐릭터 → 상대 · 마주 선 기준 자리(보정 전) · 자기 첫 모션 · 옮겨 섰는지. 보정(PAIR_SPOTS)은 늘 두 기준 자리에서 잰다
   * (명령을 받는 순서와 상관없이 — 나중에 받은 쪽이 옮겨 서면 먼저 받은 쪽 보정을 새 기준에서 다시 건다)
   */
  private readonly pairs = new Map<string, { with: string; base: Pt; first: string; moved: boolean }>();
  /** 두 캐릭터 보정으로 높이(lift)를 건 캐릭터 — 끝나면 0 으로 */
  private readonly pairLifted = new Set<string>();
  /** 「이펙트만」 단계(trembling, H-6) — 캐릭터 → 그 명령 · 남은 초. 그동안 평소 대기 자세 + 저릿저릿 */
  private readonly effectSteps = new Map<string, { run: ActRun; left: number }>();
  /** 끝난 뒤 마지막 자세로 더 있는 단계(motions.json holdEndMs — fall_down 1.5초 멍) — 캐릭터 → 그 명령 · 시계 */
  private readonly endHolds = new Map<string, { run: ActRun; fx: EndHold }>();
  /** 끌어다 놓은 슬롯머신 앞에서 뜸을 들이는 캐릭터 */
  private readonly slotWaits = new Map<string, SlotWait>();
  /** 진행 중인 박살(G-2) — 터진 뒤엔 캐릭터가 다른 일을 해도 가구는 사라진다 */
  private readonly breaks = new Set<BreakEntry>();
  /** 박살로 숨기고 배치 해제를 저장하는 중인 가구 — 그동안은 근접 · 드롭 대상에서 뺀다 */
  private readonly broken = new Set<number>();
  /** 배치 해제 저장은 하나씩 차례로 — 동시에 보내면 앞 저장으로 빠진 가구를 뒤 저장이 다시 놓는다(목록 전체를 보내서) */
  private releaseChain: Promise<void> = Promise.resolve();
  /** 내 방이면 배치 저장 — 없으면(남의 방) 박살은 화면에서만(가구를 이 화면의 배치에서만 빼고 서버는 안 건드림 — 새로고침하면 다시 있음) */
  private readonly saveLayout: SaveLayout | null;
  private stopped = false;

  constructor(deps: {
    renderer: RoomRenderer;
    /** 엔진을 만든다 — 명령 통로를 넘겨준다. 감정 공급원이 없는 화면은 NullEngine */
    createEngine: EngineFactory;
    characters: CharacterCatalog;
    furniture: FurnitureCatalog;
    /** 모션 이름 → 파일 · 움직임 (motions.json) */
    motions: MotionTable;
    events: RoomLoopEvents;
    /** 데모 계정의 내 거실 연출(roomDemo.ts) — 없거나 null 이면 평소대로. 늦게 켜질 수 있어 매번 읽는다 */
    demo?: () => RoomDemo | null;
    /**
     * 내 방 배치 저장(api.savePlacements) — 박살로 부서진 가구를 보관함으로 보낼 때(G-2). 남의 방은 넘기지 않는다:
     * 그때 박살은 먼지 · 사라짐까지 화면에서만(2026-11-25 도휘) — 배치 · DB 는 그대로라 새로고침하면 가구가 다시 있다
     */
    saveLayout?: SaveLayout;
  }) {
    this.renderer = deps.renderer;
    this.engine = deps.createEngine((cmd) => this.onCommand(cmd));
    this.chars = deps.characters;
    this.furniture = deps.furniture;
    this.motions = deps.motions;
    this.events = deps.events;
    this.demo = deps.demo ?? (() => null);
    this.saveLayout = deps.saveLayout ?? null;
    this.gesture = new PressGesture({
      hit: (x, y) => (this.mode === 'PLACEMENT' ? null : this.renderer.pick(x, y)),
      canLift: () => this.mode === 'NORMAL',
      tap: (id) => (id ? this.onPick(id) : this.events.onEmptyPick()),
      chargeStart: (id, ms) => this.setCharging(id, true, ms),
      chargeEnd: (id) => this.setCharging(id, false),
      liftStart: (id) => this.onDragStart(id),
      liftMove: (id, x, y) => this.onDragMove(id, this.renderer.grabFloor(x, y), { x, y }), // 커서 끝 = 캐릭터 골반
      liftEnd: (id) => this.onDragEnd(id),
    });
  }

  /**
   * 스냅샷으로 가구를 놓고 캐릭터를 세운다. 고르거나 자르지 않는다 —
   * 다만 카탈로그에 없는 종목은 그릴 모양이 없어 세우지 못한다(characterIds 로 알 수 있다).
   */
  load(snapshot: RoomSnapshot): void {
    this.setPlacements(snapshot.placements);
    this.spawnAll(snapshot.characters);
  }

  /** 아직 안 선 캐릭터를 빈 칸에 세운다 — 이미 선 캐릭터와도 SPAWN_GAP 만큼 띄운다 */
  private spawnAll(characters: RoomCharacterDto[]): void {
    const taken: Pt[] = [...this.handles.values()].map((h) => h.position);
    for (const c of characters) {
      const id = charIdOf(c);
      const def = this.chars.def(id);
      if (!def || this.handles.has(id)) continue;
      const h = createHandle(id, this.spawnPoint(taken) ?? { x: ROOM / 2, y: ROOM / 2 });
      this.handles.set(id, h);
      this.renderer.spawn(id, def, h.position);
      // 감정을 아직 몰라도 바로 알린다 — 엔진이 감정 대기로 받아 두었다가 감정이 오면 활동시킨다(지시서 1-5 A)
      this.engine.addCharacter(id);
      this.clothes.set(id, c.ownedClothesId);
      // 남의 거실은 방문 시점 서버 수익률로 진입 때 한 번. 내 거실은 보유 목록 폴링이 updateReturnRates 로 넣는다
      if (c.returnRate !== undefined) this.outfits.update(id, c.returnRate);
      this.applyLook(id);
    }
  }

  /**
   * 거실에 세울 캐릭터를 바꾼다 — 캐릭터 탭에서 프리셋을 고르거나 고쳤을 때 (2026-10-12 추가).
   * 빠진 캐릭터는 치우고, 새로 든 캐릭터는 빈 칸 아무 데나 세운다. 남은 캐릭터는 하던 대로 둔다.
   * 카탈로그에 없는 종목은 세우지 못한다(characterIds 로 알 수 있다)
   */
  setRoster(characters: RoomCharacterDto[]): void {
    const keep = new Set(characters.map(charIdOf));
    const removed = [...this.handles.keys()].filter((id) => !keep.has(id));
    const added = characters.some((c) => !this.handles.has(charIdOf(c)) && this.chars.def(charIdOf(c)));
    if (removed.length === 0 && !added) return;
    this.gesture.cancel(); // 들고 있던 캐릭터가 빠질 수 있다 — 내려놓고 시작
    for (const id of removed) {
      if (this.dropTarget?.kind === 'character' && this.dropTarget.charId === id) this.setDropTarget(null);
      this.engine.deleteCharacter(id);
      this.renderer.despawn(id); // 틀던 엔진 모션도 같이 버린다
      this.handles.delete(id);
      this.outfits.forget(id); // 다시 세우면 여유 구간 없이 처음부터 판정
      this.clothes.delete(id);
    }
    this.spawnAll(characters);
  }

  /** 실제로 세운 캐릭터 — 오버레이는 이 목록만 보여 준다 */
  get characterIds(): string[] {
    return [...this.handles.keys()];
  }

  /** 지금 방에 놓인 배치 — 배치 편집을 시작할 때 오버레이가 읽는다. 배치의 원본은 여기 하나 */
  get currentPlacements(): readonly PlacementDto[] {
    return this.placements;
  }

  /**
   * 슬롯머신 타이머를 바꾼다(마무리 M-4) — 뽑은 직후 그 기계 하나, 또는 서버에서 다시 받은 배치(fresh)의 타이머 전부.
   * 자리 · 씬은 건드리지 않는다. 배치의 원본이 여기라 타이머도 여기 둔다
   */
  setSlotTimer(placementId: number, slot: SlotTimer): void {
    const p = this.placements.find((q) => q.placementId === placementId);
    if (p) p.slot = slot;
  }

  refreshSlotTimers(fresh: readonly PlacementDto[]): void {
    for (const f of fresh) if (f.slot) this.setSlotTimer(f.placementId, f.slot);
  }

  /**
   * 가구를 다시 놓는다 — 처음 띄울 때와 배치 저장 뒤에 부른다. 없어진 가구는 씬에서 지우고, 엔진에도 알린다 (추가).
   */
  setPlacements(placements: PlacementDto[]): void {
    syncPlacements(this.renderer, this.placements, placements);
    this.placements = placements.map((p) => ({ ...p }));
    this.tellEngine(placements);
    this.walkOn(placements);
  }

  /**
   * 엔진이 아는 가구를 맞춘다 — 엔진의 가구 id = placement_id, 종류 = 카탈로그 엔진 이름. 엔진 이름이 없는 가구(장식)는 알리지 않는다.
   * 엔진은 위치를 모르니 옮긴 가구는 알릴 게 없다(배치 저장 뒤엔 respawn 이 하던 상호작용을 그만두게 한다)
   */
  private tellEngine(placements: readonly PlacementDto[]): void {
    const next = new Map<number, string>();
    for (const p of placements) {
      const name = this.furniture.def(p.furnitureId)?.engineName;
      if (name) next.set(p.placementId, name);
    }
    for (const id of [...this.engineFurniture.keys()]) {
      if (next.has(id)) continue;
      this.engineFurniture.delete(id);
      this.engine.deleteFurniture(id); // 쓰던 캐릭터는 엔진이 cancel 로 멈춘다
    }
    for (const [id, name] of next) {
      if (this.engineFurniture.has(id)) continue;
      this.engineFurniture.set(id, name);
      this.engine.addFurniture(id, name);
    }
  }

  /**
   * 배치 편집 중의 가구로 걷는 칸만 바꾼다 — 씬은 편집기가 이미 맞춰 두었다 (추가).
   * 편집을 취소하면 currentPlacements 로 다시 부르면 된다.
   */
  previewPlacements(placements: readonly PlacementDto[]): void {
    this.walkOn(placements);
  }

  /**
   * 걷는 칸을 다시 만들고, 걷던 길은 새 가구 기준으로 다시 찾고, 가구에 묻힌 캐릭터는 비켜 세운다.
   * 배치 편집 중엔 캐릭터가 숨어 멈춰 있으니 칸만 바꾼다 — 저장하면 다시 세우고(respawn), 취소하면 원래 칸으로 돌아오니 길이 그대로 맞다
   */
  private walkOn(placements: readonly PlacementDto[]): void {
    this.grid = new WalkGrid(placements, (id) => this.furniture.def(id));
    if (this.mode === 'PLACEMENT') return;
    for (const h of this.handles.values()) {
      if (h.lifted) continue;
      const dest = h.path.at(-1);
      if (dest) h.path = findPath(this.grid, h.position, dest) ?? [];
      if (h.path.length === 0) this.stepAside(h);
    }
  }

  /** 가구 안에 서 있으면 가장 가까운 빈 칸으로 비켜 선다 */
  private stepAside(h: CharacterHandle): void {
    if (this.grid.freeAt(h.position)) return;
    const out = this.grid.nearestFree(h.position);
    if (out) h.path = [out];
  }

  /** 빈 칸 아무 데나 — 이미 세운 자리(taken)와 SPAWN_GAP 넘게 떨어진 곳을 몇 번 찾아보고, 없으면 아무 빈 칸 */
  private spawnPoint(taken: Pt[]): Pt | null {
    let pos: Pt | null = null;
    for (let n = 0; n < SPAWN_TRIES && !pos; n++) {
      const p = this.grid.randomFree();
      if (p && taken.every((t) => Math.hypot(t.x - p.x, t.y - p.y) >= SPAWN_GAP)) pos = p;
    }
    pos ??= this.grid.randomFree();
    if (pos) taken.push(pos);
    return pos;
  }

  /**
   * 배치를 저장하고 나왔다 — 캐릭터를 빈 칸 아무 데나 다시 세운다(블루 아카이브 카페처럼).
   * 하던 일(걷던 길·쉬는 시간·엔진 모션)은 버리고 대기에서 새로 시작한다 — 가구에 앉아 있던 캐릭터도 옮겨지니
   * 엔진에도 하던 상호작용을 그만두라고 알린다
   */
  private respawn(): void {
    const taken: Pt[] = [];
    for (const h of this.handles.values()) {
      const pos = this.spawnPoint(taken) ?? h.position;
      Object.assign(h, { position: pos, path: [], rest: 0.5 + Math.random() * 2, pause: 0, held: false, lifted: false, charging: false, awaiting: false });
      this.renderer.move(h.id, pos); // 숨어 있는 동안 옮기면 렌더러가 카메라 쪽을 보게 세운다
      this.stopActing(h);
      this.engine.interrupt(h.id);
    }
  }

  /** 다음 목적지와 길 — 지금은 걸어서 닿는 빈 칸 중 무작위 (엔진이 목적지를 고르게 되면 여기로 받는다) */
  private plan(h: CharacterHandle): Pt[] {
    for (let n = 0; n < PLAN_TRIES; n++) {
      const dest = this.grid.randomFree(Math.random, h.position);
      if (!dest) return [];
      const path = findPath(this.grid, h.position, dest);
      if (path && path.length) return path;
    }
    return [];
  }

  start(): void {
    if (this.raf) return;
    this.engine.start();
    this.last = performance.now();
    const step = (t: number) => {
      this.tick(Math.min(0.1, (t - this.last) / 1000));
      this.last = t;
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  /** 화면을 나가면 멈춘다 — 안 멈추면 계속 돈다 */
  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.stopped = true;
    this.engine.dispose();
    this.gesture.cancel();
    this.nearFurniture.reset();
  }

  tick(dt: number): void {
    this.engine.tick(); // 시간 제한이 지난 상호작용을 엔진이 끝낸다(지시서 1-6) — 배치 모드에도 시계는 간다
    if (this.mode === 'PLACEMENT') return; // 숨어 있는 동안은 멈춰 있는다 — 걷지도, 마주치지도 않는다
    this.stepBreaks(dt);
    this.stepEffects(dt);
    this.stepEndHolds(dt);
    for (const h of this.handles.values()) {
      if (h.held || h.lifted || h.charging || h.awaiting) continue;
      const sw = this.slotWaits.get(h.id);
      if (sw) {
        this.waitAtSlot(h, sw, dt);
        continue;
      }
      // 엔진 모션 중엔 제자리 — 가구 모션이면 가구 모션 자리(takeSpot). 끝나면 설치 영역 밖으로 옮겨 서고(stepOut) 평소처럼 걷는다
      if (h.acting) continue;
      // 데모 — 제자리에서 정해 둔 모션만(돌아다니지 않는다). 다른 캐릭터가 다가와 마주치는 건 그대로
      if (this.applyStill(h)) continue;
      if (h.away) {
        this.walkAway(h, dt);
        continue;
      }
      // 장외(sleepy) — 돌아다니지 않고 제자리에서 졸기(기본 자세 standing_sleep). 다른 캐릭터가 다가와 마주치는 건 그대로(applyStill 과 같게).
      // 비켜 걷기(away) 뒤에 둔다 — anxious_meet_sleepy 는 sleepy 인 채로 trembling → surprise → avoid 를 하므로, 앞에 두면 비켜 걷기가 멈춰 명령이 끝나지 않는다
      if (this.engine.emotionOf(h.id) === 'sleepy') continue;
      if (h.path.length === 0) {
        h.rest -= dt;
        if (h.rest <= 0) {
          h.path = this.plan(h);
          if (h.path.length === 0) h.rest = 1;
        }
        continue;
      }
      // 걷다가 잠깐 멈춰 서 있는 중
      if (h.pause > 0) {
        h.pause -= dt;
        continue;
      }
      h.walkLeft -= dt;
      if (h.walkLeft <= 0) {
        h.walkLeft = between(WALK_MIN, WALK_SPAN);
        h.pause = between(PAUSE_MIN, PAUSE_SPAN);
        continue;
      }
      this.walk(h, SPEED * dt);
      if (h.path.length === 0) h.rest = between(REST_MIN, REST_SPAN);
    }
    this.fieldTimer += dt;
    if (this.fieldTimer > 0.5) {
      this.fieldTimer = 0;
      // 들린 캐릭터는 판정에서 뺀다 — 놓은 자리에서 새로 마주친다
      // 슬롯머신 앞에서 뜸을 들이는 캐릭터도 뺀다 — 그사이 마주쳐 다른 모션으로 새지 않게
      const list = [...this.handles.values()].filter((h) => !h.lifted && !this.slotWaits.has(h.id)).map((h) => ({ id: h.id, x: h.position.x, y: h.position.y }));
      for (const e of this.field.evaluate(list)) this.onFieldEnter(e.a, e.b);
      // 가구 — 들린 캐릭터만 뺀다. 바쁜 캐릭터도 넘겨 위치를 따라간다(뺐다 넣으면 exit → enter 가 새로 나서 모션을 마치자마자 또 반응한다)
      const bodies = [...this.handles.values()].filter((h) => !h.lifted).map((h) => ({ id: h.id, x: h.position.x, z: h.position.y, radius: 0 }));
      for (const e of this.nearFurniture.update(bodies, this.furnitureObstacles())) {
        // char-char 는 버린다 — 캐릭터끼리는 위 field 가 알린다(두 번 알리지 않게)
        if (e.kind === 'char-furniture' && e.type === 'enter') this.onFurnitureEnter(e.char, Number(e.furniture));
      }
    }
  }

  /**
   * 근접 판정할 가구 — 엔진에 알린 가구만, 설치 영역 상자 + 엔진 데이터의 interactionRadius(칸).
   * 슬롯머신은 뺀다 — 뽑기는 끌어다 놓을 때만(M-4). 근접으로 알리면 play_slot 만 돌고 뽑기는 안 해서 레버만 당긴다
   */
  private furnitureObstacles(): Obstacle[] {
    const out: Obstacle[] = [];
    for (const p of this.placements) {
      const name = this.engineFurniture.get(p.placementId);
      if (!name || name === SLOT_MACHINE || this.broken.has(p.placementId)) continue;
      const def = this.furniture.def(p.furnitureId);
      const radius = ROOM_RULES.furniture.get(name)?.interactionRadius;
      if (!def || radius === undefined) continue;
      const f = footprint(def, { x: p.positionX, y: p.positionY }, p.rotation);
      out.push({ id: String(p.placementId), minX: f.x0, maxX: f.x1, minZ: f.y0, maxZ: f.y1, interactionRadius: radius });
    }
    return out;
  }

  /**
   * 배회하다 가구 반경에 들어왔다 — 평소 배회 중일 때만 엔진에 알린다. 바쁘면 버린다(다시 반응하려면 멀어졌다 다가와야 한다).
   * 그다음은 엔진 규칙대로 — 반복 모션은 30초 뒤 끝, 쿨다운 20초
   */
  private onFurnitureEnter(charId: string, placementId: number): void {
    const h = this.handles.get(charId);
    if (!h || this.mode !== 'NORMAL' || !this.engineFurniture.has(placementId)) return;
    if (h.held || h.lifted || h.charging || h.awaiting || h.acting || h.away) return;
    if (this.slotWaits.has(h.id) || this.stillOn.has(h.id)) return;
    this.visitFurniture(h, placementId);
  }

  /**
   * 가구에 왔다고 엔진에 알린다 — 내려놓기 · 근접이 같이 쓴다(슬롯머신 뜸 들이기는 따로).
   * 엔진이 반응하지 않으면(쿨다운 · 감정 대기 · 자리 없음 · 규칙 없음) 아무것도 바꾸지 않는다 — 걷던 길 그대로.
   * 모션이 시작됐으면 걷던 길을 버린다 — 끝난 뒤 새 목적지를 고르게(옛 길을 이으면 앉았던 자리에서 가구를 뚫고 갈 수 있다).
   * 소파 앉기면 좌석(엔진이 고른 앵커 자리)에 앉힌다 — 근접은 가구 바깥에서 걸리니 옮기지 않으면 허공에 앉는다.
   * 다른 가구 모션은 가구 가운데 + 모션별 보정(MOTION_SPOTS) 자리에 가구 정면을 보고 선다(거실모션 H-2 — 방향은 모션 안에 들어 있다)
   */
  private visitFurniture(h: CharacterHandle, placementId: number): void {
    if (this.broken.has(placementId)) return; // 부서져 사라지는 중
    this.engine.visitFurniture(h.id, placementId);
    if (!h.acting) return;
    h.path = [];
    // 엔진이 고른 앵커(왼쪽 · 오른쪽 자리)에 앉힌다 — 앵커를 모르면 좌석 가운데(허공에 앉지 않게)
    if (this.engineFurniture.get(placementId) === SOFA_2SEAT && h.run?.steps.some((s) => s.name === SIT_SOFA)) {
      this.sitOnSofa(h, placementId, h.run.anchorId);
      return;
    }
    const first = h.run?.steps[0];
    if (first?.kind === 'clip' && first.name !== PLAY_SLOT) this.takeSpot(h, placementId, first.name);
  }

  /**
   * 가구 모션 자리(거실모션 H-2 결정 1) — 설치 영역 가운데 + 보정, 캐릭터 정면 = 가구 정면(가구 회전을 따라 돎) + turn.
   * 코드로 180° 돌리지 않는다(방향은 모션 안에). 높이는 lift(소파 앉기와 같은 길), ground 면 바닥 붙이기
   */
  private takeSpot(h: CharacterHandle, placementId: number, motion: string): void {
    const p = this.placements.find((q) => q.placementId === placementId);
    const def = p && this.furniture.def(p.furnitureId);
    if (!p || !def) return;
    const f = footprint(def, { x: p.positionX, y: p.positionY }, p.rotation);
    const s = MOTION_SPOTS[motion] ?? NO_SPOT;
    const { at, face } = spotOf({ x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2 }, p.rotation, s);
    h.position = at;
    h.path = [];
    this.renderer.move(h.id, at);
    this.renderer.face?.(h.id, face, true);
    if (s.lift !== 0) this.renderer.setSeatLift?.(h.id, s.lift);
    if (s.ground) this.renderer.setGrounded?.(h.id, true);
    this.spotted.set(h.id, placementId);
  }

  /**
   * 가구 모션이 끝났다 — 설치 영역 안(또는 걷지 못하는 칸)에 서 있으면 가구 정면 쪽 가장 가까운 빈 칸으로 옮겨 세운다(가구에 박혀 걷지 않게).
   * 가구가 이미 없어졌으면(박살 · 배치 저장) 가장 가까운 빈 칸
   */
  private stepOut(h: CharacterHandle, placementId: number): void {
    const p = this.placements.find((q) => q.placementId === placementId);
    const def = p && this.furniture.def(p.furnitureId);
    const f = p && def ? footprint(def, { x: p.positionX, y: p.positionY }, p.rotation) : null;
    const inArea = !!f && h.position.x > f.x0 && h.position.x < f.x1 && h.position.y > f.y0 && h.position.y < f.y1;
    if (!inArea && this.grid.freeAt(h.position)) return;
    let want = h.position;
    if (p && f) {
      const { front, side } = furnitureAxes(p.rotation);
      const c = { x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2 };
      const half = (Math.abs(front.x) * (f.x1 - f.x0) + Math.abs(front.y) * (f.y1 - f.y0)) / 2;
      const across = (h.position.x - c.x) * side.x + (h.position.y - c.y) * side.y; // 옆으로 서 있던 만큼은 그대로
      want = { x: c.x + front.x * (half + STEP_OUT_GAP) + side.x * across, y: c.y + front.y * (half + STEP_OUT_GAP) + side.y * across };
    }
    const out = this.grid.freeAt(want) ? want : this.grid.nearestFree(want);
    if (!out) return;
    h.position = out;
    h.path = [];
    this.renderer.move(h.id, out);
  }

  /** 길을 따라 stepLen 칸 걷는다 — 경유지를 넘어가도 남은 걸음은 다음 구간에 이어 쓴다(꺾을 때 멈칫하지 않게) */
  private walk(h: CharacterHandle, stepLen: number): void {
    while (stepLen > 0 && h.path.length) {
      const next = h.path[0];
      const dx = next.x - h.position.x;
      const dy = next.y - h.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= stepLen) {
        h.position = next;
        h.path.shift();
        stepLen -= dist;
      } else {
        h.position = { x: h.position.x + (dx / dist) * stepLen, y: h.position.y + (dy / dist) * stepLen };
        stepLen = 0;
      }
    }
    this.renderer.move(h.id, h.position);
  }

  /** move_away 로 비켜 걷는 중 — 멈칫하지 않고 빠르게. 닿으면 평소 배회로 돌아가고(1-2 ④) 엔진 명령의 다음 단계로 */
  private walkAway(h: CharacterHandle, dt: number): void {
    this.walk(h, SPEED * AWAY_SPEED_SCALE * dt);
    if (h.path.length) return;
    h.away = false;
    h.rest = between(REST_MIN, REST_SPAN);
    if (h.run) this.nextStep(h, h.run);
  }

  /** 두 캐릭터가 가까워졌다 — 판정은 여기, 무엇을 할지는 엔진. 링이 열려 멈춰 선 캐릭터는 알리지 않는다 */
  onFieldEnter(charId: string, otherId: string): void {
    const a = this.handles.get(charId);
    const b = this.handles.get(otherId);
    if (!a || !b || a.held || b.held || a.lifted || b.lifted) return;
    // 누구와 마주쳤는지 — move_away 가 그 반대쪽으로 비킨다(명령에 상대가 실려 오지 않아서)
    a.metWith = otherId;
    b.metWith = charId;
    this.engine.encounter(charId, otherId);
  }

  /**
   * 엔진 명령 → 렌더러 · 움직임 (지시서 1-1).
   *   play     단계를 하나씩 — 마지막 단계가 끝나면 그 모션 이름으로 엔진에 알린다. 들려 있으면 받지 않는다(엔진은 들 때 interrupt 를 받았다)
   *   cancel   하던 걸 멈추고 평소대로(끝 신호 없음)
   *   emotion  표정 · 기본 자세를 바꿔 끼운다(1-8). 자세 이름은 motions.json 으로 파일을 찾는다
   */
  private onCommand(cmd: EngineCommand): void {
    const h = this.handles.get(cmd.characterId);
    if (!h) return;
    switch (cmd.type) {
      case 'cancel':
        this.stopActing(h);
        return;
      case 'emotion':
        this.renderer.setExpression(h.id, cmd.emotion);
        this.basePoses.set(h.id, { idle: cmd.idle, walk: cmd.walk });
        this.setPose(h.id); // 데모 제자리 모션이 걸려 있으면 그 모션이 idle 로 남는다
        // 장외로 바뀌면 걷던 자리에 멈춰 선다. 비켜 걷는 중이면 끝까지 걷게 둔다 — 닿으면 길이 비어 그대로 제자리 졸기
        if (cmd.emotion === 'sleepy' && !h.away && h.path.length) {
          h.path = [];
          h.pause = 0;
          this.renderer.move(h.id, h.position); // 걷다 멈춘 자리에서 서게
        }
        return;
      case 'play': {
        if (h.lifted) return;
        this.dropSlotWait(h); // 뜸을 들이던 중 다른 명령이 오면 슬롯머신은 그만둔다
        this.unseat(h); // 앉아 있다 다른 명령이 오면 일어선다(새 명령이 앉기면 sitOnSofa 가 다시 앉힌다)
        const run: ActRun = { steps: cmd.steps, i: -1 };
        h.run = run; // 앞 명령은 여기서 끝 — 끝 신호 없이(렌더러도 새 play 가 앞 요청을 밀어낸다)

        if(cmd.furnitureId !== undefined){
          h.run.furnitureId = cmd.furnitureId;
          h.run.anchorId = cmd.anchorId;
        }

        this.nextStep(h, run);
        this.facePartner(h, cmd.steps);
      }
    }
  }

  /**
   * 다음 단계로 (지시서 1-2).
   *   clip      렌더러가 튼다 — 그동안 제자리. 반복은 마지막 단계에서만(끝 신호 없음 — 엔진이 cancel 로 끝낸다)
   *   behavior  keep_walking 은 바로 다음 단계(하던 걸음을 이어 감), move_away 는 상대 반대쪽으로 비켜 걸어가 닿으면 다음 단계.
   *             걸을 수 없으면 바로 완료. 그동안은 걷게 둔다
   * run 이 이미 다른 명령으로 바뀌었으면(cancel · 새 play · 들림) 아무것도 안 한다
   */
  private nextStep(h: CharacterHandle, run: ActRun): void {
    if (h.run !== run) return;
    run.i++;
    h.away = false;
    if (run.i >= run.steps.length) {
      this.unseat(h);
      h.run = null;
      h.acting = false;
      const last = run.steps.at(-1);
      if (last) this.engine.motionFinished(h.id, last.name);
      return;
    }
    const step = run.steps[run.i];
    if (step.kind === 'clip') {
      h.acting = true;
      const loop = step.loop && run.i === run.steps.length - 1;
      const clip = this.motions.clipOf(step.name);
      // 모션 파일 없이 「평소 대기 자세 + 저릿저릿」으로 대신하는 단계(trembling, 결정 6) — 정해진 초 뒤 stepEffects 가 다음 단계로
      const effectS = EFFECT_ONLY_STEPS[step.name];
      if (effectS !== undefined && clip === null) {
        this.renderer.cancel(h.id); // 앞 단계 모션을 내려놓고 평소 대기 자세로
        this.renderer.setJitterForce?.(h.id, true);
        this.effectSteps.set(h.id, { run, left: effectS });
        return;
      }
      // 박살 모션은 끝나도 마지막 자세로 멈춰 기다린다 — 먼지가 가장 짙을 때 stepBreaks 가 끝낸다. 그 전에 온 끝 신호 = 파일 없음
      const brk = this.startBreak(h, run, step.name, clip);
      // 끝난 뒤 마지막 자세로 더 있는 모션(fall_down 1.5초 멍)도 같은 자리(hold) — 시계가 끝에 닿고 holdEndMs 뒤 stepEndHolds 가 끝낸다. 그 전에 온 끝 신호 = 파일 없음 → 바로 다음
      const holdS = !brk && !loop && clip !== null && this.renderer.motionClock ? this.motions.holdEndMsOf(step.name) / 1000 : 0;
      if (holdS > 0) this.endHolds.set(h.id, { run, fx: new EndHold(holdS) });
      const finish = brk
        ? () => brk.missing()
        : () => {
            if (this.endHolds.get(h.id)?.run === run) this.endHolds.delete(h.id);
            this.nextStep(h, run);
          };
      this.renderer.play(h.id, [{ clip, loop, name: step.name, ...(brk || holdS > 0 ? { hold: true } : {}) }], finish);
      return;
    }
    h.acting = false;
    this.renderer.cancel(h.id); // 앞 단계가 clip 이었으면 내려놓고 걷기·대기로
    if (this.motions.behaviorOf(step.name) === 'move_away' && this.startAway(h)) return; // 닿으면 walkAway 가 다음 단계로
    // keep_walking · 모르는 움직임 · 비킬 수 없음 → 바로 완료. 엔진이 명령을 다 내보낸 뒤에 알리도록 한 박자 늦춘다
    queueMicrotask(() => this.nextStep(h, run));
  }

  /** move_away 시작 — 마주친 상대 반대쪽 AWAY_DISTANCE 칸 근처 빈 칸으로 길을 낸다. 상대를 모르면 아무 쪽. 길이 없으면 false */
  private startAway(h: CharacterHandle): boolean {
    const other = h.metWith ? this.handles.get(h.metWith) : undefined;
    let dx = other ? h.position.x - other.position.x : 0;
    let dy = other ? h.position.y - other.position.y : 0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-3) {
      const a = Math.random() * Math.PI * 2;
      [dx, dy] = [Math.cos(a), Math.sin(a)];
    } else [dx, dy] = [dx / len, dy / len];
    const clamp = (v: number) => Math.min(ROOM - MARGIN, Math.max(MARGIN, v));
    const want = { x: clamp(h.position.x + dx * AWAY_DISTANCE), y: clamp(h.position.y + dy * AWAY_DISTANCE) };
    const dest = this.grid.freeAt(want) ? want : this.grid.nearestFree(want);
    const path = dest ? findPath(this.grid, h.position, dest) : null;
    if (!path || path.length === 0) return false;
    h.path = path;
    h.pause = 0;
    h.away = true;
    return true;
  }

  /** 엔진 모션을 멈추고 다시 걷게 한다 — 끝 신호는 없다 */
  /**
   * 데모 트리거 버튼 — 누를 때마다 켜고 끈다(roomDemo.ts). 걸려 보내지는 않는다:
   * 켜져 있는 동안 사용자가 엔비디아를 들어 네이버 옆에 놓으면(놓은 자리에서 새로 마주침) 쿨다운 없이 매번 놀리기.
   * 켜고 끌 때 둘이 하던 상호작용을 멈춘다 — 켤 땐 엔진이 상호작용 중인 캐릭터의 만남을 받지 않아서, 끌 땐 놀리던 걸 바로 멈추려고.
   * 끄면 정해 둔 만남도 풀려 원래 규칙(쿨다운 15초)대로.
   * 바뀐 뒤 상태 — 둘 중 하나가 거실에 없으면 null
   */
  demoToggle(): boolean | null {
    const d = this.demo();
    const m = d?.meet;
    if (!d || !m || this.mode !== 'NORMAL') return null;
    const a = this.handles.get(m.self);
    const b = this.handles.get(m.other);
    if (!a || !b) return null;
    const on = d.toggle();
    for (const h of [a, b]) {
      if (h.held || h.lifted) continue; // 들고 있는 중이면 엔진은 이미 멈춰 있다
      this.stopActing(h);
      this.engine.interrupt(h.id);
    }
    return on;
  }

  /** 기본 자세를 렌더러에 — 데모 제자리 모션이 걸려 있으면 그 모션을 idle 로 */
  private setPose(id: string): void {
    const base = this.basePoses.get(id);
    const still = this.stillOn.get(id);
    if (!base && !still) return;
    this.renderer.setBasePose(id, {
      idle: this.motions.clipOf(still ?? base!.idle),
      walk: base ? this.motions.clipOf(base.walk) : null,
    });
  }

  /** 데모 제자리 캐릭터인가 — 맞으면 모션을 걸고(한 번) 걷던 길을 버린다. 데모가 꺼지면 원래 자세로 */
  private applyStill(h: CharacterHandle): boolean {
    const want = this.demo()?.stillIdle.get(h.id) ?? null;
    const have = this.stillOn.get(h.id) ?? null;
    if (want !== have) {
      if (want) this.stillOn.set(h.id, want);
      else this.stillOn.delete(h.id);
      this.setPose(h.id);
    }
    if (!want) return false;
    if (h.path.length) {
      h.path = [];
      this.renderer.move(h.id, h.position); // 걷다 멈춘 자리에서 서게
    }
    return true;
  }

  private stopActing(h: CharacterHandle): void {
    this.unseat(h);
    h.run = null;
    h.away = false;
    h.acting = false;
    this.renderer.cancel(h.id);
  }

  /**
   * 개발 모드 머리 위 글자 — 세운 캐릭터마다 지금 단계 · 남은 시간 · 감정(지시서 1-3). 화면에 안 보이는 캐릭터는 뺀다.
   * 스탯 링이 열린 캐릭터(held)도 뺀다 — 링 메뉴와 겹치지 않게. 남은 시간은 clip 이면 렌더러에 묻고, behavior 는 걷는 중
   */
  debugLabels(): DebugLabel[] {
    if (this.mode === 'PLACEMENT') return [];
    return [...this.handles.values()].flatMap((h) => {
      if (h.held) return [];
      const at = this.renderer.screenOf(h.id);
      if (!at) return [];
      const step = h.run?.steps[h.run.i];
      const motion: DebugMotion | null =
        h.run && step
          ? { name: step.name, step: h.run.i + 1, of: h.run.steps.length, left: step.kind === 'behavior' ? 'moving' : this.renderer.motionTimeLeft(h.id) }
          : null;
      return [{ id: h.id, at, motion, emotion: this.engine.emotionOf(h.id), waiting: this.engine.isWaitingEmotion(h.id) }];
    });
  }

  /* ── 상호작용 ───────────────────────────────────────────── */

  /**
   * 배치 모드에선 캐릭터를 숨기고 멈춘다(가구를 옮기는 데 방해되고, 캐릭터와 겹칠 때 처리가 애매해서).
   * 나올 때 — 저장했으면(배치가 바뀌었으면) 다시 세우고, 취소했으면 있던 자리에서 하던 대로 이어 간다
   */
  setInteractionMode(m: InteractionMode): void {
    const was = this.mode;
    this.mode = m;
    this.gesture.cancel();
    if (m === 'PLACEMENT' && was !== 'PLACEMENT') this.editFrom = this.placements;
    if (was === 'PLACEMENT' && m !== 'PLACEMENT') {
      if (this.placements !== this.editFrom) this.respawn();
      this.editFrom = null;
    }
    for (const h of this.handles.values()) {
      h.held = false;
      if (m === 'PLACEMENT') this.dropSlotWait(h);
      this.renderer.setCharacterState(h.id, { hidden: m === 'PLACEMENT', selected: false });
    }
  }

  /** 짧게 누름 — 일반 모드면 링을 띄울 수 있게 멈춰 세우고, 화면 좌표를 실어 내보낸다 */
  onPick(charId: string): void {
    const h = this.handles.get(charId);
    if (!h) return;
    if (this.mode === 'NORMAL') {
      for (const o of this.handles.values()) {
        o.held = o === h;
        this.renderer.setCharacterState(o.id, { selected: o === h });
      }
      h.path = [];
    }
    const s = this.renderer.screenOf(charId);
    if (s) this.events.onPicked(charId, s);
  }

  /** 옷 입히기 창에서 골랐다(null = 기본, 값 = MAX 옷) — 거실 캐릭터도 갈아입는다. 상태(헤진 · 좋은)는 그대로 */
  setOutfit(charId: string, clothesId: number | null): void {
    if (!this.handles.has(charId)) return;
    this.clothes.set(charId, clothesId);
    this.applyLook(charId);
  }

  /**
   * 종목 수익률(%)이 왔다 — 내 거실 보유 목록 폴링(GET /holdings, 3-②)마다. 캐릭터 id 별.
   * 처음 본 캐릭터는 바로, 이후엔 10분마다 옷 상태를 다시 판정하고 바뀌었으면 렌더러에 알린다(3-⑩)
   */
  updateReturnRates(rates: Readonly<Record<string, number>>): void {
    for (const id of this.handles.keys()) {
      const r = rates[id];
      if (r !== undefined && this.outfits.update(id, r)) this.applyLook(id);
    }
  }

  /** 지금 옷 상태 — 옷 입히기 창의 안내 한 줄. 수익률을 아직 못 받았으면 undefined */
  outfitStateOf(charId: string): OutfitState | undefined {
    return this.outfits.stateOf(charId);
  }

  /** 고른 옷 × 상태를 렌더러에 — 상태를 아직 모르면 일반 */
  private applyLook(charId: string): void {
    this.renderer.setOutfit(charId, { clothes: clothesKindOf(this.clothes.get(charId) ?? null), state: this.outfits.stateOf(charId) ?? 'normal' });
  }

  /** 스탯 링을 닫았다 — 다시 걷게 한다 (추가) */
  release(): void {
    for (const h of this.handles.values()) {
      h.held = false;
      this.renderer.setCharacterState(h.id, { selected: false });
    }
  }

  /** 누르고 있는 동안은 멈춰 세운다 — 게이지가 머리 위에 붙어 있게 */
  private setCharging(charId: string, on: boolean, ms = 0): void {
    const h = this.handles.get(charId);
    if (!h) return;
    h.charging = on;
    if (on) this.events.onLiftCharge(charId, ms);
    else this.events.onLiftChargeEnd(charId);
  }

  /** 길게 누름 → 들림. 위치는 저장하지 않는다 */
  onDragStart(charId: string): void {
    const h = this.handles.get(charId);
    if (!h) return;
    this.dropSlotWait(h);
    this.unseat(h, false); // 들려 나가니 설치 영역 밖으로 옮기지 않는다
    h.lifted = true;
    h.path = [];
    h.held = false;
    // 하던 엔진 명령은 버린다 — 틀던 모션은 아래 setCharacterState 에서 렌더러가 버리고, 비켜 걷던 것도 그만둔다
    h.acting = false;
    h.run = null;
    h.away = false;
    this.renderer.setCharacterState(charId, { lifted: true, selected: false });
    this.engine.interrupt(charId);
    this.engine.wakeByUser(charId); // 장외(sleepy)면 깬다 — 깨는 모션은 없고 들기 모션 그대로, 표정 · 기본 자세만 바뀐다
    this.events.onLifted(charId);
  }

  onDragMove(charId: string, pos: Pt, screen?: Pt): void {
    const h = this.handles.get(charId);
    if (!h) return;
    const clamp = (v: number) => Math.min(ROOM - MARGIN, Math.max(MARGIN, v));
    h.position = { x: clamp(pos.x), y: clamp(pos.y) };
    this.renderer.move(charId, h.position);
    this.setDropTarget(this.findDropTarget(h, screen));
  }

  /**
   * 지금 놓으면 만나는 상대 — 가장 가까운 하나.
   *   다른 캐릭터: 포인터가 그 캐릭터 위에 있거나(가장 먼저), 발밑끼리 CHAR_REACH 안
   *   상호작용 가구: 포인터가 그 가구 위에 있거나, 들고 있는 캐릭터 발밑이 가구 바닥 자리에서 FURN_REACH 안
   * 놓으면 가구는 엔진에 알리고(visitFurniture), 캐릭터는 다음 근접 판정이 알린다(onFieldEnter)
   */
  private findDropTarget(h: CharacterHandle, screen?: Pt): DropTarget | null {
    const found: { t: DropTarget; d: number }[] = [];
    const offer = (t: DropTarget, d: number) => found.push({ t, d });
    // 화면에서 겹쳐 보이는 것이 먼저 — 캐릭터는 가구보다 앞에 서 있으니 캐릭터가 이긴다
    const charUnder = screen ? this.renderer.pick(screen.x, screen.y, h.id) : null;
    if (charUnder && !this.handles.get(charUnder)?.lifted) offer({ kind: 'character', charId: charUnder }, -1);
    const under = screen ? this.renderer.pickFurniture(screen.x, screen.y) : null;
    for (const p of this.placements) {
      const def = this.furniture.def(p.furnitureId);
      if (!def?.engineName || this.broken.has(p.placementId)) continue;
      if (p.placementId === under) {
        offer({ kind: 'furniture', placementId: p.placementId }, 0);
        continue;
      }
      const f = footprint(def, { x: p.positionX, y: p.positionY }, p.rotation);
      const dx = Math.max(f.x0 - h.position.x, 0, h.position.x - f.x1);
      const dy = Math.max(f.y0 - h.position.y, 0, h.position.y - f.y1);
      const d = Math.hypot(dx, dy);
      if (d <= FURN_REACH) offer({ kind: 'furniture', placementId: p.placementId }, d);
    }
    for (const o of this.handles.values()) {
      if (o === h || o.lifted) continue;
      const d = Math.hypot(o.position.x - h.position.x, o.position.y - h.position.y);
      if (d <= CHAR_REACH) offer({ kind: 'character', charId: o.id }, d);
    }
    found.sort((a, b) => a.d - b.d);
    return found[0]?.t ?? null;
  }

  /** 하이라이트를 바꾼다. 상대 캐릭터는 하이라이트 동안 멈춰 기다린다 */
  private setDropTarget(t: DropTarget | null): void {
    const prev = this.dropTarget;
    if (targetKey(prev) === targetKey(t)) return;
    if (prev?.kind === 'character') {
      const o = this.handles.get(prev.charId);
      if (o) o.awaiting = false;
    }
    if (t?.kind === 'character') {
      const o = this.handles.get(t.charId);
      if (o) o.awaiting = true;
    }
    this.dropTarget = t;
    this.renderer.setDropTarget(t);
  }

  onDragEnd(charId: string): void {
    const h = this.handles.get(charId);
    if (!h) return;
    const target = this.dropTarget;
    h.lifted = false;
    h.rest = 1 + Math.random() * 2;
    this.setDropTarget(null);
    this.renderer.setCharacterState(charId, { lifted: false }); // 먼저 풀어야 렌더러가 아래 play 를 받는다
    // 놓은 상대 — 캐릭터는 들린 동안 근접 판정에서 빠져 있었으니 다음 판정에서 새로 마주친다.
    // 가구는 엔진에 알린다. 모션이 시작되면 가구 모션 자리(소파 앉기 = 좌석, 그 밖 = 가운데 + MOTION_SPOTS)로 옮겨 선다
    if (target?.kind === 'furniture' && this.mode === 'NORMAL') {
      // 슬롯머신은 앞 자리에 바로 세워 마주 보게 하고 뜸을 들인 뒤에 엔진에 알린다(2026-11-14 도휘) — 모션이 그 거리에서 레버를 당기도록 만들어졌다.
      // 걸어가게도 해 봤지만 오래 걸리고 주변 가구를 뚫고 지나가서 바로 세운다.
      // 뽑기(서버)는 놓는 순간 시작하고, 레버 · 결과 창 타이밍은 onSlotStart 에서 맞춘다
      if (this.engineFurniture.get(target.placementId) === SLOT_MACHINE && this.standAtSlot(h, target.placementId)) {
        this.events.onSlotDrop?.(charId, target.placementId);
        return;
      }
      this.visitFurniture(h, target.placementId); // 소파 앉기면 엔진이 고른 자리(앵커)에 앉힌다
      // 슬롯머신에 직접 끌어다 놓았을 때만 뽑기 시도(M-4) — 엔진이 반응하든 말든(쿨다운 · 감정 대기) 알린다. 캐릭터 동작은 엔진 play_slot 그대로
      if (this.engineFurniture.get(target.placementId) === SLOT_MACHINE) this.events.onSlotDrop?.(charId, target.placementId);
      return;
    }
    this.stepAside(h); // 장식 가구 위에 내려놓았으면 내려온다
  }

  /** 슬롯머신 앞 자리(SLOT_STAND)에 바로 세워 마주 보게 한다. 회전 0 = 모델 정면(+Z)이 방 앞쪽(+y) — RoomScene.attachFurnitureModel 과 같은 규칙 */
  private standAtSlot(h: CharacterHandle, placementId: number): boolean {
    const p = this.placements.find((q) => q.placementId === placementId);
    const def = p && this.furniture.def(p.furnitureId);
    if (!p || !def) return false;
    const f = footprint(def, { x: p.positionX, y: p.positionY }, p.rotation);
    const r = (p.rotation * Math.PI) / 180;
    const front = { x: -Math.sin(r), y: Math.cos(r) };
    const side = { x: Math.cos(r), y: Math.sin(r) };
    const spot = {
      x: (f.x0 + f.x1) / 2 + front.x * SLOT_STAND.front + side.x * SLOT_STAND.side,
      y: (f.y0 + f.y1) / 2 + front.y * SLOT_STAND.front + side.y * SLOT_STAND.side,
    };
    h.position = spot;
    h.path = [];
    this.renderer.move(h.id, spot);
    this.renderer.face?.(h.id, { x: -front.x, y: -front.y }, true);
    this.slotWaits.set(h.id, { placementId, wait: SLOT_PAUSE_S });
    return true;
  }

  /**
   * 소파 좌석 가운데에 세워 소파 정면을 보게 하고, 엉덩이가 좌석 윗면에 닿도록 몸 높이를 맞춘다.
   * 회전 0 = 모델 정면(+Z)이 방 앞쪽(+y). 앞뒤 자리는 엉덩이 뒷면이 등받이 앞면에 닿게
   */
  private sitOnSofa(h: CharacterHandle, placementId: number, anchorId?: string[]): void {
    const p = this.placements.find((q) => q.placementId === placementId);
    const def = p && this.furniture.def(p.furnitureId);
    if (!p || !def) return;
    const seat = SOFA_SEAT;
    const f = footprint(def, { x: p.positionX, y: p.positionY }, p.rotation);
    const r = (p.rotation * Math.PI) / 180;
    const front = { x: -Math.sin(r), y: Math.cos(r) };
    const side = {x: Math.cos(r), y: Math.sin(r)};
    const along = seat.back - SIT_POSE.buttBack + SOFA_BACK_GAP;
    const anchors = def.engine?.anchors;
    const matched = anchors?.filter((a) => anchorId?.includes(a.id)) ?? [];
    const offsetX = matched.length > 0 ?
      matched.reduce((sum, a) => sum + a.offset[0], 0) / matched.length : 0;
    const spot = { x: ((f.x0 + f.x1) / 2 + front.x * along) + side.x*offsetX,
       y: ((f.y0 + f.y1) / 2 + front.y * along) + side.y*offsetX };

    h.position = spot;
    h.path = [];

    this.renderer.move(h.id, spot);
    this.renderer.face?.(h.id, front, true);
    this.renderer.setSeatLift?.(h.id, seat.y - SIT_POSE.buttY);
    this.seated.add(h.id); 
  }

  /**
   * 둘이 하는 모션(PAIR_GAP)이면 마주친 상대 앞 정해진 거리로 옮겨 서고 서로 마주 본다 — 상대 쪽에서 보던 방향은 그대로 두고 거리만 맞춘다.
   * 그 자리가 가구 · 벽이면 상대 둘레를 30°씩 돌며 빈 자리를 찾고, 없으면 제자리에서 마주 보기만 한다.
   * 둘 다 PAIR_GAP 모션이면 먼저 받은 쪽만 옮겨 선다(둘 다 움직여 어긋나지 않게).
   * 그다음 각 캐릭터에게 자기 첫 모션의 보정(PAIR_SPOTS)을 마주 선 기준 자리에서 건다 — 양쪽 다(거실모션 H-5)
   */
  private facePartner(h: CharacterHandle, steps: readonly { name: string }[]): void {
    this.pairs.delete(h.id); // 새 명령 — 앞 만남의 기준 자리는 끝
    const first = steps[0]?.name;
    const gap = first !== undefined ? PAIR_GAP[first] : undefined;
    const fix = first !== undefined ? PAIR_SPOTS[first] : undefined;
    const o = (gap !== undefined || fix) && h.metWith ? this.handles.get(h.metWith) : undefined;
    if (first === undefined || !o || o.lifted) return;
    const mine = this.pairs.get(o.id);
    const oPair = mine?.with === h.id ? mine : undefined; // 상대가 이번 만남의 명령을 먼저 받았다
    const oBase = oPair ? oPair.base : o.position;
    let moved = false;
    if (gap !== undefined && !oPair?.moved) {
      const dx = h.position.x - oBase.x;
      const dy = h.position.y - oBase.y;
      const base = dx * dx + dy * dy > 1e-6 ? Math.atan2(dy, dx) : 0;
      for (let k = 0; k < 12; k++) {
        const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6);
        const spot = { x: oBase.x + Math.cos(a) * gap, y: oBase.y + Math.sin(a) * gap };
        if (!this.grid.freeAt(spot)) continue;
        h.position = spot;
        h.path = [];
        this.renderer.move(h.id, spot);
        break;
      }
      moved = true;
      const to = { x: oBase.x - h.position.x, y: oBase.y - h.position.y };
      this.renderer.face?.(h.id, to, true);
      this.renderer.face?.(o.id, { x: -to.x, y: -to.y }, true);
      o.path = [];
    }
    const hBase = h.position;
    this.pairs.set(h.id, { with: o.id, base: hBase, first, moved });
    this.applyPairSpot(h, first, hBase, oBase);
    // 먼저 받은 상대의 보정은 옮기기 전 자리에서 걸렸다 — 새 기준 자리에서 다시
    if (oPair && moved) this.applyPairSpot(o, oPair.first, oPair.base, hBase);
  }

  /** 두 캐릭터 보정 하나 — 기준 자리(base)에서 상대 기준 자리 쪽을 앞으로 along · 몸 +X 로 side · turn · lift */
  private applyPairSpot(c: CharacterHandle, first: string, base: Pt, partner: Pt): void {
    const s = PAIR_SPOTS[first];
    const got = s && pairSpotOf(base, partner, s);
    if (!s || !got) return;
    c.position = got.at;
    c.path = [];
    this.renderer.move(c.id, got.at);
    this.renderer.face?.(c.id, got.face, true);
    if (s.lift !== 0) {
      this.renderer.setSeatLift?.(c.id, s.lift);
      this.pairLifted.add(c.id);
    }
  }

  /* ── 모션 실험(?lab) — 주가와 상관없이 원할 때 모션을 본다. 실제 서비스엔 쓰지 않는다 ── */

  /**
   * 엔진을 거치지 않고 바로 튼다 — names 를 차례로(마지막만 반복 여부를 따른다). partner 가 있으면 둘이 마주친 것으로 보고
   * 상대에게 partnerNames 를 먼저 틀어 둔다(둘이 하는 모션은 자리 · 방향을 맞춘다)
   */
  labPlay(id: string, names: string[], partner?: { id: string; names: string[] }): void {
    const h = this.handles.get(id);
    if (!h || names.length === 0) return;
    const steps = (list: string[]) =>
      list.map((name, i) => ({ name, kind: 'clip' as const, loop: i === list.length - 1 && this.motions.loopOf(name) }));
    this.engine.interrupt(id);
    const o = partner && partner.id !== id ? this.handles.get(partner.id) : undefined;
    if (o && partner) {
      this.engine.interrupt(o.id);
      h.metWith = o.id;
      o.metWith = h.id;
      if (partner.names.length) this.onCommand({ type: 'play', characterId: o.id, steps: steps(partner.names) });
    }
    this.onCommand({ type: 'play', characterId: id, steps: steps(names) });
  }

  /** 하던 모션을 멈춘다 */
  labStop(id: string): void {
    const h = this.handles.get(id);
    if (!h) return;
    this.engine.interrupt(id);
    this.stopActing(h);
  }

  /** 둘을 붙여 세우고 마주친 것으로 엔진에 알린다 — 무엇을 할지는 엔진이 감정 · 규칙(확률 포함)대로 고른다. 쿨다운 중이면 아무 일도 없다 */
  labMeet(a: string, b: string): void {
    const A = this.handles.get(a);
    const B = this.handles.get(b);
    if (!A || !B || a === b) return;
    for (const h of [A, B]) {
      this.engine.interrupt(h.id);
      this.stopActing(h);
      h.path = [];
    }
    for (let k = 0; k < 8; k++) {
      const ang = (k * Math.PI) / 4;
      const spot = { x: A.position.x + Math.cos(ang) * 1.2, y: A.position.y + Math.sin(ang) * 1.2 };
      if (!this.grid.freeAt(spot)) continue;
      B.position = spot;
      this.renderer.move(B.id, spot);
      break;
    }
    this.onFieldEnter(a, b);
  }

  /**
   * 「이펙트만」 단계 시계(H-6) — 시간이 다 되면 저릿저릿을 끄고 다음 단계로. 그 전에 다른 명령 · 들기 · 멈춤이 오면 저릿저릿만 끈다
   */
  private stepEffects(dt: number): void {
    for (const [id, e] of [...this.effectSteps]) {
      const h = this.handles.get(id);
      if (!h || h.run !== e.run) {
        this.effectSteps.delete(id);
        this.renderer.setJitterForce?.(id, false);
        continue;
      }
      e.left -= dt;
      if (e.left > 0) continue;
      this.effectSteps.delete(id);
      this.renderer.setJitterForce?.(id, false);
      this.nextStep(h, e.run);
    }
  }

  /**
   * 끝난 뒤 멍(holdEndMs, fall_down) 시계 — 모션이 끝에 닿고 정해진 초가 지나면 붙잡던 마지막 자세를 내려놓고 다음 단계로.
   * 그 전에 다른 명령 · 들기 · 감정 변화로 명령이 바뀌면 그냥 버린다(렌더러는 이미 새 명령 · cancel 을 받았다)
   */
  private stepEndHolds(dt: number): void {
    for (const [id, e] of [...this.endHolds]) {
      const h = this.handles.get(id);
      if (!h || h.run !== e.run) {
        this.endHolds.delete(id);
        continue;
      }
      if (!e.fx.step(dt, this.renderer.motionClock?.(id) ?? null)) continue;
      this.endHolds.delete(id);
      this.renderer.cancel(id);
      this.nextStep(h, e.run);
    }
  }

  /* ── 가구 박살(G-2) ─────────────────────────────────────── */

  /**
   * 박살 모션(BREAK_FX)이면 박살을 건다 — 가구에 온 명령일 때만(내 방 · 남의 방 모두. 남의 방은 해제 없이 화면에서만). 아니면 null.
   * 파일이 없는 모션(motions.json clip 이 비었음)은 시작 0.3초 뒤에 터진다
   */
  private startBreak(h: CharacterHandle, run: ActRun, motion: string, clip: string | null): BreakRun | null {
    const placementId = run.furnitureId;
    if (!BREAK_FX[motion] || placementId === undefined) return null;
    if (!this.placements.some((p) => p.placementId === placementId) || this.broken.has(placementId)) return null;
    const fx = new BreakRun(motion, clip === null);
    this.breaks.add({ charId: h.id, fx, run, placementId });
    return fx;
  }

  /**
   * 박살 시계 — 들썩 · 먼지 · 가장 짙음을 렌더러 · 엔진에 낸다. 터지기 전에 캐릭터가 다른 일을 하게 되면(들기 · 다른 명령 · 감정 변화) 박살은 없던 일.
   * 터진 뒤면 가구는 그대로 사라진다(먼지가 이미 나왔다) — 모션 끝 알림만 보내지 않는다(엔진은 이미 끝낸 상호작용)
   */
  private stepBreaks(dt: number): void {
    for (const b of [...this.breaks]) {
      const h = this.handles.get(b.charId);
      const live = !!h && h.run === b.run;
      if (!live && !b.fx.burst) {
        this.breaks.delete(b);
        continue;
      }
      const clock = live ? (this.renderer.motionClock?.(b.charId) ?? null) : null;
      for (const ev of b.fx.step(dt, clock)) {
        if (ev === 'bump') this.renderer.bumpFurniture?.(b.placementId);
        else if (ev === 'burst') this.renderer.burstDust?.(b.placementId);
        else this.breakPeak(b, live ? h : undefined);
      }
      if (b.fx.peaked) this.breaks.delete(b);
    }
  }

  /**
   * 먼지가 가장 짙다 — 가구를 숨기고, 박살 모션을 그 자리에서 끝내고(모션 끝 알림 · 쿨다운이 지금부터 — 바닥으로 내리는 처리 없음),
   * 배치를 해제한다(보관함으로)
   */
  private breakPeak(b: BreakEntry, h: CharacterHandle | undefined): void {
    this.renderer.setFurnitureHidden?.(b.placementId, true);
    if (h) {
      this.renderer.cancel(h.id); // 붙잡고 있던 마지막 자세를 내려놓는다 — 다음 모션은 엔진이 정한다
      this.nextStep(h, b.run);
    }
    // 같은 가구를 쓰던 다른 캐릭터(예: 점유하지 않는 숨기로 책상 밑에 있던 캐릭터)도 그 순간 끝낸다 — 모션 끝과 같게(거실모션 H-3)
    for (const o of this.handles.values()) {
      const run = o.run;
      if (o === h || !run || run.furnitureId !== b.placementId) continue;
      this.renderer.cancel(o.id);
      run.i = run.steps.length - 1; // 남은 단계 없이 끝 — 마지막 단계 이름으로 끝 알림
      this.nextStep(o, run);
    }
    this.releaseBroken(b.placementId);
  }

  /**
   * 배치 해제 — 그 가구를 뺀 방 전체를 저장한다(배치 모드 「보관함으로 → 저장」과 같은 API · 같은 상태 갱신).
   * 실패하면 가구를 다시 보이고 다시 시도하지 않는다.
   * 남의 방(저장 없음)은 서버를 부르지 않고 이 화면의 배치에서만 뺀다 — 씬 · 엔진 · 걷는 칸은 저장했을 때와 같게 맞춘다(새로고침하면 다시 있음)
   */
  private releaseBroken(placementId: number): void {
    if (!this.saveLayout) {
      this.setPlacements(this.placements.filter((p) => p.placementId !== placementId));
      return;
    }
    this.broken.add(placementId);
    this.releaseChain = this.releaseChain.then(async () => {
      const save = this.saveLayout;
      const keep = this.placements.filter((p) => p.placementId !== placementId);
      const saved = save && keep.length < this.placements.length && !this.stopped ? await save(keep).catch(() => null) : null;
      this.broken.delete(placementId);
      if (this.stopped) return;
      if (!saved) {
        this.renderer.setFurnitureHidden?.(placementId, false);
        return;
      }
      this.setPlacements(saved); // 씬에서 지우고 엔진에도 알린다(tellEngine) · 걷는 칸도 다시
    });
  }

  /** 앉기를 푼다 — 모션이 끝났거나 멈췄거나 다시 들었다. 가구 모션 자리였으면 높이 · 바닥 붙이기를 풀고 설치 영역 밖으로(stepOut) */
  private unseat(h: CharacterHandle, out = true): void {
    if (this.pairLifted.delete(h.id)) this.renderer.setSeatLift?.(h.id, 0);
    const spot = this.spotted.get(h.id);
    if (spot !== undefined) {
      this.spotted.delete(h.id);
      this.renderer.setSeatLift?.(h.id, 0);
      this.renderer.setGrounded?.(h.id, false);
      if (out && !h.lifted) this.stepOut(h, spot);
    }
    if (!this.seated.delete(h.id)) return;
    this.renderer.setSeatLift?.(h.id, 0);
  }

  /** 슬롯머신 앞에서 뜸을 들이는 중 — 다 되면 엔진에 알린다 */
  private waitAtSlot(h: CharacterHandle, sw: SlotWait, dt: number): void {
    sw.wait -= dt;
    if (sw.wait > 0) return;
    this.slotWaits.delete(h.id);
    h.rest = between(REST_MIN, REST_SPAN);
    this.engine.visitFurniture(h.id, sw.placementId);
    const playing = h.acting && !!h.run?.steps.some((s) => s.name === 'play_slot');
    this.events.onSlotStart?.(h.id, sw.placementId, playing);
  }

  /** 슬롯머신 앞에서 뜸을 들이던 것을 그만둔다(다시 들었다 · 다른 명령 · 배치 모드) — HUD 가 기다리지 않게 알린다 */
  private dropSlotWait(h: CharacterHandle): void {
    const sw = this.slotWaits.get(h.id);
    if (!sw) return;
    this.slotWaits.delete(h.id);
    h.path = [];
    this.events.onSlotStart?.(h.id, sw.placementId, false);
  }

  /* ── 포인터 → 위 진입점들. 좌표는 방 기준 px ─────────────────────── */

  pointerDown(x: number, y: number): void {
    this.gesture.down(x, y);
  }

  pointerMove(x: number, y: number): void {
    this.gesture.move(x, y);
  }

  pointerUp(x: number, y: number): void {
    this.gesture.up(x, y);
  }

  /** 포인터를 놓쳤다 — 들고 있던 캐릭터를 내려놓는다 */
  pointerCancel(): void {
    this.gesture.cancel();
  }

  /** 이 자리(방 기준 px)에 있는 캐릭터 — 아이템을 끌어다 놓을 때 페이지가 묻는다 */
  charAt(x: number, y: number): string | null {
    return this.renderer.pick(x, y);
  }

  /** 지금 화면 좌표 */
  screenOf(charId: string): Pt | null {
    return this.renderer.screenOf(charId);
  }
}

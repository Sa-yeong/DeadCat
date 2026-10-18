import type { InteractionMode, PlacementDto, Quote, RoomCharacterDto, RoomSnapshot } from '../types';
import type { CharacterCatalog, FurnitureCatalog } from './catalogs';
import type { CharacterEngine, EngineCommand, EngineFactory } from './CharacterEngine';
import { createHandle, type CharacterHandle } from './CharacterHandle';
import { WalkGrid } from './occupancy';
import { findPath } from './pathfinding';
import { syncPlacements } from './placementSync';
import { PressGesture } from './PressGesture';
import type { PriceFeedClient } from './PriceFeedClient';
import { ProximityField } from './ProximityField';
import { ROOM, type Pt } from './projection';
import { footprint } from './furnitureShape';
import type { DropTarget, MotionStep, RoomRenderer } from './RoomRenderer';

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
  /** 시세가 왔다 — HUD 의 거실 자산·수익률용 (추가, 제안). 감정은 시세로 계산하지 않는다 — 엔진이 백엔드에서 받는다 */
  onQuotes(q: Record<string, Quote>): void;
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

const targetKey = (t: DropTarget | null) => (!t ? '' : t.kind === 'furniture' ? `f${t.placementId}` : `c${t.charId}`);

/**
 * 거실에서 **언제 무슨 일이 일어났는지**를 엔진에 알리고, 엔진 명령을 렌더러로 넘긴다 (2026-10-18 역할 분리).
 *   여기   근접 판정(자기장) · 들기/놓기 · 걷기 · 배치 — 감정을 계산하거나 기억하지 않는다
 *   엔진   감정 · 상호작용 판단 · 쿨다운 (CharacterEngine)
 *   렌더러 그리기 · 재생 — 재생기는 렌더러 하나, 순서는 들림 > 엔진 모션 > 걷기·대기
 * 시점 mode(주인/방문자)는 모른다. 상호작용 모드(NORMAL/PLACEMENT)는 안다 —
 * 같은 클릭이 모드에 따라 스탯 링 / (배치 모드에선 무시) 로 갈리기 때문이다.
 */
export class RoomLoop {
  private readonly renderer: RoomRenderer;
  private readonly engine: CharacterEngine;
  private readonly chars: CharacterCatalog;
  private readonly furniture: FurnitureCatalog;
  private readonly feed: PriceFeedClient;
  private readonly events: RoomLoopEvents;
  private readonly field = new ProximityField();
  private readonly gesture: PressGesture;

  private readonly handles = new Map<string, CharacterHandle>();
  private placements: PlacementDto[] = [];
  private grid = WalkGrid.empty();
  /** 들고 있는 캐릭터를 지금 놓으면 만나는 상대 — 하이라이트 중 */
  private dropTarget: DropTarget | null = null;
  private mode: InteractionMode = 'NORMAL';
  /** 배치 편집에 들어갈 때의 배치 — 나올 때 이것과 다르면(저장했으면) 캐릭터를 다시 세운다 */
  private editFrom: PlacementDto[] | null = null;
  private raf = 0;
  private last = 0;
  private fieldTimer = 0;

  constructor(deps: {
    renderer: RoomRenderer;
    /** 엔진을 만든다 — 명령 통로를 넘겨준다. 팀원 엔진이 붙기 전에는 NullEngine */
    createEngine: EngineFactory;
    characters: CharacterCatalog;
    furniture: FurnitureCatalog;
    feed: PriceFeedClient;
    events: RoomLoopEvents;
  }) {
    this.renderer = deps.renderer;
    this.engine = deps.createEngine((cmd) => this.onCommand(cmd));
    this.chars = deps.characters;
    this.furniture = deps.furniture;
    this.feed = deps.feed;
    this.events = deps.events;
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
      const def = this.chars.def(c.stockCode);
      if (!def || this.handles.has(c.stockCode)) continue;
      const h = createHandle(c.stockCode, this.spawnPoint(taken) ?? { x: ROOM / 2, y: ROOM / 2 });
      this.handles.set(c.stockCode, h);
      this.renderer.spawn(c.stockCode, def, h.position);
      this.engine.addCharacter(c.stockCode);
      if (c.ownedClothesId !== null) this.renderer.setOutfit(c.stockCode, c.ownedClothesId);
    }
  }

  /**
   * 거실에 세울 캐릭터를 바꾼다 — 캐릭터 탭에서 프리셋을 고르거나 고쳤을 때 (2026-10-12 추가).
   * 빠진 캐릭터는 치우고, 새로 든 캐릭터는 빈 칸 아무 데나 세운다. 남은 캐릭터는 하던 대로 둔다.
   * 시세는 새 목록으로 다시 구독한다. 카탈로그에 없는 종목은 세우지 못한다(characterIds 로 알 수 있다)
   */
  setRoster(characters: RoomCharacterDto[]): void {
    const keep = new Set(characters.map((c) => c.stockCode));
    const removed = [...this.handles.keys()].filter((id) => !keep.has(id));
    const added = characters.some((c) => !this.handles.has(c.stockCode) && this.chars.def(c.stockCode));
    if (removed.length === 0 && !added) return;
    this.gesture.cancel(); // 들고 있던 캐릭터가 빠질 수 있다 — 내려놓고 시작
    for (const id of removed) {
      if (this.dropTarget?.kind === 'character' && this.dropTarget.charId === id) this.setDropTarget(null);
      this.engine.deleteCharacter(id);
      this.renderer.despawn(id); // 틀던 엔진 모션도 같이 버린다
      this.handles.delete(id);
    }
    this.spawnAll(characters);
    if (this.raf) this.feed.subscribe([...this.handles.keys()], (q) => this.onPriceUpdate(q));
  }

  /** 실제로 세운 캐릭터 — 오버레이는 이 목록만 보여 준다(못 세운 종목은 시세도 안 온다) */
  get characterIds(): string[] {
    return [...this.handles.keys()];
  }

  /** 지금 방에 놓인 배치 — 배치 편집을 시작할 때 오버레이가 읽는다. 배치의 원본은 여기 하나 */
  get currentPlacements(): readonly PlacementDto[] {
    return this.placements;
  }

  /** 가구를 다시 놓는다 — 배치 저장 뒤에 페이지가 부른다. 없어진 가구는 씬에서 지운다 (추가) */
  setPlacements(placements: PlacementDto[]): void {
    syncPlacements(this.renderer, this.placements, placements);
    // 엔진에도 놓인 가구를 알린다 {잠정 — 배치 id. 가구 종류를 어떻게 넘길지 팀원 답 대기}
    const was = new Set(this.placements.map((p) => p.placementId));
    const now = new Set(placements.map((p) => p.placementId));
    for (const id of was) if (!now.has(id)) this.engine.deleteFurniture(String(id));
    for (const id of now) if (!was.has(id)) this.engine.addFurniture(String(id));
    this.placements = placements.map((p) => ({ ...p }));
    this.walkOn(placements);
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
      this.renderer.move(h.stockCode, pos); // 숨어 있는 동안 옮기면 렌더러가 카메라 쪽을 보게 세운다
      this.stopActing(h);
      this.engine.interrupt(h.stockCode);
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
    this.feed.subscribe([...this.handles.keys()], (q) => this.onPriceUpdate(q));
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
    this.feed.unsubscribe();
    this.engine.dispose();
    this.gesture.cancel();
  }

  tick(dt: number): void {
    if (this.mode === 'PLACEMENT') return; // 숨어 있는 동안은 멈춰 있는다 — 걷지도, 마주치지도 않는다
    for (const h of this.handles.values()) {
      if (h.held || h.lifted || h.charging || h.awaiting) continue;
      // 엔진 모션 중엔 제자리 — 단, 가구 위에 내려놓아 비켜 나오는 중이면 마저 나온다
      if (h.acting && this.grid.freeAt(h.position)) continue;
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
      // 경유지를 넘어가도 남은 걸음은 다음 구간에 이어 쓴다 — 꺾을 때 멈칫하지 않게
      let stepLen = SPEED * dt;
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
      if (h.path.length === 0) h.rest = between(REST_MIN, REST_SPAN);
      this.renderer.move(h.stockCode, h.position);
    }
    this.fieldTimer += dt;
    if (this.fieldTimer > 0.5) {
      this.fieldTimer = 0;
      // 들린 캐릭터는 판정에서 뺀다 — 놓은 자리에서 새로 마주친다
      const list = [...this.handles.values()].filter((h) => !h.lifted).map((h) => ({ id: h.stockCode, x: h.position.x, y: h.position.y }));
      for (const e of this.field.evaluate(list)) this.onFieldEnter(e.a, e.b);
    }
  }

  /** 시세 — HUD(거실 자산·수익률)로만 넘긴다. 감정은 엔진 몫이다 */
  onPriceUpdate(quotes: Record<string, Quote>): void {
    this.events.onQuotes(quotes);
  }

  /** 두 캐릭터가 가까워졌다 — 판정은 여기, 무엇을 할지는 엔진. 링이 열려 멈춰 선 캐릭터는 알리지 않는다 */
  onFieldEnter(charId: string, otherId: string): void {
    const a = this.handles.get(charId);
    const b = this.handles.get(otherId);
    if (!a || !b || a.held || b.held || a.lifted || b.lifted) return;
    this.engine.encounter(charId, otherId);
  }

  /**
   * 엔진 명령 → 렌더러. 모션 이름이 곧 클립 이름이다 {잠정 — 팀원 명령 모양 대기}.
   * 트는 동안 제자리에 세우고, 끝나면 마지막 모션 이름으로 엔진에 알린다.
   * 들려 있으면 받지 않는다(엔진은 들 때 interrupt 를 받았다). 렌더러는 지금 요청의 끝만 알려 준다 —
   * 새 요청이 앞 요청을 밀어내면 앞 요청의 끝 신호는 오지 않는다
   */
  private onCommand(cmd: EngineCommand): void {
    const h = this.handles.get(cmd.characterId);
    if (!h) return;
    if (cmd.kind === 'stop') {
      this.stopActing(h);
      return;
    }
    if (h.lifted) return;
    const n = cmd.motions.length;
    const steps: MotionStep[] = cmd.motions.map((clip, i) => ({ clip, loop: i === n - 1 && cmd.loop === true }));
    const last = cmd.motions[n - 1];
    h.acting = true;
    this.renderer.play(h.stockCode, steps, () => {
      h.acting = false;
      if (last !== undefined) this.engine.motionFinished(h.stockCode, last);
    });
  }

  /** 엔진 모션을 멈추고 다시 걷게 한다 — 끝 신호는 없다 */
  private stopActing(h: CharacterHandle): void {
    h.acting = false;
    this.renderer.cancel(h.stockCode);
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
      this.renderer.setCharacterState(h.stockCode, { hidden: m === 'PLACEMENT', selected: false });
    }
  }

  /** 짧게 누름 — 일반 모드면 링을 띄울 수 있게 멈춰 세우고, 화면 좌표를 실어 내보낸다 */
  onPick(charId: string): void {
    const h = this.handles.get(charId);
    if (!h) return;
    if (this.mode === 'NORMAL') {
      for (const o of this.handles.values()) {
        o.held = o === h;
        this.renderer.setCharacterState(o.stockCode, { selected: o === h });
      }
      h.path = [];
    }
    const s = this.renderer.screenOf(charId);
    if (s) this.events.onPicked(charId, s);
  }

  /** 옷 입히기 창에서 적용했다 — 거실 캐릭터도 갈아입는다 (추가) */
  setOutfit(charId: string, clothesId: number | null): void {
    this.renderer.setOutfit(charId, clothesId);
  }

  /** 스탯 링을 닫았다 — 다시 걷게 한다 (추가) */
  release(): void {
    for (const h of this.handles.values()) {
      h.held = false;
      this.renderer.setCharacterState(h.stockCode, { selected: false });
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
    h.lifted = true;
    h.path = [];
    h.held = false;
    h.acting = false; // 틀던 엔진 모션은 아래 setCharacterState 에서 렌더러가 버린다
    this.renderer.setCharacterState(charId, { lifted: true, selected: false }); // 틀던 엔진 모션은 렌더러가 버린다
    this.engine.interrupt(charId);
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
    const charUnder = screen ? this.renderer.pick(screen.x, screen.y, h.stockCode) : null;
    if (charUnder && !this.handles.get(charUnder)?.lifted) offer({ kind: 'character', charId: charUnder }, -1);
    const under = screen ? this.renderer.pickFurniture(screen.x, screen.y) : null;
    for (const p of this.placements) {
      const def = this.furniture.def(p.furnitureId);
      if (!def?.interactive) continue;
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
      if (d <= CHAR_REACH) offer({ kind: 'character', charId: o.stockCode }, d);
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
    h.lifted = false;
    h.rest = 1 + Math.random() * 2;
    const target = this.dropTarget;
    this.setDropTarget(null);
    this.stepAside(h); // 가구 위에 내려놓았으면 내려온다
    this.renderer.setCharacterState(charId, { lifted: false });
    // 놓은 상대 — 가구는 여기서 알린다. 캐릭터는 들린 동안 근접 판정에서 빠져 있었으니 다음 판정에서 새로 마주친다.
    // 놓았다는 것 자체를 엔진에 알릴지(endDrag 짝)는 팀원 답 대기 — 지금은 interrupt 만
    if (target?.kind === 'furniture') this.engine.visitFurniture(charId, String(target.placementId));
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

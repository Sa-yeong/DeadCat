import type { InteractionMode, PlacementDto, Quote, RoomSnapshot } from '../types';
import type { CharacterCatalog, FurnitureCatalog } from './catalogs';
import type { CharacterEngine } from './CharacterEngine';
import { createHandle, type CharacterHandle } from './CharacterHandle';
import { MotionArbiter } from './MotionArbiter';
import { MotionTable } from './MotionTable';
import { WalkGrid } from './occupancy';
import { findPath } from './pathfinding';
import { syncPlacements } from './placementSync';
import { PressGesture } from './PressGesture';
import type { PriceFeedClient } from './PriceFeedClient';
import { ProximityField } from './ProximityField';
import { ROOM, type Pt } from './projection';
import { footprint } from './furnitureShape';
import type { DropTarget, RoomRenderer } from './RoomRenderer';

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
  /** 시세가 왔다 — HUD 의 거실 자산·수익률용 (추가, 제안) */
  onQuotes(q: Record<string, Quote>): void;
}

const SPEED = 0.9; //   칸/초
const PLAN_TRIES = 8; // 목적지를 다시 고르는 횟수 — 막힌 곳만 고르면 잠깐 쉬었다 다시
const MARGIN = 0.3; //  들어 옮길 때 벽에서 띄우는 거리
const CHAR_REACH = 0.9; // 칸 — 들고 있는 캐릭터가 이만큼 가까우면 그 캐릭터가 상대
const FURN_REACH = 0.35; // 칸 — 상호작용 가구 바닥 자리에서 이만큼 안이면 그 가구가 상대

const targetKey = (t: DropTarget | null) => (!t ? '' : t.kind === 'furniture' ? `f${t.placementId}` : `c${t.charId}`);

/**
 * 거실의 **무엇을 할지**를 정한다. 그리는 건 RoomRenderer, 판정은 엔진·자기장·중재자.
 * 시점 mode(주인/방문자)는 모른다. 상호작용 모드(NORMAL/ITEM/PLACEMENT)는 안다 —
 * 같은 클릭이 모드에 따라 스탯 링 / 증여 / (배치 모드에선 무시) 로 갈리기 때문이다.
 */
export class RoomLoop {
  private readonly renderer: RoomRenderer;
  private readonly engine: CharacterEngine;
  private readonly chars: CharacterCatalog;
  private readonly furniture: FurnitureCatalog;
  private readonly feed: PriceFeedClient;
  private readonly events: RoomLoopEvents;
  private readonly arbiter: MotionArbiter;
  private readonly field = new ProximityField();
  private readonly gesture: PressGesture;

  private readonly handles = new Map<string, CharacterHandle>();
  private placements: PlacementDto[] = [];
  private grid = WalkGrid.empty();
  /** 들고 있는 캐릭터를 지금 놓으면 만나는 상대 — 하이라이트 중 */
  private dropTarget: DropTarget | null = null;
  private mode: InteractionMode = 'NORMAL';
  private raf = 0;
  private last = 0;
  private fieldTimer = 0;

  constructor(deps: {
    renderer: RoomRenderer;
    engine: CharacterEngine;
    characters: CharacterCatalog;
    furniture: FurnitureCatalog;
    feed: PriceFeedClient;
    events: RoomLoopEvents;
  }) {
    this.renderer = deps.renderer;
    this.engine = deps.engine;
    this.chars = deps.characters;
    this.furniture = deps.furniture;
    this.feed = deps.feed;
    this.events = deps.events;
    this.arbiter = new MotionArbiter((id, act) => this.renderer.playAct(id, act));
    this.gesture = new PressGesture({
      hit: (x, y) => (this.mode === 'PLACEMENT' ? null : this.renderer.pick(x, y)),
      canLift: () => this.mode === 'NORMAL',
      tap: (id) => (id ? this.onPick(id) : this.events.onEmptyPick()),
      chargeStart: (id, ms) => this.setCharging(id, true, ms),
      chargeEnd: (id) => this.setCharging(id, false),
      liftStart: (id) => this.onDragStart(id),
      liftMove: (id, x, y) => this.onDragMove(id, this.renderer.toFloor(x, y), { x, y }),
      liftEnd: (id) => this.onDragEnd(id),
    });
  }

  /**
   * 스냅샷으로 가구를 놓고 캐릭터를 세운다. 고르거나 자르지 않는다 —
   * 다만 카탈로그에 없는 종목은 그릴 모양이 없어 세우지 못한다(characterIds 로 알 수 있다).
   */
  load(snapshot: RoomSnapshot): void {
    this.setPlacements(snapshot.placements);
    for (const c of snapshot.characters) {
      const def = this.chars.def(c.stockCode);
      if (!def || this.handles.has(c.stockCode)) continue;
      const h = createHandle(c.stockCode, this.grid.randomFree() ?? { x: ROOM / 2, y: ROOM / 2 });
      this.handles.set(c.stockCode, h);
      this.renderer.spawn(c.stockCode, def, h.position);
      if (c.ownedClothesId !== null) this.renderer.setOutfit(c.stockCode, c.ownedClothesId);
    }
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

  /** 걷는 칸을 다시 만들고, 걷던 길은 새 가구 기준으로 다시 찾고, 가구에 묻힌 캐릭터는 비켜 세운다 */
  private walkOn(placements: readonly PlacementDto[]): void {
    this.grid = new WalkGrid(placements, (id) => this.furniture.def(id));
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
    this.gesture.cancel();
  }

  tick(dt: number): void {
    const now = performance.now();
    this.arbiter.tick(now);
    for (const h of this.handles.values()) {
      if (h.held || h.lifted || h.charging || h.awaiting) continue;
      if (h.path.length === 0) {
        h.rest -= dt;
        if (h.rest <= 0) {
          h.path = this.plan(h);
          if (h.path.length === 0) h.rest = 1;
        }
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
      if (h.path.length === 0) h.rest = 1.5 + Math.random() * 4;
      this.renderer.move(h.stockCode, h.position);
    }
    this.fieldTimer += dt;
    if (this.fieldTimer > 0.5) {
      this.fieldTimer = 0;
      const list = [...this.handles.values()].map((h) => ({ id: h.stockCode, x: h.position.x, y: h.position.y }));
      for (const e of this.field.evaluate(list)) this.onFieldEnter(e.a, e.b);
    }
  }

  onPriceUpdate(quotes: Record<string, Quote>): void {
    const now = performance.now();
    for (const h of this.handles.values()) {
      const q = quotes[h.stockCode];
      const def = this.chars.def(h.stockCode);
      if (!q || !def) continue;
      const { mood, changed } = this.engine.update(q.changeRate, def.sensitivity, h.lastMood);
      h.lastMood = mood;
      if (!changed) continue;
      const act = this.chars.act(h.stockCode, mood);
      // 기분의 행동이 한 번 하고 끝나는 것(놀람 등)이면, 끝난 뒤엔 옛 기분의 대기가 아니라 기본 대기로 돌아간다
      if (MotionTable.lookup(act).kind !== 'idle') this.arbiter.setIdle(h.stockCode, 'idle');
      // 들려 있는 동안엔 기분만 기억한다 — 내려놓을 때 그 기분의 행동으로 돌아간다
      if (!h.lifted) this.arbiter.submit(h.stockCode, act, now);
    }
    this.events.onQuotes(quotes);
  }

  onFieldEnter(charId: string, otherId: string): void {
    const a = this.handles.get(charId);
    const b = this.handles.get(otherId);
    const da = this.chars.def(charId);
    const db = this.chars.def(otherId);
    if (!a || !b || !da || !db || a.held || b.held || a.lifted || b.lifted || !a.lastMood || !b.lastMood) return;
    const now = performance.now();
    this.arbiter.submit(charId, this.engine.encounter(b.lastMood, da.sensitivity), now);
    this.arbiter.submit(otherId, this.engine.encounter(a.lastMood, db.sensitivity), now);
  }

  /* ── 상호작용 ───────────────────────────────────────────── */

  setInteractionMode(m: InteractionMode): void {
    this.mode = m;
    this.gesture.cancel();
    for (const h of this.handles.values()) {
      h.held = false;
      this.renderer.setCharacterState(h.stockCode, { dim: m === 'PLACEMENT', selected: false });
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
    this.renderer.setCharacterState(charId, { lifted: true, selected: false });
    this.arbiter.submit(charId, 'lifted', performance.now());
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
   * 무엇과 상호작용하는지(앉기 등)는 아직 없다 — 지금은 하이라이트만 {엔진·모션 확정 후}
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
    // 놓았다 — 하이라이트를 끈다. 상대와의 상호작용(앉기·인사 등)은 아직 없다 {엔진·모션 확정 후 여기서}
    this.setDropTarget(null);
    this.stepAside(h); // 가구 위에 내려놓았으면 내려온다
    this.renderer.setCharacterState(charId, { lifted: false });
    // 들림을 먼저 풀어야 한다 — 들린 채 감정 행동을 내면 순위에 밀려 버려진다
    this.arbiter.release(charId);
    if (h.lastMood) this.arbiter.submit(charId, this.chars.act(charId, h.lastMood), performance.now());
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

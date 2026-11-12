import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import * as api from '../api';
import type { PanControl, RoomLayout } from '../layout';
import type { CharacterCatalog, FurnitureCatalog } from '../runtime/catalogs';
import type { Pt } from '../runtime/projection';
import type { RoomLoop } from '../runtime/RoomLoop';
import type { RoomRenderer } from '../runtime/RoomRenderer';
import {
  charIdOf,
  type GiftResult,
  type InteractionMode,
  type InventoryItem,
  type OwnedStock,
  type Panel,
  type PlacementDto,
  type Quote,
  type ReactionKind,
  type RoomCharacterDto,
  type RoomReactions,
  type RoomSnapshot,
  type SlotDrawResult,
} from '../types';
import { AssetSummary } from './AssetSummary';
import { CameraButton } from './CameraMode';
import { ModeDock, TopActions } from './chrome';
import { GuestbookPanel } from './GuestbookPanel';
import { CharacterPanel } from './CharacterPanel';
import { AffinityFlash, ItemPanel } from './ItemTray';
import { WardrobeGallery } from './Modals';
import { isMaxAffinity } from './labels';
import { AttendancePanel, FarewellPanel } from './OwnerPanels';
import { OwnerProfileHud } from './OwnerProfileHud';
import { PlacementEditor } from './PlacementEditor';
import { PressRing } from './PressRing';
import { SidePanel } from './SidePanel';
import { SlotResultModal, SlotTimers } from './SlotMachine';
import { remainingMs, SLOT_NOTE_MS, SLOT_SPIN_MS, waitNotice, type SlotNote } from './slotText';
import { StatRing, type BadgeKind } from './StatRing';
import { useEscape } from './useEscape';
import { useRedDots } from './useRedDots';

/** 페이지가 런타임 콜백을 이어 붙이는 손잡이 */
export interface RoomHudApi {
  /** 캐릭터를 짧게 눌렀다 (링 자리는 그릴 때 런타임에 묻는다) */
  onSelect(charId: string, screen: Pt): void;
  onEmptyPick(): void;
  /** 캐릭터를 꾹 누르기 시작했다 — 머리 위 게이지가 ms 동안 찬다 */
  onLiftCharge(charId: string, ms: number): void;
  /** 들렸거나 취소됐다 — 게이지를 지운다 */
  onLiftChargeEnd(charId: string): void;
  /** 캐릭터가 들렸다 — 그 캐릭터의 스탯 링을 닫는다 */
  onLifted(charId: string): void;
  /** 아이템을 캐릭터에게 끌어다 놓았다 — 놓은 아이템 id 를 그대로 받는다 */
  onItemDrop(charId: string, itemId: number, screen: Pt): void;
  /** 끌고 있는 아이템 밑의 캐릭터가 바뀌었다(없으면 null) */
  onItemOver(charId: string | null): void;
  /**
   * 캐릭터를 끌어 슬롯머신에 놓았다(M-4) — 주인의 일반 모드에서만 뽑는다. 타이머가 안 찼으면 뽑지 않고 남은 시간만 알린다.
   * 뽑으면 서버 결과를 받은 뒤 레버 · 릴 → 결과 창 → 빨간점 다시 살피기
   */
  onSlotDrop(charId: string, placementId: number): void;
  /**
   * 빨간점 **다시 살피기**(M-2) — 가구 · 아이템 · 출석 · 이별 · 방명록을 서버에서 다시 조회해 버튼 점을 맞춘다(조회만, 주인이 아니면 아무것도 안 함).
   * 가구 · 아이템이 생긴 직후에 부른다 — 뽑기 직후(M-4)는 페이지에서 `hud.current?.recheckDots()`
   */
  recheckDots(): void;
}

/** OWNER 만 여는 것 */
const OWNER_ONLY: Panel[] = ['attendance', 'farewell', 'items', 'characters', 'wardrobe'];
/** 오른쪽 창에 뜨는 탭 — 옷 입히기만 가운데 팝업 */
type SideTab = Exclude<Panel, 'wardrobe'>;
const isSide = (p: Panel | null): p is SideTab => p !== null && p !== 'wardrobe';
const FLASH_MS = 1800;
const SIDE_LABEL: Record<SideTab, string> = { attendance: '출석 체크', farewell: '이별 흔적', guestbook: '방명록', items: '아이템', characters: '캐릭터' };

interface Flash {
  key: number;
  /** 준 순간의 머리 위 자리 — 캐릭터가 걸어가도 따라가지 않는다 */
  at: Pt;
  text: string;
  level: number;
  progress: number | null;
  sub?: string;
}

/**
 * 오버레이의 조율자 — 패널을 그리는 게 아니라 **누구를 띄울지 판단**한다.
 *   시점 모드로 허용 여부를 가르고, 패널은 하나만 열리게 하고,
 *   선택된 캐릭터와 스냅샷을 보관해 패널들에 나눠 준다.
 * 상호작용 모드를 바꾸면 RoomLoop 에 알린다 — 방향은 오버레이 → 런타임 한쪽뿐.
 */
export function RoomHud({
  ref,
  ownerId,
  snapshot,
  reactionKinds,
  holdings,
  quotes,
  layout,
  pan,
  loop,
  renderer,
  characters: catalog,
  furniture,
  onSidePanel,
  onStock,
  onVisit,
  onFollow,
  onRoomReactions,
  onPlacementsSaved,
  onRoster,
  loginOpen,
  onNeedLogin,
  onCamera,
  onInteraction,
}: {
  ref: Ref<RoomHudApi>;
  /** 거실 주인 — undefined 면 내 거실 */
  ownerId: api.OwnerId;
  snapshot: RoomSnapshot;
  reactionKinds: ReactionKind[];
  /** 내 보유 종목 전부(GET /holdings 폴링) — OWNER 의 보유 자산. 받기 전이거나 남의 거실이면 null */
  holdings: OwnedStock[] | null;
  /** 거실에 세운 캐릭터의 시세 — 캐릭터 id 별 */
  quotes: Record<string, Quote>;
  layout: RoomLayout;
  /** 줌인했을 때 빈 바닥 끌기 — 배치 편집기에 넘긴다 */
  pan: PanControl;
  loop: RoomLoop;
  renderer: RoomRenderer;
  characters: CharacterCatalog;
  furniture: FurnitureCatalog;
  /** 오른쪽 창이 열리고 닫힐 때 — 페이지가 줌 버튼을 비켜 놓는다 */
  onSidePanel: (open: boolean) => void;
  onStock: (stockCode: string) => void;
  onVisit: (userId: number) => void;
  /** 팔로우 버튼 — 토글 하나(POST /users/:userId/follow). 페이지가 보내고 서버 값으로 맞춘다 */
  onFollow: () => void;
  /** 거실 반응이 바뀌었다(방명록 탭에서 남김 · 교체 · 취소) — 페이지가 스냅샷을 맞춘다 */
  onRoomReactions: (r: RoomReactions) => void;
  onPlacementsSaved: (p: PlacementDto[]) => void;
  /** 거실에 선 캐릭터가 바뀌었다(캐릭터 탭) — 페이지가 스냅샷을 맞춘다 */
  onRoster: (characters: RoomCharacterDto[]) => void;
  /** 로그인 창은 페이지가 하나만 띄운다 — 떠 있는 동안 여기 Esc 는 쉰다 */
  loginOpen: boolean;
  onNeedLogin: () => void;
  /** 카메라 모드로(거실 썸네일) — 내 거실 · 3D 일 때만 페이지가 준다. 없으면 버튼도 없다 */
  onCamera?: () => void;
  /** 상호작용 모드가 바뀌었다(일반 · 배치) — 페이지가 자동 촬영 때를 가린다 */
  onInteraction?: (m: InteractionMode) => void;
}) {
  const mode = snapshot.mode;
  const owner = mode === 'OWNER';
  const [interaction, setInteraction] = useState<InteractionMode>('NORMAL');
  const [openPanel, setOpenPanel] = useState<Panel | null>(null);
  /** 오른쪽 창에 마지막으로 띄운 탭 — 닫히며 미끄러져 나가는 동안에도 내용이 남아 있게 */
  const [sideTab, setSideTab] = useState<SideTab>('guestbook');
  /** 탭을 열 때마다 올라간다 — 출석·이별 흔적은 열 때마다 새로 받게 key 로 쓴다 */
  const [openSeq, setOpenSeq] = useState(0);
  /** 링을 띄운 캐릭터. 자리는 그릴 때마다 런타임에 묻는다 — 창 크기가 바뀌어도 따라가게 */
  const [selected, setSelected] = useState<string | null>(null);
  // 런타임이 세운 캐릭터만 — 카탈로그에 없어 못 세운 종목은 링·옷 입히기에서도 뺀다
  const [chars, setChars] = useState<RoomCharacterDto[]>(() => {
    const placed = new Set(loop.characterIds);
    return snapshot.characters.filter((c) => placed.has(charIdOf(c)));
  });
  const [wardrobeFor, setWardrobeFor] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[] | null>(null);
  /** 끌고 있는 아이템 — 트레이에서 그 칸을 표시만 한다 */
  const [dragging, setDraggingState] = useState<number | null>(null);
  /** 끌고 있는 아이템 밑의 캐릭터 — 호감도 MAX 면 머리 위에 「이미 MAX」 */
  const [itemOver, setItemOver] = useState<string | null>(null);
  const setDragging = (itemId: number | null) => {
    setDraggingState(itemId);
    if (itemId === null) setItemOver(null);
  };
  const [flash, setFlash] = useState<Flash | null>(null);
  /** 들기 게이지 — 누를 때마다 key 가 바뀌어 처음부터 다시 찬다 */
  const [charge, setCharge] = useState<{ charId: string; ms: number; key: number } | null>(null);
  /** 보유 목록을 새로 받을 때마다 올라간다 — 그 전에 보낸 증여의 응답은 보유 수를 다시 깎지 않는다(새 목록에 이미 반영) */
  const itemSession = useRef(0);
  /** 캐릭터 반응을 보내는 중 */
  const reacting = useRef(false);

  /**
   * 비로그인은 다 보여 주되 **참여는 로그인 뒤에**. 반응·방명록·팔로우를 누르면 로그인 창을 띄운다.
   * 보기만 하는 것(스탯 링 열기, 방명록 읽기, 종목 보기, 남의 거실 가기)은 그대로 된다.
   * 쓰기를 실제로 막는 건 서버(JwtAuthGuard)다 — 여기는 안내다.
   */
  const guest = mode === 'GUEST';
  const askLogin = onNeedLogin;

  /** 빨간점(M-2) — 주인만. 거실에 들어올 때 한 번 살피고, 그 뒤로는 recheckDots 를 부를 때만 */
  const red = useRedDots(owner, () => loop.currentPlacements);
  /** 다시 살피기 — 아이템 탭이 열려 있으면 그 목록도 새로 받는다(새 아이템이 칸에 바로 보이게) */
  const recheckDots = () => {
    red.recheck();
    if (openPanel === 'items') loadInventory();
  };
  // 아이템 목록이 오거나 바뀌면(선물로 줄어듦) 본 수를 맞춘다 — 탭을 열어 본 것이므로 버튼 점은 지워진다
  useEffect(() => {
    if (inventory) red.itemsLoaded(inventory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventory]);

  /* ── 모드 · 패널 전환 ── */

  const deselect = () => {
    setSelected(null);
    loop.release();
  };

  const switchInteraction = (m: InteractionMode) => {
    setInteraction(m);
    loop.setInteractionMode(m);
    setSelected(null);
    setDragging(null);
    onInteraction?.(m);
  };

  /** 아이템 탭을 열 때마다 보유 목록을 새로 받는다 — 빠르게 여닫으면 늦게 온 옛 응답이 새 응답을 덮지 않게 */
  const loadInventory = () => {
    const req = ++itemSession.current;
    setInventory(null);
    const done = (inv: InventoryItem[]) => req === itemSession.current && setInventory(inv);
    void api.getInventory().then(done, () => done([]));
  };

  /**
   * 창 열기 — 모드 허용 판정 + 창은 하나만.
   * 오른쪽 창의 탭은 다른 탭을 누르면 내용만 바뀌고, 켜진 탭을 다시 누르면 닫힌다
   */
  const open = (panel: Panel, charId?: string) => {
    if (!owner && OWNER_ONLY.includes(panel)) return;
    if (panel === 'wardrobe') {
      setWardrobeFor(charId ?? (chars[0] ? charIdOf(chars[0]) : null));
      setOpenPanel('wardrobe');
      return;
    }
    if (openPanel === panel) return setOpenPanel(null);
    if (!isSide(openPanel)) deselect(); // 창이 새로 열릴 때만 링을 닫는다(탭만 바꿀 땐 그대로)
    if (panel === 'items') loadInventory();
    // 탭을 열면 그 버튼의 빨간점이 사라진다(출석은 출석해야 사라진다). 남의 거실 방명록은 점이 없다
    if (owner && (panel === 'items' || panel === 'farewell' || panel === 'guestbook')) red.panelOpened(panel);
    setSideTab(panel);
    setOpenSeq((n) => n + 1);
    setOpenPanel(panel);
  };
  const closePanel = () => setOpenPanel(null);

  // 오른쪽 창이 열리고 닫힐 때 — 페이지가 줌 버튼을 창 왼쪽으로 비킨다
  const sideOpen = isSide(openPanel);
  useEffect(() => {
    onSidePanel(sideOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideOpen]);

  /** 카메라 모드 — 열린 창 · 링 · 게이지를 다 닫고 페이지에 넘긴다(HUD 는 페이지가 숨긴다) */
  const enterCamera = () => {
    setOpenPanel(null);
    deselect();
    setDragging(null);
    setCharge(null);
    setFlash(null);
    onCamera?.();
  };

  const enterPlacement = () => {
    red.placementOpened(); // 배치 모드를 열면 배치 버튼의 빨간점이 사라진다(보관함 칸의 점은 남는다)
    setOpenPanel(null);
    switchInteraction('PLACEMENT');
  };

  /**
   * 캐릭터 탭에서 거실 조합이 바뀌었다 — 런타임에 세우고, 오버레이는 실제로 선 캐릭터만 들고 있는다.
   * 빠진 캐릭터의 스탯 링·옷 입히기는 닫는다
   */
  const applyRoster = (next: RoomCharacterDto[]) => {
    loop.setRoster(next);
    const placed = new Set(loop.characterIds);
    setChars(next.filter((c) => placed.has(charIdOf(c))));
    if (selected && !placed.has(selected)) setSelected(null);
    setCharge((c) => (c && !placed.has(c.charId) ? null : c));
    onRoster(next);
  };

  /* ── 슬롯머신 뽑기 (M-4) ── */

  /** 뽑기 결과 창 — 레버 · 릴이 선 뒤에 뜬다 */
  const [slotResult, setSlotResult] = useState<SlotDrawResult | null>(null);
  /** 못 뽑을 때 안내(남은 시간 · 서버 거절 글) — 그 기계 위에 잠깐 */
  const [slotNote, setSlotNote] = useState<SlotNote | null>(null);
  /** 뽑는 중(서버 응답 ~ 결과 창이 뜰 때까지) — 그동안 또 놓아도 뽑지 않는다 */
  const drawing = useRef(false);
  const spinTimer = useRef(0);
  /** 결과가 뜰 때의 최신 「다시 살피기」 — 레버가 도는 사이 탭을 여닫았을 수 있다 */
  const recheckRef = useRef(recheckDots);
  useEffect(() => {
    recheckRef.current = recheckDots;
  });
  useEffect(() => () => window.clearTimeout(spinTimer.current), []);
  useEffect(() => {
    if (!slotNote) return;
    const t = window.setTimeout(() => setSlotNote(null), SLOT_NOTE_MS);
    return () => window.clearTimeout(t);
  }, [slotNote]);

  const slotDrop = async (placementId: number) => {
    if (!owner || interaction !== 'NORMAL' || drawing.current) return;
    const p = loop.currentPlacements.find((q) => q.placementId === placementId);
    if (!p) return;
    // 아직 못 뽑는다 — 서버를 부르지 않고 남은 시간만(판정 자체는 서버가 한다)
    const left = remainingMs(p.slot, Date.now());
    if (left > 0) return setSlotNote({ placementId, text: waitNotice(left), key: Date.now() });
    drawing.current = true;
    let r: SlotDrawResult;
    try {
      r = await api.drawSlot(placementId);
    } catch (e) {
      drawing.current = false;
      if (e instanceof api.AuthRequiredError) return askLogin();
      setSlotNote({ placementId, text: e instanceof api.HttpError ? e.message : '뽑지 못했어요', key: Date.now() });
      // 서버와 타이머가 어긋났을 수 있다(다른 기기에서 뽑았다) — 다시 받아 맞춘다
      if (e instanceof api.HttpError) void api.getRoom(undefined).then((s) => loop.refreshSlotTimers(s.placements), () => {});
      return;
    }
    // 서버에 이미 반영됐다 — 타이머부터 맞추고, 레버 · 릴이 선 뒤 결과를 띄운다(모델이 없으면 바로)
    loop.setSlotTimer(placementId, r.slot);
    setSlotNote(null);
    const spinning = renderer.pullLever?.(placementId) ?? false;
    spinTimer.current = window.setTimeout(
      () => {
        drawing.current = false;
        setSlotResult(r);
        recheckRef.current(); // 받은 가구 · 아이템이 배치 · 아이템 버튼의 빨간점으로 뜬다
      },
      spinning ? SLOT_SPIN_MS : 0,
    );
  };

  /* ── 증여 ── */

  const give = async (charId: string, itemId: number, at: Pt) => {
    const session = itemSession.current;
    const c = chars.find((x) => charIdOf(x) === charId);
    if (!c) return;
    // MAX 캐릭터는 선물을 받지 않는다(3-⑦-a) — 서버도 거절하지만 부르지 않고 안내만
    if (isMaxAffinity(c.affinityProgress)) {
      setFlash({ key: Date.now(), at, text: '이미 MAX', level: c.affinityLevel, progress: null });
      return;
    }
    let r: GiftResult;
    try {
      r = await api.giveItem(c.stockId, itemId);
    } catch (e) {
      if (e instanceof api.AuthRequiredError) return askLogin();
      // 서버가 거절한 이유(등급 없음 · 아이템 없음 등)를 작은 줄로
      setFlash({ key: Date.now(), at, text: '선물하지 못했어요', level: c.affinityLevel, progress: c.affinityProgress, sub: e instanceof Error ? e.message : undefined });
      return;
    }
    // 호감도는 서버에 반영됐으니 그대로 받는다. 보유 수는 그 사이 아이템 탭을 다시 열어 새로 받았으면 새 목록이 맞다
    setChars((list) =>
      list.map((x) => (charIdOf(x) === charId ? { ...x, affinityLevel: r.affinityLevel, affinityScore: r.affinityScore, affinityProgress: r.affinityProgress } : x)),
    );
    if (session === itemSession.current) setInventory((inv) => (inv ?? []).map((i) => (i.itemId === itemId ? { ...i, quantity: i.quantity - 1 } : i)));
    setFlash({
      key: Date.now(),
      at,
      text: `+${r.delta}`,
      level: r.affinityLevel,
      progress: r.affinityProgress,
      sub: r.unlockedClothes ? `옷 해금 · ${r.unlockedClothes.name}` : undefined,
    });
  };

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(t);
  }, [flash]);

  /* ── 런타임에서 오는 것 (페이지가 이어 준다) ── */

  useImperativeHandle(ref, () => ({
    onSelect(charId) {
      if (interaction !== 'NORMAL') return;
      if (selected === charId) deselect();
      else setSelected(charId);
    },
    onEmptyPick() {
      if (selected) deselect();
    },
    onLiftCharge(charId, ms) {
      setCharge({ charId, ms, key: Date.now() });
    },
    onLiftChargeEnd(charId) {
      setCharge((c) => (c && c.charId === charId ? null : c));
    },
    onLifted(charId) {
      if (selected === charId) setSelected(null);
    },
    // 아이템은 끌어다 놓아야만 준다 — 캐릭터를 누르는 건 지급이 아니다(2026-10-12 도휘)
    onItemDrop(charId, itemId, screen) {
      if (!owner || interaction !== 'NORMAL') return;
      setDragging(null);
      void give(charId, itemId, screen);
    },
    onItemOver(charId) {
      if (!owner || interaction !== 'NORMAL') return;
      setItemOver(charId);
    },
    onSlotDrop(_charId, placementId) {
      void slotDrop(placementId);
    },
    recheckDots,
  }));

  // Esc — 창 → 링 순으로 닫는다. 로그인 창은 자기가 받고, 배치 모드는 편집기가 받는다
  const closeSlotResult = () => setSlotResult(null);
  useEscape(loginOpen || interaction === 'PLACEMENT' ? null : slotResult ? closeSlotResult : openPanel ? closePanel : selected ? deselect : null);

  const onBadge = (kind: BadgeKind) => {
    if (!selected) return;
    if (kind === 'stock' && sel) onStock(sel.stockCode); // 종목 화면 주소는 종목 코드(A2)
    if (kind === 'clothes') open('wardrobe', selected);
  };

  const sel = selected ? chars.find((c) => charIdOf(c) === selected) : undefined;
  const selDef = selected ? catalog.def(selected) : undefined;
  const selAt = selected ? loop.screenOf(selected) : null;
  // 누르는 동안 캐릭터는 멈춰 서 있으니 누른 순간의 머리 위가 곧 지금 자리다
  const chargeAt = charge ? loop.screenOf(charge.charId) : null;
  const overChar = dragging !== null && itemOver ? chars.find((c) => charIdOf(c) === itemOver) : undefined;
  const maxOverAt = overChar && isMaxAffinity(overChar.affinityProgress) ? loop.screenOf(itemOver!) : null;
  const centerX = layout.width / 2;
  const barTop = layout.barTop;
  const normal = interaction === 'NORMAL';

  return (
    <>
      {/* 좌상단 — 주인은 거실 자산, 방문자는 주인 프로필 */}
      {normal && owner && <AssetSummary holdings={holdings} />}
      {normal && !owner && snapshot.owner && (
        <OwnerProfileHud owner={snapshot.owner} roomReturnRate={snapshot.roomReturnRate} onFollow={guest ? askLogin : onFollow} />
      )}

      {normal && <TopActions mode={mode} openPanel={openPanel} dots={red.dots} onOpen={open} />}
      {normal && owner && <ModeDock centerX={centerX} top={layout.dockTop} dot={red.dots.place} onPlace={enterPlacement} />}
      {normal && owner && onCamera && <CameraButton top={layout.dockTop} onClick={enterCamera} />}

      {normal && selected && sel && selDef && selAt && (
        <StatRing
          key={selected}
          x={selAt.x}
          y={selAt.y}
          rightEdge={sideOpen ? layout.panel.left : layout.width}
          mode={mode}
          character={sel}
          def={selDef}
          quote={quotes[selected]}
          reactions={reactionKinds}
          onSelectBadge={onBadge}
          onReact={(reactionType) => {
            // 바는 누른 뒤에도 열려 있다 — 응답 전에 또 누르면 남기기 · 취소가 엇갈리므로 하나씩만
            if (!ownerId || reacting.current) return;
            reacting.current = true;
            const target = selected;
            // 1인 1개 — 서버가 준 개수 · 내 반응(교체 · 취소 반영)을 그대로 받는다. 로그인이 풀렸으면 로그인 창, 그 밖의 실패는 조용히(링에 안내 자리가 없음)
            void api
              .reactToCharacter(ownerId, sel.stockId, reactionType)
              .then(
                (r) => setChars((list) => list.map((c) => (charIdOf(c) === target ? { ...c, receivedReactionCount: r.receivedReactionCount, receivedReactions: r.receivedReactions, myReaction: r.myReaction } : c))),
                (e: unknown) => e instanceof api.AuthRequiredError && askLogin(),
              )
              .finally(() => {
                reacting.current = false;
              });
          }}
          onNeedLogin={askLogin}
        />
      )}

      {/* 슬롯머신 위 타이머 — 주인의 일반 모드에서만(M-4). 남의 거실 · 배치 모드에는 없다 */}
      {normal && owner && <SlotTimers placements={loop.currentPlacements} furniture={furniture} anchorOf={(id) => renderer.furnitureAnchor(id)} note={slotNote} />}
      {slotResult && <SlotResultModal result={slotResult} furniture={furniture} onClose={closeSlotResult} />}

      {chargeAt && charge && <PressRing key={charge.key} x={chargeAt.x} y={chargeAt.y} ms={charge.ms} />}
      {flash && <AffinityFlash key={flash.key} x={flash.at.x} y={flash.at.y} text={flash.text} level={flash.level} progress={flash.progress} sub={flash.sub} />}
      {maxOverAt && (
        // 끌고 있는 아이템 밑이 MAX 캐릭터 — 놓아도 주지 않는다(3-⑦-a)
        <div style={{ position: 'absolute', left: maxOverAt.x - 60, top: maxOverAt.y - 34, width: 120, zIndex: 7, pointerEvents: 'none', display: 'flex', justifyContent: 'center' }}>
          <span style={{ padding: '4px 9px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(33,33,38,0.92)', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>이미 MAX</span>
        </div>
      )}

      {interaction === 'PLACEMENT' && (
        <PlacementEditor
          renderer={renderer}
          catalog={furniture}
          initial={loop.currentPlacements}
          width={layout.width}
          stageHeight={layout.stageHeight}
          pan={pan}
          barTop={barTop}
          dots={red.furnitureTile}
          onStorage={red.placementOpened}
          onPreview={(p) => loop.previewPlacements(p)}
          onExit={(saved) => {
            if (saved) onPlacementsSaved(saved);
            else loop.previewPlacements(loop.currentPlacements); // 취소 — 걷는 칸도 원래 배치로
            switchInteraction('NORMAL');
            red.recheck(); // 배치 모드에서 나올 때 다시 살핀다(M-2)
          }}
        />
      )}

      <SidePanel open={sideOpen} label={SIDE_LABEL[sideTab]} {...layout.panel}>
        {sideTab === 'guestbook' && (
          <GuestbookPanel
            open={sideOpen}
            ownerId={ownerId}
            mode={mode}
            reactionKinds={reactionKinds}
            roomReactions={snapshot.roomReactions}
            onRoomReactions={onRoomReactions}
            onClose={closePanel}
            onVisit={onVisit}
            onNeedLogin={askLogin}
            onLoaded={owner ? red.guestbookLoaded : undefined}
          />
        )}
        {/* 주인 탭은 열 때마다 새로 받는다 — 닫히며 미끄러져 나가는 동안엔 그대로 둔다 */}
        {owner && sideTab === 'attendance' && (
          <AttendancePanel
            key={openSeq}
            onClose={closePanel}
            onClaimed={() => {
              setInventory(null);
              red.attendanceClaimed(); // 출석 점을 지우고 다시 살핀다 — 받은 보상이 아이템(M-3: 슬롯머신이면 배치) 버튼의 점으로 뜬다
            }}
          />
        )}
        {owner && sideTab === 'farewell' && <FarewellPanel key={openSeq} onClose={closePanel} onLoaded={red.farewellsLoaded} />}
        {owner && sideTab === 'items' && <ItemPanel inventory={inventory} dragging={dragging} dots={red.itemTile} onDrag={setDragging} onClose={closePanel} />}
        {owner && sideTab === 'characters' && <CharacterPanel key={openSeq} catalog={catalog} holdings={holdings} onRoom={applyRoster} onClose={closePanel} onNeedLogin={askLogin} />}
      </SidePanel>
      {openPanel === 'wardrobe' && wardrobeFor && (
        <WardrobeGallery
          characters={chars}
          defs={(id) => catalog.def(id)}
          initial={wardrobeFor}
          stateOf={(id) => loop.outfitStateOf(id)}
          onClose={closePanel}
          onChanged={(id, clothesId) => {
            setChars((list) => list.map((c) => (charIdOf(c) === id ? { ...c, ownedClothesId: clothesId } : c)));
            loop.setOutfit(id, clothesId); // 거실 캐릭터도 갈아입는다
          }}
        />
      )}
    </>
  );
}

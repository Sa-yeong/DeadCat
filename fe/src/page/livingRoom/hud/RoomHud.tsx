import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import * as api from '../api';
import type { RoomLayout } from '../layout';
import type { CharacterCatalog, FurnitureCatalog } from '../runtime/catalogs';
import type { Pt } from '../runtime/projection';
import type { RoomLoop } from '../runtime/RoomLoop';
import type { RoomRenderer } from '../runtime/RoomRenderer';
import type {
  InteractionMode,
  InventoryItem,
  Panel,
  PlacementDto,
  Quote,
  ReactionKind,
  RoomCharacterDto,
  RoomSnapshot,
} from '../types';
import { AssetSummary } from './AssetSummary';
import { ModeBanner, ModeDock, TopActions } from './chrome';
import { GuestbookPanel } from './GuestbookPanel';
import { AffinityFlash, ItemTray } from './ItemTray';
import { AttendanceBoard, FarewellArchive, WardrobeGallery } from './Modals';
import { OwnerProfileHud } from './OwnerProfileHud';
import { PlacementEditor } from './PlacementEditor';
import { PressRing } from './PressRing';
import { StatRing, type BadgeKind } from './StatRing';
import { useEscape } from './useEscape';

/** 페이지가 런타임 콜백을 이어 붙이는 손잡이 */
export interface RoomHudApi {
  /** 캐릭터를 짧게 눌렀다. screen 은 누른 순간 머리 위 자리 — 아이템 모드의 하트 자리로만 쓴다(링은 그릴 때 런타임에 묻는다) */
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
}

/** OWNER 만 여는 것 */
const OWNER_ONLY: Panel[] = ['attendance', 'farewell', 'wardrobe'];
const FLASH_MS = 1800;

interface Flash {
  key: number;
  /** 준 순간의 머리 위 자리 — 캐릭터가 걸어가도 따라가지 않는다 */
  at: Pt;
  delta: number;
  score: number;
  level: number;
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
  quotes,
  layout,
  roomLeft,
  loop,
  renderer,
  characters: catalog,
  furniture,
  onGuestbook,
  onStock,
  onVisit,
  onFollow,
  onPlacementsSaved,
  loginOpen,
  onNeedLogin,
}: {
  ref: Ref<RoomHudApi>;
  /** 거실 주인 — undefined 면 내 거실 */
  ownerId: api.OwnerId;
  snapshot: RoomSnapshot;
  reactionKinds: ReactionKind[];
  quotes: Record<string, Quote>;
  layout: RoomLayout;
  roomLeft: number;
  loop: RoomLoop;
  renderer: RoomRenderer;
  characters: CharacterCatalog;
  furniture: FurnitureCatalog;
  onGuestbook: (open: boolean) => void;
  onStock: (stockCode: string) => void;
  onVisit: (userId: number) => void;
  onFollow: (on: boolean) => void;
  onPlacementsSaved: (p: PlacementDto[]) => void;
  /** 로그인 창은 페이지가 하나만 띄운다 — 떠 있는 동안 여기 Esc 는 쉰다 */
  loginOpen: boolean;
  onNeedLogin: () => void;
}) {
  const mode = snapshot.mode;
  const owner = mode === 'OWNER';
  const [interaction, setInteraction] = useState<InteractionMode>('NORMAL');
  const [openPanel, setOpenPanel] = useState<Panel | null>(null);
  /** 링을 띄운 캐릭터. 자리는 그릴 때마다 런타임에 묻는다 — 창 크기가 바뀌어도 따라가게 */
  const [selected, setSelected] = useState<string | null>(null);
  // 런타임이 세운 캐릭터만 — 못 세운 종목은 시세도 안 오므로 거실 자산에서도 뺀다
  const [chars, setChars] = useState<RoomCharacterDto[]>(() => {
    const placed = new Set(loop.characterIds);
    return snapshot.characters.filter((c) => placed.has(c.stockCode));
  });
  const [wardrobeFor, setWardrobeFor] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  /** 들기 게이지 — 누를 때마다 key 가 바뀌어 처음부터 다시 찬다 */
  const [charge, setCharge] = useState<{ charId: string; ms: number; key: number } | null>(null);
  /** 상호작용 모드가 바뀔 때마다 올라간다 — 지난 아이템 모드에서 보낸 보유 목록·증여 응답은 버린다 */
  const itemSession = useRef(0);

  /**
   * 비로그인은 다 보여 주되 **참여는 로그인 뒤에**. 반응·방명록·팔로우를 누르면 로그인 창을 띄운다.
   * 보기만 하는 것(스탯 링 열기, 방명록 읽기, 종목 보기, 남의 거실 가기)은 그대로 된다.
   * 쓰기를 실제로 막는 건 서버(JwtAuthGuard)다 — 여기는 안내다.
   */
  const guest = mode === 'GUEST';
  const askLogin = onNeedLogin;

  /** 골라 둔 아이템 — 다 쓴 아이템은 골라 둔 것으로 치지 않는다 */
  const pendingItem = picked !== null && (inventory?.find((i) => i.itemId === picked)?.quantity ?? 0) > 0 ? picked : null;

  /* ── 모드 · 패널 전환 ── */

  const deselect = () => {
    setSelected(null);
    loop.release();
  };

  const switchInteraction = (m: InteractionMode) => {
    if (m !== interaction) itemSession.current++;
    setInteraction(m);
    loop.setInteractionMode(m);
    setSelected(null);
    setPicked(null);
  };

  /** 패널 열기 — 모드 허용 판정 + 패널은 하나만. 방명록은 다시 누르면 닫힌다 */
  const open = (panel: Panel, charId?: string) => {
    // 패널 버튼은 일반 모드에서만 보인다 — 아이템·배치 모드에서 여기로 오는 길은 없다
    if (!owner && OWNER_ONLY.includes(panel)) return;
    if (panel === 'wardrobe') setWardrobeFor(charId ?? chars[0]?.stockCode ?? null);
    else deselect();
    setOpenPanel((cur) => (cur === panel && panel === 'guestbook' ? null : panel));
  };
  const closePanel = () => {
    // 방명록이 닫히면 방이 옆으로 미끄러진다 — 링이 제자리에 남아 어긋나 보이지 않게 같이 닫는다
    if (openPanel === 'guestbook') deselect();
    setOpenPanel(null);
  };

  // 방명록이 열리고 닫힐 때만 페이지가 방을 옮긴다
  const gbOpen = openPanel === 'guestbook';
  useEffect(() => {
    onGuestbook(gbOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gbOpen]);

  const enterItem = () => {
    setOpenPanel(null);
    switchInteraction('ITEM');
    // 모드를 빠르게 들락거리면 늦게 온 옛 응답이 새 응답을 덮지 않게
    const req = itemSession.current;
    const done = (inv: InventoryItem[]) => req === itemSession.current && setInventory(inv);
    void api.getInventory().then(done, () => done([]));
  };
  const enterPlacement = () => {
    setOpenPanel(null);
    switchInteraction('PLACEMENT');
  };

  /* ── 증여 ── */

  const give = async (charId: string, itemId: number, at: Pt) => {
    const session = itemSession.current;
    const r = await api.giveItem(charId, itemId).catch(() => null);
    if (!r) return;
    // 호감도는 서버에 반영됐으니 그대로 받는다. 보유 수·하트는 아이템 모드를 나갔다 왔으면 새로 받은 목록이 맞다
    setChars((list) => list.map((c) => (c.stockCode === charId ? { ...c, affinityScore: r.affinityScore, affinityLevel: r.affinityLevel } : c)));
    if (session !== itemSession.current) return;
    setInventory((inv) => (inv ?? []).map((i) => (i.itemId === itemId ? { ...i, quantity: i.quantity - 1 } : i)));
    setFlash({ key: Date.now(), at, delta: r.delta, score: r.affinityScore, level: r.affinityLevel });
  };

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(t);
  }, [flash]);

  /* ── 런타임에서 오는 것 (페이지가 이어 준다) ── */

  useImperativeHandle(ref, () => ({
    onSelect(charId, screen) {
      if (interaction === 'ITEM') {
        if (pendingItem !== null) void give(charId, pendingItem, screen);
        return;
      }
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
    onItemDrop(charId, itemId, screen) {
      if (interaction !== 'ITEM') return;
      setPicked(itemId);
      void give(charId, itemId, screen);
    },
  }));

  // Esc — 창 → 링 → 아이템 모드 순으로 닫는다. 로그인 창은 자기가 받고, 배치 모드는 편집기가 받는다
  useEscape(
    loginOpen || interaction === 'PLACEMENT'
      ? null
      : openPanel
        ? closePanel
        : selected
          ? deselect
          : interaction === 'ITEM'
            ? () => switchInteraction('NORMAL')
            : null,
  );

  const onBadge = (kind: BadgeKind) => {
    if (!selected) return;
    if (kind === 'stock') onStock(selected);
    if (kind === 'clothes') open('wardrobe', selected);
  };

  const sel = selected ? chars.find((c) => c.stockCode === selected) : undefined;
  const selDef = selected ? catalog.def(selected) : undefined;
  const selAt = selected ? loop.screenOf(selected) : null;
  // 누르는 동안 캐릭터는 멈춰 서 있으니 누른 순간의 머리 위가 곧 지금 자리다
  const chargeAt = charge ? loop.screenOf(charge.charId) : null;
  const centerX = roomLeft + layout.roomWidth / 2;
  const barTop = layout.stageHeight - 92;
  const normal = interaction === 'NORMAL';

  return (
    <>
      {/* 좌상단 — 주인은 거실 자산, 방문자는 주인 프로필 */}
      {normal && owner && <AssetSummary characters={chars} quotes={quotes} />}
      {normal && !owner && snapshot.owner && (
        <OwnerProfileHud owner={snapshot.owner} roomReturnRate={snapshot.roomReturnRate} onFollow={guest ? askLogin : onFollow} />
      )}

      {normal && <TopActions mode={mode} openPanel={openPanel} onOpen={open} />}
      {normal && owner && <ModeDock centerX={centerX} top={layout.dockTop} onItem={enterItem} onPlace={enterPlacement} />}

      {normal && selected && sel && selDef && selAt && (
        <StatRing
          key={selected}
          x={roomLeft + selAt.x}
          y={selAt.y}
          mode={mode}
          character={sel}
          def={selDef}
          quote={quotes[selected]}
          reactions={reactionKinds}
          onSelectBadge={onBadge}
          onReact={(id) => {
            const code = selected;
            // 남긴 반응은 받은 반응 수에 바로 보이게 — 실패하면 조용히 넘긴다(링에 안내 자리가 없음)
            void api.reactToCharacter(ownerId, code, id).then(
              () => setChars((list) => list.map((c) => (c.stockCode === code ? { ...c, receivedReactionCount: c.receivedReactionCount + 1 } : c))),
              () => {},
            );
          }}
          onNeedLogin={askLogin}
        />
      )}

      {interaction === 'ITEM' && (
        <>
          <ModeBanner title="아이템" hint="지급하는 순간에만 호감도 게이지가 보여요" />
          <ItemTray inventory={inventory} pending={pendingItem} centerX={centerX} top={barTop} onPick={setPicked} onDone={() => switchInteraction('NORMAL')} />
        </>
      )}
      {chargeAt && charge && <PressRing key={charge.key} x={roomLeft + chargeAt.x} y={chargeAt.y} ms={charge.ms} />}
      {flash && <AffinityFlash key={flash.key} x={roomLeft + flash.at.x} y={flash.at.y} delta={flash.delta} score={flash.score} level={flash.level} />}

      {interaction === 'PLACEMENT' && (
        <PlacementEditor
          renderer={renderer}
          catalog={furniture}
          initial={loop.currentPlacements}
          roomLeft={roomLeft}
          roomWidth={layout.roomWidth}
          stageHeight={layout.stageHeight}
          barTop={barTop}
          onPreview={(p) => loop.previewPlacements(p)}
          onExit={(saved) => {
            if (saved) onPlacementsSaved(saved);
            else loop.previewPlacements(loop.currentPlacements); // 취소 — 걷는 칸도 원래 배치로
            switchInteraction('NORMAL');
          }}
        />
      )}

      <GuestbookPanel
        open={gbOpen}
        ownerId={ownerId}
        mode={mode}
        reactionKinds={reactionKinds}
        {...layout.panel}
        onClose={closePanel}
        onVisit={onVisit}
        onNeedLogin={askLogin}
      />
      {openPanel === 'attendance' && <AttendanceBoard onClose={closePanel} onClaimed={() => setInventory(null)} />}
      {openPanel === 'farewell' && <FarewellArchive onClose={closePanel} />}
      {openPanel === 'wardrobe' && wardrobeFor && (
        <WardrobeGallery
          characters={chars}
          defs={(code) => catalog.def(code)}
          initial={wardrobeFor}
          onClose={closePanel}
          onChanged={(code, clothesId) => {
            setChars((list) => list.map((c) => (c.stockCode === code ? { ...c, ownedClothesId: clothesId } : c)));
            loop.setOutfit(code, clothesId); // 거실 캐릭터도 갈아입는다
          }}
        />
      )}
    </>
  );
}

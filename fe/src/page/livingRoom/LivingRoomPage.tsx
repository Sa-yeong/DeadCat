import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import * as api from './api';
import { ITEM_MIME } from './hud/dnd';
import { LoginPrompt } from './hud/LoginPrompt';
import { RoomHud, type RoomHudApi } from './hud/RoomHud';
import { MIN_STAGE, MIN_WIDTH, useRoomLayout } from './layout';
import { CharacterCatalog, FurnitureCatalog } from './runtime/catalogs';
import { StubEngine } from './runtime/CharacterEngine';
import { PlaceholderScene } from './runtime/PlaceholderScene';
import { PriceFeedClient } from './runtime/PriceFeedClient';
import { RoomLoop } from './runtime/RoomLoop';
import type { RoomRenderer } from './runtime/RoomRenderer';
import type { Quote, ReactionKind, RoomSnapshot } from './types';

interface Runtime {
  loop: RoomLoop;
  renderer: RoomRenderer;
  characters: CharacterCatalog;
  furniture: FurnitureCatalog;
  reactionKinds: ReactionKind[];
}

/**
 * 거실 화면 — /room (내 거실) · /room/:userId (남의 거실)
 *
 * 진입 흐름 (클래스 다이어그램 r20 그대로)
 *   enter(ownerId) → fetchSnapshot → mode·visibility 보관
 *   → RoomLoop.load(snapshot)  캐릭터 세우기
 *   → RoomHud 에 스냅샷과 mode 전달  패널 구성
 *
 * 런타임은 HUD 를 모른다. 캐릭터 클릭은 RoomLoop 이 onPicked 콜백으로만 내보내고,
 * 페이지가 그걸 RoomHud.onSelect 에 잇는다.
 *
 * 3D 는 아직 없다 — RoomRenderer 자리에 평면 더미(PlaceholderScene)를 꽂았다.
 * 3D 가 붙으면 `new PlaceholderScene(...)` 한 줄만 RoomScene 으로 바뀐다.
 */
export function LivingRoomPage() {
  const { userId } = useParams();
  const { search } = useLocation();
  // 더미 전용 — 실제로는 서버가 토큰으로 판정한다. 실 API 로 바꿀 때 api.getRoom 의 인자와 함께 지운다
  const asGuest = new URLSearchParams(search).has('guest');
  // 다른 거실로 옮겨 가면 통째로 새로 만든다 — 이전 거실의 런타임·패널 상태를 끌고 가지 않게
  return <RoomView key={`${userId ?? 'me'}|${asGuest}`} userId={userId} asGuest={asGuest} />;
}

function RoomView({ userId, asGuest }: { userId: string | undefined; asGuest: boolean }) {
  const navigate = useNavigate();

  const rootRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const roomRef = useRef<HTMLDivElement | null>(null);
  const hud = useRef<RoomHudApi | null>(null);
  const L = useRoomLayout(rootRef);

  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [rt, setRt] = useState<Runtime | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [gbOpen, setGbOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 내 거실을 비로그인으로 열었다 — 로그인 창을 띄운다 */
  /** 로그인 창 — 화면에 하나만. 내 거실을 비로그인으로 열었을 때와 비로그인이 참여하려 할 때 */
  const [needLogin, setNeedLogin] = useState(false);
  const followRequest = useRef(0);
  /** 씬 축척이 바뀐 횟수 — HUD 가 런타임에 자리를 다시 묻게 한 번 더 그린다 */
  const [, setSceneVersion] = useState(0);

  /* ── 진입: 스냅샷 + 카탈로그 → 런타임 ── */
  useEffect(() => {
    let alive = true;
    let loop: RoomLoop | null = null;
    let renderer: RoomRenderer | null = null;
    (async () => {
      const snap = await api.getRoom(userId, asGuest);
      const codes = snap.characters.map((c) => c.stockCode);
      const [charDefs, furnDefs, reactionKinds] = await Promise.all([api.getCharacterDefs(codes), api.getFurnitureDefs(), api.getReactionKinds()]);
      if (!alive || !svgRef.current) return;

      const characters = new CharacterCatalog();
      characters.load(charDefs);
      const furniture = new FurnitureCatalog();
      furniture.load(furnDefs);
      // 축척은 아래 layout effect 가 rt 가 생기자마자(첫 화면을 그리기 전에) 맞춘다
      renderer = new PlaceholderScene(svgRef.current, furniture);
      loop = new RoomLoop({
        renderer,
        engine: new StubEngine(),
        characters,
        furniture,
        feed: new PriceFeedClient(),
        events: {
          onPicked: (id, screen) => hud.current?.onSelect(id, screen),
          onEmptyPick: () => hud.current?.onEmptyPick(),
          onLiftCharge: (id, ms) => hud.current?.onLiftCharge(id, ms),
          onLiftChargeEnd: (id) => hud.current?.onLiftChargeEnd(id),
          onLifted: (id) => hud.current?.onLifted(id),
          onQuotes: (q) => setQuotes(q),
        },
      });
      loop.load(snap);
      loop.start();
      setSnapshot(snap);
      setRt({ loop, renderer, characters, furniture, reactionKinds });
    })().catch((e: unknown) => {
      if (!alive) return;
      if (e instanceof api.AuthRequiredError) {
        setError('로그인하면 내 거실을 볼 수 있어요');
        setNeedLogin(true);
      } else setError('거실을 불러오지 못했어요');
    });
    return () => {
      alive = false;
      loop?.stop();
      renderer?.dispose();
    };
  }, [userId, asGuest]);

  // 창 크기가 바뀌면 방 축척만 다시 — 글자·패널 크기는 그대로.
  // 그리기 전에 맞춰야 첫 화면이 빈 SVG 로 깜빡이지 않고, 스탯 링·배치 도구가 옛 자리에 남지 않는다
  useLayoutEffect(() => {
    if (!rt) return;
    rt.renderer.resize(L.scale, L.backY, L.roomWidth, L.stageHeight);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 바깥(씬) 축척을 바꾼 뒤 HUD 가 새 자리를 읽도록 한 번 더 그린다
    setSceneVersion((v) => v + 1);
  }, [rt, L.scale, L.backY, L.roomWidth, L.stageHeight]);

  const roomLeft = gbOpen ? L.roomLeftOpen : L.roomLeft;

  /* ── 방 위 포인터 → 런타임 (좌표는 방 기준) ── */
  const local = (e: { clientX: number; clientY: number }) => {
    const r = roomRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // 비공개 거실 — 주인이 아니면 블러만 보이고 아무것도 누를 수 없다(방명록·팔로우 포함).
  // 거실 탐색 검색에서 빼는 것은 서버 몫. 여기는 링크(방명록 닉네임·커뮤니티·팔로우 목록)로 들어온 경우다
  const isPrivate = snapshot?.visibility === 'PRIVATE' && snapshot.mode !== 'OWNER';

  return (
    <div
      ref={rootRef}
      className="dc-screen"
      style={{ position: 'relative', overflow: 'hidden', width: '100%', minWidth: MIN_WIDTH, height: L.stageHeight, minHeight: MIN_STAGE, background: '#19191C', color: '#EDEDEA', userSelect: 'none' }}
    >
      <div
        ref={roomRef}
        onPointerDown={(e) => {
          // 첫 손가락·왼쪽 버튼만 — 두 번째 손가락이 들고 있던 캐릭터를 놓치게 하지 않게
          if (e.button !== 0 || !e.isPrimary || !rt) return;
          // 방 밖에서 손을 떼도 놓기가 들어오게 — 들어 옮기던 캐릭터가 붙은 채 남지 않도록
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = local(e);
          rt.loop.pointerDown(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!rt || !e.isPrimary) return;
          const p = local(e);
          rt.loop.pointerMove(p.x, p.y);
        }}
        onPointerUp={(e) => {
          if (!rt || !e.isPrimary) return;
          const p = local(e);
          rt.loop.pointerUp(p.x, p.y);
        }}
        onPointerCancel={(e) => e.isPrimary && rt?.loop.pointerCancel()}
        onLostPointerCapture={() => rt?.loop.pointerCancel()}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(ITEM_MIME)) e.preventDefault();
        }}
        onDrop={(e) => {
          const itemId = Number(e.dataTransfer.getData(ITEM_MIME));
          if (!rt || !itemId) return;
          e.preventDefault();
          const p = local(e);
          const charId = rt.loop.charAt(p.x, p.y);
          const at = charId ? rt.loop.screenOf(charId) : null;
          if (charId && at) hud.current?.onItemDrop(charId, itemId, at);
        }}
        style={{
          position: 'absolute', left: roomLeft, top: 0, width: L.roomWidth, height: L.stageHeight, transition: 'left 0.35s ease',
          filter: isPrivate ? 'blur(6px) brightness(0.6)' : undefined, touchAction: 'none', pointerEvents: isPrivate ? 'none' : undefined,
        }}
      >
        <svg ref={svgRef} role="img" aria-label="거실 — 가구와 캐릭터 (3D 자리의 평면 더미)" style={{ display: 'block', overflow: 'hidden' }} />
      </div>

      {!snapshot && !error && <Center>불러오는 중…</Center>}
      {error && <Center>{error}</Center>}
      {isPrivate && <Center>비공개 거실이에요</Center>}
      {snapshot && !isPrivate && snapshot.characters.length === 0 && snapshot.mode === 'OWNER' && (
        <Center sub="마이페이지에서 거실에 세울 캐릭터를 고를 수 있어요">거실에 세운 캐릭터가 없어요</Center>
      )}

      {snapshot && rt && !isPrivate && (
        <RoomHud
          ref={hud}
          ownerId={userId}
          snapshot={snapshot}
          reactionKinds={rt.reactionKinds}
          quotes={quotes}
          layout={L}
          roomLeft={roomLeft}
          loop={rt.loop}
          renderer={rt.renderer}
          characters={rt.characters}
          furniture={rt.furniture}
          onGuestbook={setGbOpen}
          onStock={(code) => navigate(`/stocks/${code}`)}
          onVisit={(id) => navigate(`/room/${id}${asGuest ? '?guest' : ''}`)} // ?guest 는 더미 전용
          onFollow={(on) => {
            if (!userId) return;
            const prev = snapshot.owner?.isFollowing ?? false;
            const setFollowing = (v: boolean) => setSnapshot((s) => (s && s.owner ? { ...s, owner: { ...s.owner, isFollowing: v } } : s));
            // 먼저 바꿔 보이고, 실패하면 되돌린다 — 단 그 사이 다시 눌렀으면 마지막 누름이 이긴다
            const req = ++followRequest.current;
            setFollowing(on);
            api.setFollow(userId, on).catch(() => req === followRequest.current && setFollowing(prev));
          }}
          onPlacementsSaved={(p) => rt.loop.setPlacements(p)}
          loginOpen={needLogin}
          onNeedLogin={() => setNeedLogin(true)}
        />
      )}
      <LoginPrompt open={needLogin} onClose={() => setNeedLogin(false)} />
    </div>
  );
}

function Center({ children, sub }: { children: string; sub?: string }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, pointerEvents: 'none', zIndex: 3 }}>
      <span style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(33,33,38,0.86)', border: '1px solid rgba(255,255,255,0.14)', fontSize: 13, fontWeight: 700 }}>{children}</span>
      {sub && <span style={{ fontSize: 12, color: '#9A9A93' }}>{sub}</span>}
    </div>
  );
}

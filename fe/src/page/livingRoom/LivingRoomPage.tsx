import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import * as api from './api';
import { characterDef } from './catalog';
import { DebugLabels } from './hud/DebugLabels';
import { ITEM_MIME } from './hud/dnd';
import { LoginPrompt } from './hud/LoginPrompt';
import { RoomHud, type RoomHudApi } from './hud/RoomHud';
import { useHoldingsPoll } from './hud/useHoldingsPoll';
import { ZoomControl } from './hud/ZoomControl';
import { clampView, FIT_VIEW, MIN_STAGE, MIN_WIDTH, projectionOf, sideSlack, useRoomLayout, ZOOM_MAX, zoomAt, type PanControl, type RoomView } from './layout';
import { CharacterCatalog, FurnitureCatalog } from './runtime/catalogs';
import { NullEngine, type EngineFactory } from './runtime/CharacterEngine';
import { PlaceholderScene } from './runtime/PlaceholderScene';
import { RoomFeed } from './runtime/RoomFeed';
import { createRoomEngine, ROOM_MOTIONS } from './runtime/roomEngine';
import { RoomLoop } from './runtime/RoomLoop';
import type { RoomRenderer } from './runtime/RoomRenderer';
import { charIdOf, type OwnedStock, type Quote, type ReactionKind, type RoomSnapshot } from './types';

/** 개발 모드(?debug=motion) — 파일 없는 모션 단계를 이만큼 대기 자세로 채운다(지시서 1-3, 글자를 읽기 편하게) */
const DEBUG_HOLD_MS = 3000;

interface Runtime {
  loop: RoomLoop;
  renderer: RoomRenderer;
  characters: CharacterCatalog;
  furniture: FurnitureCatalog;
  reactionKinds: ReactionKind[];
}

/** 버튼 줌 애니메이션을 멈춘다 — 휠·끌기·슬라이더가 끼어들면 그쪽이 이긴다 */
function stopAnim(r: { current: { raf: number; target: number } | null }) {
  if (r.current) cancelAnimationFrame(r.current.raf);
  r.current = null;
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
 * 그리는 쪽(RoomRenderer)은 둘 — 3D(RoomScene, three.js · 치비 VRM)가 기본이고,
 * 평면 더미(PlaceholderScene, SVG)는 주소에 `?r=2d` 를 붙이면 쓴다(확인·테스트용).
 * 3D 는 three.js 를 쓰므로 따로 불러온다(평면 더미만 볼 때는 내려받지 않는다).
 *
 * 내 거실은 실 API(S4) — 거실 조회 · 감정 스트림(엔진) · 보유 종목 3초 폴링(HUD). 남의 거실은 아직 더미라 엔진 없이 걷기만 한다(S7·S8).
 * 개발 모드 `?debug=motion` — 머리 위에 모션 · 감정 글자, 파일 없는 모션을 3초 대기 자세로, 엔진 사건 로그를 콘솔에(지시서 1-3 · 1-11).
 * 실제 서비스 화면에는 이 주소를 걸지 않는다.
 *
 * 줌 · 끌기 — 페이지가 시점(RoomView)을 들고, 바뀔 때마다 렌더러에 resize 로 넘긴다.
 * 1배는 방 전체 구도(layout.ts 규칙), 줌인했을 때만 빈 바닥을 끌어서 둘러본다.
 */
export function LivingRoomPage() {
  const { userId } = useParams();
  const { search } = useLocation();
  // 더미 전용 — 실제로는 서버가 토큰으로 판정한다. 실 API 로 바꿀 때 api.getRoom 의 인자와 함께 지운다
  const params = new URLSearchParams(search);
  const asGuest = params.has('guest');
  const use3d = params.get('r') !== '2d';
  const debug = params.get('debug') === 'motion';
  // 다른 거실로 옮겨 가면 통째로 새로 만든다 — 이전 거실의 런타임·패널 상태를 끌고 가지 않게
  return <RoomView key={`${userId ?? 'me'}|${asGuest}|${use3d}|${debug}`} userId={userId} asGuest={asGuest} use3d={use3d} debug={debug} />;
}

function RoomView({ userId, asGuest, use3d, debug }: { userId: string | undefined; asGuest: boolean; use3d: boolean; debug: boolean }) {
  const navigate = useNavigate();

  const rootRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const roomRef = useRef<HTMLDivElement | null>(null);
  const hud = useRef<RoomHudApi | null>(null);
  const L = useRoomLayout(rootRef);

  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [rt, setRt] = useState<Runtime | null>(null);
  /** 내 보유 종목 전부(GET /holdings) — 내 거실에서만. 3초마다 새로 받는다(지시서 3-②) */
  const [holdings, setHoldings] = useState<OwnedStock[] | null>(null);
  /** 오른쪽 창(출석·이별 흔적·방명록·아이템·캐릭터)이 열려 있다 — 줌 버튼을 그 왼쪽으로 */
  const [sideOpen, setSideOpen] = useState(false);
  const slackRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  /** 내 거실을 비로그인으로 열었다 — 로그인 창을 띄운다 */
  /** 로그인 창 — 화면에 하나만. 내 거실을 비로그인으로 열었을 때와 비로그인이 참여하려 할 때 */
  const [needLogin, setNeedLogin] = useState(false);
  const followRequest = useRef(0);
  /** 씬 축척이 바뀐 횟수 — HUD 가 런타임에 자리를 다시 묻게 한 번 더 그린다 */
  const [, setSceneVersion] = useState(0);
  /** 줌 · 끌기 — 1배(FIT_VIEW)가 방 전체 구도 */
  const [view, setView] = useState<RoomView>(FIT_VIEW);
  /** 이벤트 처리기가 읽는 지금 시점·레이아웃 — 그린 뒤에 맞춘다 */
  const viewRef = useRef(view);
  const layoutRef = useRef(L);
  const panning = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  /** 버튼 줌 애니메이션 — 도는 중에 또 누르면 목표에서 한 단계 더 */
  const zoomAnim = useRef<{ raf: number; target: number } | null>(null);
  /** 휠 줌을 받을 때인가 — 거실을 다 받았고 비공개가 아닐 때 */
  const wheelOn = useRef(false);

  /* ── 진입: 스냅샷 + 카탈로그 → 런타임 ── */
  useEffect(() => {
    let alive = true;
    let loop: RoomLoop | null = null;
    let renderer: RoomRenderer | null = null;
    (async () => {
      const mine = !userId;
      // 내 거실은 보유 목록도 같이 — 캐릭터 썸네일(stock_img)이 여기 있고(3-③) HUD 자산의 첫 값이 된다
      const [snap, owned] = await Promise.all([api.getRoom(userId, asGuest), mine ? api.getMyHoldings() : null]);
      const imgOf = (stockId: number) => owned?.find((h) => h.stockId === stockId)?.imgUrl ?? '';
      const [charDefs, furnDefs, reactionKinds] = await Promise.all([
        // 남의 거실은 아직 더미 카탈로그(S8)
        mine ? snap.characters.map((c) => characterDef(c, imgOf(c.stockId))) : api.getCharacterDefs(snap.characters.map((c) => c.stockCode)),
        api.getFurnitureDefs(),
        api.getReactionKinds(),
      ]);
      const Scene3D = use3d ? (await import('./runtime/RoomScene')).RoomScene : null;
      if (!alive || !(Scene3D ? canvasRef.current : svgRef.current)) return;

      const characters = new CharacterCatalog();
      characters.load(charDefs);
      const furniture = new FurnitureCatalog();
      furniture.load(furnDefs);
      // 축척은 아래 layout effect 가 rt 가 생기자마자(첫 화면을 그리기 전에) 맞춘다
      renderer = Scene3D ? new Scene3D(canvasRef.current!, furniture) : new PlaceholderScene(svgRef.current!, furniture);
      renderer.holdMissingClips(debug ? DEBUG_HOLD_MS : null);
      // 엔진 — 내 거실만 감정 스트림이 있다. 남의 거실 스트림(2-7)은 S7·S8 이라 그때까지 빈 엔진(걷기 · 대기 · 들기만)
      const createEngine: EngineFactory = mine
        ? (onCommand) =>
            createRoomEngine({
              feed: new RoomFeed(() => alive && setNeedLogin(true)),
              onCommand,
              log: debug ? (line) => console.log(`[엔진] ${line}`) : undefined,
              labelOf: (id) => characters.def(id)?.stockName,
            })
        : () => new NullEngine();
      loop = new RoomLoop({
        renderer,
        createEngine,
        characters,
        furniture,
        motions: ROOM_MOTIONS,
        events: {
          onPicked: (id, screen) => hud.current?.onSelect(id, screen),
          onEmptyPick: () => hud.current?.onEmptyPick(),
          onLiftCharge: (id, ms) => hud.current?.onLiftCharge(id, ms),
          onLiftChargeEnd: (id) => hud.current?.onLiftChargeEnd(id),
          onLifted: (id) => hud.current?.onLifted(id),
        },
      });
      loop.load(snap);
      loop.start();
      setSnapshot(snap);
      setHoldings(owned);
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
  }, [userId, asGuest, use3d, debug]);

  // 보유 종목 3초 폴링 — 내 거실을 다 받은 뒤부터. 로그인이 풀리면 멈추고 로그인 창
  useHoldingsPoll(!!rt && snapshot?.mode === 'OWNER', setHoldings, () => setNeedLogin(true));
  /** 거실에 세운 캐릭터의 시세 — 보유 목록에서 캐릭터 id 로 찾는다(스탯 링 수익률) */
  const quotes = useMemo(() => {
    const out: Record<string, Quote> = {};
    for (const h of holdings ?? []) out[charIdOf(h)] = { price: h.currentPrice, returnRate: h.returnRate };
    return out;
  }, [holdings]);

  // 창 크기 · 줌 · 끌기가 바뀌면 보는 자리만 다시 — 글자·패널 크기는 그대로.
  // 그리기 전에 맞춰야 첫 화면이 빈 화면으로 깜빡이지 않고, 스탯 링·배치 도구가 옛 자리에 남지 않는다
  /**
   * 좌우로 더 끌 수 있는 폭 — 오른쪽 창이 가리는 폭만큼, 양쪽 같게. 창이 열려 있든 아니든 늘 (2026-10-12 도휘 — 가만히 있으면 답답).
   * 그래서 맨 줌아웃에서도 좌우로는 끌린다. 창 폭은 레이아웃이 정한다(화면 크기를 따라감)
   */
  const slack = sideSlack(L);
  const fitted = clampView(L, view.z, view.tx, view.ty, slack); // 창 크기가 바뀌면 지금 줌을 새 범위 안으로
  const P = projectionOf(L, fitted);
  useLayoutEffect(() => {
    viewRef.current = fitted;
    slackRef.current = slack;
    layoutRef.current = L;
  });
  useLayoutEffect(() => {
    if (!rt) return;
    rt.renderer.resize(P.scale, P.ox, P.oy, L.width, L.stageHeight);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 바깥(씬) 시점을 바꾼 뒤 HUD 가 새 자리를 읽도록 한 번 더 그린다
    setSceneVersion((v) => v + 1);
  }, [rt, P.scale, P.ox, P.oy, L.width, L.stageHeight]);

  /** 줌인했을 때 빈 바닥을 끌어 둘러보기 — 일반 모드는 여기서, 배치 모드는 편집기가 부른다 */
  const pan: PanControl = {
    start: (x, y) => {
      stopZoomAnim();
      const v = viewRef.current;
      if (v.z <= 1.001 && slackRef.current <= 0) return false;
      panning.current = { x, y, tx: v.tx, ty: v.ty };
      return true;
    },
    move: (x, y) => {
      const s = panning.current;
      if (s) setView(clampView(layoutRef.current, viewRef.current.z, s.tx + x - s.x, s.ty + y - s.y, slackRef.current));
    },
    end: () => {
      panning.current = null;
    },
  };
  const stopZoomAnim = () => stopAnim(zoomAnim);
  /** 슬라이더 — 바로 그 배율로 (화면 가운데를 붙잡고) */
  const zoomTo = (z: number) => {
    stopZoomAnim();
    setView((v) => zoomAt(layoutRef.current, v, z, layoutRef.current.width / 2, layoutRef.current.stageHeight / 2, slackRef.current));
  };
  /**
   * − / + 버튼 — 화면 가운데를 붙잡고 0.24초 동안 부드럽게 (휠과 같은 느낌).
   * 배율은 곱으로 보간해서 확대 속도가 일정해 보이게 한다
   */
  const zoomStep = (factor: number) => {
    const from = viewRef.current;
    const target = Math.min(ZOOM_MAX, Math.max(1, (zoomAnim.current?.target ?? from.z) * factor));
    stopZoomAnim();
    const z0 = from.z;
    const t0 = performance.now();
    const DURATION = 240;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / DURATION);
      const e = 1 - (1 - k) ** 3; // 빠르게 시작해 천천히 멈춤
      const L0 = layoutRef.current;
      setView(zoomAt(L0, from, z0 * (target / z0) ** e, L0.width / 2, L0.stageHeight / 2, slackRef.current));
      if (k < 1 && zoomAnim.current) zoomAnim.current.raf = requestAnimationFrame(step);
      else zoomAnim.current = null;
    };
    zoomAnim.current = { raf: requestAnimationFrame(step), target };
  };
  useEffect(() => () => stopAnim(zoomAnim), []);

  /**
   * 마우스 휠 — 커서 자리를 붙잡고 확대·축소. 페이지가 같이 스크롤되지 않게 수동 리스너(passive: false).
   * 방 위만이 아니라 화면 전체(배치 편집기 덮개 포함)에서 받는다 — 단 스스로 스크롤하는 창(오른쪽 창·팝업·하단 바,
   * data-own-wheel)은 그쪽이 먹고, 거실을 다 받기 전이나 비공개 거실이면 줌하지 않는다
   */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!wheelOn.current || (e.target as Element).closest('[data-own-wheel]')) return;
      e.preventDefault();
      stopAnim(zoomAnim);
      const r = el.getBoundingClientRect();
      const at = { x: e.clientX - r.left, y: e.clientY - r.top };
      setView((v) => zoomAt(layoutRef.current, v, v.z * Math.exp(-e.deltaY * 0.0015), at.x, at.y, slackRef.current));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /* ── 방 위 포인터 → 런타임 (좌표는 무대 기준) ── */
  const local = (e: { clientX: number; clientY: number }) => {
    const r = roomRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // 비공개 거실 — 주인이 아니면 블러만 보이고 아무것도 누를 수 없다(방명록·팔로우 포함).
  // 거실 탐색 검색에서 빼는 것은 서버 몫. 여기는 링크(방명록 닉네임·커뮤니티·팔로우 목록)로 들어온 경우다
  const isPrivate = snapshot?.visibility === 'PRIVATE' && snapshot.mode !== 'OWNER';
  useLayoutEffect(() => {
    wheelOn.current = !!snapshot && !!rt && !isPrivate;
  });

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
          // 캐릭터가 아닌 곳을 누르면 줌인 상태에서는 방을 끈다. 짧게 누르면 여전히 빈 바닥 누름(스탯 링 닫기)
          if (!rt.loop.charAt(p.x, p.y)) pan.start(p.x, p.y);
          rt.loop.pointerDown(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!rt || !e.isPrimary) return;
          const p = local(e);
          pan.move(p.x, p.y);
          rt.loop.pointerMove(p.x, p.y);
        }}
        onPointerUp={(e) => {
          if (!rt || !e.isPrimary) return;
          const p = local(e);
          pan.end();
          rt.loop.pointerUp(p.x, p.y);
        }}
        onPointerCancel={(e) => {
          if (!e.isPrimary) return;
          pan.end();
          rt?.loop.pointerCancel();
        }}
        onLostPointerCapture={() => {
          pan.end();
          rt?.loop.pointerCancel();
        }}
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
          position: 'absolute', left: 0, top: 0, width: L.width, height: L.stageHeight, cursor: fitted.z > 1.001 || slack > 0 ? 'grab' : undefined,
          filter: isPrivate ? 'blur(6px) brightness(0.6)' : undefined, touchAction: 'none', pointerEvents: isPrivate ? 'none' : undefined,
        }}
      >
        {use3d ? (
          <canvas ref={canvasRef} role="img" aria-label="거실 — 가구와 캐릭터 (3D)" style={{ display: 'block' }} />
        ) : (
          <svg ref={svgRef} role="img" aria-label="거실 — 가구와 캐릭터 (평면 더미)" style={{ display: 'block', overflow: 'hidden' }} />
        )}
      </div>

      {!snapshot && !error && <Center>불러오는 중…</Center>}
      {error && <Center>{error}</Center>}
      {isPrivate && <Center>비공개 거실이에요</Center>}
      {snapshot && !isPrivate && snapshot.characters.length === 0 && snapshot.mode === 'OWNER' && (
        <Center sub="오른쪽 위 캐릭터 탭에서 거실에 세울 캐릭터를 고를 수 있어요">거실에 세운 캐릭터가 없어요</Center>
      )}

      {snapshot && rt && !isPrivate && (
        <RoomHud
          ref={hud}
          ownerId={userId}
          snapshot={snapshot}
          reactionKinds={rt.reactionKinds}
          holdings={holdings}
          quotes={quotes}
          layout={L}
          pan={pan}
          loop={rt.loop}
          renderer={rt.renderer}
          characters={rt.characters}
          furniture={rt.furniture}
          onSidePanel={setSideOpen}
          onStock={(code) => navigate(`/stocks/${code}`)}
          onVisit={(id) => navigate(`/room/${id}${roomQuery(asGuest, use3d, debug)}`)} // ?guest 는 더미 전용
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
          onRoster={(characters) => setSnapshot((s) => (s ? { ...s, characters } : s))}
          loginOpen={needLogin}
          onNeedLogin={() => setNeedLogin(true)}
        />
      )}
      {debug && rt && !isPrivate && <DebugLabels loop={rt.loop} />}
      {snapshot && rt && !isPrivate && (
        // 오른쪽 창이 열리면 그 왼쪽으로 비켜난다
        <ZoomControl z={fitted.z} right={sideOpen ? L.panel.width + 24 : 12} top={L.dockTop} onZoom={zoomTo} onStep={zoomStep} />
      )}
      <LoginPrompt open={needLogin} onClose={() => setNeedLogin(false)} />
    </div>
  );
}

/** 다른 거실로 갈 때도 미리보기 표시(비로그인 흉내 · 평면 더미 · 개발 모드)를 이어 간다 */
function roomQuery(asGuest: boolean, use3d: boolean, debug: boolean): string {
  const parts = [asGuest ? 'guest' : '', use3d ? '' : 'r=2d', debug ? 'debug=motion' : ''].filter(Boolean);
  return parts.length ? `?${parts.join('&')}` : '';
}

function Center({ children, sub }: { children: string; sub?: string }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, pointerEvents: 'none', zIndex: 3 }}>
      <span style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(33,33,38,0.86)', border: '1px solid rgba(255,255,255,0.14)', fontSize: 13, fontWeight: 700 }}>{children}</span>
      {sub && <span style={{ fontSize: 12, color: '#9A9A93' }}>{sub}</span>}
    </div>
  );
}

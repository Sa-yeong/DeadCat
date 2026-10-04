import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LayoutContext, MIN_STAGE, MIN_WIDTH, useLayout, useViewportLayout } from './layout';
import { QuoteSync, SLOW_MS, fetchCandles, type Tick } from './QuoteSync';
import { getRanking, isNotFound, type RankingItem } from './api';
import type { Candle, Timeframe, VolumeSummary } from './types';
import { StageView } from './components/StageView';
import { CharacterStage, type StageStatus } from './components/CharacterStage';
import type { StockStageLoop } from './runtime/StockStageLoop';
import { TOOLBAR_H, WindowHud, type WindowTab } from './components/WindowHud';
import { PostComposer } from './components/PostComposer';
import { StockHeader } from './components/StockHeader';
import { OrderBookBlock } from './components/OrderBookBlock';
import { OrderBlock } from './components/OrderBlock';
import { VolumeBlock } from './components/VolumeBlock';
import { WatchRail } from './components/WatchRail';
import { SolidBatchToggle } from './components/SolidBatchToggle';
import { Block } from './components/Block';

type BlockId = 'orderbook' | 'order' | 'volume' | 'rail';
const BLOCK_IDS: BlockId[] = ['orderbook', 'order', 'volume', 'rail'];

/**
 * 개별 종목 화면 — 라우트 /stocks/:stockCode
 *
 * 공간 구조: 캐릭터가 있는 공간 / 창문이 난 벽 / 사용자.
 * 차트는 그 벽에 난 창문이고, 벽은 반투명이라 뒤가 비쳐 보이되 그 위에 UI를 올린다.
 *
 * 상태를 페이지가 드는 것과 아닌 것 —
 *   여러 곳이 같이 보는 값만 페이지가 든다(tab · timeframe · solid · 관심목록 · tick · volume · candles).
 *   주문 입력, 관심 레일의 전체/관심 탭, 글쓰기 모달은 각자 든다.
 *
 * 데이터 조달은 세 갈래다. 주기가 다르기 때문이다.
 *   ① 빠른 주기 — 현재가·등락·호가·차트 마지막 봉 (QuoteSync.fastTick)
 *   ② 느린 주기 — 거래량 (QuoteSync.slowTick)
 *   ③ 열릴 때 한 번 — 기업정보 · 커뮤니티 (각 패널이 직접)
 *   ④ 종목·주기가 바뀔 때 — 캔들 전체. 페이지가 받아 차트와 거래량이 **같은 봉**을 나눠 쓴다
 */
export function StockDetailPage() {
  const { stockCode = '000000' } = useParams();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const L = useViewportLayout(rootRef);
  const layoutRef = useRef(L);
  layoutRef.current = L;
  const navigate = useNavigate();

  const [tab, setTab] = useState<WindowTab>('CHART');
  const [timeframe, setTimeframe] = useState<Timeframe>('DAY');
  const [solid, setSolid] = useState<Record<BlockId, boolean>>({
    orderbook: false,
    order: false,
    volume: false,
    rail: false,
  });
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [rail, setRail] = useState<RankingItem[]>([]);
  /** 헤더에 띄울 받기 실패 문구 — 성공하면 지운다 */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tick, setTick] = useState<Tick | null>(null);
  const [volume, setVolume] = useState<VolumeSummary | null>(null);
  const [candles, setCandles] = useState<{ key: string; list: Candle[] } | null>(null);
  const [composing, setComposing] = useState(false);
  /** 호가창에서 누른 가격 → 주문 블럭 가격 칸. n은 같은 가격을 다시 눌러도 들어가게 하는 순번 */
  const [picked, setPicked] = useState<{ code: string; price: number; n: number } | null>(null);
  const pickPrice = useCallback(
    (price: number) => setPicked((v) => ({ code: stockCode, price, n: (v?.n ?? 0) + 1 })),
    [stockCode],
  );
  const [stage, setStage] = useState<StageStatus>('loading');
  const stageLoop = useRef<StockStageLoop | null>(null);
  const [communityKey, setCommunityKey] = useState(0);

  const sync = useRef<QuoteSync | null>(null);
  if (!sync.current) {
    sync.current = new QuoteSync({
      onTick: (t) => {
        setTick(t);
        setLoadError(null);
      },
      onVolume: setVolume,
      onError: (e) => setLoadError(isNotFound(e) ? '종목을 찾을 수 없어요' : '서버에 연결할 수 없어요'),
    });
  }

  /** 최초 진입과 종목 전환이 같은 경로를 탄다 */
  useEffect(() => {
    const q = sync.current!;
    setTick(null);
    setVolume(null);
    setLoadError(null);
    setCommunityKey((k) => k + 1); // 패널 캐시·커서를 버린다
    q.start(stockCode, timeframe);
    return () => q.stop();
    // timeframe 변경은 아래 effect가 따로 처리한다 — 여기서 재시작하면 폴링이 끊긴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockCode]);

  useEffect(() => {
    sync.current?.setTimeframe(timeframe);
  }, [timeframe]);

  // 캔들 전체 — 종목·주기가 바뀔 때만. 늦게 온 옛 요청은 key로 걸러낸다
  const candleKey = `${stockCode}|${timeframe}`;
  useEffect(() => {
    let alive = true;
    fetchCandles(stockCode, timeframe)
      .then((list) => {
        if (alive) setCandles({ key: `${stockCode}|${timeframe}`, list });
      })
      .catch(() => {}); // 실패는 QuoteSync 쪽 문구로 알린다 — 차트는 '불러오는 중'에 머문다
    return () => {
      alive = false;
    };
  }, [stockCode, timeframe]);
  const baseCandles = candles?.key === candleKey ? candles.list : null;

  // 빠른 주기로 온 마지막 봉 — 지금 보고 있는 주기의 봉일 때만 쓴다
  const liveLast = tick && tick.timeframe === timeframe ? tick.lastCandle : null;

  /** 거래량 블럭이 그릴 봉 — 캔들 전체의 마지막 봉을 실시간 봉으로 갈아끼운다 */
  const bars = useMemo(() => {
    if (!baseCandles) return null;
    let out = baseCandles;
    if (liveLast) {
      const last = out[out.length - 1];
      if (last && last.write_time === liveLast.write_time) out = [...out.slice(0, -1), liveLast];
      else if (!last || Date.parse(liveLast.write_time) > Date.parse(last.write_time)) out = [...out, liveLast];
    }
    // 일봉의 오늘 봉은 거래량이 0으로 온다(2026-09-29 확인) — 오늘 누적 거래량으로 메운다
    const last = out[out.length - 1];
    if (timeframe === 'DAY' && volume && last && !last.volume) {
      out = [...out.slice(0, -1), { ...last, volume: volume.total_volume }];
    }
    return out;
  }, [baseCandles, liveLast, timeframe, volume]);

  /**
   * 우측 레일 '전체' 목록 — 거래대금 상위(GET /stocks/ranking). 느린 주기로 다시 받는다.
   * 관심 하트는 처음 받을 때만 응답의 is_favorite로 채운다 — 그 뒤엔 사용자가 누른 상태가 우선.
   * {관심 등록·해제 API(POST/DELETE /favorites)는 로그인 연결 때 붙인다 — 지금은 화면 안에서만}
   */
  useEffect(() => {
    let alive = true;
    let seeded = false;
    const load = () =>
      getRanking()
        .then((list) => {
          if (!alive) return;
          setRail(list);
          if (!seeded) {
            seeded = true;
            setFavorites(new Set(list.filter((i) => i.is_favorite).map((i) => i.stock_code)));
          }
        })
        .catch(() => {}); // 목록은 못 받아도 화면은 돈다 — 다음 주기에 다시
    void load();
    const t = window.setInterval(load, SLOW_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  const openStock = useCallback(
    (code: string) => {
      if (code === stockCode) return;
      navigate(`/stocks/${code}`); // 탭과 주기는 유지한다 — 차트를 보던 사람은 계속 차트를 본다
    },
    [navigate, stockCode],
  );

  const toggleFavorite = useCallback((code: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const setBlockSolid = useCallback((id: BlockId) => {
    setSolid((s) => ({ ...s, [id]: !s[id] }));
  }, []);

  const allSolid = BLOCK_IDS.every((id) => solid[id]);
  const setAllSolid = useCallback((v: boolean) => {
    setSolid({ orderbook: v, order: v, volume: v, rail: v });
  }, []);

  /**
   * 캐릭터를 덮고 있는 UI 사각형.
   * 어떤 UI가 가리는지는 **좌표를 아는 쪽만** 안다 — StageLayout의 사각형과
   * "지금 열린 패널"을 둘 다 보는 것은 페이지뿐이다.
   * 3D가 붙으면 이 값을 런타임에 넘겨 캐릭터가 얼굴을 빼꼼 내밀게 한다.
   */
  const occlusion = useMemo(() => {
    const rects = [
      { left: L.colLeft, top: L.blocks.orderbook.top, width: L.colWidth, height: L.blocks.orderbook.height, solid: solid.orderbook },
      { left: L.colLeft, top: L.blocks.order.top, width: L.colWidth, height: L.blocks.order.height, solid: solid.order },
      { left: L.colLeft, top: L.blocks.volume.top, width: L.colWidth, height: L.blocks.volume.height, solid: solid.volume },
      { left: L.rail.left, top: L.rail.top, width: L.rail.width, height: L.rail.height, solid: solid.rail },
      { left: L.win.left, top: L.win.top, width: L.winWidth, height: L.tabHeight, solid: true },
    ];
    // {반투명 블럭을 가림으로 칠지 미정} — 지금은 불투명일 때만 가림으로 본다
    return rects.filter((r) => r.solid);
  }, [solid, L]);
  useEffect(() => {
    stageLoop.current?.setOcclusion(occlusion);
  }, [occlusion, stage]);

  /**
   * 캐릭터 누르기 — 차트 탭에서 창문 안을 눌렀을 때만. 창문 안은 차트가 덮고 있어
   * 캔버스가 직접 못 받으므로 무대에서 가로챈다(막지는 않는다 — 차트도 그대로 받는다).
   * 몸에 닿았는지는 런타임이 판단한다.
   */
  const lastTab = useRef(tab);
  lastTab.current = tab;
  useEffect(() => {
    const el = rootRef.current?.querySelector('main');
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      if (lastTab.current !== 'CHART' || !stageLoop.current) return;
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const w = layoutRef.current.win;
      // 탭 줄과 차트 도구 줄은 버튼 자리라 뺀다
      if (x < w.left || x > w.right || y < w.top + layoutRef.current.tabHeight + TOOLBAR_H || y > w.bottom) return;
      stageLoop.current.onTap(x, y);
    };
    el.addEventListener('pointerdown', onDown, true);
    return () => el.removeEventListener('pointerdown', onDown, true);
  }, []);

  const basic = tick?.basic ?? null;

  return (
    <LayoutContext.Provider value={L}>
    <div
      ref={rootRef}
      className="dc-screen relative overflow-hidden"
      style={{
        width: '100%',
        minWidth: MIN_WIDTH,
        height: L.stageHeight,
        minHeight: MIN_STAGE,
        background: '#1C1C1E',
        color: '#EDEDEA',
        fontFamily: "'Gothic A1', system-ui, sans-serif",
      }}
    >
      {/* 네비는 그리지 않는다 — 앱에서는 팀의 GlobalNavBar(Root)가 위에 있다 */}
      <main className="relative" style={{ width: L.width, height: L.stageHeight }}>
        <StageView
          live={stage === 'ready'}
          windowOpen={tab === 'CHART'}
          scene={
            <CharacterStage
              onLoop={(lp) => {
                stageLoop.current = lp;
              }}
              onStatus={setStage}
            />
          }
        />

        <StockHeader basic={basic} stockCode={stockCode} status={loadError ?? (basic ? null : '불러오는 중…')} />
        <SolidBatchToggle allSolid={allSolid} onSetAll={setAllSolid} />

        <WindowHud
          tab={tab}
          onSwitch={setTab}
          stockCode={stockCode}
          timeframe={timeframe}
          onTimeframe={setTimeframe}
          candles={baseCandles}
          lastCandle={liveLast}
          communityKey={communityKey}
          onCompose={() => setComposing(true)}
        />

        {tick ? (
          <OrderBookBlock tick={tick} solid={solid.orderbook} onToggle={() => setBlockSolid('orderbook')} onPick={pickPrice} />
        ) : (
          <Placeholder id="orderbook" title="호가" solid={solid.orderbook} onToggle={() => setBlockSolid('orderbook')} />
        )}

        <OrderBlock
          key={stockCode}
          currentPrice={basic?.current_price ?? 0}
          picked={picked?.code === stockCode ? picked : null}
          solid={solid.order}
          onToggle={() => setBlockSolid('order')}
          onDone={() => sync.current?.refreshFastNow()}
        />

        {bars ? (
          <VolumeBlock
            bars={bars}
            timeframe={timeframe}
            today={volume}
            solid={solid.volume}
            onToggle={() => setBlockSolid('volume')}
          />
        ) : (
          <Placeholder id="volume" title="거래량" solid={solid.volume} onToggle={() => setBlockSolid('volume')} />
        )}

        <WatchRail
          items={rail}
          favorites={favorites}
          currentCode={stockCode}
          solid={solid.rail}
          onToggle={() => setBlockSolid('rail')}
          onSelect={openStock}
          onToggleHeart={toggleFavorite}
        />

        <PostComposer
          open={composing}
          onClose={() => setComposing(false)}
          onSubmitted={() => setCommunityKey((k) => k + 1)}
        />
      </main>
    </div>
    </LayoutContext.Provider>
  );
}

/** 로딩 중에도 블럭 자리는 비워두지 않는다 — 화면 전체를 덮는 로딩은 두지 않는다 */
function Placeholder({
  id,
  title,
  solid,
  onToggle,
}: {
  id: 'orderbook' | 'volume';
  title: string;
  solid: boolean;
  onToggle: () => void;
}) {
  const L = useLayout();
  const b = L.blocks[id];
  return (
    <Block title={title} solid={solid} onToggle={onToggle} left={L.colLeft} top={b.top} width={L.colWidth} height={b.height}>
      <div className="flex items-center justify-center" style={{ height: b.height - 80, fontSize: 12.5, color: '#6E6E68' }}>
        불러오는 중…
      </div>
    </Block>
  );
}

import { createContext, useContext, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { collapsedHostWidth, hostWidth, hostWidthWithSidebar, observeHost } from '../../layout/hostArea';
import { SIDEBAR, sidebarWidth, useSidebar } from '../../common/sidebar/sidebarState';

/**
 * 시안(Claude Design 아트보드) 기준값 — 1440 × 1036 캔버스.
 * 화면은 이 값을 **그대로 늘리지 않는다.** 글자·줄 높이·여백은 고정하고,
 * 박스만 창 크기에 맞춰 늘고 줄어든다. 박스가 커지면 보이는 정보가 늘어난다.
 */
export const L = {
  width: 1440,
  navHeight: 56,
  stageHeight: 980,
  win: { left: 420, top: 116, right: 1104, bottom: 864 },
  tabHeight: 38, // 창문 탭 줄 — 블럭 머리 줄(Block.HEAD_H)과 같은 높이
  colLeft: 32,
  colWidth: 320,
  blocks: {
    orderbook: { top: 118, height: 284 },
    order: { top: 413, height: 241 },
    volume: { top: 665, height: 226 },
  },
  character: { left: 512, top: 134, width: 500, height: 910 },
  floor: { horizon: 260, vanishX: 762 },
} as const;

/* ── 고정 치수 (px) — 창 크기와 무관 ─────────────────────────────── */
/*  2026-09-29 간격 재조정 — 블럭 사이를 붙이고 남는 자리를 창문(차트·캐릭터)에 준다.
 *  참고: 토스증권 차트 화면의 패널 간격. 시안(아트보드)보다 촘촘하다.            */
const GAP = 12; //         블럭 사이 · 끝 여백 공통 간격
const EDGE = GAP; //       화면 좌우 끝 여백 (시안 32)
const GAP_COL_WIN = GAP; // 좌측 열 ↔ 창문 (시안 68)
const BLOCK_GAP = GAP; //  좌측 블럭 사이 (시안 11)
/** 종목 헤더 높이 — 코드 한 줄 + 이름·현재가 한 줄 */
export const HEADER_TOP = 10;
export const HEADER_H = 48;
const TOP = HEADER_TOP + HEADER_H + GAP; // 블럭이 시작하는 높이 (시안 118)
const WIN_TOP = TOP; //    창문 윗변도 블럭과 맞춘다 (시안 116)
const WIN_SHORTER = 0; //  창문 아랫변도 좌측 열과 맞춘다 (시안 27 위)

/** 호가 한 줄 22, 현재가 줄 26, 블럭 껍데기(테두리 2 + 머리 줄 38 + 본문 여백 10·10) 60
 *  2026-09-29 — 위아래로 눌러 날렵하게(토스증권 참고). 머리 줄은 칩 + 구분선 (Block.HEAD_H) */
const OB_ROW = 22;
const OB_CENTER = 26;
export const BLOCK_CHROME = 60;
const OB_MAX_LEVELS = 10; // 한쪽 최대 호가 단수 — 증권 앱 관례
const OB_MIN_LEVELS = 2;

const ORDER_H = 211; //     주문 블럭 — 늘어날 내용이 없어 고정 (본문 151 + 껍데기 60)
const VOLUME_BASE = 170; // 거래량 — 줄인 만큼 호가가 가져간다 (226 → 170)
const VOLUME_MIN = 130;
const BOTTOM_BASE = GAP; // 좌측 열 아래 여백 (시안 89)
const BOTTOM_MIN = 8;

const obHeightFor = (levels: number) => BLOCK_CHROME + levels * 2 * OB_ROW + OB_CENTER;
const OB_BASE = L.blocks.orderbook.height; // 284 — 3단
const OB_MIN = obHeightFor(OB_MIN_LEVELS);
const OB_MAX = obHeightFor(OB_MAX_LEVELS);

/**
 * 이보다 작으면 스크롤한다 — 글자를 줄이지 않는 대신 치르는 값.
 * 1366 노트북에서 글로벌 사이드바를 열어도(왼쪽 영역 약 970~990, 스크롤바 폭에 따라) 스크롤이 생기지 않게.
 * 이때 창문은 약 600 — 차트 도구 줄이 한 줄에 들어가는 폭이다. 더 작은 화면은 가로 스크롤.
 * (오른쪽 관심 레일이 있던 때는 1280 — 레일은 글로벌 사이드바로 옮겨 갔다)
 */
export const MIN_WIDTH = 960;
export const MIN_STAGE = TOP + OB_MIN + BLOCK_GAP + ORDER_H + BLOCK_GAP + VOLUME_MIN + BOTTOM_MIN;

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Layout {
  width: number;
  /** 실제로 보이는 폭 — 화면을 담은 칸의 폭. MIN_WIDTH 보다 좁으면 width 보다 작고 나머지는 스크롤해야 보인다 */
  viewWidth: number;
  /**
   * 3D 무대(캔버스) 폭 — 글로벌 사이드바를 접었을 때의 폭이라 여닫아도 변하지 않는다.
   * 열면 오른쪽이 사이드바 밑에 깔린다(화면 칸 밖이라 잘려 안 보인다). 캔버스 크기를 바꾸면
   * 3D 를 다시 맞춰야 하고 캐릭터가 움찔하므로, 여닫을 때는 창문만 움직인다.
   */
  canvasWidth: number;
  stageHeight: number;
  win: { left: number; top: number; right: number; bottom: number };
  winWidth: number;
  winHeight: number;
  tabHeight: number;
  colLeft: number;
  colWidth: number;
  blocks: {
    orderbook: { top: number; height: number };
    order: { top: number; height: number };
    volume: { top: number; height: number };
  };
  /** 지금 호가 블럭에 한쪽 몇 단이 들어가는지 */
  orderbookLevels: number;
  character: Rect;
  floor: { horizon: number; vanishX: number };
}

/**
 * 창 크기 → 화면 좌표.
 *
 * 가로 — 좌측 열은 왼쪽 끝에 붙고 창문이 나머지를 오른쪽 끝까지 채운다.
 * 세로 — 좌측 열이 쓸 높이가 남으면 **호가가 먼저** 가져간다(한쪽 10단까지).
 *        호가가 다 차면 거래량이 나머지를 가져간다. 주문은 고정.
 *        모자라면 아래 여백 → 호가 → 거래량 순으로 줄인다.
 * 캐릭터 — 창문 높이에 비례. 상반신이 늘 같은 비율로 창문에 걸린다.
 *
 * canvasW — 3D 무대 폭(Layout.canvasWidth). 모르면 보이는 폭과 같게.
 */
export function computeLayout(availW: number, availH: number, canvasW = availW): Layout {
  const width = Math.max(availW, MIN_WIDTH);
  const stageHeight = Math.max(availH, MIN_STAGE);

  // ── 세로: 좌측 열 ──────────────────────────────────────────
  const fixed = BLOCK_GAP * 2 + ORDER_H;
  let bottom = BOTTOM_BASE;
  let avail = stageHeight - TOP - bottom - fixed; // 호가 + 거래량이 나눠 쓸 높이
  let ob: number;

  const base = OB_BASE + VOLUME_BASE;
  if (avail >= base) {
    const extra = avail - base;
    ob = Math.min(OB_BASE + extra, OB_MAX); // 호가 먼저 — 남은 높이는 거래량이 가져간다
  } else {
    // 모자라다 — 아래 여백부터 줄인다
    const shortBy = base - avail;
    const giveBottom = Math.min(shortBy, BOTTOM_BASE - BOTTOM_MIN);
    bottom -= giveBottom;
    avail += giveBottom;
    // 그다음 호가를 줄인다. 그래도 모자란 만큼은 거래량이 줄어든다(열 하단 기준 계산)
    ob = Math.max(OB_BASE - (base - avail), OB_MIN);
  }

  const levels = Math.max(
    OB_MIN_LEVELS,
    Math.min(OB_MAX_LEVELS, Math.floor((ob - BLOCK_CHROME - OB_CENTER) / (OB_ROW * 2))),
  );
  // 호가는 한 단(52px)씩 늘어나 딱 떨어지지 않는다. 시안보다 커졌을 때는
  // 단수에 맞춰 잘라내고, 남는 높이는 거래량이 가져간다 — 호가 아래 빈 띠가 생기지 않게.
  // 시안 크기 이하에서는 자르지 않는다(시안 좌표를 그대로 지키기 위해).
  if (ob > OB_BASE) ob = Math.max(OB_BASE, obHeightFor(levels));

  const obTop = TOP;
  const orderTop = obTop + ob + BLOCK_GAP;
  const volTop = orderTop + ORDER_H + BLOCK_GAP;
  const colBottom = stageHeight - bottom;

  // ── 가로 ────────────────────────────────────────────────
  const colLeft = EDGE;
  const colWidth = L.colWidth;

  const win = {
    left: colLeft + colWidth + GAP_COL_WIN,
    right: width - EDGE,
    top: WIN_TOP,
    bottom: colBottom - WIN_SHORTER,
  };
  const winWidth = win.right - win.left;
  const winHeight = win.bottom - win.top;
  const winCenter = (win.left + win.right) / 2;

  // ── 캐릭터: 창문 높이 비례, 창문 가운데 ───────────────────────
  const baseWinH = L.win.bottom - L.win.top; // 748
  const k = winHeight / baseWinH;
  const charH = L.character.height * k;
  const charW = L.character.width * k;
  const character = {
    left: winCenter - charW / 2,
    top: win.top + (L.character.top - L.win.top) * k,
    width: charW,
    height: charH,
  };

  // ── 바닥: 소실점은 창문 가운데, 지평선은 창문 안 같은 높이 ──────────
  const floor = {
    vanishX: winCenter,
    horizon: win.top + (L.floor.horizon - L.win.top) * k,
  };

  return {
    width,
    viewWidth: availW,
    canvasWidth: Math.max(canvasW, width),
    stageHeight,
    win,
    winWidth,
    winHeight,
    tabHeight: L.tabHeight,
    colLeft,
    colWidth,
    blocks: {
      orderbook: { top: obTop, height: ob },
      order: { top: orderTop, height: ORDER_H },
      volume: { top: volTop, height: colBottom - volTop },
    },
    orderbookLevels: levels,
    character,
    floor,
  };
}

/**
 * 창 크기를 따라가는 레이아웃.
 *
 * 이 화면은 **자기 위에 무엇이 있는지 모른다.** 앱에서는 팀의 GlobalNavBar가,
 * 미리보기에서는 대용 네비가 위에 있다. 그래서 화면 맨 위가 문서의 어디에서
 * 시작하는지 재서, 창 높이에서 그만큼 뺀 높이를 쓴다 — 네비 높이가 바뀌어도 맞는다.
 * 폭은 창이 아니라 화면을 담은 칸 — 오른쪽 글로벌 사이드바 밑이 잘리지 않게(hostArea).
 *
 * 사이드바를 여닫을 때는 칸 폭을 매 프레임 따라가지 않는다 — 시작할 때 **최종 레이아웃을 한 번** 계산하고,
 * 창틀만 CSS 전환으로 그 자리까지 움직인다(sliding · slideTransition). 다시 그리는 건 시작과 끝 두 번뿐이다.
 * 3D 무대 폭은 사이드바를 접었을 때의 칸 폭이라 그동안 그대로다(Layout.canvasWidth).
 */
export function useViewportLayout(root: RefObject<HTMLElement | null>): { layout: Layout; sliding: boolean } {
  const sidebar = useSidebar();
  const open = sidebar?.open ?? false;
  // 사이드바가 없으면(미리보기) 무대 폭 = 칸 폭. 있으면 접혀도 남는 아이콘 줄만큼 뺀 폭
  const keep = sidebar ? SIDEBAR.railWidth : 0;
  const openNow = useRef(open);
  const slidingNow = useRef(false);
  const read = () => {
    const el = root.current;
    const top = el ? el.getBoundingClientRect().top + window.scrollY : 0;
    // 여닫는 중에는 칸이 아직 움직이는 중이다 — 도착할 폭으로 계산한다
    const w = slidingNow.current ? hostWidthWithSidebar(el, sidebarWidth(openNow.current)) : hostWidth(el);
    return computeLayout(w, window.innerHeight - top, Math.max(w, collapsedHostWidth(el, keep)));
  };
  const [layout, setLayout] = useState<Layout>(() => computeLayout(window.innerWidth, window.innerHeight));
  const [sliding, setSliding] = useState(false);
  // 크기가 같으면 그대로 둔다 — 화면을 쓸데없이 다시 그리지 않게
  const update = () => {
    const next = read();
    setLayout((prev) =>
      next.viewWidth === prev.viewWidth && next.stageHeight === prev.stageHeight && next.canvasWidth === prev.canvasWidth
        ? prev
        : next,
    );
  };
  useLayoutEffect(() => {
    update();
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    // 여닫는 중 칸 크기 변화는 듣지 않는다 — 끝날 때 한 번 다시 잰다
    const onHostResize = () => {
      if (!slidingNow.current) onResize();
    };
    window.addEventListener('resize', onResize);
    // 창은 그대로인데 화면 칸만 바뀌는 경우(스크롤바가 생기고 없어짐)
    const unobserve = observeHost(root.current, onHostResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      unobserve();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 글로벌 사이드바 여닫기 — 도중에 또 여닫으면 마지막 상태 기준으로 다시 잰다
  useLayoutEffect(() => {
    if (openNow.current === open) return;
    openNow.current = open;
    slidingNow.current = true;
    setSliding(true);
    update();
    const done = window.setTimeout(() => {
      slidingNow.current = false;
      setSliding(false);
      update();
    }, SIDEBAR.slideMs + SLIDE_MARGIN_MS);
    return () => window.clearTimeout(done);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return { layout, sliding };
}

/** 전환이 다 끝난 뒤에 끝났다고 치도록 두는 여유(ms) — 전환은 다음 프레임부터 시작한다 */
const SLIDE_MARGIN_MS = 60;

/** 글로벌 사이드바 패널과 같은 시간 · 같은 곡선(Sidebar.css)의 CSS 전환 */
export const slideTransition = (property: string) => `${property} ${SIDEBAR.slideMs}ms ease`;

export const LayoutContext = createContext<Layout>(computeLayout(L.width, L.stageHeight));
export const useLayout = () => useContext(LayoutContext);

/** 글로벌 사이드바를 여닫는 중 — 창틀은 CSS 전환으로 움직이고, 차트 크기 맞춤 · 캐릭터 이동은 끝난 뒤로 미룬다 */
export const SlidingContext = createContext(false);
export const useSliding = () => useContext(SlidingContext);

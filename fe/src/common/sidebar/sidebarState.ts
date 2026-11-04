import { createContext, useContext } from 'react';

/**
 * 글로벌 사이드바 — 화면 오른쪽 끝에 늘 붙어 있는 패널 + 아이콘 줄.
 * 페이지를 옮겨도 그대로 있고 왼쪽 영역(네비 + 화면)만 바뀐다. 상태는 Root 가 들고 있다.
 */

/** 탭 — 순서가 아이콘 줄 위→아래 순서다 */
export const SIDEBAR_TABS = ['holdings', 'watch', 'all'] as const;
export type SidebarTab = (typeof SIDEBAR_TABS)[number];

/** 치수(px) · 여닫는 시간(ms). 왼쪽 영역 화면이 사이드바 폭을 알아야 할 때 여기를 본다 */
export const SIDEBAR = {
  panelWidth: 320,
  railWidth: 56,
  /** 패널이 열리고 닫히는 데 걸리는 시간 — CSS(Sidebar.css)의 transition 과 같은 값 */
  slideMs: 220,
} as const;

export interface SidebarState {
  open: boolean;
  tab: SidebarTab;
}

/** 처음 접속은 접힌 상태 — 패널이 화면을 먼저 가리지 않게 */
export const DEFAULT_SIDEBAR: SidebarState = { open: false, tab: 'holdings' };

export const SIDEBAR_KEY = 'dc.sidebar';

/** 브라우저 저장소 중 쓰는 부분만 — 테스트에서 가짜를 넣을 수 있게 */
type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

/** 저장소가 막힌 환경(사생활 보호 창 등)에서는 localStorage 를 읽기만 해도 던진다 */
function storage(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * 마지막 열림 · 접힘과 탭. 화면 이동 · 새로고침 · 재접속 모두 이어진다.
 * 못 읽거나 모양이 틀리면 처음 접속처럼 접힌 상태로 시작한다.
 */
export function loadSidebar(store: KeyValueStore | null = storage()): SidebarState {
  try {
    const raw = store?.getItem(SIDEBAR_KEY);
    if (!raw) return DEFAULT_SIDEBAR;
    const v = JSON.parse(raw) as Partial<SidebarState> | null;
    if (!v || typeof v !== 'object') return DEFAULT_SIDEBAR;
    return {
      open: v.open === true,
      tab: SIDEBAR_TABS.includes(v.tab as SidebarTab) ? (v.tab as SidebarTab) : DEFAULT_SIDEBAR.tab,
    };
  } catch {
    return DEFAULT_SIDEBAR;
  }
}

/** 저장 실패(가득 참 · 막힘)는 조용히 넘긴다 — 이번 접속 동안은 화면 상태로 충분하다 */
export function saveSidebar(s: SidebarState, store: KeyValueStore | null = storage()): void {
  try {
    store?.setItem(SIDEBAR_KEY, JSON.stringify({ open: s.open, tab: s.tab }));
  } catch {
    /* 무시 */
  }
}

/** 보유 줄 오른쪽에 보이는 값 — 평가금(평가금액 · 수익) | 현재가(현재가 · 오늘 등락) */
export type HoldingsView = 'valuation' | 'price';
export const HOLDINGS_VIEW_KEY = 'dc.sidebar.holdingsView';

/** 못 읽으면 평가금 */
export function loadHoldingsView(store: KeyValueStore | null = storage()): HoldingsView {
  try {
    return store?.getItem(HOLDINGS_VIEW_KEY) === 'price' ? 'price' : 'valuation';
  } catch {
    return 'valuation';
  }
}

export function saveHoldingsView(v: HoldingsView, store: KeyValueStore | null = storage()): void {
  try {
    store?.setItem(HOLDINGS_VIEW_KEY, v);
  } catch {
    /* 무시 */
  }
}

/**
 * 아이콘을 눌렀을 때 — 접혀 있거나 다른 탭이면 그 탭으로 연다.
 * 열려 있는 탭을 한 번 더 누르면 접는다(토스증권과 같음).
 */
export function pickTab(s: SidebarState, tab: SidebarTab): SidebarState {
  if (s.open && s.tab === tab) return { ...s, open: false };
  return { open: true, tab };
}

/** 지금 사이드바가 차지하는 폭 — 아이콘 줄은 접혀도 남는다 */
export const sidebarWidth = (open: boolean) => SIDEBAR.railWidth + (open ? SIDEBAR.panelWidth : 0);

export interface SidebarControl extends SidebarState {
  /** 펼치기 · 접기 버튼 */
  toggle(): void;
  setOpen(open: boolean): void;
  /** 아이콘 — pickTab 규칙 */
  pick(tab: SidebarTab): void;
}

export const SidebarContext = createContext<SidebarControl | null>(null);

/** 왼쪽 영역 화면에서 사이드바 상태가 필요할 때. Root 밖(미리보기 등)에서는 null */
export const useSidebar = () => useContext(SidebarContext);

import type { ComponentType } from 'react';
import { BarsIcon, HeartIcon, WalletIcon } from './icons';
import { AllStocksPanel } from './panels/AllStocksPanel';
import { HoldingsPanel } from './panels/HoldingsPanel';
import { WatchPanel } from './panels/WatchPanel';
import type { SidebarTab } from './sidebarState';

/**
 * 탭 하나 — 아이콘 줄 글자(label), 패널 머리 제목(title), 아이콘, 본문(Panel).
 * 탭 내용을 채울 때는 panels/ 의 파일만 바꾸면 된다. 머리 · 여닫기는 Sidebar 몫.
 */
export interface TabDef {
  label: string;
  title: string;
  Icon: ComponentType;
  Panel: ComponentType;
}

export const TABS: Record<SidebarTab, TabDef> = {
  holdings: { label: '보유', title: '보유', Icon: WalletIcon, Panel: HoldingsPanel },
  watch: { label: '관심', title: '관심', Icon: HeartIcon, Panel: WatchPanel },
  all: { label: '전체', title: '전체', Icon: BarsIcon, Panel: AllStocksPanel },
};

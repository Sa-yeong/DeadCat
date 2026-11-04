import type { ReactNode } from 'react';

/** 아이콘 — 22px, 선 굵기 1.7. 색은 글자색(currentColor)을 따라 켜짐 · 꺼짐이 같이 바뀐다 */
const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox='0 0 24 24' width='22' height='22' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
    {children}
  </svg>
);

/** 보유 — 지갑 */
export const WalletIcon = () => (
  <Svg>
    <path d='M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3' />
    <rect x='4' y='8' width='16' height='11' rx='2.5' />
    <path d='M16 13.5h1.5' />
  </Svg>
);

/** 관심 — 하트 */
export const HeartIcon = () => (
  <Svg>
    <path d='M12 19.5s-7-4.3-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.1c0 5.1-7 9.4-7 9.4z' />
  </Svg>
);

/** 전체 — 막대 그래프 */
export const BarsIcon = () => (
  <Svg>
    <path d='M5 19V11M10 19V6M15 19v-5M20 19V9' />
  </Svg>
);

/** 펼치기(«) · 접기(») — 패널이 왼쪽으로 펼쳐지므로 화살표도 그쪽을 본다 */
export const Chevrons = ({ open }: { open: boolean }) => (
  <svg viewBox='0 0 24 24' width='20' height='20' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
    {open ? <path d='M6 7l5 5-5 5M13 7l5 5-5 5' /> : <path d='M18 7l-5 5 5 5M11 7l-5 5 5 5' />}
  </svg>
);

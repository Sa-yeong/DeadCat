import type { CSSProperties } from 'react';
import { R } from '../../stockDetail/radius';

/** 거실 HUD 공용 값 — 색 · 버튼 모양. 개별종목 화면과 같은 값을 쓴다 */
export const C = {
  bg: '#1C1C1E',
  nav: '#212126',
  panel: '#26262B',
  input: '#2A2A2E',
  chip: '#34343C',
  text: '#EDEDEA',
  text2: '#C6C6BE',
  dim: '#9A9A93',
  faint: '#8A8A82',
  line: 'rgba(255,255,255,0.18)',
  lineSoft: 'rgba(255,255,255,0.10)',
  accent: '#F2564C',
  glass: 'rgba(33,33,38,0.86)',
} as const;

export const ghostBtn: CSSProperties = {
  height: 30,
  padding: '0 11px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  border: 'none',
  borderRadius: R.control,
  background: 'transparent',
  color: C.text2,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export const solidBtn: CSSProperties = {
  ...ghostBtn,
  background: C.chip,
  color: C.text,
  fontWeight: 700,
};

export const accentBtn: CSSProperties = {
  ...ghostBtn,
  background: C.accent,
  color: '#1C1C1E',
  fontWeight: 900,
  padding: '0 16px',
};

/** 떠 있는 띠 — 상단 버튼 묶음, 모드 버튼 */
export const floatBar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  padding: 3,
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: R.card,
  background: C.glass,
};

export const REACTION_COLOR = { heart: '#FF7A70', star: '#F2C38B', smile: '#9FD3C7' } as const;

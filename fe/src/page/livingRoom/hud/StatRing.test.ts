import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { topReaction } from '../catalog';
import type { ViewMode } from '../types';
import { reactionCountLabel } from './labels';
import { ReactionBar, ReactionRingFace } from './StatRing';

// 받은 반응 링 (F1) — 숫자 표기 · 1등 고르기 · 링 안 · 모드별 바

describe('reactionCountLabel', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1k'],
    [1099, '1k'],
    [1100, '1.1k'],
    [2000, '2k'],
    [9000, '9k'],
    [9949, '9.9k'],
    [9999, '9.9k'],
    [10000, '10k+'],
    [1234567, '10k+'],
  ])('%d → %s', (n, label) => {
    expect(reactionCountLabel(n)).toBe(label);
  });
});

describe('topReaction', () => {
  it('가장 많이 받은 종류 + 그 수', () => {
    expect(topReaction({ THUMBS_UP: 2, HEART: 100, SAD: 3 })).toEqual({ reactionType: 'HEART', count: 100 });
  });
  it('같은 수면 👍 🔥 ❤️ 😢 순서로 앞의 것 — 응답 순서와 무관', () => {
    expect(topReaction({ SAD: 5, HEART: 5, FIRE: 5 })).toEqual({ reactionType: 'FIRE', count: 5 });
  });
  it('표에 없는 종류도 많이 받았으면 1등, 같은 수면 표의 것이 앞', () => {
    expect(topReaction({ WOW: 7, SAD: 2 })).toEqual({ reactionType: 'WOW', count: 7 });
    expect(topReaction({ WOW: 2, SAD: 2 })).toEqual({ reactionType: 'SAD', count: 2 });
  });
  it('하나도 안 받았으면 null', () => {
    expect(topReaction({})).toBeNull();
    expect(topReaction({ HEART: 0 })).toBeNull();
  });
});

describe('ReactionRingFace', () => {
  const face = (counts: Record<string, number>) => renderToStaticMarkup(createElement(ReactionRingFace, { counts }));
  it('이모지 + 표기한 수', () => {
    const html = face({ HEART: 12345, FIRE: 3 });
    expect(html).toContain('❤️');
    expect(html).toContain('10k+');
  });
  it('받은 반응 0이면 0만', () => {
    const html = face({});
    expect(html).toContain('>0<');
    expect(html).not.toMatch(/👍|🔥|❤️|😢/u);
  });
  it('이모지가 없는 종류는 이름 대신 수만 — 원을 넘치지 않게', () => {
    const html = face({ WOW: 4 });
    expect(html).toContain('4');
    expect(html).not.toContain('WOW');
  });
});

describe('ReactionBar', () => {
  const kinds = ['THUMBS_UP', 'FIRE', 'HEART', 'SAD'].map((reactionType) => ({ reactionType }));
  const bar = (mode: ViewMode, myReaction: string | null = null) =>
    renderToStaticMarkup(
      createElement(ReactionBar, { left: 0, top: 0, mode, stockName: 'A', reactions: kinds, counts: { HEART: 1500, SAD: 2 }, myReaction, onPick: () => {} }),
    );

  it('반응 종류 전부 + 각각 받은 수(안 받은 종류는 0)', () => {
    const html = bar('VISITOR');
    for (const e of ['👍', '🔥', '❤️', '😢']) expect(html).toContain(e);
    expect(html).toContain('1.5k');
    expect(html.match(/<button/g)).toHaveLength(4);
  });
  it('OWNER — 전부 누를 수 없다', () => {
    expect(bar('OWNER').match(/disabled=""/g)).toHaveLength(4);
  });
  it('VISITOR — 누를 수 있고 내 반응만 눌림 표시', () => {
    const html = bar('VISITOR', 'HEART');
    expect(html).not.toContain('disabled');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('A에게 남긴 HEART 취소');
  });
  it('GUEST — 눌러 볼 수 있고(로그인 안내는 눌렀을 때) 내 반응은 없다', () => {
    const html = bar('GUEST', 'HEART');
    expect(html).not.toContain('disabled');
    expect(html).not.toContain('aria-pressed="true"');
  });
  it('반응 종류가 없으면 안내', () => {
    const html = renderToStaticMarkup(createElement(ReactionBar, { left: 0, top: 0, mode: 'OWNER', stockName: 'A', reactions: [], counts: {}, myReaction: null, onPick: () => {} }));
    expect(html).toContain('아직 반응 종류가 없어요');
  });
});

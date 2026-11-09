import { describe, expect, it } from 'vitest';
import { PanGesture, RELEASE_GLIDE_MS } from './panGesture';

describe('PanGesture — 범위 변화가 사용자가 끈 것인가', () => {
  it('아무도 안 눌렀으면 끈 게 아니다', () => {
    expect(new PanGesture().byUser(1000)).toBe(false);
  });

  it('봉이 있는 차트를 누르는 동안은 끈 것이다', () => {
    const g = new PanGesture();
    g.press(true);
    expect(g.byUser(1000)).toBe(true);
  });

  it('놓은 뒤 잠깐(관성)까지 끈 것이고, 그 뒤로는 아니다', () => {
    const g = new PanGesture();
    g.press(true);
    g.release(1000);
    expect(g.byUser(1000 + RELEASE_GLIDE_MS - 1)).toBe(true);
    expect(g.byUser(1000 + RELEASE_GLIDE_MS)).toBe(false);
  });

  it('봉이 없을 때 누르면 — 누르는 동안도, 놓은 뒤에도 끈 게 아니다(봉이 도착하며 생기는 범위 변화)', () => {
    const g = new PanGesture();
    g.press(false);
    expect(g.byUser(1000)).toBe(false);
    g.release(1000);
    expect(g.byUser(1001)).toBe(false);
  });

  it('봉이 없을 때 누른 다음에 봉이 도착해 다시 누르면 그때부터는 끈 것이다', () => {
    const g = new PanGesture();
    g.press(false);
    g.release(1000);
    g.press(true);
    expect(g.byUser(1100)).toBe(true);
  });

  it('누른 적 없이 온 놓기는 무시한다(차트 밖에서 뗀 것)', () => {
    const g = new PanGesture();
    g.release(1000);
    expect(g.byUser(1001)).toBe(false);
  });
});

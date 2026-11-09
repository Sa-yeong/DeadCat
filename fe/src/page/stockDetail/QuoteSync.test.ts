import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({
  getBasic: vi.fn(),
  getOrderbook: vi.fn(),
  getChart: vi.fn(),
  getVolume: vi.fn(),
}));

import { getBasic, getChart, getOrderbook, getVolume } from './api';
import { FAST_MS, QuoteSync } from './QuoteSync';

const basicOf = (price: number) => ({ stock_code: '005930', current_price: price, change_rate: 0, change_price: 0, market: 'DOMESTIC' });

/** F7 — 주문 · 취소 직후 빠른 주기 한 번 당기기 */
describe('QuoteSync.refreshFastNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
    vi.mocked(getBasic).mockReset().mockResolvedValue(basicOf(100) as never);
    vi.mocked(getOrderbook).mockReset().mockResolvedValue({ asks: [], bids: [] } as never);
    vi.mocked(getChart).mockReset().mockResolvedValue([]);
    vi.mocked(getVolume).mockReset().mockResolvedValue({} as never);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const started = async () => {
    const onTick = vi.fn();
    const q = new QuoteSync({ onTick, onVolume: () => {} });
    q.start('005930', 'DAY');
    await vi.advanceTimersByTimeAsync(0);
    expect(getBasic).toHaveBeenCalledTimes(1);
    return { q, onTick };
  };

  it('다음 주기를 기다리지 않고 바로 한 번 받는다', async () => {
    const { q, onTick } = await started();
    await vi.advanceTimersByTimeAsync(500);
    q.refreshFastNow();
    expect(getBasic).toHaveBeenCalledTimes(2);
    expect(getOrderbook).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(onTick).toHaveBeenCalledTimes(2);
    q.stop();
  });

  it('당긴 뒤 주기는 거기서부터 다시 센다 — 바로 뒤에 같은 요청이 또 나가지 않는다', async () => {
    const { q } = await started();
    await vi.advanceTimersByTimeAsync(FAST_MS - 100);
    q.refreshFastNow();
    expect(getBasic).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(FAST_MS - 1); // 원래 주기였다면 100ms 뒤에 또 나갔다
    expect(getBasic).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(getBasic).toHaveBeenCalledTimes(3);
    q.stop();
  });

  it('가고 있는 요청이 있으면 그걸로 갈음한다', async () => {
    const { q } = await started();
    let release = (_: unknown) => {};
    vi.mocked(getBasic).mockReturnValue(new Promise((r) => (release = r)) as never);
    q.refreshFastNow();
    q.refreshFastNow(); // 주문 블럭의 onDone 과 주문 신호가 같은 때에 온다
    expect(getBasic).toHaveBeenCalledTimes(2);
    release(basicOf(101));
    await vi.advanceTimersByTimeAsync(0);
    q.refreshFastNow();
    expect(getBasic).toHaveBeenCalledTimes(3);
    q.stop();
  });

  it('늦게 돌아온 앞 요청이 뒤 요청의 값을 덮지 않는다', async () => {
    const { q, onTick } = await started();
    let releaseOld = (_: unknown) => {};
    vi.mocked(getBasic).mockReturnValueOnce(new Promise((r) => (releaseOld = r)) as never);
    await vi.advanceTimersByTimeAsync(FAST_MS); // 느린 요청이 나감
    vi.mocked(getBasic).mockResolvedValue(basicOf(102) as never);
    await vi.advanceTimersByTimeAsync(FAST_MS); // 다음 주기 요청이 먼저 돌아옴
    expect(onTick.mock.lastCall?.[0].basic.current_price).toBe(102);
    releaseOld(basicOf(99));
    await vi.advanceTimersByTimeAsync(0);
    expect(onTick.mock.lastCall?.[0].basic.current_price).toBe(102);
    q.stop();
  });

  it('멈춘 뒤에는 받지 않는다', async () => {
    const { q } = await started();
    q.stop();
    q.refreshFastNow();
    expect(getBasic).toHaveBeenCalledTimes(1);
  });
});

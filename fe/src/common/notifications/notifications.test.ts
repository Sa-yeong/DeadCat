import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/axios';
import { startOrderFeed, subscribeOrderEvents } from './orderFeed';
import { cancelFailedNotice, cancelledNotice, failedNotice, laterNotice, missedNotices, money, orderResultNotice, type OrderNotification, type OrderResultLike } from './orderNotices';
import { clearNotices, dismissNotice, getNotices, notify, type NoticeInput, type NoticePart } from './store';

/** 글 조각을 글자로 — 매수/매도 · 종목명까지 펼쳐서 문구를 비교한다 */
const text = (parts: NoticePart[]) =>
  parts
    .map((p) => (typeof p === 'string' ? p : 'side' in p ? (p.side === 'BUY' ? '매수' : '매도') : p.stock.name))
    .join('');

const later = (over: Partial<OrderNotification> = {}): OrderNotification => ({
  type: 'order',
  status: 'COMPLETED',
  order_id: '1',
  stock_code: '005930',
  stock_name: '삼성전자',
  order_side: 'BUY',
  quantity: 10,
  price: 71000,
  fill_price: 71400,
  currency: 'KRW',
  reason: null,
  at: '2026-11-03T00:00:00.000Z',
  ...over,
});

const result = (over: Partial<OrderResultLike> = {}): OrderResultLike => ({
  status: 'COMPLETED',
  message: '',
  stock_code: '005930',
  stock_name: '삼성전자',
  order_side: 'SELL',
  quantity: 10,
  price: 71000,
  fill_price: 71400,
  currency: 'KRW',
  ...over,
});

const card = (body: string): NoticeInput => ({ tone: 'FAIL', title: [], body: [body] });

describe('알림 목록', () => {
  afterEach(clearNotices);

  it('새 알림이 뒤에 붙고, 3개를 넘으면 가장 옛 것이 닫힌다', () => {
    ['가', '나', '다', '라'].forEach((b) => notify(card(b)));
    expect(getNotices().map((n) => n.body[0])).toEqual(['나', '다', '라']);
  });

  it('「그 밖에 N건」 한 장은 3개에 세지 않고 남는다', () => {
    notify({ ...card('그 밖에'), summary: true });
    ['가', '나', '다', '라'].forEach((b) => notify(card(b)));
    expect(getNotices().map((n) => n.body[0])).toEqual(['그 밖에', '나', '다', '라']);
  });

  it('닫기 · 비우기', () => {
    notify(card('가'));
    notify(card('나'));
    dismissNotice(getNotices()[0].key);
    expect(getNotices().map((n) => n.body[0])).toEqual(['나']);
    clearNotices();
    expect(getNotices()).toEqual([]);
  });
});

describe('주문 알림 문구', () => {
  it('가격 표기 — 국내 원, 해외 달러 소수 2자리', () => {
    expect(money(71400, 'KRW')).toBe('71,400원');
    expect(money(228.86, 'USD')).toBe('$228.86');
    expect(money(1228.5, 'USD')).toBe('$1,228.50');
  });

  it('바로 체결 — 체결가, 종목명은 링크', () => {
    const n = orderResultNotice(result());
    expect(n.tone).toBe('SELL');
    expect(text(n.title)).toBe('매도 체결');
    expect(text(n.body)).toBe('삼성전자 10주 · 71,400원');
    expect(n.body[0]).toEqual({ stock: { code: '005930', name: '삼성전자' } });
  });

  it('대기 접수 — 지정가, 링크 없음', () => {
    const n = orderResultNotice(result({ status: 'PENDING', order_side: 'BUY', fill_price: null }));
    expect(text(n.title)).toBe('매수 대기');
    expect(n.body).toEqual(['삼성전자 10주 · 71,000원에 대기 중']);
  });

  it('응답으로 거절 · 에러는 주문 실패', () => {
    const n = orderResultNotice(result({ status: 'REJECTED', message: '잔고가 부족해요.' }));
    expect(n.tone).toBe('FAIL');
    expect(text(n.title)).toBe('주문 실패');
    expect(text(n.body)).toBe('잔고가 부족해요.');
    expect(failedNotice('로그인이 필요해요.').body).toEqual(['로그인이 필요해요.']);
  });

  it('대기 취소 — 매수 · 매도 색 띠, 실패는 회색', () => {
    const n = cancelledNotice(result({ order_side: 'BUY' }));
    expect(n.tone).toBe('BUY');
    expect(text(n.title)).toBe('대기 취소');
    expect(text(n.body)).toBe('삼성전자 10주 매수 대기를 취소했어요');
    const failed = cancelFailedNotice('취소할 수 있는 대기 주문이 없습니다.');
    expect(failed.tone).toBe('FAIL');
    expect(text(failed.title)).toBe('취소 실패');
  });

  it('나중 체결 — 체결가를 모르면 지정가를 적지 않고 뺀다', () => {
    expect(text(laterNotice(later()).body)).toBe('삼성전자 10주 · 71,400원');
    expect(text(laterNotice(later({ fill_price: null })).body)).toBe('삼성전자 10주');
    expect(text(laterNotice(later({ currency: 'USD', stock_name: '애플', fill_price: 228.86 })).body)).toBe('애플 10주 · $228.86');
  });

  it('해외 카드는 서버가 준 환율로 원화 — 체결 · 대기 접수 · 나중 체결', () => {
    const usd = { currency: 'USD', stock_name: '애플', usd_krw: 1400 } as const;
    expect(text(orderResultNotice(result({ ...usd, fill_price: 228.86 })).body)).toBe('애플 10주 · 320,404원');
    expect(text(orderResultNotice(result({ ...usd, status: 'PENDING', price: 228.86, fill_price: null })).body)).toBe('애플 10주 · 320,404원에 대기 중');
    expect(text(laterNotice(later({ ...usd, fill_price: 228.86 })).body)).toBe('애플 10주 · 320,404원');
  });

  it('나중 거절 — 실시간은 실제 이유, 놓친 목록(reason null)은 정해진 문장. 회색 띠', () => {
    const live = laterNotice(later({ status: 'REJECTED', reason: '잔고가 부족합니다.' }));
    expect(live.tone).toBe('FAIL');
    expect(text(live.title)).toBe('대기 주문 거절');
    expect(text(live.body)).toBe('삼성전자 10주 매수 — 잔고가 부족합니다.');
    expect(text(laterNotice(later({ status: 'REJECTED' })).body)).toBe('삼성전자 10주 매수 — 잔고 또는 보유 수량이 부족해 체결되지 못했어요');
  });

  it('나중 만료 — 거절과 다른 제목 · 문장, 회색 띠', () => {
    const n = laterNotice(later({ status: 'EXPIRED', fill_price: null }));
    expect(n.tone).toBe('FAIL');
    expect(text(n.title)).toBe('대기 주문 만료');
    expect(text(n.body)).toBe('삼성전자 10주 매수 — 장이 끝날 때까지 체결되지 않았어요');
  });

  it('놓친 것이 3개까지면 그대로, 4개부터는 「그 밖에」 한 장 + 가장 최근 3개', () => {
    const list = (n: number) => Array.from({ length: n }, (_, i) => later({ order_id: String(i), quantity: i + 1 }));
    expect(missedNotices(list(3)).map((c) => text(c.body))).toEqual(['삼성전자 1주 · 71,400원', '삼성전자 2주 · 71,400원', '삼성전자 3주 · 71,400원']);
    const many = missedNotices(list(5));
    expect(many.map((c) => text(c.body))).toEqual(['그 밖에 대기 주문 2건이 체결 · 거절 · 만료됐어요', '삼성전자 3주 · 71,400원', '삼성전자 4주 · 71,400원', '삼성전자 5주 · 71,400원']);
    expect(many[0].summary).toBe(true);
    expect(missedNotices([])).toEqual([]);
  });
});

describe('알림 통로', () => {
  const flush = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  };
  /** 열어 둔 스트림 — push 로 이벤트를 보낸다 */
  function sse() {
    let c!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start: (x) => { c = x; } });
    return {
      res: new Response(body, { status: 200 }),
      push: (d: unknown) => c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(d)}\n\n`)),
      end: () => c.close(),
    };
  }

  let unread: OrderNotification[];
  let getSpy: ReturnType<typeof vi.spyOn>;
  let postSpy: ReturnType<typeof vi.spyOn>;
  const bodies = () => getNotices().map((n) => text(n.body));

  beforeEach(() => {
    unread = [];
    vi.stubGlobal('window', globalThis);
    getSpy = vi.spyOn(api, 'get').mockImplementation(async () => ({ data: { data: unread } }));
    postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { read: 0 } } });
  });
  afterEach(() => {
    clearNotices();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('열리면 놓친 알림을 띄우고 바로 보여줬음 표시, 내 토큰으로', async () => {
    const s = sse();
    const fetchMock = vi.fn().mockResolvedValue(s.res);
    vi.stubGlobal('fetch', fetchMock);
    unread = [later({ order_id: '7' }), later({ order_id: '8', quantity: 3 })];
    const stop = startOrderFeed('tok');
    await flush();
    stop();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/notifications\/stream$/);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    expect(getSpy).toHaveBeenCalledWith('/notifications/unread', { headers: { Authorization: 'Bearer tok' } });
    expect(bodies()).toEqual(['삼성전자 10주 · 71,400원', '삼성전자 3주 · 71,400원']);
    expect(postSpy).toHaveBeenCalledWith('/notifications/read', { order_ids: ['7', '8'] }, { headers: { Authorization: 'Bearer tok' } });
  });

  it('실시간 이벤트를 띄우고 보여줬음 표시 — 놓친 목록과 같은 주문은 한 번만', async () => {
    const s = sse();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(s.res));
    unread = [later({ order_id: '7' })];
    const stop = startOrderFeed('tok');
    await flush();
    s.push(later({ order_id: '7' }));
    s.push(later({ order_id: '9', quantity: 2 }));
    s.push({ type: 'ping' });
    await flush();
    stop();
    expect(bodies()).toEqual(['삼성전자 10주 · 71,400원', '삼성전자 2주 · 71,400원']);
    expect(postSpy).toHaveBeenCalledTimes(2);
    expect(postSpy).toHaveBeenLastCalledWith('/notifications/read', { order_ids: ['9'] }, expect.anything());
  });

  it('놓친 것 · 실시간 모두 화면에 한 번씩 전한다 — 끊으면 안 온다', async () => {
    const s = sse();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(s.res));
    unread = [later({ order_id: '7' })];
    const heard: string[] = [];
    const off = subscribeOrderEvents((n) => heard.push(n.order_id));
    const stop = startOrderFeed('tok');
    await flush();
    s.push(later({ order_id: '7' }));
    s.push(later({ order_id: '9' }));
    s.push({ type: 'ping' });
    await flush();
    off();
    s.push(later({ order_id: '11' }));
    await flush();
    stop();
    expect(heard).toEqual(['7', '9']);
  });

  it('끊겼다 다시 이으면 놓친 것을 또 받되 이미 띄운 것은 다시 안 띄운다', async () => {
    vi.useFakeTimers();
    const first = sse();
    const second = sse();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(first.res).mockResolvedValueOnce(second.res));
    unread = [later({ order_id: '7' })];
    const stop = startOrderFeed('tok');
    await vi.advanceTimersByTimeAsync(0);
    unread = [later({ order_id: '7' }), later({ order_id: '10', quantity: 4 })];
    first.end();
    await vi.advanceTimersByTimeAsync(1100);
    stop();
    expect(getSpy).toHaveBeenCalledTimes(2);
    expect(bodies()).toEqual(['삼성전자 10주 · 71,400원', '삼성전자 4주 · 71,400원']);
  });

  it('닫은 뒤 도착한 놓친 목록은 띄우지도 표시하지도 않는다', async () => {
    const s = sse();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(s.res));
    let answer!: (v: unknown) => void;
    getSpy.mockImplementation(() => new Promise((r) => { answer = r; }));
    const stop = startOrderFeed('tok');
    await flush();
    stop();
    answer({ data: { data: [later()] } });
    await flush();
    expect(getNotices()).toEqual([]);
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('로그인이 풀리면(401) 다시 잇지 않고 조용히 멈춘다', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const stop = startOrderFeed('tok');
    await vi.advanceTimersByTimeAsync(60_000);
    stop();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getSpy).not.toHaveBeenCalled();
    expect(getNotices()).toEqual([]);
  });
});

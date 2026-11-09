import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { krwRate } from './format';
import { krwInputToUsd, orderMoney, usdToKrwInput } from './orderKrw';
import { PendingOrderList } from './components/PendingOrders';
import type { PendingOrder } from './api';

const RATE = 1363;

describe('krwRate', () => {
  it('해외는 머리 원화 ÷ 달러', () => {
    expect(krwRate({ market: 'FOREIGN', current_price: 100, current_price_krw: 136300 })).toBe(RATE);
  });
  it('국내 · 원화 없음 · 시세 없음은 null', () => {
    expect(krwRate({ market: 'DOMESTIC', current_price: 70000, current_price_krw: 70000 })).toBeNull();
    expect(krwRate({ market: 'FOREIGN', current_price: 100 })).toBeNull();
    expect(krwRate({ market: 'FOREIGN', current_price: 100, current_price_krw: 0 })).toBeNull();
    expect(krwRate({ market: 'FOREIGN', current_price: 0, current_price_krw: 136300 })).toBeNull();
  });
});

describe('orderMoney', () => {
  it('환율이 있는 해외는 원화 정수', () => {
    expect(orderMoney(186.65, 'USD', RATE)).toBe('254,404원');
  });
  it('환율이 없으면 달러로 되돌린다', () => {
    expect(orderMoney(186.65, 'USD', null)).toBe('$186.65');
  });
  it('국내는 그대로', () => {
    expect(orderMoney(70000, 'KRW', null)).toBe('70,000원');
  });
});

describe('원화 입력 ↔ 달러', () => {
  it('원화를 0.01달러 단위 달러로 바꾼다', () => {
    expect(krwInputToUsd('254404', RATE)).toBe('186.65');
    expect(krwInputToUsd('254410', RATE)).toBe('186.65'); // 가장 가까운 0.01달러
  });
  it('칸에는 그 달러의 원화를 보여 준다 — 입력과 몇 원 다를 수 있다', () => {
    expect(usdToKrwInput(krwInputToUsd('254410', RATE), RATE)).toBe('254404');
  });
  it('호가의 달러 값은 원화로 그대로 왕복한다', () => {
    const shown = usdToKrwInput('186.65', RATE);
    expect(krwInputToUsd(shown, RATE)).toBe('186.65');
  });
  it('빈 값 · 0 · 0달러가 되는 작은 값은 가격 없음', () => {
    expect(krwInputToUsd('', RATE)).toBe('');
    expect(krwInputToUsd('0', RATE)).toBe('');
    expect(krwInputToUsd('5', RATE)).toBe('');
    expect(usdToKrwInput('', RATE)).toBe('');
  });
});

describe('대기 주문 목록 가격', () => {
  const row: PendingOrder = {
    order_id: '1',
    order_side: 'BUY',
    order_type: 'LIMIT',
    quantity: 10,
    price: 186.65,
    currency: 'USD',
    created_at: '2026-11-09T10:00:00Z',
  } as unknown as PendingOrder;
  const render = (krwRateValue: number | null) =>
    renderToStaticMarkup(
      createElement(PendingOrderList, {
        orders: { rows: [row], failed: false },
        krwRate: krwRateValue,
        onChanged: async () => {},
      }),
    );

  it('해외는 원화로, 마우스를 올리면 실제 달러', () => {
    const html = render(RATE);
    expect(html).toContain('>254,404원<');
    expect(html).toContain('title="$186.65"');
  });
  it('환율이 없으면 달러', () => {
    expect(render(null)).toContain('>$186.65<');
  });
});

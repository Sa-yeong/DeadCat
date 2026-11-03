/**
 * 미리보기 전용 가짜 백엔드 — 서버 없이 HTML 한 장으로 화면을 열기 위해.
 * 앱에는 들어가지 않는다(preview/ 폴더에만 있다). 2026-10-27.
 *
 * 하는 일 두 가지 —
 *   1) axios 가 서버로 나가지 않고 여기서 만든 응답을 받게 한다(api.defaults.adapter 교체)
 *   2) 3D 캐릭터 파일(./characters/...)을 HTML 안에 넣어 둔 것으로 돌려준다(fetch 가로채기)
 *      — 파일을 더블클릭해 열면 브라우저가 옆 파일을 못 읽기 때문
 *
 * 시세는 종목 코드마다 고정된 난수로 만든다(열 때마다 같은 모양).
 *   일봉 약 10년치 → 주·월·년봉은 일봉을 묶어서 만든다. 분봉은 마지막 거래일 하루치.
 *   현재가는 2초 조회 때마다 한두 호가씩 움직인다 — 마지막 봉·지표가 따라 바뀌는지 보려고.
 *
 * 실제 서버와 다른 점: 일봉이 10년치 있다(실제 DB 는 약 100일), 호가·거래량·기업정보·커뮤니티는 그럴듯한 가짜.
 */
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { api } from '../src/api/axios';
import type { Candle, Timeframe } from '../src/page/stockDetail/types';
import { PREVIEW_ASSETS } from 'virtual:dc-preview-assets';

/* ── 3D 파일 ─────────────────────────────────────────────── */

const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const m = /characters\/(.+)$/.exec(url);
  const packed = m ? PREVIEW_ASSETS[decodeURIComponent(m[1])] : undefined;
  if (!packed) return realFetch(input, init);
  // gzip 으로 줄여 넣어 둔 것을 풀어서 돌려준다
  return realFetch(packed).then(
    (r) =>
      new Response(r.body!.pipeThrough(new DecompressionStream('gzip')), {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
  );
};

/* ── 난수 ─────────────────────────────────────────────── */

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

/** 국내 호가 단위 */
function tick(p: number) {
  if (p < 2000) return 1;
  if (p < 5000) return 5;
  if (p < 20000) return 10;
  if (p < 50000) return 50;
  if (p < 200000) return 100;
  if (p < 500000) return 500;
  return 1000;
}
const toTick = (p: number) => Math.max(tick(p), Math.round(p / tick(p)) * tick(p));

/* ── 종목 ─────────────────────────────────────────────── */

const STOCKS: { code: string; name: string; price: number }[] = [
  { code: '005930', name: '삼성전자', price: 71000 },
  { code: '000660', name: 'SK하이닉스', price: 182000 },
  { code: '005380', name: '현대차', price: 238000 },
  { code: '035420', name: 'NAVER', price: 189000 },
  { code: '035720', name: '카카오', price: 43000 },
  { code: '373220', name: 'LG에너지솔루션', price: 381000 },
  { code: '068270', name: '셀트리온', price: 176000 },
  { code: '000270', name: '기아', price: 97000 },
  { code: '005490', name: 'POSCO홀딩스', price: 352000 },
  { code: '105560', name: 'KB금융', price: 78000 },
];
const info = (code: string) => STOCKS.find((s) => s.code === code) ?? { code, name: '미리보기 종목', price: 50000 };

/* ── 봉 만들기 ─────────────────────────────────────────── */

const DAY_MS = 86400000;
const KST_MS = 9 * 3600000;
/** 한국 날짜(자정 UTC 로 표시) — 일봉 write_time 이 'UTC 자정 = 그날' 형식이라 맞춘다 */
const kstDay = (ms: number) => Math.floor((ms + KST_MS) / DAY_MS) * DAY_MS;
const isWeekday = (dayMs: number) => {
  const d = new Date(dayMs).getUTCDay();
  return d !== 0 && d !== 6;
};

interface Series {
  day: Candle[];
  minute: Candle[];
  /** 지금가 — 조회할 때마다 움직인다 */
  live: number;
  prevClose: number;
}
const cache = new Map<string, Series>();

function build(code: string): Series {
  const hit = cache.get(code);
  if (hit) return hit;
  const r = seeded(hash(code));
  const { price } = info(code);

  // 거래일 목록 — 오늘(주말이면 금요일)까지 약 10년
  const days: number[] = [];
  for (let d = kstDay(Date.now()); days.length < 2500; d -= DAY_MS) if (isWeekday(d)) days.unshift(d);

  // 로그 수익률을 쌓아 가격 경로를 만들고, 마지막 값이 기준 가격이 되게 맞춘다
  const steps = days.map((_, i) => 0.0002 + 0.017 * gauss(r) + 0.004 * Math.sin(i / 37));
  let acc = 0;
  const logs = steps.map((s) => (acc += s));
  const shift = Math.log(price) - logs[logs.length - 1];
  const closes = logs.map((l) => toTick(Math.exp(l + shift)));

  const day: Candle[] = days.map((d, i) => {
    const close = closes[i];
    const open = toTick((i ? closes[i - 1] : close) * (1 + 0.006 * gauss(r)));
    const high = toTick(Math.max(open, close) * (1 + Math.abs(0.008 * gauss(r))));
    const low = toTick(Math.min(open, close) * (1 - Math.abs(0.008 * gauss(r))));
    return {
      write_time: new Date(d).toISOString(),
      open_price: open,
      close_price: close,
      high_price: Math.max(high, open, close),
      low_price: Math.min(low, open, close),
      volume: Math.round(2e6 * (0.5 + r()) * (1 + Math.abs(steps[i]) * 30)),
    };
  });

  // 분봉 — 마지막 거래일 09:00 ~ (오늘이면 지금, 아니면 15:30)
  const last = day[day.length - 1];
  const lastDay = Date.parse(last.write_time);
  const openMs = lastDay - KST_MS + 9 * 3600000; // 그날 09:00 KST
  const nowMin = Math.floor((Date.now() - openMs) / 60000);
  const n = lastDay === kstDay(Date.now()) ? Math.max(1, Math.min(390, nowMin + 1)) : 390;
  const walk: number[] = [last.open_price];
  for (let i = 1; i < n; i++) walk.push(walk[i - 1] * (1 + 0.0015 * gauss(r)));
  // 마지막 분봉이 일봉 종가에 닿도록 기울기를 나눠 준다
  const drift = (last.close_price - walk[n - 1]) / Math.max(1, n - 1);
  const minute: Candle[] = walk.map((p, i) => {
    const close = toTick(p + drift * i);
    const open = i ? toTick(walk[i - 1] + drift * (i - 1)) : last.open_price;
    return {
      write_time: new Date(openMs + i * 60000).toISOString(),
      open_price: open,
      close_price: close,
      high_price: toTick(Math.max(open, close) * (1 + 0.0007 * r())),
      low_price: toTick(Math.min(open, close) * (1 - 0.0007 * r())),
      volume: Math.round(20000 * (0.3 + r())),
    };
  });

  const s: Series = { day, minute, live: last.close_price, prevClose: day[day.length - 2].close_price };
  cache.set(code, s);
  return s;
}

/** 일봉을 주·월·년으로 묶는다. 봉의 시각은 그 구간의 첫 거래일 */
function group(day: Candle[], keyOf: (d: Date) => string): Candle[] {
  const out: Candle[] = [];
  let key = '';
  for (const c of day) {
    const k = keyOf(new Date(c.write_time));
    const cur = out[out.length - 1];
    if (k !== key || !cur) {
      key = k;
      out.push({ ...c });
      continue;
    }
    cur.close_price = c.close_price;
    cur.high_price = Math.max(cur.high_price, c.high_price);
    cur.low_price = Math.min(cur.low_price, c.low_price);
    cur.volume = (cur.volume ?? 0) + (c.volume ?? 0);
  }
  return out;
}
const weekKey = (d: Date) => String(Math.floor((d.getTime() / DAY_MS + 3) / 7)); // 월요일 시작
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
const yearKey = (d: Date) => String(d.getUTCFullYear());

/** 지금가를 반영한 봉 목록 — 마지막 봉의 종가·고가·저가를 지금가에 맞춘다 */
function chart(code: string, tf: Timeframe): Candle[] {
  const s = build(code);
  const base =
    tf === '1M'
      ? s.minute
      : tf === 'DAY'
        ? s.day
        : tf === 'WEEK'
          ? group(s.day, weekKey)
          : tf === 'MONTH'
            ? group(s.day, monthKey)
            : group(s.day, yearKey);
  const list = base.map((c) => ({ ...c }));
  const last = list[list.length - 1];
  last.close_price = s.live;
  last.high_price = Math.max(last.high_price, s.live);
  last.low_price = Math.min(last.low_price, s.live);
  return list;
}

/** 조회할 때마다 한두 호가씩 움직인다 */
function move(code: string) {
  const s = build(code);
  const r = Math.random();
  const steps = r < 0.35 ? 0 : r < 0.65 ? 1 : r < 0.95 ? -1 : (Math.random() < 0.5 ? 2 : -2);
  s.live = toTick(s.live + steps * tick(s.live));
}

const rate = (code: string) => {
  const s = build(code);
  return Math.round(((s.live - s.prevClose) / s.prevClose) * 10000) / 100;
};

/* ── 응답 ─────────────────────────────────────────────── */

function basic(code: string) {
  move(code);
  const s = build(code);
  return {
    stock_code: code,
    stock_name: info(code).name,
    logo_url: null,
    current_price: s.live,
    change_rate: rate(code),
    market: 'DOMESTIC',
    is_favorite: code === '005930' || code === '000660',
    is_event: false,
    tick_rule: 'KRX_STOCK',
    market_open: true,
  };
}

function orderbook(code: string) {
  const p = build(code).live;
  const t = tick(p);
  const q = () => Math.round(500 + Math.random() * 30000);
  return {
    stock_code: code,
    asks: Array.from({ length: 10 }, (_, i) => ({ price: p + t * (i + 1), quantity: q() })),
    bids: Array.from({ length: 10 }, (_, i) => ({ price: p - t * i, quantity: q() })),
  };
}

function volume(code: string) {
  const s = build(code);
  const today = s.day[s.day.length - 1];
  return {
    stock_code: code,
    total_volume: today.volume ?? 0,
    total_trading_value: (today.volume ?? 0) * s.live,
    volume_graph: s.minute.slice(-60).map((c) => ({ write_time: c.write_time, volume: c.volume ?? 0 })),
  };
}

function ranking() {
  return STOCKS.map((st, i) => {
    const s = build(st.code);
    const v = s.day[s.day.length - 1].volume ?? 0;
    return {
      rank: i + 1,
      stock_code: st.code,
      stock_name: st.name,
      change_rate: rate(st.code),
      character_img_url: null,
      is_favorite: st.code === '005930' || st.code === '000660',
      market: 'DOMESTIC',
      current_price: s.live,
      trading_value: v * s.live,
      trading_value_krw: v * s.live,
    };
  });
}

const DAY = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString();
const writer = (id: string, nickname: string) => ({ user_id: id, nickname, profile_img_url: null });

function posts() {
  const list = [
    { content: '오늘 장 분위기 어떻게 보세요? 이평선 정배열 들어가는 중인 듯', likes: 12, comments: 3 },
    { content: '볼린저 밴드 상단 터치했네요. 여기서 더 갈지 모르겠음', likes: 5, comments: 1 },
    { content: '물타기 그만하고 싶다…', likes: 31, comments: 7 },
    { content: 'RSI 70 넘었는데 다들 익절하셨나요', likes: 8, comments: 2 },
    { content: '장기 보유 3년째. 캐릭터가 다크서클 생겼어요 ㅋㅋ', likes: 44, comments: 5 },
  ].map((p, i) => ({
    post_id: String(100 - i),
    content: p.content,
    write_time: DAY(i * 0.3),
    writer: writer(String(10 + i), ['적립식개미', '단타의신', '존버왕', '차트쟁이', '배당러'][i]),
    like_count: p.likes,
    comment_count: p.comments,
    is_liked: i === 2,
    vote: null as unknown,
  }));
  list.splice(1, 0, {
    post_id: '101',
    content: '이번 주 마감 때 어디 있을까?',
    write_time: DAY(0.1),
    writer: writer('30', '투표장인'),
    like_count: 3,
    comment_count: 0,
    is_liked: false,
    vote: {
      vote_id: '7',
      state: true,
      end_date: DAY(-3),
      total_voters: 52,
      options: [
        { option_no: 1, option_text: '지금보다 위', vote_count: 29, percentage: 55.8 },
        { option_no: 2, option_text: '지금보다 아래', vote_count: 23, percentage: 44.2 },
      ],
    },
  });
  return { posts: list, next_cursor: null, has_more: false };
}

function comments() {
  return {
    comments: [
      { comment_id: '1', content: '저도 같은 생각이에요', write_time: DAY(0.05), writer: writer('11', '단타의신') },
      { comment_id: '2', content: '조금 더 지켜봐야 할 듯', write_time: DAY(0.04), writer: writer('12', '존버왕') },
      { comment_id: '3', content: 'ㅋㅋㅋ 공감', write_time: DAY(0.02), writer: writer('13', '차트쟁이') },
    ],
    next_cursor: null,
    has_more: false,
  };
}

function route(url: string, params: Record<string, string> | undefined): unknown {
  const m = /^\/stocks\/([^/]+)(\/.*)?$/.exec(url);
  if (url === '/stocks/ranking') return ranking();
  if (/^\/posts\/[^/]+\/comments$/.test(url)) return comments();
  if (!m) return undefined;
  const code = decodeURIComponent(m[1]);
  const rest = m[2] ?? '';
  switch (rest) {
    case '':
      return basic(code);
    case '/orderbook':
      return orderbook(code);
    case '/chart':
      return chart(code, (params?.timeframe as Timeframe) ?? 'DAY');
    case '/volume-summary':
      return volume(code);
    case '/company-info/summary': {
      const p = build(code).live;
      const day = build(code).day;
      const year = day.slice(-250);
      return {
        stock_code: code,
        market_cap: p * 5_969_782_550,
        market_cap_krw: p * 5_969_782_550,
        per: 14.2,
        pbr: 1.31,
        dividend_yield: 1.98,
        week52_high: Math.max(...year.map((c) => c.high_price)),
        week52_low: Math.min(...year.map((c) => c.low_price)),
      };
    }
    case '/company-info/financials':
      return [2021, 2022, 2023, 2024, 2025].map((y, i) => ({
        year: y,
        revenue: (240 + i * 18 - (i === 2 ? 40 : 0)) * 1e12,
        operating_profit: (40 - (i === 2 ? 33 : 0) + i * 3) * 1e12,
      }));
    case '/company-info/scores':
      return { growth: 62, profitability: 71, stability: 88, dividend: 45, activity: 93 };
    case '/company-info/overview':
      return {
        stock_code: code,
        dividend_per: 1444,
        dividend_cycle: '분기',
        ex_dividend_date: null,
        dividend_pay_date: null,
        description: '미리보기용 가짜 기업 개요입니다. 실제 서버에 연결하면 DB 에 있는 개요가 보입니다.',
        tags: ['반도체', '전자'],
      };
    case '/posts':
      return posts();
    default:
      return undefined;
  }
}

const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  await new Promise((res) => setTimeout(res, 60 + Math.random() * 80));
  const url = (config.url ?? '').replace(/^https?:\/\/[^/]+/, '');
  const data = (config.method ?? 'get').toLowerCase() === 'get' ? route(url, config.params) : undefined;
  if (data === undefined) {
    // 없는 주소 — 앱 쪽은 404 를 '없는 종목'으로 본다
    throw Object.assign(new Error(`미리보기에 없는 API: ${config.method} ${url}`), { response: { status: 404 }, config });
  }
  const res: AxiosResponse = { data: { success: true, data }, status: 200, statusText: 'OK', headers: {}, config, request: {} };
  return res;
};
api.defaults.adapter = adapter;

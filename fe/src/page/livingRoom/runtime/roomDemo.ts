import type { ForceMeet } from '../engine/matcher';

/**
 * **데모 거실 연출(졸프 데모 영상)** — 데모 계정이 연출 거실(서버 DEMO_ROOM_USER_IDS, demo1)을 볼 때만 켜진다.
 * 내 거실이든 놀러 간 거실이든 거실 주인으로 판단 — demo2 로 녹화하다 demo1 거실을 잠깐 보여 줄 수 있게.
 *  · 네이버(035420)는 돌아다니지 않고 제자리에서 tired 모션(우울해 가만히)을 계속 튼다.
 *    감정 tired 는 서버가 준다(데모 계정 거실의 네이버 — backend demo-scenario.ts DEMO_ROOM_EMOTIONS)
 *  · 엔비디아(NVDA)가 네이버를 만나면 감정과 상관없이 늘 놀리기 — basic_meet_tired 규칙의 놀리기 효과(tease_find → tease).
 *    규칙 쿨다운(15초)은 그대로 지킨다
 * 종목 코드로 적고, 캐릭터 id(stock_id)는 거실에 선 캐릭터에서 찾는다.
 */
const STILL_IDLE: Readonly<Record<string, string>> = { '035420': 'tired' };
const FORCED_MEETS: readonly { self: string; other: string; ruleId: string; effect: number }[] = [
  // basic_meet_tired 의 effect[1] = { self: [tease_find, tease], other: tired }
  { self: 'NVDA', other: '035420', ruleId: 'basic_meet_tired', effect: 1 },
];

export interface RoomDemo {
  /** 캐릭터 id → 제자리에서 계속 틀 모션(motions.json 이름) */
  stillIdle: ReadonlyMap<string, string>;
  forceMeet: ForceMeet;
  /** 트리거 버튼으로 보여 줄 만남(캐릭터 id) — 거실에 둘 다 있을 때만 */
  meet: { self: string; other: string } | null;
  /** 다음 한 번의 정해 둔 만남은 쿨다운을 보지 않는다(트리거 버튼) */
  arm(): void;
}

/** 거실 캐릭터(id · 종목 코드)로 데모 연출을 만든다 */
export function roomDemoOf(chars: readonly { id: string; stockCode: string }[]): RoomDemo {
  const idOf = new Map(chars.map((c) => [c.stockCode.toUpperCase(), c.id]));
  const stillIdle = new Map<string, string>();
  for (const [code, motion] of Object.entries(STILL_IDLE)) {
    const id = idOf.get(code);
    if (id) stillIdle.set(id, motion);
  }
  const meets = FORCED_MEETS.flatMap((m) => {
    const self = idOf.get(m.self);
    const other = idOf.get(m.other);
    return self && other ? [{ ...m, self, other }] : [];
  });
  let armed = false;
  return {
    stillIdle,
    meet: meets[0] ? { self: meets[0].self, other: meets[0].other } : null,
    arm: () => {
      armed = true;
    },
    forceMeet: (a, b) => {
      const m = meets.find((x) => (x.self === a && x.other === b) || (x.self === b && x.other === a));
      if (!m) return null;
      const ignoreCooldown = armed;
      armed = false;
      return { ruleId: m.ruleId, self: m.self, other: m.other, effect: m.effect, ...(ignoreCooldown ? { ignoreCooldown } : {}) };
    },
  };
}

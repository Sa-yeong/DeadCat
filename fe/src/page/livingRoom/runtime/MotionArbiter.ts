import type { ActName } from '../types';
import { MotionTable, type ActKind } from './MotionTable';

const RANK: Record<ActKind, number> = { common: 3, event: 2, interaction: 1, idle: 0 };

interface Playing {
  act: ActName;
  /** 한 번 재생이 끝나는 시각(ms). 0 = 끝이 없다(반복·공통) */
  until: number;
  rank: number;
}

/**
 * 같은 캐릭터에게 행동이 겹쳐 오면 높은 것을 남긴다 — 공통 > 사건 > 상호작용 > 대기.
 * {엔진 확정 전 — 잠정}
 *   · 대기 행동은 "돌아갈 자리"로 기억만 하고, 더 높은 행동이 도는 중이면 끼어들지 않는다.
 *   · 공통 행동(들림)은 끝이 없다 — release() 로 풀어야 대기로 돌아간다.
 */
export class MotionArbiter {
  private readonly playing = new Map<string, Playing>();
  private readonly idle = new Map<string, ActName>();
  private readonly play: (charId: string, act: ActName) => void;

  constructor(play: (charId: string, act: ActName) => void) {
    this.play = play;
  }

  submit(charId: string, act: ActName, now: number): void {
    const def = MotionTable.lookup(act);
    const rank = RANK[def.kind];
    const cur = this.playing.get(charId);
    const busy = cur !== undefined && cur.rank > 0 && (cur.until === 0 || cur.until > now);

    if (def.kind === 'idle') {
      this.idle.set(charId, act);
      if (busy) return; // 끝난 뒤에 tick() 이 이 대기 행동으로 돌려놓는다
    } else if (busy && cur && cur.rank > rank) {
      return;
    }
    this.playing.set(charId, { act, until: def.duration ? now + def.duration * 1000 : 0, rank });
    this.play(charId, act);
  }

  /** 돌아갈 대기 행동을 바꾼다 — 지금 도는 행동은 건드리지 않는다 */
  setIdle(charId: string, act: ActName): void {
    this.idle.set(charId, act);
  }

  /** 공통 행동을 풀고 대기로 돌린다 */
  release(charId: string): void {
    const back = this.idle.get(charId) ?? 'idle';
    this.playing.set(charId, { act: back, until: 0, rank: 0 });
    this.play(charId, back);
  }

  /** 끝난 한 번 재생을 대기 행동으로 되돌린다 */
  tick(now: number): void {
    for (const [id, cur] of this.playing) {
      if (cur.until && cur.until <= now) this.release(id);
    }
  }
}

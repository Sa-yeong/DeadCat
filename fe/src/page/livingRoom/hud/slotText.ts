import type { SlotDrawResult, SlotTimer } from '../types';
import { gradeLabel } from './labels';

/**
 * 슬롯머신 타이머 · 뽑기 결과의 글 (마무리 M-4) — 셈과 글만 모은 순수 함수. 그리기는 SlotMachine.tsx.
 * 타이머는 기계마다 하나(SlotTimer.readyAt — 이 브라우저 시계 ms, null 이면 지금 뽑을 수 있음). 판정은 서버가 한다 — 여기는 안내용
 */

/** 다음 뽑기까지 남은 ms — 0 이면 지금 뽑을 수 있다. 타이머를 모르면(옛 서버) 0 으로 보고 서버에 맡긴다 */
export function remainingMs(slot: SlotTimer | undefined, now: number): number {
  if (!slot || slot.readyAt === null) return 0;
  return Math.max(0, slot.readyAt - now);
}

/** 남은 시간 글자 — `5:59:12`(시:분:초, 초는 올림 — 0:00:00 이 보이는 순간이 곧 뽑을 수 있는 때) */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const READY_LABEL = '뽑기 가능';

/** 슬롯머신 위 글자 — 남은 시간 또는 「뽑기 가능」 */
export function timerLabel(slot: SlotTimer | undefined, now: number): string {
  const left = remainingMs(slot, now);
  return left > 0 ? formatRemaining(left) : READY_LABEL;
}

/** 아직 못 뽑는데 캐릭터를 놓았을 때 */
export const waitNotice = (ms: number): string => `아직 뽑을 수 없어요 — ${formatRemaining(ms)} 뒤에 뽑을 수 있어요`;

/** 결과 창 제목 */
export function drawTitle(r: Pick<SlotDrawResult, 'kind' | 'grade'>): string {
  if (r.kind === 'FIRST') return '첫 뽑기 — 기본 가구 패키지';
  return r.kind === 'FURNITURE' ? `${gradeLabel(r.grade)} 가구 팩` : `${gradeLabel(r.grade)} 아이템`;
}

/**
 * 결과 창의 가구 한 줄 — 팩으로 받은 가구는 낱개로 늘어놓지 않고 「가구 팩 (노말)」 한 묶음으로만 보인다(보관함에는 낱개로 들어감).
 * 등급 = 팩 등급(첫 뽑기는 서버가 노말 팩 등급을 grade 로 준다). 가구를 안 받았으면 null
 */
export function packLabel(r: Pick<SlotDrawResult, 'kind' | 'grade' | 'furniture'>): string | null {
  if (r.kind === 'ITEM' || r.furniture.length === 0) return null;
  return `가구 팩 (${gradeLabel(r.grade)})`;
}

/** 결과 창 아래 안내 — 받은 것이 어디로 들어갔는지 */
export function drawHint(r: Pick<SlotDrawResult, 'furniture' | 'item'>): string {
  const furniture = r.furniture.length > 0;
  if (furniture && r.item) return '가구는 배치 보관함에, 아이템은 아이템 탭에 들어갔어요';
  if (furniture) return '받은 가구는 배치 보관함에 들어갔어요 — 배치에서 꺼내 놓을 수 있어요';
  if (r.item) return '받은 아이템은 아이템 탭에서 캐릭터에게 끌어다 줄 수 있어요';
  // 아이템 데이터가 DB 에 전혀 없을 때만(서버가 아이템 없이 진행)
  return '이번에는 받은 것이 없어요 — 아이템이 아직 준비 중이에요';
}

/** 레버 · 릴 한 판이 끝날 때까지(RoomScene SLOT — 마지막 릴 1.9초 + 튕김 0.25초) 기다렸다가 결과를 띄운다 */
export const SLOT_SPIN_MS = 2300;
/** 못 뽑을 때 안내가 떠 있는 시간 */
export const SLOT_NOTE_MS = 2600;

export interface SlotNote {
  placementId: number;
  text: string;
  key: number;
}

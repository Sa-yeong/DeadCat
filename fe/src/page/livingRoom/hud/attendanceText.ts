import type { AttendanceClaim, AttendanceState } from '../types';

/**
 * 출석 창의 글 — 보상이 아이템인지 가구(첫 슬롯머신, 마무리 M-3)인지에 따라 달라지는 것만 모았다.
 * 슬롯머신이 한 대도 없는 계정은 그날 칸의 아이템 대신 슬롯머신을 받고, 그것은 보관함(배치 모드)에 들어간다
 */

/** 이름 끝 글자에 받침이 있는가 — 한글이 아니면 없다고 본다(조사 고르기용) */
const endsWithBatchim = (name: string): boolean => {
  const code = name.charCodeAt(name.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
};

/** 방금 받은 보상 안내 */
export function claimNotice(r: Pick<AttendanceClaim, 'rewardItem' | 'rewardFurniture'>): string {
  if (r.rewardFurniture) return `${r.rewardFurniture.name}${endsWithBatchim(r.rewardFurniture.name) ? '을' : '를'} 보관함에 넣었어요 — 배치에서 꺼내 놓을 수 있어요`;
  if (r.rewardItem) return `${r.rewardItem.name} ×${r.rewardItem.quantity}를 보유 아이템에 넣었어요`;
  // 그 등급 아이템이 DB 에 아직 없으면 출석만 기록된다(아이템 데이터 보류)
  return '출석했어요 — 이 칸의 보상 아이템은 아직 준비 중이에요';
}

/** 창 아래 안내 — 받은 직후 · 받기 전(오늘이 슬롯머신인 날) · 평소 */
export function attendanceHint(st: Pick<AttendanceState, 'claimedToday' | 'todayFurniture'> | null, got: Pick<AttendanceClaim, 'rewardItem' | 'rewardFurniture'> | null): string {
  const itemTip = '받은 아이템은 아이템 탭에서 캐릭터에게 끌어다 줄 수 있어요';
  if (got) return got.rewardFurniture ? claimNotice(got) : `${claimNotice(got)} · ${itemTip}`;
  if (st && !st.claimedToday && st.todayFurniture) return `오늘 보상은 ${st.todayFurniture.name}${endsWithBatchim(st.todayFurniture.name) ? '이에요' : '예요'} — 받으면 배치 보관함에 들어가요`;
  return itemTip;
}

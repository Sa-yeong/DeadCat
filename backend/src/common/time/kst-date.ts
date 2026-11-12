// 한국 시간(KST, UTC+9) 기준 날짜. 서버 시간대와 상관없이 같은 결과를 낸다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 그 순간의 KST 날짜 'YYYY-MM-DD' */
export function kstDateString(at: Date = new Date()): string {
    return new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 그 순간의 KST 날짜를 `@db.Date` 칸에 넣을 값으로(그 날짜의 UTC 자정).
 * Prisma는 Date 칸을 UTC 날짜 부분으로 읽고 쓰므로, 읽은 값과 `getTime()`으로 바로 비교할 수 있다
 */
export function kstDateOnly(at: Date = new Date()): Date {
    return new Date(`${kstDateString(at)}T00:00:00.000Z`);
}

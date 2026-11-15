import { Injectable } from '@nestjs/common';

/** 데모 동작을 받는 종목 — 엔비디아 · 네이버 */
export const DEMO_STOCK_CODES: readonly string[] = ['NVDA', '035420'];

/**
 * **데모 계정(졸프 데모 영상용)** — 서버 환경변수 DEMO_USER_IDS(쉼표로 나눈 users.id)로 정한다.
 * 목록이 비어 있으면 어떤 계정도 데모가 아니다 → 모든 데모 동작이 꺼지고 원래 동작과 같다.
 * 환경변수는 서버를 켤 때 한 번 읽는다(바꾸면 pm2 restart).
 */
@Injectable()
export class DemoService {
    private readonly ids: ReadonlySet<string>;

    constructor() {
        this.ids = parseDemoUserIds(process.env.DEMO_USER_IDS);
    }

    /** 이 사용자가 데모 계정인가 — 비로그인(null · undefined)은 아니다 */
    isDemoUser(userId: bigint | string | null | undefined): boolean {
        return userId != null && this.ids.has(String(userId));
    }

    /** 이 사용자의 이 종목에 데모 동작을 적용하는가 */
    isDemoStock(
        userId: bigint | string | null | undefined,
        stockCode: string,
    ): boolean {
        return (
            this.isDemoUser(userId) &&
            DEMO_STOCK_CODES.includes(stockCode.toUpperCase())
        );
    }
}

/** "12, 34 ,," → {12, 34}. 숫자가 아닌 칸은 버린다 */
export function parseDemoUserIds(raw: string | undefined): Set<string> {
    return new Set(
        (raw ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter((s) => /^\d+$/.test(s))
            .map((s) => String(BigInt(s))),
    );
}

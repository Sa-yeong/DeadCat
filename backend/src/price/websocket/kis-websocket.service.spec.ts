// 해외 실시간 체결 — 지금 열린 장의 체결만 받고, 애프터 등락은 오늘 정규장 기준
jest.mock(
    'src/providers/kis/kis.provider',
    () => ({
        signedChange: (sign: string, value: string) =>
            sign === '5' ? -Math.abs(Number(value)) : Math.abs(Number(value)),
    }),
    { virtual: true },
);
jest.mock(
    'src/providers/database/prisma.service',
    () => ({ PrismaService: class {} }),
    { virtual: true },
);
jest.mock('../price.service', () => ({ PriceService: class {} }));

import {
    isTickOfSession,
    KisWebSocketService,
} from './kis-websocket.service';
import type { ForeignSession } from '../../modules/character-engine/service/market-time.service';

/** HDFSCNT0 한 건 — 0 실시간코드 · 1 종목 · 11 현재가 · 12 부호 · 13 전일대비 · 14 등락률 */
const tick = (rsym: string, price: string) => {
    const f = Array.from({ length: 15 }, () => '');
    f[0] = rsym;
    f[1] = 'TSLA';
    f[11] = price;
    f[12] = '2';
    f[13] = '1.39';
    f[14] = '0.39';
    return f.join('^');
};

function setup(session: ForeignSession, afterChange: object | null = null) {
    const writeSinglePrice = jest.fn().mockResolvedValue(undefined);
    const service = new KisWebSocketService(
        {
            writeSinglePrice,
            afterChangeOf: jest.fn().mockReturnValue(afterChange),
        } as never,
        {} as never,
        { foreignSession: () => session } as never,
    );
    const receive = (data: string) =>
        (
            service as unknown as {
                handleOverseasPriceMessage: (d: string) => Promise<void>;
            }
        ).handleOverseasPriceMessage(data);
    return { receive, writeSinglePrice };
}

describe('isTickOfSession', () => {
    it.each([
        ['RBAQTSLA', 'DAY', true],
        ['DNASTSLA', 'DAY', false],
        ['DNASTSLA', 'PRE', true],
        ['DNASTSLA', 'REGULAR', true],
        ['DNASTSLA', 'AFTER', true],
        ['RBAQTSLA', 'PRE', false],
        ['RBAQTSLA', 'CLOSED', false],
        ['DNASTSLA', 'CLOSED', false],
    ] as [string, ForeignSession, boolean][])(
        '%s · %s → %s',
        (rsym, session, ok) => {
            expect(isTickOfSession(rsym, session)).toBe(ok);
        },
    );
});

describe('해외 체결 반영', () => {
    it('프리마켓 체결도 현재가로 — KIS 등락 그대로(직전 정규장 종가 대비)', async () => {
        const { receive, writeSinglePrice } = setup('PRE');
        await receive(tick('DNASTSLA', '359.61'));
        expect(writeSinglePrice).toHaveBeenCalledWith('TSLA', {
            current_price: 359.61,
            change_rate: 0.39,
            change_price: 1.39,
        });
    });

    it('데이마켓에는 주간거래 체결만', async () => {
        const { receive, writeSinglePrice } = setup('DAY');
        await receive(tick('DNASTSLA', '359.61'));
        expect(writeSinglePrice).not.toHaveBeenCalled();
        await receive(tick('RBAQTSLA', '359.05'));
        expect(writeSinglePrice).toHaveBeenCalledTimes(1);
    });

    it('닫힌 시간 체결은 버린다', async () => {
        const { receive, writeSinglePrice } = setup('CLOSED');
        await receive(tick('DNASTSLA', '359.61'));
        expect(writeSinglePrice).not.toHaveBeenCalled();
    });

    it('애프터마켓 등락은 오늘 정규장 기준으로 바꾼다', async () => {
        const { receive, writeSinglePrice } = setup('AFTER', {
            change_rate: 0.5,
            change_price: 1.8,
        });
        await receive(tick('DNASTSLA', '361'));
        expect(writeSinglePrice).toHaveBeenCalledWith('TSLA', {
            current_price: 361,
            change_rate: 0.5,
            change_price: 1.8,
        });
    });

    it('애프터 기준을 아직 모르면 KIS 등락 그대로', async () => {
        const { receive, writeSinglePrice } = setup('AFTER', null);
        await receive(tick('DNASTSLA', '361'));
        expect(writeSinglePrice).toHaveBeenCalledWith(
            'TSLA',
            expect.objectContaining({ change_rate: 0.39 }),
        );
    });
});

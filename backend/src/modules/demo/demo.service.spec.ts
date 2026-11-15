import { DemoService, parseDemoUserIds } from './demo.service';

describe('데모 계정 판별', () => {
    const OLD = process.env.DEMO_USER_IDS;
    afterEach(() => {
        if (OLD === undefined) delete process.env.DEMO_USER_IDS;
        else process.env.DEMO_USER_IDS = OLD;
    });

    it('쉼표 목록을 읽고 빈 칸 · 숫자 아닌 칸은 버린다', () => {
        expect([...parseDemoUserIds(' 12, 034 ,,abc,')]).toEqual(['12', '34']);
        expect(parseDemoUserIds(undefined).size).toBe(0);
    });

    it('목록이 비어 있으면 아무도 데모가 아니다', () => {
        delete process.env.DEMO_USER_IDS;
        const d = new DemoService();
        expect(d.isDemoUser(1n)).toBe(false);
        expect(d.isDemoStock(1n, 'NVDA')).toBe(false);
    });

    it('데모 계정 + NVDA · 035420 만 데모 종목', () => {
        process.env.DEMO_USER_IDS = '7';
        const d = new DemoService();
        expect(d.isDemoUser(7n)).toBe(true);
        expect(d.isDemoUser('7')).toBe(true);
        expect(d.isDemoUser(8n)).toBe(false);
        expect(d.isDemoUser(null)).toBe(false);
        expect(d.isDemoStock(7n, 'nvda')).toBe(true);
        expect(d.isDemoStock(7n, '035420')).toBe(true);
        expect(d.isDemoStock(7n, '005930')).toBe(false);
        expect(d.isDemoStock(8n, 'NVDA')).toBe(false);
    });

    it('거실 연출은 DEMO_ROOM_USER_IDS 의 거실에서만 — 네이버만 tired', () => {
        process.env.DEMO_USER_IDS = '13,14';
        process.env.DEMO_ROOM_USER_IDS = '13';
        const d = new DemoService();
        expect(d.roomUserIds).toEqual(['13']);
        expect(d.roomEmotionOf('13', '035420')).toBe('tired');
        expect(d.roomEmotionOf(13n, '035420')).toBe('tired');
        expect(d.roomEmotionOf('13', 'NVDA')).toBeNull();
        expect(d.roomEmotionOf('14', '035420')).toBeNull(); // demo2 거실은 연출 없음
        expect(d.roomEmotionOf('2', '035420')).toBeNull();
        delete process.env.DEMO_ROOM_USER_IDS;
        expect(new DemoService().roomEmotionOf('13', '035420')).toBeNull(); // 비우면 꺼짐
    });
});

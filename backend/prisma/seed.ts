import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

// 임시 시드. 카테고리 값/배정은 추후 변경 가능(성격기반 분류 검토중).
// upsert(id 기준)라 여러 번 돌려도 안전.
const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// 카테고리(업종 6개, 임시)
const categories = [
    { id: 1n, name: '반도체' },
    { id: 2n, name: 'IT/플랫폼' },
    { id: 3n, name: '자동차/에너지' },
    { id: 4n, name: '금융' },
    { id: 5n, name: '소비재' },
    { id: 6n, name: 'ETF' },
];

// 종목 20개 (국내 10 + 해외 10). exchange_code: 국내 null, 해외 KIS 주문코드(provider가 시세코드로 매핑).
const stocks = [
    { id: 1n, code: '005930', name: '삼성전자', stock_type: 'DOMESTIC', exchange_code: null, category_id: 1n },
    { id: 2n, code: '000660', name: 'SK하이닉스', stock_type: 'DOMESTIC', exchange_code: null, category_id: 1n },
    { id: 3n, code: '034020', name: '두산에너빌리티', stock_type: 'DOMESTIC', exchange_code: null, category_id: 3n },
    { id: 4n, code: '006800', name: '미래에셋증권', stock_type: 'DOMESTIC', exchange_code: null, category_id: 4n },
    { id: 5n, code: '035420', name: 'NAVER', stock_type: 'DOMESTIC', exchange_code: null, category_id: 2n },
    { id: 6n, code: '035720', name: '카카오', stock_type: 'DOMESTIC', exchange_code: null, category_id: 2n },
    { id: 7n, code: '005380', name: '현대차', stock_type: 'DOMESTIC', exchange_code: null, category_id: 3n },
    { id: 8n, code: '005935', name: '삼성전자우', stock_type: 'DOMESTIC', exchange_code: null, category_id: 1n },
    { id: 9n, code: '360750', name: 'TIGER 미국S&P500', stock_type: 'DOMESTIC', exchange_code: null, category_id: 6n },
    { id: 10n, code: '066570', name: 'LG전자', stock_type: 'DOMESTIC', exchange_code: null, category_id: 5n },
    { id: 11n, code: 'AAPL', name: '애플', stock_type: 'FOREIGN', exchange_code: 'NASD', category_id: 2n },
    { id: 12n, code: 'TSLA', name: '테슬라', stock_type: 'FOREIGN', exchange_code: 'NASD', category_id: 3n },
    { id: 13n, code: 'NVDA', name: '엔비디아', stock_type: 'FOREIGN', exchange_code: 'NASD', category_id: 1n },
    { id: 14n, code: 'NOK', name: '노키아', stock_type: 'FOREIGN', exchange_code: 'NYSE', category_id: 2n },
    { id: 15n, code: 'INTC', name: '인텔', stock_type: 'FOREIGN', exchange_code: 'NASD', category_id: 1n },
    { id: 16n, code: 'BRK.B', name: '버크셔 해서웨이', stock_type: 'FOREIGN', exchange_code: 'NYSE', category_id: 4n },
    { id: 17n, code: 'MSFT', name: '마이크로소프트', stock_type: 'FOREIGN', exchange_code: 'NASD', category_id: 2n },
    { id: 18n, code: 'V', name: '비자', stock_type: 'FOREIGN', exchange_code: 'NYSE', category_id: 4n },
    { id: 19n, code: 'AMD', name: 'AMD', stock_type: 'FOREIGN', exchange_code: 'NASD', category_id: 1n },
    { id: 20n, code: 'KO', name: '코카콜라', stock_type: 'FOREIGN', exchange_code: 'NYSE', category_id: 5n },
];

// 펀더멘털(per/pbr 등)은 다른 범위 개발영역이라 임시 0. 전체 종목 리스트 API엔 미사용.
const zero = {
    market_cap: 0n,
    ev: 0n,
    per: '0',
    psr: '0',
    pbr: '0',
    eps: '0',
    bps: '0',
    roe: '0',
};

async function main() {
    for (const c of categories) {
        await prisma.categories.upsert({
            where: { id: c.id },
            update: { name: c.name },
            create: c,
        });
    }

    for (const s of stocks) {
        const fields = {
            code: s.code,
            name: s.name,
            stock_type: s.stock_type,
            exchange_code: s.exchange_code,
            category_id: s.category_id,
            ...zero,
        };
        await prisma.stocks.upsert({
            where: { id: s.id },
            update: fields,
            create: { id: s.id, ...fields },
        });
    }

    // 테스트용 유저(favorites 검증용). 비밀번호는 임시(인증 발급은 다른 범위).
    await prisma.users.upsert({
        where: { login_id: 'testuser' },
        update: {},
        create: {
            id: 1n,
            login_id: 'testuser',
            login_pw: 'test1234',
            nickname: '테스트유저',
        },
    });

    console.log(
        `시드 완료: categories ${categories.length}, stocks ${stocks.length}, user testuser(id=1)`,
    );
}

main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
        console.error('시드 실패:', e);
        await prisma.$disconnect();
        process.exit(1);
    });

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
    {
        id: 1n,
        code: '005930',
        name: '삼성전자',
        stock_type: 'DOMESTIC',
        exchange_code: null,
        category_id: 1n,
    },
    {
        id: 2n,
        code: '000660',
        name: 'SK하이닉스',
        stock_type: 'DOMESTIC',
        exchange_code: null,
        category_id: 1n,
    },
    {
        id: 3n,
        code: '034020',
        name: '두산에너빌리티',
        stock_type: 'DOMESTIC',
        exchange_code: null,
        category_id: 3n,
    },
    {
        id: 4n,
        code: '006800',
        name: '미래에셋증권',
        stock_type: 'DOMESTIC',
        exchange_code: null,
        category_id: 4n,
    },
    {
        id: 5n,
        code: '035420',
        name: 'NAVER',
        stock_type: 'DOMESTIC',
        exchange_code: null,
        category_id: 2n,
    },
    {
        id: 6n,
        code: '035720',
        name: '카카오',
        stock_type: 'DOMESTIC',
        exchange_code: null,
        category_id: 2n,
    },
    {
        id: 7n,
        code: '005380',
        name: '현대차',
        stock_type: 'DOMESTIC',
        exchange_code: null,
        category_id: 3n,
    },
    {
        id: 8n,
        code: '005935',
        name: '삼성전자우',
        stock_type: 'DOMESTIC',
        exchange_code: null,
        category_id: 1n,
    },
    {
        id: 9n,
        code: '360750',
        name: 'TIGER 미국S&P500',
        stock_type: 'DOMESTIC',
        exchange_code: null,
        category_id: 6n,
    },
    {
        id: 10n,
        code: '066570',
        name: 'LG전자',
        stock_type: 'DOMESTIC',
        exchange_code: null,
        category_id: 5n,
    },
    {
        id: 11n,
        code: 'AAPL',
        name: '애플',
        stock_type: 'FOREIGN',
        exchange_code: 'NASD',
        category_id: 2n,
    },
    {
        id: 12n,
        code: 'TSLA',
        name: '테슬라',
        stock_type: 'FOREIGN',
        exchange_code: 'NASD',
        category_id: 3n,
    },
    {
        id: 13n,
        code: 'NVDA',
        name: '엔비디아',
        stock_type: 'FOREIGN',
        exchange_code: 'NASD',
        category_id: 1n,
    },
    {
        id: 14n,
        code: 'NOK',
        name: '노키아',
        stock_type: 'FOREIGN',
        exchange_code: 'NYSE',
        category_id: 2n,
    },
    {
        id: 15n,
        code: 'INTC',
        name: '인텔',
        stock_type: 'FOREIGN',
        exchange_code: 'NASD',
        category_id: 1n,
    },
    {
        id: 16n,
        code: 'BRK.B',
        name: '버크셔 해서웨이',
        stock_type: 'FOREIGN',
        exchange_code: 'NYSE',
        category_id: 4n,
    },
    {
        id: 17n,
        code: 'MSFT',
        name: '마이크로소프트',
        stock_type: 'FOREIGN',
        exchange_code: 'NASD',
        category_id: 2n,
    },
    {
        id: 18n,
        code: 'V',
        name: '비자',
        stock_type: 'FOREIGN',
        exchange_code: 'NYSE',
        category_id: 4n,
    },
    {
        id: 19n,
        code: 'AMD',
        name: 'AMD',
        stock_type: 'FOREIGN',
        exchange_code: 'NASD',
        category_id: 1n,
    },
    {
        id: 20n,
        code: 'KO',
        name: '코카콜라',
        stock_type: 'FOREIGN',
        exchange_code: 'NYSE',
        category_id: 5n,
    },
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

    // 캐릭터 이미지(임시 placeholder). 실제 이미지는 캐릭터 담당이 교체.
    for (const s of stocks) {
        await prisma.characters.upsert({
            where: { stock_id: s.id },
            update: {},
            create: {
                stock_id: s.id,
                img_url: `https://placehold.co/300x400?text=${s.code}`,
            },
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

    // 최종 발표 시연을 위한 mock data
    console.log('👥 1. users 데이터 삽입 중...');
    await prisma.users.createMany({
        data: [
            {
                id: 1,
                login_id: 'testuser',
                login_pw: 'test1234',
                nickname: '테스트유저',
                balance: 100000000,
            },
            {
                id: 2,
                login_id: 'member1',
                login_pw: '$2b$10$8lt7JK3722SRY7z/2jiq4eqoElppU8Jyfjz3.KDw6r/wSiRN1cfzq',
                nickname: 'deadcat1',
                balance: 100000000,
            },
        ],
        skipDuplicates: true, // 🌟 이미 동일한 id의 유저가 있다면 에러를 내지 않고 건너뜁니다.
    });

    console.log('📈 2. holdings 데이터 삽입 중...');
    await prisma.holdings.createMany({
        data: [
            {
                user_id: 2,
                stock_id: 1,
                quantity: 50,
                mean_price_krw: 75000,
                mean_price_foreign: null,
            },
            {
                user_id: 2,
                stock_id: 2,
                quantity: 20,
                mean_price_krw: 1500000,
                mean_price_foreign: null,
            },
            {
                user_id: 2,
                stock_id: 3,
                quantity: 15,
                mean_price_krw: 120000,
                mean_price_foreign: null,
            },
            { user_id: 2, stock_id: 4, quantity: 8, mean_price_krw: 185000, mean_price_foreign: null },
            { user_id: 2, stock_id: 5, quantity: 30, mean_price_krw: 78000, mean_price_foreign: null },
            { user_id: 2, stock_id: 6, quantity: 25, mean_price_krw: 54000, mean_price_foreign: null },
            { user_id: 2, stock_id: 7, quantity: 11, mean_price_krw: 492500, mean_price_foreign: null },
            { user_id: 2, stock_id: 8, quantity: 10, mean_price_krw: 230050, mean_price_foreign: null },
            { user_id: 2, stock_id: 9, quantity: 12, mean_price_krw: 175000, mean_price_foreign: null },
        ],
        skipDuplicates: true,
    });

    console.log('📜 3. transaction_history 데이터 삽입 중...');
    await prisma.transaction_history.createMany({
        data: [
            { id: 1, user_id: 2, stock_id: 1, trade_type: 'BUY', quantity: 50, trade_price: 75000, transaction_time: new Date('2026-06-12T09:15:00') },
            { id: 2, user_id: 2, stock_id: 2, trade_type: 'SELL', quantity: 10, trade_price: 120000, transaction_time: new Date('2026-06-14T15:45:00') },
            { id: 3, user_id: 2, stock_id: 2, trade_type: 'BUY', quantity: 30, trade_price: 1500000, transaction_time: new Date('2026-06-10T10:30:00') },
            { id: 4, user_id: 2, stock_id: 3, trade_type: 'BUY', quantity: 15, trade_price: 120000, transaction_time: new Date('2026-06-15T10:00:00') },
            { id: 5, user_id: 2, stock_id: 4, trade_type: 'BUY', quantity: 8, trade_price: 185000, transaction_time: new Date('2026-06-15T11:30:00') },
            { id: 6, user_id: 2, stock_id: 5, trade_type: 'BUY', quantity: 30, trade_price: 78000, transaction_time: new Date('2026-06-16T09:05:00') },
            { id: 7, user_id: 2, stock_id: 6, trade_type: 'BUY', quantity: 25, trade_price: 54000, transaction_time: new Date('2026-06-16T14:20:00') },
            { id: 8, user_id: 2, stock_id: 7, trade_type: 'BUY', quantity: 11, trade_price: 492500, transaction_time: new Date('2026-06-17T13:15:00') },
            { id: 9, user_id: 2, stock_id: 8, trade_type: 'BUY', quantity: 10, trade_price: 230050, transaction_time: new Date('2026-06-17T15:00:00') },
            { id: 10, user_id: 2, stock_id: 9, trade_type: 'BUY', quantity: 12, trade_price: 175000, transaction_time: new Date('2026-06-18T09:45:00') },
        ],
        skipDuplicates: true,
    });

    console.log('📝 4. posts 데이터 삽입 중...');
    await prisma.posts.createMany({
        data: [
            { id: 1, writer_id: 2, content: '차트가 살짝 횡보하는 느낌인데, 보유 주식 탭에서 제 평단가 보니까 슬슬 추매 타이밍 잡아야 할 것 같아요.', write_time: new Date('2026-06-16T04:20:00') },
            { id: 2, writer_id: 2, content: '과거 3번의 연준의장 취임 후 첫 FOMC에서는 S&P500의 장중 평균 흐름이 약세를 보였다', write_time: new Date('2026-06-15T10:00:00') },
            { id: 3, writer_id: 2, content: '이번에 처음 들어오게 되었습니다.', write_time: new Date('2026-06-10T14:25:30') },
            { id: 4, writer_id: 2, content: '액면분할 이후로 계속 횡보하는 느낌이라 진입 타이밍 보고 있는데... 전고점 뚫고 더 갈 수 있을지 의견 궁금합니다. 상단 매물대가 좀 무겁긴 하네요.', write_time: new Date('2026-06-17T11:15:30') },
            { id: 5, writer_id: 2, content: '오전부터 외인들은 순매수 잡히길래 반등하나 기대했더니만 기관 애들이 물량 다 던지면서 지수 확 끌어내리네요. 언제쯤 삼전 현대차 제대로 가려나 한숨만 나옵니다.', write_time: new Date('2026-06-17T14:45:00') },
            { id: 6, writer_id: 2, content: '지난번 연준 발표는 다소 매파적이었는데 이번 주말 고용지표가 둔화세로 나오면 다시 9월 인하론에 힘이 실릴 것 같습니다. 일단 달러 인덱스 추이 보면서 현금 비중 유지합니다.', write_time: new Date('2026-06-18T09:10:15') },
        ],
        skipDuplicates: true,
    });

    console.log('❤️ 5. like_posts 데이터 삽입 중...');
    await prisma.like_posts.createMany({
        data: [
            { user_id: 2, post_id: 1 },
        ],
        skipDuplicates: true,
    });

    console.log('💬 6. comments 데이터 삽입 중...');
    await prisma.comments.createMany({
        data: [
            { id: 1, post_id: 1, user_id: 2, content: '앗 다들 좋게 봐주셔서 감사합니다!! 더 열심히', write_time: new Date('2026-06-15T11:30:00') },
            { id: 2, post_id: 1, user_id: 2, content: '삼전은 역시 장기투자죠! 같이 버텨봅시다.', write_time: new Date('2026-06-16T01:15:00') },
        ],
        skipDuplicates: true,
    });

    console.log('🏁 기존 테이블 우회 완료 및 신규 데이터 누적 Seed 완료!');
}

main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
        console.error('시드 실패:', e);
        await prisma.$disconnect();
        process.exit(1);
    });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

export async function seedStocks() {
    const stocks = [
        //domestic
        {
            code: '005930',
            exchange_code: null,
            category_id: null,
            stock_type: 'DOMESTIC',
            name: '삼성전자',
            name_en: null,
            market_cap: 23050249, // 보통주 시가 총액 // 단위: 억원
            ev: 9635452, // 단위: 억원
            per: 29.3, // 단위: 배
            psr: 6.3, // 단위: 배
            pbr: 5.0, // 단위: 배
            eps: 12372, // 단위 : 원
            bps: 71907, // 단위: 원
            roe: 19.2, // 단위: 퍼센트
        },

        {
            code: '0000660',
            exchange_code: null,
            category_id: null,
            stock_type: 'DOMESTIC',
            name: 'SK하이닉스',
            name_en: null,
            market_cap: 16563202, // 단위: 억원
            ev: 5426534, // 단위: 억원
            per: 22.4, // 단위 배
            psr: 12.8, // 단위: 배
            pbr: 9.8, // 단위: 배
            eps: 103521, // 단위: 원
            bps: 237789, // 단위: 원
            roe: 61.2, // 단위: 퍼센트
        },
        {
            code: '034020',
            exchange_code: null,
            category_id: null,
            stock_type: 'DOMESTIC',
            name: '두산에너빌리티',
            name_en: null,
            market_cap: 642482, // 단위: 억원
            ev: 626364, // 단위: 억원
            per: 416.2, // 단위 배
            psr: 3.7, // 단위: 배
            pbr: 8.0, // 단위: 배
            eps: 241, // 단위: 원
            bps: 12542, // 단위: 원
            roe: 2.0, // 단위: 퍼센트
        },
        {
            code: '006800',
            exchange_code: null,
            category_id: null,
            stock_type: 'DOMESTIC',
            name: '미래에셋증권',
            name_en: null,
            market_cap: 345919, // 단위: 억원
            ev: 537785, // 단위: 억원
            per: 26.8, // 단위 배
            psr: 1.4, // 단위: 배
            pbr: 2.5, // 단위: 배
            eps: 2153, // 단위: 원
            bps: 22705, // 단위: 원
            roe: 12.4, // 단위: 퍼센트
        },
        {
            code: '035420',
            exchange_code: null,
            category_id: null,
            stock_type: 'DOMESTIC',
            name: 'NAVER',
            name_en: null,
            market_cap: 429049, // 단위: 억원
            ev: 275175, // 단위: 억원
            per: 23.7, // 단위 배
            psr: 3.4, // 단위: 배
            pbr: 1.4, // 단위: 배
            eps: 11520, // 단위: 원
            bps: 196984, // 단위: 원
            roe: 6.5, // 단위: 퍼센트
        },
        {
            code: '035720',
            exchange_code: null,
            category_id: null,
            stock_type: 'DOMESTIC',
            name: '카카오',
            name_en: null,
            market_cap: 187055, // 단위: 억원
            ev: 137497, // 단위: 억원
            per: 38.1, // 단위 배
            psr: 2.3, // 단위: 배
            pbr: 1.6, // 단위: 배
            eps: 1110, // 단위: 원
            bps: 26080, // 단위: 원
            roe: 4.5, // 단위: 퍼센트
        },
        {
            code: '005380',
            exchange_code: null,
            category_id: null,
            stock_type: 'DOMESTIC',
            name: '현대차',
            name_en: null,
            market_cap: 1648915, // 단위: 억원
            ev: 2035911, // 단위: 억원
            per: 22.3, // 단위 배
            psr: 1.0, // 단위: 배
            pbr: 1.6, // 단위: 배
            eps: 32437, // 단위: 원
            bps: 456242, // 단위: 원
            roe: 7.5, // 단위: 퍼센트
        },
        {
            code: '005935',
            exchange_code: null,
            category_id: null,
            stock_type: 'DOMESTIC',
            name: '삼성전자우',
            name_en: null,
            market_cap: 23050249, // 단위: 억원
            ev: 9635452, // 단위: 억원
            per: 29.3, // 단위 배
            psr: 6.3, // 단위: 배
            pbr: 5.0, // 단위: 배
            eps: 12372, // 단위: 원
            bps: 71907, // 단위: 원
            roe: 19.2, // 단위: 퍼센트
        },
        {
            code: '360750',
            exchange_code: null,
            category_id: null,
            stock_type: 'DOMESTIC',
            name: 'TIGER 미국S&P500 ETF',
            name_en: null,
            market_cap: 190000, // 단위: 억원
            ev: 189000, // 단위: 억원
            per: 0, // 단위 배
            psr: 0, // 단위: 배
            pbr: 0, // 단위: 배
            eps: 0, // 단위: 원
            bps: 0, // 단위: 원
            roe: 0, // 단위: 퍼센트
        },
        {
            code: '066570',
            exchange_code: null,
            category_id: null,
            stock_type: 'DOMESTIC',
            name: 'LG전자',
            name_en: null,
            market_cap: 630971, // 단위: 억원
            ev: 233698, // 단위: 억원
            per: 69.2, // 단위 배
            psr: 0.7, // 단위: 배
            pbr: 2.6, // 단위: 배
            eps: 5419, // 단위: 원
            bps: 142232, // 단위: 원
            roe: 4.1, // 단위: 퍼센트
        },
        // foreign
        {
            code: 'AAPL',
            exchange_code: 'NASDAQ',
            category_id: null,
            stock_type: 'FOREIGN',
            name: '애플',
            name_en: null,
            market_cap: 69964947,
            ev: 55341350,
            per: 37.8,
            psr: 10.3,
            pbr: 43.5,
            eps: 12483,
            bps: 10972,
            roe: 141.5,
        },
        {
            code: 'TSLA',
            exchange_code: 'NASDAQ',
            category_id: null,
            stock_type: 'FOREIGN',
            name: '테슬라',
            name_en: 'tesla',
            market_cap: 24051590,
            ev: 20573955,
            per: 412.1,
            psr: 16.3,
            pbr: 18.9,
            eps: 1647,
            bps: 33853,
            roe: 4.9,
        },
        {
            code: 'NVDA',
            exchange_code: 'NASDAQ',
            category_id: null,
            stock_type: 'FOREIGN',
            name: '엔비디아',
            name_en: 'nvidia',
            market_cap: 81492983,
            ev: 73865046,
            per: 33.8,
            psr: 21.3,
            pbr: 27.6,
            eps: 9853,
            bps: 12196,
            roe: 114.3,
        },
        {
            code: 'NOK',
            exchange_code: 'NYSE',
            category_id: null,
            stock_type: 'FOREIGN',
            name: '노키아',
            name_en: 'nokia',
            market_cap: 1424206,
            ev: 630768,
            per: 103.6,
            psr: 4.1,
            pbr: 3.9,
            eps: 241,
            bps: 6589,
            roe: 3.8,
        },
        {
            code: 'INTC',
            exchange_code: 'NASDAQ',
            category_id: null,
            stock_type: 'FOREIGN',
            name: '인텔',
            name_en: 'intel',
            market_cap: 8198140,
            ev: 3446158,
            per: -170.9,
            psr: 10.1,
            pbr: 4.9,
            eps: -937,
            bps: 33505,
            roe: -3.0,
        },
        {
            code: 'BRK.B',
            exchange_code: 'NYSE',
            category_id: null,
            stock_type: 'FOREIGN',
            name: '버크셔 해서웨이 B',
            name_en: 'berkshire hathaway class b',
            market_cap: 15369172,
            ev: 16707931,
            per: 14.0,
            psr: 2.7,
            pbr: 1.4,
            eps: 50764,
            bps: 509519,
            roe: 10.5,
        },
        {
            code: 'MSFT',
            exchange_code: 'NASDAQ',
            category_id: null,
            stock_type: 'FOREIGN',
            name: '마이크로소프트',
            name_en: 'microsoft',
            market_cap: 49544079,
            ev: 41976678,
            per: 26.2,
            psr: 10.3,
            pbr: 7.9,
            eps: 25374,
            bps: 84285,
            roe: 34.0,
        },
        {
            code: 'V',
            exchange_code: 'NYSE',
            category_id: null,
            stock_type: 'FOREIGN',
            name: '비자',
            name_en: 'Visa',
            market_cap: 9035617,
            ev: 8870570,
            per: 26.9,
            psr: 13.9,
            pbr: 16.8,
            eps: 17183,
            bps: 28170,
            roe: 60.3,
        },
        {
            code: 'AMD',
            exchange_code: 'NASDAQ',
            category_id: null,
            stock_type: 'FOREIGN',
            name: 'amd',
            name_en: 'AMD',
            market_cap: 12852449,
            ev: 4822688,
            per: 169.8,
            psr: 22.7,
            pbr: 13.2,
            eps: 4594,
            bps: 59756,
            roe: 8.2,
        },
        {
            code: 'KO',
            exchange_code: 'NYSE',
            category_id: null,
            stock_type: 'FOREIGN',
            name: '코카콜라',
            name_en: 'Coca-Cola',
            market_cap: 5098486,
            ev: 5472002,
            per: 24.6,
            psr: 6.8,
            pbr: 10.0,
            eps: 4790,
            bps: 11803,
            roe: 45.8,
        },
    ];

    await prisma.stocks.createMany({
        data: stocks,
        skipDuplicates: true,
    });

    console.log(`Stocks seeded: ${stocks.length} rows!`);
}

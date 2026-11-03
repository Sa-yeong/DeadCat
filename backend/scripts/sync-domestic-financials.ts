// scripts/sync-domestic-financials.ts

import * as dotenv from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'generated/prisma/client';

// --------------------------------------------------
// 1. 환경변수 설정
// --------------------------------------------------

dotenv.config();

// DATABASE_URL 확인
if (!process.env.DATABASE_URL) {
    throw new Error('❌ DATABASE_URL이 .env에 없습니다.');
}

// DART API KEY 확인
if (!process.env.DART_API_KEY) {
    throw new Error('❌ DART_API_KEY가 .env에 없습니다.');
}

// 2. Prisma 7 + PostgreSQL Adapter

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});

// Prisma Client 생성
const prisma = new PrismaClient({
    adapter,
});

const DART_API_KEY = process.env.DART_API_KEY;

// 3. 조회할 사업연도

// 성장률 계산을 위해 최근 3개년 데이터를 가져온다.
const YEARS = [2023, 2024, 2025];

// 미래에셋증권(006800) 영업이익 하드코딩
// 미래에셋증권은 금융업종 특성상 현재 DART API의
// 일반적인 '영업이익' 계정 매칭으로 값이 0이 나오므로 프로젝트 대상 종목에 한해 실제 연결 기준 연간 영업이익을 사용한다.

// 단위: 원
const MIRAe_ASSET_OPERATING_PROFIT: Record<number, bigint> = {
    // 2023년: 5,110억 원
    2023: 511_000_000_000n,

    // 2024년: 1조 1,590억 원
    2024: 1_159_000_000_000n,

    // 2025년: 1조 9,150억 원
    2025: 1_915_000_000_000n,
};

// 사업보고서
// 11011 = 사업보고서
const REPORT_CODE = '11011';

// --------------------------------------------------
// 4. DART 금액 변환 함수
// --------------------------------------------------

/**
 * DART에서 내려오는 금액 문자열을 BigInt로 변환한다.
 */
function parseAmountToBigInt(value: string | undefined): bigint {
    // 값이 없으면 0으로 처리
    if (!value) {
        return BigInt(0);
    }

    // 천 단위 쉼표와 공백 제거 후 BigInt 변환
    return BigInt(value.replace(/,/g, '').trim());
}

// 5. DART 재무정보 조회

/**
 * 특정 기업의 특정 사업연도 재무정보를 조회한다.
 *
 * @param corpCode DART 기업 고유번호
 * @param year 사업연도
 */
async function fetchFinancialData(corpCode: string, year: number) {
    // DART 단일회사 전체 재무제표 API
    const url =
        `https://opendart.fss.or.kr/api/fnlttSinglAcnt.json` +
        `?crtfc_key=${DART_API_KEY}` +
        `&corp_code=${corpCode}` +
        `&bsns_year=${year}` +
        `&reprt_code=${REPORT_CODE}`;

    // DART API 호출
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `DART API 요청 실패: ${response.status} ${response.statusText}`,
        );
    }

    // JSON 응답 반환
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return await response.json();
}

// --------------------------------------------------
// 6. 한 종목의 재무정보 동기화
// --------------------------------------------------

/**
 * 하나의 국내 종목에 대해
 * 2023~2025년 재무정보를 동기화한다.
 */
async function syncStockFinancials(stock: {
    id: bigint;
    code: string;
    name: string;
    corp_code: string | null;
}) {
    if (!stock.corp_code) {
        console.warn(`${stock.name}(${stock.code}) → corp_code 없음`);
        return;
    }

    for (const year of YEARS) {
        try {
            console.log(`${stock.name}(${stock.code}) ${year}년 조회 중...`);

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const data = await fetchFinancialData(stock.corp_code, year);

            if (data.status !== '000') {
                console.warn(
                    `${stock.name} ${year}년 DART 오류: ${data.message}`,
                );
                continue;
            }

            const rows = data.list ?? [];

            // 연결재무제표를 우선 사용
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const consolidatedRows = rows.filter(
                (row: any) => row.fs_div === 'CFS',
            );

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const financialRows =
                consolidatedRows.length > 0
                    ? consolidatedRows
                    : rows.filter((row: any) => row.fs_div === 'OFS');

            // 매출액과 영업이익 조회
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const revenueRow = financialRows.find(
                (row: any) => row.account_nm === '매출액',
            );

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const operatingProfitRow = financialRows.find(
                (row: any) => row.account_nm === '영업이익',
            );

            if (!revenueRow && !operatingProfitRow) {
                console.warn(
                    `${stock.name} ${year}년 재무 데이터를 찾지 못했습니다.`,
                );
                continue;
            }

            const revenue = parseAmountToBigInt(revenueRow?.thstrm_amount);

            let operatingProfit = parseAmountToBigInt(
                operatingProfitRow?.thstrm_amount,
            );

            // 미래에셋증권은 별도 영업이익 데이터를 사용
            if (stock.code === '006800') {
                operatingProfit = MIRAe_ASSET_OPERATING_PROFIT[year] ?? 0n;
            }

            await prisma.stock_financials.upsert({
                where: {
                    stock_id_year: {
                        stock_id: stock.id,
                        year,
                    },
                },
                update: {
                    revenue,
                    operating_profit: operatingProfit,
                },
                create: {
                    stock_id: stock.id,
                    year,
                    revenue,
                    operating_profit: operatingProfit,
                },
            });

            console.log(
                `${stock.name} ${year}년 저장 완료`,
                `| 매출액: ${revenue}`,
                `| 영업이익: ${operatingProfit}`,
            );
        } catch (error) {
            console.error(
                `${stock.name}(${stock.code}) ${year}년 처리 실패:`,
                error,
            );
        }
    }
}

// --------------------------------------------------
// 7. 전체 국내 종목 동기화

async function syncDomesticFinancials() {
    console.log(` ${YEARS.join(', ')}년 재무정보 동기화 시작`);

    try {
        // ------------------------------------------
        // DART corp_code가 있는 국내 종목 조회
        // ------------------------------------------

        const stocks = await prisma.stocks.findMany({
            where: {
                stock_type: 'DOMESTIC',

                // corp_code가 NULL인 종목은 제외
                corp_code: {
                    not: null,
                },
            },

            // 결과에 필요한 필드만 가져온다.
            select: {
                id: true,
                code: true,
                name: true,
                corp_code: true,
            },
        });

        console.log(`DART 재무정보 대상: ${stocks.length}개`);

        // ------------------------------------------
        // 종목별 재무정보 동기화
        // ------------------------------------------

        for (const stock of stocks) {
            // 한 종목에서 오류가 발생해도
            // 다음 종목은 계속 처리한다.
            await syncStockFinancials(stock);
        }

        console.log(' 전체 국내 재무정보 동기화 완료!');
    } catch (error) {
        // 전체적인 오류 처리
        console.error(' 재무정보 동기화 중 오류 발생:', error);
    } finally {
        // Prisma 연결 종료
        await prisma.$disconnect();
    }
}

// 8. 실행

syncDomesticFinancials();

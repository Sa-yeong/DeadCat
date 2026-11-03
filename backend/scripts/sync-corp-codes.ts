import * as unzipper from 'unzipper';
import { parseStringPromise } from 'xml2js';
import * as dotenv from 'dotenv';
import { PrismaClient } from 'generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// .env 파일 로드
dotenv.config();

// Prisma 7 + PostgreSQL Driver Adapter 설정
const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});

// 기존 NestJS PrismaService와 동일한 방식으로 Prisma Client 생성
const prisma = new PrismaClient({
    adapter,
});

const DART_API_KEY = process.env.DART_API_KEY;

async function syncCorpCodes() {
    // DART API Key가 없으면 실행 중단
    if (!DART_API_KEY) {
        console.error(' .env 파일에 DART_API_KEY가 설정되어 있지 않습니다.');
        process.exit(1);
    }

    console.log(' DART corpCode.xml 다운로드 및 압축 해제 중...');

    try {
        // DART 전체 기업 코드 XML 다운로드
        const res = await fetch(
            `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${DART_API_KEY}`,
        );

        // HTTP 요청 자체가 실패했는지 확인
        if (!res.ok) {
            throw new Error(
                `DART API 요청 실패: ${res.status} ${res.statusText}`,
            );
        }

        // 응답을 Buffer로 변환
        const buffer = Buffer.from(await res.arrayBuffer());

        // ZIP 파일 열기
        const zip = await unzipper.Open.buffer(buffer);

        // ZIP 안의 XML 파일 읽기
        const xmlContent = await zip.files[0].buffer();

        // XML → JavaScript 객체 변환
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const parsed = await parseStringPromise(xmlContent.toString());

        // DART 기업 목록
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const list: {
            corp_code: string[];
            stock_code: string[];
        }[] = parsed.result.list;

        // 국내 주식만 조회
        const domesticStocks = await prisma.stocks.findMany({
            where: {
                stock_type: 'DOMESTIC',
            },
        });

        console.log(` 대상 국내 종목 수: ${domesticStocks.length}개`);

        // 국내 종목 각각 DART corp_code 매칭
        for (const stock of domesticStocks) {
            const match = list.find(
                (c) => c.stock_code && c.stock_code[0]?.trim() === stock.code,
            );

            if (match) {
                const corpCode = match.corp_code[0];

                // DB에 DART corp_code 저장
                await prisma.stocks.update({
                    where: {
                        id: stock.id,
                    },
                    data: {
                        corp_code: corpCode,
                    },
                });

                console.log(
                    ` [매칭 성공] ${stock.name}(${stock.code}) → ${corpCode}`,
                );
            } else {
                // ETF 등 DART 상장법인 코드가 없는 종목
                console.warn(
                    ` [매칭 실패/ETF/미대상] ${stock.name}(${stock.code})`,
                );
            }
        }

        console.log(' corp_code 동기화 완료');
    } catch (error) {
        console.error(' 스크립트 실행 중 에러 발생:', error);
    } finally {
        // Prisma 연결 종료
        await prisma.$disconnect();
    }
}

// 스크립트 실행
syncCorpCodes();

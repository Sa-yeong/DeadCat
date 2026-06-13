import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../providers/database/prisma.service';
import { KisProvider, StockPrice } from '../providers/kis/kis.provider';
import { PriceService } from './price.service';

// 폴링 주기(미정 → 일단 30초). 변경 시 이 cron 한 줄만 수정.
// 20종목 순차 호출(throttle 300ms) ≈ 6초 소요라 30초가 안전.
const POLL_CRON = '*/30 * * * * *';
// 시세 캐시 TTL(초). 폴링 주기보다 길게 잡아 주기 사이 공백을 막는다.
const PRICE_TTL_SECONDS = 100;
// 해외 거래대금(USD)을 원화로 환산하는 임시 환율. 거래대금 순위 정규화용.
// TODO: 고정값 대신 KIS 환율 API/설정값으로 대체.
const USD_KRW = 1350;

// 시세 수집 스케줄러. KIS에서 받아 Redis에 적재한다(컨트롤러는 Redis만 읽음).
@Injectable()
export class PriceScheduler {
    private readonly logger = new Logger(PriceScheduler.name);
    private isPolling = false; // 폴링 중복 실행 방지

    constructor(
        private readonly prisma: PrismaService,
        private readonly kis: KisProvider,
        private readonly price: PriceService,
    ) {}

    @Cron(POLL_CRON)
    async pollStocks(): Promise<void> {
        if (this.isPolling) {
            this.logger.warn('이전 폴링이 진행 중이라 이번 주기를 건너뜁니다.');
            return;
        }
        this.isPolling = true;
        try {
            const stocks = await this.prisma.stocks.findMany({
                select: { code: true, stock_type: true, exchange_code: true },
            });
            if (stocks.length === 0) {
                this.logger.log('폴링 대상 종목이 없습니다(시드 전).');
                return;
            }

            const domesticCodes = stocks
                .filter((s) => s.stock_type !== 'FOREIGN')
                .map((s) => s.code);
            const overseas = stocks
                .filter((s) => s.stock_type === 'FOREIGN')
                .map((s) => ({ symbol: s.code, exchange: s.exchange_code ?? '' }));

            const domPrices = await this.kis.getDomesticPrices(domesticCodes);
            const ovsPrices = await this.kis.getOverseasPrices(overseas);

            const entries: {
                code: string;
                price: StockPrice;
                rankingScore: number;
            }[] = [];
            for (const [code, price] of domPrices) {
                entries.push({ code, price, rankingScore: price.trading_value });
            }
            for (const [code, price] of ovsPrices) {
                entries.push({
                    code,
                    price,
                    rankingScore: price.trading_value * USD_KRW,
                });
            }

            await this.price.writePrices(entries, PRICE_TTL_SECONDS);
            this.logger.log(
                `시세 적재 완료: ${entries.length}/${stocks.length}종목`,
            );
        } catch (e) {
            this.logger.error(
                `폴링 실패: ${e instanceof Error ? e.message : String(e)}`,
            );
        } finally {
            this.isPolling = false;
        }
    }
}

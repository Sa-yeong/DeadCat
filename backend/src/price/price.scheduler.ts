import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../providers/database/prisma.service';
import { KisProvider, StockPrice } from '../providers/kis/kis.provider';
import { PriceService } from './price.service';

// 폴링 주기(미정 → 일단 30초). 변경 시 이 cron 한 줄만 수정.
const POLL_CRON = '*/30 * * * * *';
// 시세 캐시 TTL(초). 폴링 주기보다 길게.
const PRICE_TTL_SECONDS = 100;
// 환율 조회 실패 시 폴백 환율(원/달러).
const DEFAULT_USD_KRW = 1350;

const VOLUME_SUMMARY_TTL_SECONDS = 300; //(5분) 거래대금 캐시 TTL

// 시세 수집 스케줄러. KIS에서 받아 Redis에 적재한다(컨트롤러는 Redis만 읽음).
@Injectable()
export class PriceScheduler {
    private readonly logger = new Logger(PriceScheduler.name);
    private isPolling = false;

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

            // 통합 순위 정규화용 실시간 환율(실패 시 폴백).
            const usdKrw = await this.getUsdKrwRate();

            const domesticCodes = stocks
                .filter((s) => s.stock_type !== 'FOREIGN')
                .map((s) => s.code);
            const overseas = stocks
                .filter((s) => s.stock_type === 'FOREIGN')
                .map((s) => ({
                    symbol: s.code,
                    exchange: s.exchange_code ?? '',
                }));

            const domPrices = await this.kis.getDomesticPrices(domesticCodes);
            const ovsPrices = await this.kis.getOverseasPrices(overseas);

            const entries: {
                code: string;
                price: StockPrice;
                rankingScore: number;
            }[] = [];
            for (const [code, price] of domPrices) {
                entries.push({
                    code,
                    price,
                    rankingScore: price.trading_value,
                });
            }
            for (const [code, price] of ovsPrices) {
                entries.push({
                    code,
                    price,
                    rankingScore: price.trading_value * usdKrw,
                });
            }

            await this.price.writePrices(entries, PRICE_TTL_SECONDS);

            // 국내 종목만 volume-summary 적재 (해외는 KIS TR ID 다름)
            for (const code of domesticCodes) {
                try {
                    const summary = await this.kis.fetchVolumeSummary(code);
                    await this.price.writeVolumeSummary(
                        code,
                        summary,
                        VOLUME_SUMMARY_TTL_SECONDS, //
                    );
                    this.logger.log(`volume-summary 적재 완료: ${code}`);
                } catch (e) {
                    this.logger.warn(
                        `volume-summary 실패 ${code}: ${e instanceof Error ? e.message : String(e)}`,
                    );
                }
            }
            this.logger.log(
                `시세 적재 완료: ${entries.length}/${stocks.length}종목 (환율 ${usdKrw})`,
            );
        } catch (e) {
            this.logger.error(
                `폴링 실패: ${e instanceof Error ? e.message : String(e)}`,
            );
        } finally {
            this.isPolling = false;
        }
    }

    // 실시간 USD/KRW. 실패 시 폴백 환율 사용(폴링이 멈추지 않게).
    private async getUsdKrwRate(): Promise<number> {
        try {
            const rate = await this.kis.getUsdKrwRate();
            return rate > 0 ? rate : DEFAULT_USD_KRW;
        } catch (e) {
            this.logger.warn(
                `환율 조회 실패, 기본값 ${DEFAULT_USD_KRW} 사용: ${e instanceof Error ? e.message : String(e)}`,
            );
            return DEFAULT_USD_KRW;
        }
    }
}

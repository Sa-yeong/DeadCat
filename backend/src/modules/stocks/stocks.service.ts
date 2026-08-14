import { Injectable, NotFoundException } from '@nestjs/common';
import { PriceService } from '../../price/price.service';
import { FavoritesService } from '../favorites/favorites.service';
import { StocksRepository } from './stocks.repository';
import { StockRankingResponseDto } from './dto/stock-ranking.response.dto';
import { StockDetailResponseDto } from './dto/stock-detail.response.dto';
import { VolumeSummaryResponseDto } from './dto/volume-summary.response.dto';
import { StockChartResponseDto } from './dto/stock-chart-dto';
import {
    OrderbookItemDto,
    OrderbookResponseDto,
} from './dto/orderbook.response.dto';
import { KisProvider } from 'src/providers/kis/kis.provider';
import { CompanyInfoSummaryResponseDto } from './dto/company-info-summary-response.dto';

// 거래대금 상위 N (시범 20종목이라 전부 포함됨).
const TOP_N = 20;

// 시장 필터 값.
export type MarketFilter = 'DOMESTIC' | 'FOREIGN';

// 전체 종목 리스트의 두뇌. Redis 순위 + DB 메타 + 관심여부를 결합해 가공한다.
@Injectable()
export class StocksService {
    constructor(
        private readonly price: PriceService,
        private readonly favorites: FavoritesService,
        private readonly repo: StocksRepository,
        private readonly kisProvider: KisProvider,
    ) {}

    // GET /stocks/ranking: 거래대금 상위 종목. market 지정 시 해당 시장만(rank 재부여).
    async getRanking(
        userId?: bigint,
        market?: MarketFilter,
    ): Promise<StockRankingResponseDto[]> {
        const codes = await this.price.readRankedCodes(TOP_N);
        const rows = await this.buildStockRows(codes, userId);
        if (!market) return rows;
        // 같은 시장끼리는 통화가 같아 정규화 순서가 그대로 유효 → 필터 후 rank만 재부여.
        return rows
            .filter((r) => r.market === market)
            .map((r, i) => ({ ...r, rank: i + 1 }));
    }

    // 코드 목록(랭킹 순) → 메타+시세+관심여부 결합. sectors(API 4)가 빌려 씀 → export.
    async buildStockRows(
        codes: string[],
        userId?: bigint,
    ): Promise<StockRankingResponseDto[]> {
        if (codes.length === 0) return [];

        const metas = await this.repo.findStocksByCodes(codes);
        const metaByCode = new Map(metas.map((m) => [m.code, m]));
        const prices = await this.price.readPrices(codes);
        const favoriteSet = userId
            ? await this.favorites.findFavoriteStockCodes(userId)
            : new Set<string>();

        const rows: StockRankingResponseDto[] = [];
        for (const code of codes) {
            const meta = metaByCode.get(code);
            const price = prices.get(code);
            if (!meta || !price) continue; // 메타/시세 없는 종목은 제외
            rows.push({
                rank: rows.length + 1,
                stock_code: code,
                stock_name: meta.name,
                market: meta.stock_type,
                character_img_url: meta.character_img_url,
                current_price: price.current_price,
                change_rate: price.change_rate,
                trading_value: price.trading_value,
                trading_value_krw: price.trading_value_krw,
                is_favorite: favoriteSet.has(code),
            });
        }
        return rows;
    }

    // 섹터 상승률 계산용: 코드별 등락률.
    async getChangeRates(codes: string[]): Promise<Map<string, number>> {
        const prices = await this.price.readPrices(codes);
        const result = new Map<string, number>();
        for (const [code, price] of prices) {
            result.set(code, price.change_rate);
        }
        return result;
    }

    // GET /stock/{stock_code} 개별 종목 기본 정보 조회
    async getStockDetail(
        stockCode: string,
        userId?: bigint,
    ): Promise<StockDetailResponseDto> {
        const meta = await this.repo.findStockByCode(stockCode);
        if (!meta) throw new NotFoundException('종목을 찾을 수 없습니다.');

        const prices = await this.price.readPrices([stockCode]);
        const price = prices.get(stockCode);

        const isFavorite = userId
            ? (await this.favorites.findFavoriteStockCodes(userId)).has(
                  stockCode,
              )
            : false;

        return new StockDetailResponseDto({
            stock_code: meta.code,
            stock_name: meta.name,
            logo_url: meta.characters?.img_url ?? null,
            current_price: price?.current_price ?? 0,
            change_rate: price?.change_rate ?? 0,
            market: meta.stock_type,
            is_favorite: isFavorite,
            is_event: meta.is_event,
        });
    }

    // GET  /stocks/{stock_code}/volume-summary 거래대금 조회
    async getVolumeSummary(
        stockCode: string,
    ): Promise<VolumeSummaryResponseDto> {
        const meta = await this.repo.findStockByCode(stockCode);
        if (!meta) throw new NotFoundException('종목을 찾을 수 없습니다.');

        const cached = await this.price.readVolumeSummary(stockCode);
        if (!cached)
            throw new NotFoundException('거래량 데이터가 아직 없습니다.');

        return new VolumeSummaryResponseDto(cached);
    }

    //GET stock/{stock_code}/chart 일봉 차트 조회
    async getStockChart(
        stockCode: string,
        timeframe: string = 'DAY',
    ): Promise<StockChartResponseDto[]> {
        const meta = await this.repo.findStockByCode(stockCode);
        if (!meta) throw new NotFoundException('종목을 찾을 수 없습니다.');

        // 1. 1분봉(1M) 처리
        if (timeframe === '1M') {
            const chartData = await this.price.readStockChart(
                stockCode,
                timeframe,
            );
            return chartData.map((item) => new StockChartResponseDto(item));
        }

        // 2. 해외주식 판단
        const isOverseas =
            meta.stock_type === 'FOREIGN' ||
            meta.stock_type === 'OVERSEAS' ||
            /^[A-Za-z]+$/.test(stockCode);

        if (isOverseas) {
            // DB에서 조회 (syncHistoricalData로 이미 저장됨)
            const history = await this.repo.findStockHistory(
                meta.id,
                timeframe,
            );

            return history.map(
                (h) =>
                    new StockChartResponseDto({
                        write_time: h.record_date.toISOString(), // ISO-8601
                        open_price: Number(h.open_price),
                        close_price: Number(h.close_price),
                        low_price: Number(h.low_price),
                        high_price: Number(h.high_price),
                    }),
            );
        }

        // 3. 국내주식 일/주/월 데이터 DB 조회
        const history = await this.repo.findStockHistory(meta.id, timeframe);

        return history.map(
            (h) =>
                new StockChartResponseDto({
                    write_time: h.record_date.toISOString(),
                    open_price: Number(h.open_price),
                    close_price: Number(h.close_price),
                    low_price: Number(h.low_price),
                    high_price: Number(h.high_price),
                }),
        );
    }

    // GET /stocks/{stock_code}/orderbook 실시간 호가창 조회
    async getOrderbook(stockCode: string): Promise<OrderbookResponseDto> {
        const meta = await this.repo.findStockByCode(stockCode);
        if (!meta) {
            throw new NotFoundException('종목을 찾을 수 없습니다.');
        }

        const isOverseas =
            meta.stock_type === 'FOREIGN' ||
            meta.stock_type === 'OVERSEAS' ||
            /^[A-Za-z]+$/.test(stockCode);

        let orderbook: {
            asks: { price: number; quantity: number }[];
            bids: { price: number; quantity: number }[];
        };

        if (isOverseas) {
            const exchange = meta.exchange_code || 'NAS';
            orderbook = await this.kisProvider.getOverseasOrderbook(
                stockCode,
                exchange,
            );
        } else {
            orderbook = await this.kisProvider.getOrderbook(stockCode);
        }

        // DTO 객체 변환
        const asks = orderbook.asks.map(
            (item) => new OrderbookItemDto(item.price, item.quantity),
        );
        const bids = orderbook.bids.map(
            (item) => new OrderbookItemDto(item.price, item.quantity),
        );

        return new OrderbookResponseDto(stockCode, asks, bids);
    }

    // GET /stocks/{stock_code}/company-info/summary 개별 종목 상단 지표 조회
    async getCompanyInfoSummary(
        stockCode: string,
    ): Promise<CompanyInfoSummaryResponseDto> {
        // 1. DB에서 basic 메타/지표 데이터(시가총액, PER, PBR) 조회
        const basicInfo = await this.repo.findBasicSummaryByCode(stockCode);
        if (!basicInfo) {
            throw new NotFoundException('종목을 찾을 수 없습니다.');
        }

        // 2. Redis/PriceService 캐시에서 52주 최고/최저, 배당수익률 정보 확인
        let dynamicInfo = await this.price.readCompanySummaryExtra(stockCode);

        // 3. 캐시에 없으면 KIS API 호출 후 Redis 적재
        if (!dynamicInfo) {
            const kisData =
                await this.kisProvider.getCompanySummaryExtra(stockCode);

            if (kisData) {
                dynamicInfo = kisData;
                // KIS에서 받아온 추가 지표(52주 high/low, 배당수익률) 캐싱 (예: 12시간 TTL)
                await this.price.writeCompanySummaryExtra(
                    stockCode,
                    kisData,
                    43200,
                );
            } else {
                // API 응답 실패 시 기본값 fallback
                dynamicInfo = {
                    dividend_yield: 0,
                    week52_high: 0,
                    week52_low: 0,
                };
            }
        }

        // 4. DB 데이터 + KIS/PriceService 데이터 결합
        return new CompanyInfoSummaryResponseDto({
            stock_code: stockCode,
            market_cap: Number(basicInfo.market_cap),
            per: basicInfo.per,
            pbr: basicInfo.pbr,
            dividend_yield: dynamicInfo.dividend_yield,
            week52_high: dynamicInfo.week52_high,
            week52_low: dynamicInfo.week52_low,
        });
    }
}

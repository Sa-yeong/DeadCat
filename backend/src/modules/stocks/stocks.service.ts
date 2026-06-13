import { Injectable } from '@nestjs/common';
import { PriceService } from '../../price/price.service';
import { FavoritesService } from '../favorites/favorites.service';
import { StocksRepository } from './stocks.repository';
import { StockRankingResponseDto } from './dto/stock-ranking.response.dto';

// 거래대금 상위 N (시범 20종목이라 전부 포함됨).
const TOP_N = 20;

// 전체 종목 리스트의 두뇌. Redis 순위 + DB 메타 + 관심여부를 결합해 가공한다.
@Injectable()
export class StocksService {
    constructor(
        private readonly price: PriceService,
        private readonly favorites: FavoritesService,
        private readonly repo: StocksRepository,
    ) {}

    // GET /stocks/ranking: 거래대금 상위 종목.
    async getRanking(userId?: bigint): Promise<StockRankingResponseDto[]> {
        const codes = await this.price.readRankedCodes(TOP_N);
        return this.buildStockRows(codes, userId);
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
                current_price: price.current_price,
                change_rate: price.change_rate,
                trading_value: price.trading_value,
                is_favorite: favoriteSet.has(code),
            });
        }
        return rows;
    }

    // 섹터 상승률 계산용: 코드별 등락률. sectors(API 3)가 빌려 씀 → export.
    async getChangeRates(codes: string[]): Promise<Map<string, number>> {
        const prices = await this.price.readPrices(codes);
        const result = new Map<string, number>();
        for (const [code, price] of prices) {
            result.set(code, price.change_rate);
        }
        return result;
    }
}

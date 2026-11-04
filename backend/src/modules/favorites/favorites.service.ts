import { Injectable } from '@nestjs/common';
import { FavoritesRepository } from './favorites.repository';
import { FavoriteItemResponseDto } from './dto/favorite-item.response.dto';
import { PriceService } from 'src/price/price.service';

// 관심종목 비즈니스 로직. stocks를 모름(단방향) — 종목 검증은 repo가 DB에서 직접.
@Injectable()
export class FavoritesService {
    constructor(
        private readonly repo: FavoritesRepository,
        private readonly priceService: PriceService,
    ) {}

    async add(userId: bigint, stockCode: string): Promise<void> {
        const stockId = await this.repo.resolveStockIdByCode(stockCode);
        await this.repo.insertInterest(userId, stockId);
    }

    async remove(userId: bigint, stockCode: string): Promise<void> {
        const stockId = await this.repo.resolveStockIdByCode(stockCode);
        await this.repo.deleteInterest(userId, stockId);
    }

    // stocks 모듈이 is_favorite 판단에 빌려 씀 → export. Set으로 O(1) 조회.
    async findFavoriteStockCodes(userId: bigint): Promise<Set<string>> {
        return new Set(await this.repo.findFavoriteCodesByUser(userId));
    }

    // 관심 종목 목록 조회 로직
    async findAll(userId: bigint): Promise<FavoriteItemResponseDto[]> {
        const interests = await this.repo.findFavoriteStocksByUser(userId);

        if (interests.length === 0) {
            return [];
        }

        // 실시간 시세(원화) 조회 — 캐시에 없으면 마지막 두 종가로
        const quotes = await this.priceService.readKrwQuotes(
            interests.map(({ stocks }) => ({
                code: stocks.code,
                stock_type: stocks.stock_type,
                closes: stocks.stock_history.map((h) => h.close_price),
            })),
        );

        return interests.map((item) => {
            const stock = item.stocks;
            const quote = quotes.get(stock.code);

            return new FavoriteItemResponseDto({
                stock_code: stock.code,
                stock_name: stock.name,
                character_img_url: stock.characters?.img_url ?? null,
                change_rate: quote?.change_rate ?? 0,
                current_price_krw: quote?.current_price_krw ?? null,
                change_price_krw: quote?.change_price_krw ?? null,
                is_favorite: true,
            });
        });
    }
}

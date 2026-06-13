import { Injectable } from '@nestjs/common';
import { FavoritesRepository } from './favorites.repository';

// 관심종목 비즈니스 로직. stocks를 모름(단방향) — 종목 검증은 repo가 DB에서 직접.
@Injectable()
export class FavoritesService {
    constructor(private readonly repo: FavoritesRepository) {}

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
}

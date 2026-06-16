import { Module } from '@nestjs/common';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';
import { FavoritesRepository } from './favorites.repository';

// 관심종목 모듈(리프). PrismaService는 전역(@Global)이라 import 불필요.
// FavoritesService를 export해 stocks 모듈이 is_favorite 판단에 사용한다.
@Module({
    controllers: [FavoritesController],
    providers: [FavoritesService, FavoritesRepository],
    exports: [FavoritesService],
})
export class FavoritesModule {}

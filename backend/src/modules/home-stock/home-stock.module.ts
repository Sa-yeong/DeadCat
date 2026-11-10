import { Module } from '@nestjs/common';
import { HomeRoomsController } from '../home/home-room.controller';
import { HomeStocksController } from './home-stock.controller';
import { HomeRoomsService } from '../home/home-room.service';
import { HomeRoomsRepository } from '../home/home-room.repository';
import { HomeStocksService } from './home-stock.service';
import { HomeStocksRepository } from './home-stock.repository';
import { PriceModule } from 'src/price/price.module';

@Module({
    imports: [PriceModule],
    controllers: [
        HomeRoomsController,
        HomeStocksController, // 종목 검색 Controller 추가
    ],
    providers: [
        HomeRoomsService,
        HomeRoomsRepository,
        HomeStocksService,
        HomeStocksRepository,
    ],
})
export class HomeModule {}

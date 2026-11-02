import { Module } from '@nestjs/common';

import { PrismaModule } from 'src/providers/database/prisma.module';
import { PriceModule } from 'src/price/price.module';
import { HomeRoomsController } from './home-room.controller';
import { HomeRoomsService } from './home-room.service';
import { HomeRoomsRepository } from './home-room.repository';
import { AssetModule } from '../asset/asset.module';

@Module({
    imports: [PrismaModule, PriceModule, AssetModule],
    controllers: [HomeRoomsController],
    providers: [HomeRoomsService, HomeRoomsRepository],
    exports: [HomeRoomsService],
})
export class HomeRoomsModule {}

import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { PrismaModule } from 'src/providers/database/prisma.module';
import { AssetModule } from '../asset/asset.module';
import { PriceModule } from 'src/price/price.module';

@Module({
    imports: [PrismaModule, AssetModule, PriceModule],
    controllers: [RoomsController],
    providers: [RoomsService],
    exports: [RoomsService],
})
export class RoomsModule {}

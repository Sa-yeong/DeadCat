import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { FarewellsService } from './farewells.service';
import { RoomThumbnailService } from './room-thumbnail.service';
import { PrismaModule } from 'src/providers/database/prisma.module';
import { HoldingModule } from '../holding/holding.module';

@Module({
    imports: [PrismaModule, HoldingModule],
    controllers: [RoomsController],
    providers: [RoomsService, FarewellsService, RoomThumbnailService],
    exports: [RoomsService],
})
export class RoomsModule {}

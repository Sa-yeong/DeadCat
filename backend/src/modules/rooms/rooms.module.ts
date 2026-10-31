import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { FarewellsService } from './farewells.service';
import { PrismaModule } from 'src/providers/database/prisma.module';
import { HoldingModule } from '../holding/holding.module';

@Module({
    imports: [PrismaModule, HoldingModule],
    controllers: [RoomsController],
    providers: [RoomsService, FarewellsService],
    exports: [RoomsService],
})
export class RoomsModule {}

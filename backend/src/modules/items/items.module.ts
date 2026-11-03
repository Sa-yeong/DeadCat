import { Module } from '@nestjs/common';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';
import { PrismaModule } from 'src/providers/database/prisma.module';
import { ItemsRepository } from './items.repository';

@Module({
    imports: [PrismaModule],
    controllers: [ItemsController],
    providers: [ItemsService, ItemsRepository],
    exports: [ItemsService],
})
export class ItemsModule {}

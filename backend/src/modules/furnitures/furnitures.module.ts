import { Module } from '@nestjs/common';
import { FurnituresController } from './furnitures.controller';
import { FurnituresService } from './furnitures.service';
import { FurnituresRepository } from './furnitures.repository';
import { PrismaModule } from 'src/providers/database/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [FurnituresController],
    providers: [FurnituresService, FurnituresRepository],
    exports: [FurnituresService],
})
export class FurnituresModule {}

import { Module } from '@nestjs/common';
import { WardrobesController } from './wardrobes.controller';
import { WardrobesService } from './wardrobes.service';
import { PrismaModule } from 'src/providers/database/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [WardrobesController],
    providers: [WardrobesService],
    exports: [WardrobesService],
})
export class WardrobesModule {}

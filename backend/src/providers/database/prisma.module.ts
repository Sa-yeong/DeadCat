import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global: 모든 모듈이 import 없이 PrismaService를 주입받을 수 있게 한다.
@Global()
@Module({
    providers: [PrismaService],
    exports: [PrismaService],
})
export class PrismaModule {}

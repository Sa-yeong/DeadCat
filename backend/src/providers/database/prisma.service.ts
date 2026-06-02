import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from 'generated/prisma/client';

// 런타임 DB 연결. schema.prisma가 생성한 PrismaClient를 확장해 주입 가능한 provider로 만든다.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
    async onModuleInit() {
        await this.$connect();
    }
}

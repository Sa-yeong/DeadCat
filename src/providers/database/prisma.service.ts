import {
    Injectable,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'generated/prisma/client';

// 런타임 DB 연결. Prisma 7부터는 driver adapter가 필수다.
// PostgreSQL용 @prisma/adapter-pg에 DATABASE_URL(트랜잭션 풀러)을 연결한다.
@Injectable()
export class PrismaService
    extends PrismaClient
    implements OnModuleInit, OnModuleDestroy
{
    constructor() {
        super({
            adapter: new PrismaPg({
                connectionString: process.env.DATABASE_URL,
            }),
        });
    }

    async onModuleInit() {
        await this.$connect();
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }
}

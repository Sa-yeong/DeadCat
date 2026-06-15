import { Injectable, OnModuleInit } from '@nestjs/common';
//import { PrismaClient } from 'generated/prisma/client';
//import { PrismaClient } from '../../../generated/prisma';
//import { PrismaClient } from '@prisma/client';
// 이렇게 바꾸세요
import { PrismaClient } from '@prisma/client/index';

// 런타임 DB 연결. schema.prisma가 생성한 PrismaClient를 확장해 주입 가능한 provider로 만든다.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
    async onModuleInit() {
        await this.$connect();
    }
}

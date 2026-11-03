import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { CompanyInfoController } from './company-info.controller';

import { CompanyInfoService } from './company-info.service';

import { CompanyInfoRepository } from './compant-info.repository';
import { PrismaModule } from 'src/providers/database/prisma.module';
import { KisModule } from 'src/providers/kis/kis.module';

@Module({
    imports: [
        // DART HTTP 요청에 사용
        HttpModule,
        PrismaModule,
        KisModule,
    ],

    controllers: [CompanyInfoController],

    providers: [CompanyInfoService, CompanyInfoRepository],

    exports: [CompanyInfoService],
})
export class CompanyInfoModule {}

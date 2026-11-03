import { Module } from '@nestjs/common';

import { TagRepository } from './repositories/tag.repository';
import { InvestmentTagService } from './services/investment-tag.service';
import { TagAssignmentService } from './services/tag-assignment.service';
import { PrismaModule } from 'src/providers/database/prisma.module';
import { TagsController } from './controller/tags-controller';

@Module({
    imports: [
        // DB 접근을 위해 PrismaModule 가져오기
        PrismaModule,
    ],
    controllers: [TagsController],
    providers: [
        // DB 조회 및 저장 담당
        TagRepository,

        // 투자 성향 분석 담당
        InvestmentTagService,

        // 분석 결과를 사용자 태그에 반영
        TagAssignmentService,
    ],
    exports: [
        // 다른 모듈에서도 사용할 서비스만 외부에 공개
        InvestmentTagService,
        TagAssignmentService,
    ],
})
export class TagModule {}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../providers/database/prisma.service';

// [예시] Repository = DB 접근 담당. PrismaService를 주입받는 형태를 보여주기 위한 템플릿.
// 실제 쿼리는 도메인 구현 시 작성. (지금은 DB 없이도 동작하도록 비워둠)
@Injectable()
export class ExampleRepository {
    constructor(private readonly prisma: PrismaService) {}
}

import { Controller, Post, Param, ParseIntPipe } from '@nestjs/common';
import { TagAssignmentService } from '../services/tag-assignment.service';

@Controller('tags')
export class TagsController {
    constructor(private readonly tagAssignmentService: TagAssignmentService) {}

    // 전체 회원의 투자 성향 태그 일괄 부여
    @Post('assignment/all')
    async assignAllUsersInvestmentTags() {
        return this.tagAssignmentService.assignAllUsersInvestmentTags();
    }

    // 특정 사용자의 투자 성향 태그 재계산
    @Post('assignment/:userId')
    async assignInvestmentTags(@Param('userId', ParseIntPipe) userId: number) {
        return this.tagAssignmentService.assignInvestmentTags(BigInt(userId));
    }
}

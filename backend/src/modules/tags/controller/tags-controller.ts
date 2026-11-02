import { Controller, Post, Param, ParseIntPipe } from '@nestjs/common';
import { TagAssignmentService } from '../services/tag-assignment.service';

@Controller('tags')
export class TagsController {
    constructor(private readonly tagAssignmentService: TagAssignmentService) {}

    // 특정 사용자의 투자 성향 태그 재계산 API
    @Post('assignment/:userId')
    async assignInvestmentTags(@Param('userId', ParseIntPipe) userId: number) {
        return this.tagAssignmentService.assignInvestmentTags(BigInt(userId));
    }
}

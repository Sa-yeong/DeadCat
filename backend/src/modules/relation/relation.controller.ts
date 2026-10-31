import {
    Controller,
    Get,
    Param,
    Post,
    Query,
    UseGuards,
    Req,
} from '@nestjs/common';
import { RelationService } from './relation.service';
import { UserRelationResponseDto } from './dto/user-relation-response.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';

//18. 팔로잉 & 팔로워 유저 리스트 조회
@Controller('users')
export class RelationController {
    constructor(private readonly relationService: RelationService) {}

    @UseGuards(JwtAuthGuard)
    @Get('me/relations')
    async getMyRelations(
        @Req() req: any,
        @Query('type') type: string,
    ): Promise<UserRelationResponseDto[]> {
        // JwtGuard에서 데리고 온 로그인 유저 ID
        const userId = req.user.id;

        //  relationService의 메소드 호출
        return this.relationService.getMyRelations(String(userId), type);
    }

    // 팔로우 토글 (지시서 3-⑨) — 사용자 기능이라 /users 아래(C1 예외)
    @UseGuards(JwtAuthGuard)
    @Post(':userId/follow')
    async toggleFollow(
        @User() followerId: bigint,
        @Param('userId') userId: string,
    ): Promise<{ is_following: boolean }> {
        return this.relationService.toggleFollow(followerId, userId);
    }
}

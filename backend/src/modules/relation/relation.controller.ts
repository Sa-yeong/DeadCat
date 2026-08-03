import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { RelationService } from './relation.service';
import { UserRelationResponseDto } from './dto/user-relation-response.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

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
}

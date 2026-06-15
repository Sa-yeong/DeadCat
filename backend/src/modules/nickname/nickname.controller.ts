import {
    Controller,
    Get,
    Patch,
    Query,
    Body,
    UseGuards,
    Request,
} from '@nestjs/common';
import { NicknameService } from './nickname.service';
import {
    JwtAuthGuard,
    type AuthenticatedRequest,
} from 'src/common/guards/jwt-auth.guard';
import {
    CheckNicknameQueryDto,
    CheckNicknameResponseDto,
    UpdateNicknameBodyDto,
    UpdateNicknameResponseDto,
} from './dto/nickname.dto';

@Controller()
export class NicknameController {
    constructor(private readonly nicknameService: NicknameService) {}

    // 12. 닉네임 중복 확인 (모달창 입력 시)
    @UseGuards(JwtAuthGuard)
    @Get('nicknames/check')
    async checkNickname(
        @Query() query: CheckNicknameQueryDto,
    ): Promise<CheckNicknameResponseDto> {
        return await this.nicknameService.checkNickname(query.nickname);
    }

    // 13. 닉네임 변경 (입력 완료 후 반영)
    @UseGuards(JwtAuthGuard)
    @Patch('users/me/nickname')
    async updateNickname(
        @Request() req: AuthenticatedRequest,
        @Body() body: UpdateNicknameBodyDto,
    ): Promise<UpdateNicknameResponseDto> {
        const userId = String(req.user!.id);
        return await this.nicknameService.updateNickname(userId, body.nickname);
    }
}

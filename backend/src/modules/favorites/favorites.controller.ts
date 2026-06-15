import { Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User } from '../../common/decorators/user.decorator';
import { FavoritesService } from './favorites.service';
import { MessageResponseDto } from './dto/message.response.dto';

// 관심종목 등록/해제. 인증 필수(JwtAuthGuard가 userId를 request.user에 세팅).
@Controller('favorites')
@UseGuards(JwtAuthGuard)
export class FavoritesController {
    constructor(private readonly favoritesService: FavoritesService) {}

    // POST /favorites/{code} — 관심 등록
    @Post(':code')
    async add(
        @Param('code') code: string,
        @User() userId: bigint,
    ): Promise<MessageResponseDto> {
        await this.favoritesService.add(userId, code);
        return { code, message: '관심 종목으로 등록되었습니다.' };
    }

    // DELETE /favorites/{code} — 관심 해제
    @Delete(':code')
    async remove(
        @Param('code') code: string,
        @User() userId: bigint,
    ): Promise<MessageResponseDto> {
        await this.favoritesService.remove(userId, code);
        return { code, message: '관심 종목에서 해제되었습니다.' };
    }
}

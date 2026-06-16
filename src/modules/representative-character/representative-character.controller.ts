import { Controller, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { RepresentativeCharacterService } from './representative-character.service';
import {
    JwtAuthGuard,
    type AuthenticatedRequest,
} from 'src/common/guards/jwt-auth.guard';
import {
    SetRepresentCharacterDto,
    RepresentCharacterResponseDto,
} from './dto/set-representative-character.dto';

@Controller('users/me/representative-character')
export class RepresentativeCharacterController {
    constructor(private readonly service: RepresentativeCharacterService) {}

    @UseGuards(JwtAuthGuard)
    @Patch()
    async setRepresentativeCharacter(
        @Request() req: AuthenticatedRequest, // 인증된 요청 객체 주입
        @Body() body: SetRepresentCharacterDto,
    ): Promise<RepresentCharacterResponseDto> {
        // 토큰에서 추출한  ID 바인딩
        const userId = String(req.user!.id);

        return await this.service.setRepresentativeCharacter(
            userId,
            body.stock_code,
        );
    }
}

import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { WardrobesService } from './wardrobes.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('home/characters')
export class WardrobesController {
    constructor(private readonly wardrobesService: WardrobesService) {}

    // 5. 캐릭터별 보유 의상 목록 조회
    @UseGuards(JwtAuthGuard)
    @Get(':character_id/costumes')
    async getCharacterCostumes(
        @Request() req: any,
        @Param('character_id') characterId: string,
    ) {
        const userId = String(req.user.id || req.user.sub);
        return await this.wardrobesService.getCharacterCostumes(
            userId,
            characterId,
        );
    }
}

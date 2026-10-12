import {
    Controller,
    Get,
    Param,
    UseGuards,
    Request,
    Put,
} from '@nestjs/common';
import { CharactersService } from './characters.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'; // 경로 조정
import { UpdateCharacterPlacementDto } from './dto/update-placement.dto';

@Controller('home/characters')
export class CharactersController {
    constructor(private readonly charactersService: CharactersService) {}

    // 5. 캐릭터별 보유 의상 목록 조회
    @UseGuards(JwtAuthGuard)
    @Get(':character_id/costumes')
    async getCharacterCostumes(
        @Request() req: any,
        @Param('character_id') characterId: string,
    ) {
        const userId = String(req.user.id || req.user.sub);
        return await this.charactersService.getCharacterCostumes(
            userId,
            characterId,
        );
    }

    // 17.보유 주식 중 거실 배치 캐릭터 선정
    @UseGuards(JwtAuthGuard)
    @Put('placement')
    async placeCharacters(
        @Request() req: any,
        @Body() dto: UpdateCharacterPlacementDto,
    ) {
        const userId = String(req.user.id || req.user.sub);
        return await this.charactersService.placeCharacters(userId, dto);
    }
}

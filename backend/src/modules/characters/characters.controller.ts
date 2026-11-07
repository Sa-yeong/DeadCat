import {
    Controller,
    Get,
    Param,
    UseGuards,
    Request,
    Put,
    Body,
    Delete,
    Post,
} from '@nestjs/common';
import { CharactersService } from './characters.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'; // 경로 조정
import { UpdateCharacterPlacementDto } from './dto/update-placement.dto';
import { UpdateCostumeDto } from './dto/update-costume.dto';
import { UpdatePresetDto } from './dto/update-preset.dto';
import { CreatePresetDto } from './dto/create-preset.dto';

@Controller('home/characters')
export default class CharactersController {
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

    // 11. 캐릭터 의상 변경 (옷 입히기)
    @UseGuards(JwtAuthGuard)
    @Put(':character_id/costume')
    async changeCostume(
        @Request() req: any,
        @Param('character_id') characterId: string,
        @Body() dto: UpdateCostumeDto,
    ) {
        const userId = String(req.user.id || req.user.sub);
        return await this.charactersService.changeCostume(
            userId,
            characterId,
            dto,
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
        //const userId = '2';
        return await this.charactersService.placeCharacters(userId, dto);
    }

    // 18. 유저 캐릭터 프리셋 목록 조회
    @UseGuards(JwtAuthGuard)
    @Get('presets') // GET /home/characters/presets
    async getPresets(@Request() req: any) {
        const userId = String(req.user.id || req.user.sub);
        return await this.charactersService.getPresets(userId);
    }

    // 19. 새로운 프리셋 추가 (저장)
    @UseGuards(JwtAuthGuard)
    @Post('presets') // POST /home/characters/presets
    async createPreset(@Request() req: any, @Body() dto: CreatePresetDto) {
        const userId = String(req.user.id || req.user.sub);
        return await this.charactersService.createPreset(userId, dto);
    }

    // 20. 기존 프리셋 수정 (이름 및 캐릭터 조합 변경)
    @UseGuards(JwtAuthGuard)
    @Put('presets/:preset_id') // PUT /home/characters/presets/:preset_id
    async updatePreset(
        @Request() req: any,
        @Param('preset_id') presetId: string,
        @Body() dto: UpdatePresetDto,
    ) {
        const userId = String(req.user.id || req.user.sub);
        return await this.charactersService.updatePreset(userId, presetId, dto);
    }

    // 21. 프리셋 삭제
    @UseGuards(JwtAuthGuard)
    @Delete('presets/:preset_id') // DELETE /home/characters/presets/:preset_id
    async deletePreset(
        @Request() req: any,
        @Param('preset_id') presetId: string,
    ) {
        const userId = String(req.user.id || req.user.sub);
        return await this.charactersService.deletePreset(userId, presetId);
    }
}

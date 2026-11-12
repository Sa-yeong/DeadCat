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
import { UpdateClothesDto } from './dto/update-clothes.dto';
import { UpdatePresetDto } from './dto/update-preset.dto';
import { CreatePresetDto } from './dto/create-preset.dto';
import { GiftItemDto } from './dto/gift-item.dto';

// 내 거실 캐릭터 · 옷 · 선물 · 프리셋 (C1 경로표 2절: /home/characters → /rooms/me)
@Controller('rooms/me')
export default class CharactersController {
    constructor(private readonly charactersService: CharactersService) {}

    // 5. 캐릭터별 옷 목록 조회 (해금 · 착용 여부)
    @UseGuards(JwtAuthGuard)
    @Get('characters/:stockId/clothes')
    async getCharacterClothes(
        @Request() req: any,
        @Param('stockId') stockId: string,
    ) {
        const userId = String(req.user.id || req.user.sub);
        return await this.charactersService.getCharacterClothes(
            userId,
            stockId,
        );
    }

    // 11. 캐릭터 옷 변경 (옷 입히기)
    @UseGuards(JwtAuthGuard)
    @Put('characters/:stockId/clothes')
    async changeClothes(
        @Request() req: any,
        @Param('stockId') stockId: string,
        @Body() dto: UpdateClothesDto,
    ) {
        const userId = String(req.user.id || req.user.sub);
        return await this.charactersService.changeClothes(userId, stockId, dto);
    }

    // 7. 캐릭터 아이템 선물 (3-⑦-a)
    @UseGuards(JwtAuthGuard)
    @Post('characters/:stockId/gift')
    async giftItem(
        @Request() req: any,
        @Param('stockId') stockId: string,
        @Body() dto: GiftItemDto,
    ) {
        const userId = String(req.user.id || req.user.sub);
        return await this.charactersService.giftItem(userId, stockId, dto);
    }

    // 17. 보유 주식 중 거실 표시 캐릭터 선정
    @UseGuards(JwtAuthGuard)
    @Put('characters')
    async placeCharacters(
        @Request() req: any,
        @Body() dto: UpdateCharacterPlacementDto,
    ) {
        const userId = String(req.user.id || req.user.sub);
        return await this.charactersService.placeCharacters(userId, dto);
    }

    // 18. 유저 캐릭터 프리셋 목록 조회
    @UseGuards(JwtAuthGuard)
    @Get('presets')
    async getPresets(@Request() req: any) {
        const userId = String(req.user.id || req.user.sub);
        return await this.charactersService.getPresets(userId);
    }

    // 19. 새로운 프리셋 추가 (저장)
    @UseGuards(JwtAuthGuard)
    @Post('presets')
    async createPreset(@Request() req: any, @Body() dto: CreatePresetDto) {
        const userId = String(req.user.id || req.user.sub);
        return await this.charactersService.createPreset(userId, dto);
    }

    // 프리셋 선택 (3-⑥) — 거실에 세울 캐릭터도 이 프리셋으로 바뀜
    @UseGuards(JwtAuthGuard)
    @Put('presets/:presetId/activate')
    async activatePreset(
        @Request() req: any,
        @Param('presetId') presetId: string,
    ) {
        const userId = String(req.user.id || req.user.sub);
        return await this.charactersService.activatePreset(userId, presetId);
    }

    // 20. 기존 프리셋 수정 (이름 및 캐릭터 조합 변경)
    @UseGuards(JwtAuthGuard)
    @Put('presets/:presetId')
    async updatePreset(
        @Request() req: any,
        @Param('presetId') presetId: string,
        @Body() dto: UpdatePresetDto,
    ) {
        const userId = String(req.user.id || req.user.sub);
        return await this.charactersService.updatePreset(userId, presetId, dto);
    }

    // 21. 프리셋 삭제
    @UseGuards(JwtAuthGuard)
    @Delete('presets/:presetId')
    async deletePreset(
        @Request() req: any,
        @Param('presetId') presetId: string,
    ) {
        const userId = String(req.user.id || req.user.sub);
        return await this.charactersService.deletePreset(userId, presetId);
    }
}

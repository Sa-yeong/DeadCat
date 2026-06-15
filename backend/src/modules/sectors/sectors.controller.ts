import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { User } from '../../common/decorators/user.decorator';
import { SectorsService } from './sectors.service';
import { SectorResponseDto } from './dto/sector.response.dto';
import { StockRankingResponseDto } from '../stocks/dto/stock-ranking.response.dto';

@Controller('sectors')
export class SectorsController {
    constructor(private readonly sectorsService: SectorsService) {}

    // GET /sectors — 섹터 목록 + 상승률
    @Get()
    async getSectors(): Promise<SectorResponseDto[]> {
        return this.sectorsService.getSectors();
    }

    // GET /sectors/{code}/stocks — 섹터별 종목 리스트(선택 인증: is_favorite 표시)
    @Get(':code/stocks')
    @UseGuards(OptionalJwtAuthGuard)
    async getStocksBySector(
        @Param('code') code: string,
        @User() userId?: bigint,
    ): Promise<StockRankingResponseDto[]> {
        return this.sectorsService.getStocksBySector(code, userId);
    }
}

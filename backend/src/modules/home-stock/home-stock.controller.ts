import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { HomeStocksService } from './home-stock.service';
import { SearchStocksQueryDto } from './dto/search-stock.dto';
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt-auth.guard';

@Controller('home/stocks')
export class HomeStocksController {
    constructor(private readonly homeStocksService: HomeStocksService) {}

    // 10.4 종목 검색 (비인증 허용)
    @UseGuards(OptionalJwtAuthGuard)
    @Get('search')
    async searchStocks(@Query() query: SearchStocksQueryDto) {
        return await this.homeStocksService.searchStocks(query);
    }
}

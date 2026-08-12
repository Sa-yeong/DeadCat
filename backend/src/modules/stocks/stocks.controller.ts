import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { User } from '../../common/decorators/user.decorator';
import { StocksService, MarketFilter } from './stocks.service';
import { StockRankingResponseDto } from './dto/stock-ranking.response.dto';
import { StockDetailResponseDto } from './dto/stock-detail.response.dto';
import { VolumeSummaryResponseDto } from './dto/volume-summary.response.dto';
import { StockChartResponseDto } from './dto/stock-chart-dto';
import { OrderbookResponseDto } from './dto/orderbook.response.dto';

// 거래대금 상위 종목 리스트. 선택 인증: 로그인 시 is_favorite 표시.
@Controller('stocks')
export class StocksController {
    constructor(private readonly stocksService: StocksService) {}

    // GET /stocks/ranking?market=DOMESTIC|FOREIGN (생략 시 전체 통합)
    @Get('ranking')
    @UseGuards(OptionalJwtAuthGuard)
    async getRanking(
        @User() userId?: bigint,
        @Query('market') market?: string,
    ): Promise<StockRankingResponseDto[]> {
        const filter: MarketFilter | undefined =
            market === 'DOMESTIC' || market === 'FOREIGN' ? market : undefined;
        return this.stocksService.getRanking(userId, filter);
    }

    // GET /stocks/{stock_code}
    @Get(':stock_code')
    @UseGuards(OptionalJwtAuthGuard)
    async getStockDetail(
        @Param('stock_code') stockCode: string,
        @User() userId?: bigint,
    ): Promise<StockDetailResponseDto> {
        return this.stocksService.getStockDetail(stockCode, userId);
    }

    @Get(':stock_code/volume-summary')
    async getVolumeSummary(
        @Param('stock_code') stockCode: string,
    ): Promise<VolumeSummaryResponseDto> {
        return this.stocksService.getVolumeSummary(stockCode);
    }

    //
    @Get(':stock_code/chart')
    async getStockChart(
        @Param('stock_code') stockCode: string,
        @Query('timeframe') timeframe?: string,
    ): Promise<StockChartResponseDto[]> {
        return await this.stocksService.getStockChart(
            stockCode,
            timeframe ?? 'DAY',
        );
    }

    @Get(':stock_code/orderbook')
    async getOrderbook(
        @Param('stock_code') stockCode: string,
    ): Promise<OrderbookResponseDto> {
        return this.stocksService.getOrderbook(stockCode);
    }
}

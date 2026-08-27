import { Controller, Get, Param } from '@nestjs/common';
import { CompanyInfoService } from './company-info.service';

@Controller('stocks')
export class CompanyInfoController {
    constructor(private readonly companyInfoService: CompanyInfoService) {}

    // 1. 개별 종목 상단 지표 조회
    @Get(':stock_code/company-info/summary')
    async getSummary(@Param('stock_code') stockCode: string) {
        return await this.companyInfoService.getSummary(stockCode);
    }

    // 2. 연간 실적 조회
    @Get(':stock_code/company-info/financials')
    async getFinancials(@Param('stock_code') stockCode: string) {
        return await this.companyInfoService.getFinancials(stockCode);
    }

    // 3. 종목 능력치 조회
    @Get(':stock_code/company-info/scores')
    async getScores(@Param('stock_code') stockCode: string) {
        return await this.companyInfoService.getScores(stockCode);
    }

    // 4. 배당 정보 및 기업 개요 조회
    @Get(':stock_code/company-info/overview')
    async getOverview(@Param('stock_code') stockCode: string) {
        return await this.companyInfoService.getOverview(stockCode);
    }
}

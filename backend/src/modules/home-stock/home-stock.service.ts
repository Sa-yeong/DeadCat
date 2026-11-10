import { Injectable } from '@nestjs/common';
import { HomeStocksRepository } from './home-stock.repository';
import { SearchStocksQueryDto } from './dto/search-stock.dto';

@Injectable()
export class HomeStocksService {
    constructor(private readonly homeStocksRepository: HomeStocksRepository) {}

    // 종목 검색 처리
    async searchStocks(query: SearchStocksQueryDto) {
        const { keyword } = query;

        if (!keyword || keyword.trim() === '') {
            return { stocks: [] };
        }

        // 1. Repository에서 데이터 조회 (타입 자동 추론됨)
        const rawStocks = await this.homeStocksRepository.searchStocks(keyword);

        // 2. 검색어 시작 부분(접두사) 우선 정렬 및 글자 수 정렬 (삼성전자 > 삼성전자우)
        const sortedStocks = [...rawStocks].sort((a, b) => {
            const aStartsWith = a.stock_name.startsWith(keyword);
            const bStartsWith = b.stock_name.startsWith(keyword);

            if (aStartsWith && !bStartsWith) return -1;
            if (!aStartsWith && bStartsWith) return 1;
            return a.stock_name.length - b.stock_name.length;
        });

        // 3. stock_id를 Number로 안전하게 변환하여 응답 생성
        const stocks = sortedStocks.map((s) => ({
            stock_id: Number(s.stock_id),
            stock_code: s.stock_code,
            stock_name: s.stock_name,
        }));

        // 4. 글로벌 Interceptor가 { success: true, data: ... }로 감싸므로 객체만 반환
        return {
            stocks,
        };
    }
}

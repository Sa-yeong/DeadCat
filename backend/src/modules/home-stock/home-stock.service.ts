import { Injectable } from '@nestjs/common';
import { HomeStocksRepository } from './home-stock.repository';
import { SearchStocksQueryDto } from './dto/search-stock.dto';

@Injectable()
export class HomeStocksService {
    constructor(private readonly homeStocksRepository: HomeStocksRepository) {}

    // 종목 검색 처리
    async searchStocks(query: SearchStocksQueryDto) {
        const { keyword } = query;

        // 검색어가 없거나 공백이면 빈 배열 반환
        if (!keyword || keyword.trim() === '') {
            return { stocks: [] };
        }

        // 검색어 앞뒤 공백 제거
        const normalizedKeyword = keyword.trim();

        // 1. Repository에서 종목 데이터 조회
        const rawStocks =
            await this.homeStocksRepository.searchStocks(normalizedKeyword);

        // 2. 검색 우선순위 계산
        const getSearchPriority = (
            stock: (typeof rawStocks)[number],
        ): number => {
            // 1순위: 한글 종목명
            if (
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                stock.kr_name
                    ?.toLowerCase()
                    .startsWith(normalizedKeyword.toLowerCase())
            ) {
                return 1;
            }

            // 2순위: 영문 종목명
            if (
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                stock.en_name
                    ?.toLowerCase()
                    .startsWith(normalizedKeyword.toLowerCase())
            ) {
                return 2;
            }

            // 3순위: 종목 ID
            if (String(stock.stock_id).startsWith(normalizedKeyword)) {
                return 3;
            }

            // 4순위: 종목 코드
            if (
                stock.stock_code
                    ?.toLowerCase()
                    .startsWith(normalizedKeyword.toLowerCase())
            ) {
                return 4;
            }

            // 접두사가 일치하지 않는 검색 결과
            return 5;
        };

        // 3. 검색 우선순위에 따라 정렬
        const sortedStocks = [...rawStocks].sort((a, b) => {
            const aPriority = getSearchPriority(a);
            const bPriority = getSearchPriority(b);

            // 우선순위가 높은 종목 먼저 반환
            if (aPriority !== bPriority) {
                return aPriority - bPriority;
            }

            // 같은 우선순위라면 종목명 길이순 정렬
            return a.stock_name.length - b.stock_name.length;
        });

        // 4. API 명세에 맞게 응답 데이터 생성
        const stocks = sortedStocks.map((s) => ({
            stock_id: Number(s.stock_id),
            stock_code: s.stock_code,
            stock_name: s.stock_name,
        }));

        // 5. 글로벌 Interceptor가 응답을 래핑하므로 객체만 반환
        return {
            stocks,
        };
    }
}

/*@Injectable()
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
}*/

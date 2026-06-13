// 거래대금 상위 종목 응답 1행. (API 4 섹터별 종목 리스트도 이 형식 재사용)
export class StockRankingResponseDto {
    rank: number; // 거래대금 순위 (1부터)
    stock_code: string;
    stock_name: string;
    current_price: number;
    change_rate: number; // 등락률(%)
    trading_value: number; // 누적 거래대금(현지 통화)
    is_favorite: boolean; // 비로그인 시 항상 false
}

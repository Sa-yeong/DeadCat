// 거래대금 상위 종목 응답 1행. (API 4 섹터별 종목 리스트도 이 형식 재사용)
export class StockRankingResponseDto {
    rank: number; // 거래대금 순위 (1부터)
    stock_code: string;
    stock_name: string;
    market: string; // DOMESTIC(국내) | FOREIGN(해외)
    character_img_url: string | null; // 캐릭터 썸네일(호버용). 없으면 null
    current_price: number;
    change_rate: number; // 등락률(%)
    trading_value: number; // 누적 거래대금(현지 통화: 국내=원, 해외=달러)
    trading_value_krw: number; // 거래대금 원화 환산값 (전부 원 기준)
    is_favorite: boolean; // 비로그인 시 항상 false
}

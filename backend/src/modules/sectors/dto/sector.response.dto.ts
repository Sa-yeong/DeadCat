// 섹터(카테고리) 목록 1행.
export class SectorResponseDto {
    rank: number; // 섹터 상승률 순위(1부터)
    sector_code: string; // 카테고리 id
    sector_name: string;
    change_rate: number; // 섹터 내 종목 등락률 단순평균(%)
    num_of_incre_stocks: number; // 등락률 > 0 종목 수
}

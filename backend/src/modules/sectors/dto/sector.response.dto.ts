// 섹터(카테고리) 목록 1행.
export class SectorResponseDto {
    rank: number; // 섹터 상승률 순위(1부터)
    sector_code: string; // 카테고리 id
    sector_name: string;
    sector_img_url: string | null; // 섹터 일러스트 이미지 URL(미설정 시 null)
    change_rate: number; // 섹터 내 종목 등락률 단순평균(%)
    stock_count: number; // 섹터 내 전체 종목 수
    num_of_incre_stocks: number; // 등락률 > 0 종목 수
}

import { IndexHistoryPoint } from '../../../providers/kis/kis.provider';

// 상단 지수 슬라이드 1개.
export class IndexResponseDto {
    index_code: string;
    index_name: string;
    change_rate: number; // 전일 대비율(%)
    graph: IndexHistoryPoint[]; // 일별 OHLC 시계열(오름차순)
}

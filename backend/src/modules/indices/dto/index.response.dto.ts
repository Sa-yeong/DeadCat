import { IndexHistoryPoint } from '../../../providers/kis/kis.provider';

// 상단 지수 슬라이드 1개.
export class IndexResponseDto {
    index_code: string;
    index_name: string;
    current_value: number; // 현재 지수값
    change_rate: number; // 전일 대비율(%)
    change_amount: number; // 전일 대비 포인트 차이
    graph: IndexHistoryPoint[]; // 일별 OHLC 시계열(오름차순)
}

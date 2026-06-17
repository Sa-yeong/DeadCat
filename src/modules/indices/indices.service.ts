import { Injectable, Logger } from '@nestjs/common';
import { KisProvider, IndexData } from '../../providers/kis/kis.provider';
import { RedisService } from '../../providers/redis/redis.service';
import { IndexResponseDto } from './dto/index.response.dto';

// 보여줄 지수 정의. market: U=국내(KIS 업종코드), N=해외(KIS 지수코드).
// indices 테이블엔 메타(id,name)만 있어 코드/시장은 여기 상수로 둔다.
interface IndexDef {
    indexCode: string; // 응답용 공개 코드
    name: string;
    market: 'U' | 'N';
    kisCode: string; // KIS 조회 코드
}
const INDEX_DEFS: IndexDef[] = [
    { indexCode: 'KOSPI', name: '코스피', market: 'U', kisCode: '0001' },
    { indexCode: 'KOSDAQ', name: '코스닥', market: 'U', kisCode: '1001' },
    { indexCode: 'DJI', name: '다우존스', market: 'N', kisCode: '.DJI' },
    { indexCode: 'NASDAQ', name: '나스닥 종합', market: 'N', kisCode: 'COMP' },
    { indexCode: 'SP500', name: 'S&P500', market: 'N', kisCode: 'SPX' },
];
// 지수 캐시 TTL(초). 지수는 5개뿐이고 그래프는 일 단위라 짧게 캐시해 KIS 호출을 줄인다.
const CACHE_TTL = 60;
// 그래프 조회 기간(일). 최근 N일.
const GRAPH_DAYS = 30;

@Injectable()
export class IndicesService {
    private readonly logger = new Logger(IndicesService.name);

    constructor(
        private readonly kis: KisProvider,
        private readonly redis: RedisService,
    ) {}

    // GET /indices: 지수별 등락률 + 그래프. 종목별로 Redis 캐시(없으면 KIS 조회).
    async getIndices(): Promise<IndexResponseDto[]> {
        const { from, to } = this.dateRange();
        const result: IndexResponseDto[] = [];
        for (const def of INDEX_DEFS) {
            const data = await this.getCached(def, from, to);
            if (!data) continue; // 조회 실패한 지수는 제외
            result.push({
                index_code: def.indexCode,
                index_name: def.name,
                current_value: data.current_value,
                change_rate: data.change_rate,
                graph: data.graph,
            });
        }
        return result;
    }

    private async getCached(
        def: IndexDef,
        from: string,
        to: string,
    ): Promise<IndexData | null> {
        const key = `index:${def.indexCode}`;
        const cached = await this.redis.get(key);
        if (cached) return JSON.parse(cached) as IndexData;
        try {
            const data =
                def.market === 'U'
                    ? await this.kis.getDomesticIndexChart(def.kisCode, from, to)
                    : await this.kis.getOverseasIndexChart(def.kisCode, from, to);
            await this.redis.set(key, JSON.stringify(data), CACHE_TTL);
            return data;
        } catch (e) {
            this.logger.warn(
                `지수 조회 실패 ${def.indexCode}: ${e instanceof Error ? e.message : String(e)}`,
            );
            return null;
        }
    }

    // 최근 GRAPH_DAYS일 범위(YYYYMMDD).
    private dateRange(): { from: string; to: string } {
        const fmt = (d: Date): string =>
            d.toISOString().slice(0, 10).replace(/-/g, '');
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - GRAPH_DAYS);
        return { from: fmt(from), to: fmt(to) };
    }
}

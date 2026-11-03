import { Injectable, NotFoundException } from '@nestjs/common';
import { StocksService } from '../stocks/stocks.service';
import { StockRankingResponseDto } from '../stocks/dto/stock-ranking.response.dto';
import { SectorsRepository } from './sectors.repository';
import { SectorResponseDto } from './dto/sector.response.dto';

// 섹터 일러스트 이미지 URL 매핑(코드 상수).
// 섹터는 6개로 고정이라 DB 컬럼 대신 여기서 관리한다. key=sector_code(=카테고리 id).
// 실제 일러스트가 준비되면 아래 URL만 교체하면 된다(응답 형식은 그대로).
const SECTOR_IMG: Record<string, string> = {
    '1': 'https://placehold.co/300x200?text=반도체',
    '2': 'https://placehold.co/300x200?text=IT-플랫폼',
    '3': 'https://placehold.co/300x200?text=자동차-에너지',
    '4': 'https://placehold.co/300x200?text=금융',
    '5': 'https://placehold.co/300x200?text=소비재',
    '6': 'https://placehold.co/300x200?text=ETF',
};

// 섹터 도메인. 시세는 stocks 경유로만 접근(Redis 직접 접근 안 함).
@Injectable()
export class SectorsService {
    constructor(
        private readonly stocks: StocksService,
        private readonly repo: SectorsRepository,
    ) {}

    // GET /sectors: 섹터별 상승률(단순평균) + 상승 종목 수. 상승률 내림차순 정렬.
    async getSectors(): Promise<SectorResponseDto[]> {
        const sectors = await this.repo.findAllSectors();

        const rows = await Promise.all(
            sectors.map(async (s) => {
                const codes = await this.repo.findStockCodesBySector(s.id);
                const rates = await this.stocks.getChangeRates(codes); // 시세 있는 종목만
                const values = [...rates.values()];
                const avg =
                    values.length > 0
                        ? values.reduce((a, b) => a + b, 0) / values.length
                        : 0;
                const upCount = values.filter((r) => r > 0).length;
                const sectorCode = String(s.id);
                return {
                    sector_code: sectorCode,
                    sector_name: s.name,
                    sector_img_url: SECTOR_IMG[sectorCode] ?? null,
                    change_rate: Math.round(avg * 100) / 100,
                    stock_count: codes.length,
                    num_of_incre_stocks: upCount,
                };
            }),
        );

        // 상승률 내림차순 정렬 후 rank 부여.
        rows.sort((a, b) => b.change_rate - a.change_rate);
        return rows.map((r, i) => ({ rank: i + 1, ...r }));
    }

    // GET /sectors/{code}/stocks: 섹터 내 종목 리스트(형식은 stocks와 동일).
    // 섹터 내 정렬은 상승률(등락률) 내림차순.
    async getStocksBySector(
        sectorCode: string,
        userId?: bigint,
    ): Promise<StockRankingResponseDto[]> {
        let categoryId: bigint;
        try {
            categoryId = BigInt(sectorCode);
        } catch {
            throw new NotFoundException(`존재하지 않는 섹터입니다: ${sectorCode}`);
        }
        const codes = await this.repo.findStockCodesBySector(categoryId);
        const rows = await this.stocks.buildStockRows(codes, userId);
        // 상승률 내림차순으로 재정렬 + rank 재부여.
        rows.sort((a, b) => b.change_rate - a.change_rate);
        return rows.map((r, i) => ({ ...r, rank: i + 1 }));
    }
}

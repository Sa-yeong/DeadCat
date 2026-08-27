import { Injectable } from '@nestjs/common';

@Injectable()
export class CompanyInfoRepository {
    /**
     * 추후 DB에서 기업 재무정보를 조회하는 곳
     *
     * 현재는 DART API를 직접 조회하므로
     * Repository 구현은 비워둘 수 있다.
     */
    findFinancials(stockCode: string): any[] {
        // TODO:
        // DB 캐싱을 도입할 경우 구현
        return [];
    }

    /**
     * 기업정보 캐시 조회
     */
    findOverview(stockCode: string): any | null {
        // TODO:
        // DB에서 기업 개요 조회
        return null;
    }
}

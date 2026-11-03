import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class DartProvider {
    private readonly logger = new Logger(DartProvider.name);
    private readonly baseUrl = 'https://opendart.fss.or.kr/api';

    constructor(
        private readonly http: HttpService,
        private readonly config: ConfigService,
    ) {}

    private get apiKey(): string {
        return this.config.getOrThrow<string>('DART_API_KEY');
    }

    /**
     * 1. 주요계정 조회 (매출, 영업이익)
     */
    async getSingleAccount(
        corpCode: string,
        year: number,
        reportCode = '11011',
    ): Promise<any[]> {
        try {
            const response = await firstValueFrom(
                this.http.get(`${this.baseUrl}/fnlttSinglAcnt.json`, {
                    params: {
                        crtfc_key: this.apiKey,
                        corp_code: corpCode,
                        bsns_year: String(year),
                        reprt_code: reportCode,
                    },
                }),
            );
            if (response.data.status !== '000') return [];
            return response.data.list ?? [];
        } catch {
            return [];
        }
    }

    /**
     * 2. 재무지표 조회 (성장성, 수익성, 안정성 등)
     * idxClCode: M210000(수익성), M220000(안정성), M230000(성장성), M240000(활동성)
     */
    async getFinancialIndicators(
        corpCode: string,
        year: number,
        idxClCode: string,
    ): Promise<any[]> {
        try {
            const response = await firstValueFrom(
                this.http.get(`${this.baseUrl}/fnlttSinglIndx.json`, {
                    params: {
                        crtfc_key: this.apiKey,
                        corp_code: corpCode,
                        bsns_year: String(year),
                        reprt_code: '11011',
                        idx_cl_code: idxClCode,
                    },
                }),
            );
            if (response.data.status !== '000') return [];
            return response.data.list ?? [];
        } catch {
            return [];
        }
    }

    /**
     * 3. 배당에 관한 사항 조회
     */
    async getDividendInfo(corpCode: string, year: number): Promise<any[]> {
        try {
            const response = await firstValueFrom(
                this.http.get(`${this.baseUrl}/alotMatter.json`, {
                    params: {
                        crtfc_key: this.apiKey,
                        corp_code: corpCode,
                        bsns_year: String(year),
                        reprt_code: '11011',
                    },
                }),
            );
            if (response.data.status !== '000') return [];
            return response.data.list ?? [];
        } catch {
            return [];
        }
    }

    /**
     * 4. 기업 개요 조회 (회사명, 설립일 등 기본 정보)
     */
    async getCompanyOverview(corpCode: string): Promise<any> {
        try {
            const response = await firstValueFrom(
                this.http.get(`${this.baseUrl}/company.json`, {
                    params: {
                        crtfc_key: this.apiKey,
                        corp_code: corpCode,
                    },
                }),
            );
            if (response.data.status !== '000') return null;
            return response.data;
        } catch {
            return null;
        }
    }
}

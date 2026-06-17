import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IndicesService } from './indices.service';

// 지수 폴링 주기(60초). 변경 시 이 cron 한 줄만 수정.
const POLL_CRON = '*/60 * * * * *';

// 지수 캐시 프리워밍 스케줄러.
// 부팅 시 1회 + 주기적으로 KIS에서 지수를 받아 Redis에 미리 적재한다.
// 덕분에 컨트롤러는 항상 데워진 캐시를 읽어 콜드 스타트(최초 ~2초) 없이 빠르게 응답.
@Injectable()
export class IndicesScheduler implements OnModuleInit {
    private readonly logger = new Logger(IndicesScheduler.name);
    private isWarming = false;

    constructor(private readonly indices: IndicesService) {}

    // 서버 기동 직후 1회 프리워밍(첫 요청자도 캐시 히트).
    async onModuleInit(): Promise<void> {
        await this.warm('부팅');
    }

    @Cron(POLL_CRON)
    async pollIndices(): Promise<void> {
        await this.warm('폴링');
    }

    private async warm(reason: string): Promise<void> {
        if (this.isWarming) {
            this.logger.warn(`이전 워밍이 진행 중이라 이번(${reason})을 건너뜁니다.`);
            return;
        }
        this.isWarming = true;
        try {
            const ok = await this.indices.warmCache();
            this.logger.log(`지수 캐시 워밍(${reason}) 완료: ${ok}/5`);
        } catch (e) {
            this.logger.error(
                `지수 워밍 실패(${reason}): ${e instanceof Error ? e.message : String(e)}`,
            );
        } finally {
            this.isWarming = false;
        }
    }
}

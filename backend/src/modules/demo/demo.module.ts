import { Global, Module } from '@nestjs/common';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

/** 데모 계정 판별 — 시세 · 감정 · 주문이 같이 쓰므로 전역 */
@Global()
@Module({
    controllers: [DemoController],
    providers: [DemoService],
    exports: [DemoService],
})
export class DemoModule {}

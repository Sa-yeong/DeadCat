import {
    Global,
    MiddlewareConsumer,
    Module,
    NestModule,
    RequestMethod,
} from '@nestjs/common';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';
import { DemoContextMiddleware } from './demo-context.middleware';

/** 데모 계정 판별 + 데모 요청 표시 — 시세 · 감정 · 주문이 같이 쓰므로 전역 */
@Global()
@Module({
    controllers: [DemoController],
    providers: [DemoService],
    exports: [DemoService],
})
export class DemoModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer
            .apply(DemoContextMiddleware)
            .forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
    }
}

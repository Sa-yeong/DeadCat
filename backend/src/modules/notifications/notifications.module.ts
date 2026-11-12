import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './notifications.repository';
import { PriceModule } from '../../price/price.module';

// 앱 공용 알림 통로. 주문 체결 엔진(orders)이 NotificationsService로 이벤트를 보낸다.
// PriceModule은 놓친 알림의 가격을 원화로 보일 환율 때문에 — 시세 계층은 orders를 모르므로 순환이 없다.
@Module({
    imports: [PriceModule],
    controllers: [NotificationsController],
    providers: [NotificationsService, NotificationsRepository],
    exports: [NotificationsService],
})
export class NotificationsModule {}

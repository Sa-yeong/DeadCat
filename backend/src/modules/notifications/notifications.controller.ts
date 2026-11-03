import {
    Body,
    Controller,
    Get,
    HttpCode,
    Post,
    Req,
    Sse,
    UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { NotificationsService } from './notifications.service';
import { OrderNotification } from './dto/order-notification.dto';
import { ReadNotificationsDto } from './dto/read-notifications.dto';
import {
    JwtAuthGuard,
    type AuthenticatedRequest,
} from 'src/common/guards/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
    constructor(private readonly notifications: NotificationsService) {}

    // GET /notifications/stream — 대기 주문이 나중에 체결·거절되면 이벤트(SSE)
    @Sse('stream')
    stream(
        @Req() req: AuthenticatedRequest,
    ): Observable<{ data: OrderNotification }> {
        return this.notifications.stream(req.user!.id);
    }

    // GET /notifications/unread — 안 보여준 알림, 오래된 것부터 최대 20개
    @Get('unread')
    async unread(
        @Req() req: AuthenticatedRequest,
    ): Promise<OrderNotification[]> {
        return await this.notifications.listUnread(req.user!.id);
    }

    // POST /notifications/read — 보여줬음 표시(내 주문만, 여러 번 불러도 같음)
    @Post('read')
    @HttpCode(200)
    async read(
        @Req() req: AuthenticatedRequest,
        @Body() dto: ReadNotificationsDto,
    ): Promise<{ read: number }> {
        return {
            read: await this.notifications.markRead(
                req.user!.id,
                dto.order_ids,
            ),
        };
    }
}

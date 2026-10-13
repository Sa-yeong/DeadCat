import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderResponseDto } from './dto/create-order-response.dto';
import { PendingOrderDto } from './dto/pending-order.dto';
import {
    JwtAuthGuard,
    type AuthenticatedRequest,
} from 'src/common/guards/jwt-auth.guard';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) {}

    // POST /orders — 시장가(즉시 체결) / 지정가·예약(대기)
    @Post()
    async createOrder(
        @Req() req: AuthenticatedRequest,
        @Body() dto: CreateOrderDto,
    ): Promise<CreateOrderResponseDto> {
        return await this.ordersService.createOrder(req.user!.id, dto);
    }

    // GET /orders/pending?stock_code= — 내 대기 주문
    @Get('pending')
    async listPending(
        @Req() req: AuthenticatedRequest,
        @Query('stock_code') stockCode?: string,
    ): Promise<PendingOrderDto[]> {
        return await this.ordersService.listPending(req.user!.id, stockCode);
    }

    // DELETE /orders/:orderId — 내 대기 주문 취소
    @Delete(':orderId')
    async cancel(
        @Req() req: AuthenticatedRequest,
        @Param('orderId') orderId: string,
    ): Promise<CreateOrderResponseDto> {
        return await this.ordersService.cancel(req.user!.id, orderId);
    }
}

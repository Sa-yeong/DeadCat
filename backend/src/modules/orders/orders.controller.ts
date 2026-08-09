import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderResponseDto } from './dto/create-order-response.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('orders')
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) {}

    @UseGuards(JwtAuthGuard) // 인증 가드 적용
    @Post()
    async createOrder(
        @Req() req: any,
        @Body() dto: CreateOrderDto,
    ): Promise<CreateOrderResponseDto> {
        const userId = req.user.id;
        return await this.ordersService.createOrder(userId, dto);
    }
}

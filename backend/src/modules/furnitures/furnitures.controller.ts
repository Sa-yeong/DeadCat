import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { FurnituresService } from './furnitures.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'; // 경로 조정

@Controller('home/furniture')
export class FurnituresController {
    constructor(private readonly furnituresService: FurnituresService) {}

    // 4. 가구 인벤토리 조회
    @UseGuards(JwtAuthGuard)
    @Get('inventory')
    async getFurnitureInventory(@Request() req: any) {
        const userId = String(req.user.id || req.user.sub);
        return await this.furnituresService.getFurnitureInventory(userId);
    }
}

import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ItemsService } from './items.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

// 아이템 보관함은 C1에 따라 /rooms/me/items. 가구 보관함은 가구 묶음(보류)이라 옛 경로 그대로
@Controller()
export class ItemsController {
    constructor(private readonly itemsService: ItemsService) {}

    // 3. 소비성 아이템 인벤토리 조회
    @UseGuards(JwtAuthGuard)
    @Get('rooms/me/items')
    async getUserItems(@Request() req: any) {
        const userId = String(req.user.id || req.user.sub);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return await this.itemsService.getUserItems(userId);
    }

    // 4. 가구 인벤토리 조회
    @UseGuards(JwtAuthGuard)
    @Get('home/furniture/inventory')
    async getUserFurnitureInventory(@Request() req: any) {
        const userId = String(req.user.id || req.user.sub);
        return await this.itemsService.getUserFurnitureInventory(userId);
    }
}

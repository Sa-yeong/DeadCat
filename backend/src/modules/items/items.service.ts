import { Injectable } from '@nestjs/common';

import { FurnitureInventoryDto } from './dto/furniture-inventory-response.dto';
import { PrismaService } from 'src/providers/database/prisma.service';
import { ItemInventoryDto } from './dto/item-inventory-response.dto copy';
import { ItemsRepository } from './items.repository';

@Injectable()
export class ItemsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly itemsRepository: ItemsRepository,
    ) {}

    // 3. 소비성 아이템 인벤토리 조회
    async getUserItems(userIdStr: string) {
        const userId = BigInt(userIdStr);
        const inventories =
            await this.itemsRepository.findConsumableInventory(userId);

        return inventories.map((inv) => ({
            item_id: Number(inv.item_id),
            item_name: inv.items.name,
            quantity: inv.quantity,
            item_img_url: `https://assets.deadcat.com/items/${inv.item_id}.png`,
        }));
    }

    // 4. 가구 보관함 (미배치 잔여 가구) 조회
    async getUserFurnitureInventory(userIdStr: string) {
        const userId = BigInt(userIdStr);
        const storages =
            await this.itemsRepository.findFurnitureInventory(userId);

        return storages.map((s) => ({
            item_code: `FURNITURE_${s.furniture_id}`,
            furniture_name: s.furnitures.name,
            remaining_count: s.quantity,
            item_img_url: `https://assets.deadcat.com/furnitures/${s.furniture_id}.png`,
        }));
    }
}

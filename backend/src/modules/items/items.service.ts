import { Injectable } from '@nestjs/common';

import { FurnitureInventoryDto } from './dto/furniture-inventory-response.dto';
import { PrismaService } from 'src/providers/database/prisma.service';
import { ItemInventoryDto } from './dto/item-inventory-response.dto copy';
import { ItemsRepository } from './items.repository';
import { giftAffinityPoints, toItemGrade } from 'src/common/items/item-grade';

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

        // 등급 · 선물 점수는 선물 API 와 같은 함수로(item-grade.ts) — 프론트는 계산하지 않고 표시만. 표에 없는 등급이면 null(선물 불가)
        // 그림 주소는 싣지 않는다 — 프론트가 item_id 로 public/items/{id}.png 를 조립
        return inventories.map((inv) => ({
            item_id: Number(inv.item_id),
            item_name: inv.items.name,
            item_level: toItemGrade(inv.items.level),
            affinity_points: giftAffinityPoints(inv.items.level),
            quantity: inv.quantity,
        }));
    }

    // 4. 가구 보관함 (미배치 잔여 가구) 조회
    async getUserFurnitureInventory(userIdStr: string) {
        const userId = BigInt(userIdStr);
        const storages =
            await this.itemsRepository.findFurnitureInventory(userId);

        // 한 줄 = 보관함의 가구 한 종류. furniture_id 는 프론트 카탈로그 · 그림(public/furnitures/{id}.png)의 키
        return storages.map((s) => ({
            furniture_id: Number(s.furniture_id),
            furniture_name: s.furnitures.name,
            level: s.furnitures.level,
            remaining_count: s.quantity,
        }));
    }
}

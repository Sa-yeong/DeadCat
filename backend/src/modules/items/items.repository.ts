import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

@Injectable()
export class ItemsRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findConsumableInventory(userId: bigint) {
        return await this.prisma.inventory.findMany({
            where: { user_id: userId, quantity: { gt: 0 } },
            include: { items: true },
        });
    }

    // 보관함 = 위치가 빈 줄. 줄 하나가 가구 한 개라 종류별로 세면 개수
    async findFurnitureInventory(userId: bigint) {
        const grouped = await this.prisma.user_furniture.groupBy({
            by: ['furniture_id'],
            where: { user_id: userId, position_x: null },
            _count: { _all: true },
            orderBy: { furniture_id: 'asc' },
        });
        if (!grouped.length) return [];

        const furnitures = await this.prisma.furnitures.findMany({
            where: { id: { in: grouped.map((g) => g.furniture_id) } },
        });
        const byId = new Map(furnitures.map((f) => [f.id.toString(), f]));

        return grouped.map((g) => ({
            furniture_id: g.furniture_id,
            quantity: g._count._all,
            // user_furniture.furniture_id 외래 키가 있어 항상 찾는다
            furnitures: byId.get(g.furniture_id.toString())!,
        }));
    }
}

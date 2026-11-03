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

    async findFurnitureInventory(userId: bigint) {
        return await this.prisma.storage.findMany({
            where: { user_id: userId, quantity: { gt: 0 } },
            include: { furnitures: true },
        });
    }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

@Injectable()
export class UserRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findById(userId: string) {
        return await this.prisma.users.findUnique({
            where: { id: BigInt(userId) },
            select: {
                id: true,
                nickname: true,
                represent_stock_id: true,
            },
        });
    }
}

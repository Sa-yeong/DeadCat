import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service'; // 프리스마 서비스 경로에 맞게 수정

@Injectable()
export class NicknameRepository {
    constructor(private readonly prisma: PrismaService) {}

    // 닉네임 존재 여부 빠르게 확인 (count 사용)
    async existsByNickname(nickname: string): Promise<boolean> {
        const count = await this.prisma.users.count({
            where: { nickname },
        });
        return count > 0;
    }

    // 유저 테이블의 닉네임 컬럼 업데이트
    async updateUserNickname(userId: string, nickname: string): Promise<void> {
        await this.prisma.users.update({
            where: { id: BigInt(userId) },
            data: { nickname },
        });
    }
}

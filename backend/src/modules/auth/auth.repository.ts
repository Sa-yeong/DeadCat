import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../providers/database/prisma.service';

// users 테이블 접근(인증용). 조회/생성만.
@Injectable()
export class AuthRepository {
    constructor(private readonly prisma: PrismaService) {}

    findByLoginId(loginId: string) {
        return this.prisma.users.findUnique({ where: { login_id: loginId } });
    }

    // 아이디 또는 닉네임이 이미 쓰이는지(중복 메시지용).
    findDuplicate(loginId: string, nickname: string) {
        return this.prisma.users.findFirst({
            where: { OR: [{ login_id: loginId }, { nickname }] },
            select: { login_id: true, nickname: true },
        });
    }

    createUser(loginId: string, hashedPw: string, nickname: string) {
        return this.prisma.users.create({
            data: { login_id: loginId, login_pw: hashedPw, nickname },
            select: { id: true, nickname: true },
        });
    }
}

import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { AuthenticatedRequest } from 'src/common/guards/jwt-auth.guard';
import { PrismaService } from 'src/providers/database/prisma.service';

// 경로의 방 주인 id(:userId) → bigint. 숫자가 아니면(예: /rooms/me/… 중 없는 경로) 없는 사용자로
export function parseUserIdParam(param: string): bigint {
    if (!/^\d+$/.test(param)) {
        throw new NotFoundException('존재하지 않는 사용자입니다.');
    }
    return BigInt(param);
}

/**
 * 이 사람이 볼 수 있는 거실인지 확인하고 방 주인을 돌려준다(지시서 3-④).
 * 없는 사용자 404, 비공개 거실은 주인이 아니면 403(비로그인 포함)
 */
export async function findViewableRoomOwner(
    prisma: PrismaService,
    ownerId: bigint,
    viewerId?: bigint,
) {
    const owner = await prisma.users.findUnique({
        where: { id: ownerId },
        select: {
            id: true,
            nickname: true,
            profile_img_url: true,
            share_option: true,
        },
    });
    if (!owner) {
        throw new NotFoundException('존재하지 않는 사용자입니다.');
    }
    if (viewerId !== ownerId && owner.share_option === false) {
        throw new ForbiddenException('비공개 거실입니다.');
    }
    return owner;
}

/**
 * SSE 경로용: 없는 거실 404 · 비공개 403을 스트림을 열기 전에 HTTP 상태로 돌려준다.
 * `@Sse` 핸들러 안에서 던지면 이미 200 헤더가 나간 뒤라 SSE `error` 이벤트가 되므로 가드에서 확인한다.
 * 로그인 가드(OptionalJwtAuthGuard) 다음에 둔다 — `@UseGuards(OptionalJwtAuthGuard, ViewableRoomGuard)`
 */
@Injectable()
export class ViewableRoomGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context
            .switchToHttp()
            .getRequest<AuthenticatedRequest>();
        const ownerId = parseUserIdParam(String(request.params.userId));
        await findViewableRoomOwner(this.prisma, ownerId, request.user?.id);
        return true;
    }
}

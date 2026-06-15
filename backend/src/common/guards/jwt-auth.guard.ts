import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

// 인증 통과 시 user.id(bigint)를 싣는 요청 타입.
export interface AuthenticatedRequest extends Request {
    user?: { id: bigint };
}

// "Authorization: Bearer <token>"에서 토큰만 분리.
export function extractBearerToken(authHeader?: string): string | undefined {
    const [type, token] = authHeader?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
}

// 토큰 검증 후 request.user 설정. 성공 true / 실패 false (예외 처리는 호출측 정책).
// 필수 가드와 선택 가드가 공유하는 핵심 로직.
export async function verifyAndAttachUser(
    request: AuthenticatedRequest,
    jwt: JwtService,
    secret: string,
): Promise<boolean> {
    const token = extractBearerToken(request.headers.authorization);
    if (!token) return false;
    try {
        const payload = await jwt.verifyAsync<{ sub: string | number }>(token, {
            secret,
        });
        request.user = { id: BigInt(payload.sub) };
        return true;
    } catch {
        return false;
    }
}

// 인증 필수. 토큰이 없거나 무효면 401. (favorites 등록/해제용)
@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly jwt: JwtService,
        private readonly config: ConfigService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context
            .switchToHttp()
            .getRequest<AuthenticatedRequest>();
        const secret = this.config.get<string>('jwt.secret')!;
        const ok = await verifyAndAttachUser(request, this.jwt, secret);
        if (!ok) throw new UnauthorizedException('유효한 인증 토큰이 필요합니다.');
        return true;
    }
}

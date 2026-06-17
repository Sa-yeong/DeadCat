import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest } from '../guards/jwt-auth.guard';

// @User() userId: bigint | undefined — 검증된 토큰의 userId. 비로그인 시 undefined.
// (가드가 request.user를 미리 세팅: JwtAuthGuard=필수, OptionalJwtAuthGuard=선택)
export const User = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): bigint | undefined => {
        const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
        return request.user?.id;
    },
);

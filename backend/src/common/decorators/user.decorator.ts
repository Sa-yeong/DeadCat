import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// @User() userId: bigint — 검증된 토큰에서 userId 추출. 비로그인 시 undefined.
export const User = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): bigint | undefined => {
        // TODO: request.user에서 id 추출
        const request = ctx.switchToHttp().getRequest();
        return request.user?.id;
    },
);

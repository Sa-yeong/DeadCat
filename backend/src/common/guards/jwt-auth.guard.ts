import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

// JWT 검증 문지기. @UseGuards(JwtAuthGuard)로 보호할 라우트에 적용. (공통 구현은 팀 합의 후)
@Injectable()
export class JwtAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        // TODO: Authorization 헤더의 JWT 검증 후 request.user = { id } 설정
        throw new Error('Not implemented');
    }
}

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthenticatedRequest, verifyAndAttachUser } from './jwt-auth.guard';

// 인증 선택. 토큰이 있으면 user.id를 싣고, 없거나 무효여도 통과(=비로그인 열람 허용).
// 조회 API(stocks/sectors)에서 is_favorite 판단용 userId를 얻기 위해 사용.
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
    constructor(
        private readonly jwt: JwtService,
        private readonly config: ConfigService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context
            .switchToHttp()
            .getRequest<AuthenticatedRequest>();
        const secret = this.config.get<string>('jwt.secret')!;
        await verifyAndAttachUser(request, this.jwt, secret); // 결과 무관, 항상 통과
        return true;
    }
}

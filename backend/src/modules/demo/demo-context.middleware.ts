import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import { extractBearerToken } from '../../common/guards/jwt-auth.guard';
import { DemoService } from './demo.service';

/**
 * 데모 계정의 요청에 「데모 요청」 표시를 붙인다 — 그 요청 안에서 읽는 시세가 가짜 시세가 된다(DemoService).
 * 가드보다 먼저 돌아서 토큰을 직접 확인한다(로그인이 선택인 조회 API 도 같이 덮으려고). 인증 판단은 하지 않는다 — 가드 몫.
 * 데모 계정이 없으면(DEMO_USER_IDS 비어 있음) 아무것도 하지 않고 넘긴다.
 */
@Injectable()
export class DemoContextMiddleware implements NestMiddleware {
    constructor(
        private readonly demo: DemoService,
        private readonly jwt: JwtService,
        private readonly config: ConfigService,
    ) {}

    use(req: Request, _res: Response, next: NextFunction): void {
        if (!this.demo.enabled) return next();
        const token = extractBearerToken(req.headers.authorization);
        if (!token) return next();
        this.jwt
            .verifyAsync<{ sub: string | number }>(token, {
                secret: this.config.get<string>('jwt.secret')!,
            })
            .then(
                (p) => this.demo.runAs(String(p.sub), () => next()),
                () => next(),
            );
    }
}

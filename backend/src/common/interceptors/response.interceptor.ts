import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Response } from 'express';
import { ApiResponseDto } from '../dto/api-response.dto';

// 모든 성공 응답을 { success: true, data } 래퍼로 포장(프론트 일관성).
// + 실시간 갱신 화면이 브라우저 캐시로 옛 값을 보지 않도록 Cache-Control: no-store 지정.
// SSE(@Sse)는 감싸지 않는다 — 메시지마다 감싸면 본문이 { data: 이벤트 } 로 한 겹 더 싸인다.
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
    T,
    ApiResponseDto<T> | T
> {
    constructor(private readonly reflector: Reflector) {}

    intercept(
        context: ExecutionContext,
        next: CallHandler<T>,
    ): Observable<ApiResponseDto<T> | T> {
        if (this.reflector.get<boolean>(SSE_METADATA, context.getHandler())) {
            return next.handle();
        }
        const res = context.switchToHttp().getResponse<Response>();
        res.setHeader('Cache-Control', 'no-store');
        return next.handle().pipe(map((data) => ({ success: true, data })));
    }
}

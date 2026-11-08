import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Response } from 'express';
import { ApiResponseDto } from '../dto/api-response.dto';
import { SKIP_RESPONSE_TRANSFORM } from '../decorators/skip-response-transform.decorator';

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
        const res = context.switchToHttp().getResponse<Response>();

        // 브라우저 캐시 방지
        res.setHeader('Cache-Control', 'no-store');

        // 컨트롤러에 응답 래핑 제외 데코레이터가 있는지 확인
        const skipTransform = this.reflector.getAllAndOverride<boolean>(
            SKIP_RESPONSE_TRANSFORM,
            [context.getHandler(), context.getClass()],
        );

        return next.handle().pipe(
            map((data) => {
                // 예외 처리 대상 API는 원본 응답 그대로 반환
                if (skipTransform) {
                    return data;
                }

                // 일반 API는 기존 공통 응답 형식 유지
                return {
                    success: true,
                    data,
                };
            }),
        );
    }
}

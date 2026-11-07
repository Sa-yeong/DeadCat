import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Response } from 'express';
import { ApiResponseDto } from '../dto/api-response.dto';

// 모든 성공 응답을 { success: true, data } 래퍼로 포장(프론트 일관성).
// + 실시간 갱신 화면이 브라우저 캐시로 옛 값을 보지 않도록 Cache-Control: no-store 지정.
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
    T,
    ApiResponseDto<T> | T
> {
    intercept(
        context: ExecutionContext,
        next: CallHandler<T>,
    ): Observable<ApiResponseDto<T> | T> {
        const res = context.switchToHttp().getResponse<Response>();

        // 브라우저 캐시 방지
        res.setHeader('Cache-Control', 'no-store');

        return next.handle().pipe(
            map((data) => {
                // 이미 API 명세에 맞춘 응답은 그대로 반환
                if (
                    data &&
                    typeof data === 'object' &&
                    'is_success' in data &&
                    'code' in data
                ) {
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

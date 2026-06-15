import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

// 모든 응답을 공통 래퍼로 포장(프론트 일관성).
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, unknown> {
    intercept(context: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
        // TODO: map(data => new ApiResponseDto(data))
        throw new Error('Not implemented');
    }
}

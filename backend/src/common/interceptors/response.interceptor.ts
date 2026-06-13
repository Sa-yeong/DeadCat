import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponseDto } from '../dto/api-response.dto';

// 모든 성공 응답을 { success: true, data } 래퍼로 포장(프론트 일관성).
@Injectable()
export class ResponseInterceptor<T>
    implements NestInterceptor<T, ApiResponseDto<T>>
{
    intercept(
        _context: ExecutionContext,
        next: CallHandler<T>,
    ): Observable<ApiResponseDto<T>> {
        return next.handle().pipe(map((data) => ({ success: true, data })));
    }
}

import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';

// Prisma 에러(FK 위반 등)를 깔끔한 HTTP 응답으로 변환.
// 예: 없는 종목 관심 등록 → FK 위반 → 400 메시지.
@Catch()
export class PrismaExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void {
        // TODO: Prisma 에러 코드 분기 → 응답 변환
        throw new Error('Not implemented');
    }
}

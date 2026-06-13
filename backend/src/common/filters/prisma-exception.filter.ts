import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from 'generated/prisma/client';

// 전역 예외 필터: HttpException은 그대로, Prisma 에러는 코드별 변환, 나머지는 500.
// 모든 에러 응답을 { success: false, message } 형식으로 통일(프론트 일관성).
@Catch()
export class PrismaExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(PrismaExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<Response>();
        let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
        let message: string | string[] = '서버 오류가 발생했습니다.';

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const res = exception.getResponse();
            message =
                typeof res === 'string'
                    ? res
                    : ((res as { message?: string | string[] }).message ??
                      exception.message);
        } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
            ({ status, message } = this.mapPrismaError(exception));
        } else {
            this.logger.error(exception);
        }

        response.status(status).json({ success: false, message });
    }

    // 자주 만나는 Prisma 에러 코드만 명시 변환, 나머지는 500.
    private mapPrismaError(e: Prisma.PrismaClientKnownRequestError): {
        status: number;
        message: string;
    } {
        switch (e.code) {
            case 'P2002': // unique 위반 (예: 이미 등록한 관심종목)
                return {
                    status: HttpStatus.CONFLICT,
                    message: '이미 존재하는 데이터입니다.',
                };
            case 'P2003': // FK 위반 (예: 없는 종목 관심 등록)
                return {
                    status: HttpStatus.BAD_REQUEST,
                    message: '존재하지 않는 대상입니다.',
                };
            case 'P2025': // 대상 레코드 없음 (예: 관심 해제 대상 없음)
                return {
                    status: HttpStatus.NOT_FOUND,
                    message: '대상을 찾을 수 없습니다.',
                };
            default:
                this.logger.error(
                    `Unhandled Prisma error ${e.code}: ${e.message}`,
                );
                return {
                    status: HttpStatus.INTERNAL_SERVER_ERROR,
                    message: '데이터 처리 중 오류가 발생했습니다.',
                };
        }
    }
}

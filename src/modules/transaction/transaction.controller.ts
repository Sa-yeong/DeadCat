import { Controller, Get, UseGuards, Query, Request } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import {
    JwtAuthGuard,
    type AuthenticatedRequest,
} from 'src/common/guards/jwt-auth.guard';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { TransactionItemDto } from './dto/transaction-response.dto';

//거래내역 조회
@Controller('transactions')
export class TransactionController {
    constructor(private readonly transactionService: TransactionService) {}

    @UseGuards(JwtAuthGuard)
    @Get()
    async getMyTransactions(
        @Request() req: AuthenticatedRequest,
        @Query() query: TransactionQueryDto,
    ): Promise<TransactionItemDto[]> {
        // 토큰 안의 유저 ID추출
        const userId = String(req.user!.id);

        return await this.transactionService.getMyTransactions(userId, query);
    }
}

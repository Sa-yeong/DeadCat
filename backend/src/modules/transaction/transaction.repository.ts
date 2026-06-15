import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';
import { Prisma } from '@prisma/client';
import {
    TransactionQueryDto,
    TradeTypeFilter,
} from './dto/transaction-query.dto';

@Injectable()
export class TransactionRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findUserHoldings(userId: string) {
        return await this.prisma.holdings.findMany({
            where: { user_id: BigInt(userId) },
            select: {
                stock_id: true,
                mean_price_krw: true,
            },
        });
    }

    async findUserTransactions(userId: string, query: TransactionQueryDto) {
        const { type, start_date, end_date } = query;

        const whereClause: Prisma.transaction_historyWhereInput = {
            user_id: BigInt(userId),
        };

        //  1. 거래 유형 필터링 (ALL이 아니거나 값이 지정된 경우에만)
        if (type && type !== TradeTypeFilter.ALL) {
            whereClause.trade_type = type;
        }

        //  2. 기간 필터링 (start_date ~ end_date)
        if (start_date || end_date) {
            // 시간 조건 객체 정의
            const timeFilter: Prisma.DateTimeNullableFilter = {};

            if (start_date) {
                timeFilter.gte = new Date(`${start_date}T00:00:00.000Z`);
            }
            if (end_date) {
                timeFilter.lte = new Date(`${end_date}T23:59:59.999Z`);
            }

            whereClause.transaction_time = timeFilter;
        }

        return await this.prisma.transaction_history.findMany({
            where: whereClause,
            include: {
                stocks: true,
            },
            orderBy: {
                transaction_time: 'desc',
            },
        });
    }
}

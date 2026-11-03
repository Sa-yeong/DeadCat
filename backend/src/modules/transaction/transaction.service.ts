import { Injectable } from '@nestjs/common';
import { TransactionRepository } from './transaction.repository';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { TransactionItemDto } from './dto/transaction-response.dto';

@Injectable()
export class TransactionService {
    constructor(
        private readonly transactionRepository: TransactionRepository,
    ) {}

    async getMyTransactions(
        userId: string,
        query: TransactionQueryDto,
    ): Promise<TransactionItemDto[]> {
        const [histories, holdings] = await Promise.all([
            this.transactionRepository.findUserTransactions(userId, query),
            this.transactionRepository.findUserHoldings(userId),
        ]);

        // BUY 거래용 fallback: 현재 보유 평단가 맵
        const holdingMap = new Map<string, string>();
        holdings.forEach((h) => {
            holdingMap.set(String(h.stock_id), String(h.mean_price_krw));
        });

        return histories.map((history) => {
            const stockName = history.stocks?.name || '알 수 없는 종목';
            const tradeDate = history.transaction_time
                ? history.transaction_time.toISOString().split('T')[0]
                : '날짜 정보 없음';

            const isSell = history.trade_type === 'SELL';
            const displayType = isSell ? '매도' : '매수';

            let profit = '0';
            let returnRate = 0;
            let avgPurchasePrice = '0';

            if (isSell) {
                // SELL: 체결 시점에 저장된 정확한 원가/손익 사용
                const avgCost = history.avg_cost_at_trade;
                const realizedProfit = history.realized_profit;

                avgPurchasePrice = avgCost !== null ? String(avgCost) : '0';
                profit = realizedProfit !== null ? String(realizedProfit) : '0';

                if (avgCost && avgCost > BigInt(0) && history.quantity > 0) {
                    const totalCost = avgCost * BigInt(history.quantity);
                    const rateBonus =
                        ((realizedProfit ?? BigInt(0)) * BigInt(10000)) /
                        totalCost;
                    returnRate = Number(rateBonus) / 100;
                }
            } else {
                // BUY: 실현손익 개념 없음, 참고용으로 현재 보유 평단가만 표시
                avgPurchasePrice =
                    holdingMap.get(String(history.stock_id)) || '0';
                profit = '0';
                returnRate = 0;
            }

            return new TransactionItemDto({
                stock_name: stockName,
                trade_date: tradeDate,
                type: displayType,
                quantity: history.quantity,
                unit_price: String(history.trade_price),
                profit: profit,
                return_rate: returnRate,
                avg_purchase_price: avgPurchasePrice,
            });
        });
    }
}

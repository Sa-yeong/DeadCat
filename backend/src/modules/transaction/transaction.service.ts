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
        // 1. 거래 내역과 유저의 현재 보유 주식 평단가를 동시에 조회
        const [histories, holdings] = await Promise.all([
            this.transactionRepository.findUserTransactions(userId, query),
            this.transactionRepository.findUserHoldings(userId),
        ]);

        // 빠른 조회를 위해 [stock_id -> 평단가] 맵을 생성
        const holdingMap = new Map<string, string>();
        holdings.forEach((h) => {
            holdingMap.set(String(h.stock_id), String(h.mean_price_krw));
        });

        return histories.map((history) => {
            const stockName = history.stocks?.name || '알 수 없는 종목';
            const tradeDate = history.transaction_time
                ? history.transaction_time.toISOString().split('T')[0]
                : '날짜 정보 없음';

            // 명세서 상 표시용 타입 변환 ('BUY' -> '매수', 'SELL' -> '매도')
            const displayType = history.trade_type === 'BUY' ? '매수' : '매도';

            // 맵에서 해당 주식의 평균 매수단가를 찾고, 없으면 '0'
            const avgPurchasePrice =
                holdingMap.get(String(history.stock_id)) || '0';

            // 명세서에 계산 요청된 손익 & 수익률 초기값 설정
            const profit = '0';
            const returnRate = 0;

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

import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';
import { kstDateString } from 'src/common/time/kst-date';

export interface FarewellCardDto {
    stock_id: number;
    stock_code: string;
    stock_name: string;
    /** 그 회차 첫 매수일(KST 'YYYY-MM-DD') */
    start_date: string;
    /** 전량 매도일(KST 'YYYY-MM-DD') */
    end_date: string;
    /** 보유 기간(일) = 두 날짜의 차이. 같은 날 사고 다 팔면 0 */
    days: number;
    /** 그 회차 실현 손익 ÷ 매도 원가(%, 소수 둘째 자리) — `/holdings`의 return_rate와 같은 형식 */
    final_return_rate: number;
}

interface Round {
    start: Date;
    quantity: number;
    profit: bigint;
    cost: bigint;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 이별 흔적 (3-⑦-d) — 저장하지 않고 조회할 때마다 거래 내역에서 파생한다.
 * 종목별로 보유 수량을 시간순으로 더하고 빼서 0이 된 순간마다 카드 1장(한 종목을 여러 번 사고 다 팔면 회차마다).
 */
@Injectable()
export class FarewellsService {
    constructor(private readonly prisma: PrismaService) {}

    async getFarewells(userIdStr: string): Promise<FarewellCardDto[]> {
        const userId = BigInt(userIdStr);

        const trades = await this.prisma.transaction_history.findMany({
            where: { user_id: userId },
            orderBy: [{ transaction_time: 'asc' }, { id: 'asc' }],
            select: {
                stock_id: true,
                trade_type: true,
                quantity: true,
                transaction_time: true,
                avg_cost_at_trade: true,
                realized_profit: true,
                stocks: { select: { code: true, name: true } },
            },
        });

        const open = new Map<bigint, Round>();
        const cards: (FarewellCardDto & { endAt: number })[] = [];

        for (const t of trades) {
            const at = t.transaction_time ?? new Date(0);
            const round = open.get(t.stock_id);

            if (t.trade_type === 'BUY') {
                if (round) {
                    round.quantity += t.quantity;
                } else {
                    open.set(t.stock_id, {
                        start: at,
                        quantity: t.quantity,
                        profit: 0n,
                        cost: 0n,
                    });
                }
                continue;
            }

            // 매수 기록 없이 시작한 매도(옛 데이터 등)는 회차를 알 수 없어 건너뜀
            if (t.trade_type !== 'SELL' || !round) continue;

            round.quantity -= t.quantity;
            round.profit += t.realized_profit ?? 0n;
            round.cost += (t.avg_cost_at_trade ?? 0n) * BigInt(t.quantity);

            if (round.quantity > 0) continue;

            open.delete(t.stock_id);
            const startDate = kstDateString(round.start);
            const endDate = kstDateString(at);
            cards.push({
                stock_id: Number(t.stock_id),
                stock_code: t.stocks.code,
                stock_name: t.stocks.name,
                start_date: startDate,
                end_date: endDate,
                days: Math.round(
                    (Date.parse(endDate) - Date.parse(startDate)) / DAY_MS,
                ),
                final_return_rate:
                    round.cost > 0n
                        ? Number((round.profit * 10000n) / round.cost) / 100
                        : 0,
                endAt: at.getTime(),
            });
        }

        // 최근 이별 순
        return cards
            .sort((a, b) => b.endAt - a.endAt)
            .map(({ endAt: _endAt, ...card }) => card);
    }
}

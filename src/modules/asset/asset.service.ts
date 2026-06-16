import { Injectable, NotFoundException } from '@nestjs/common';
import { AssetRepository } from './asset.repository';
import { AssetInfoResponseDto } from './dto/asset-info-response.dto';

@Injectable()
export class AssetService {
    constructor(private readonly assetRepository: AssetRepository) {}

    async getMyAssetInfo(userId: string): Promise<AssetInfoResponseDto> {
        const userData = await this.assetRepository.findUserAssetData(userId);

        if (!userData) {
            throw new NotFoundException(
                '사용자의 자산 정보를 찾을 수 없습니다.',
            );
        }

        const holdings = userData.holdings || [];

        // 1. 총 투자금액 (매입금액) 계산: 합산 (수량 * 평단가)
        const totalInvestmentBigInt = holdings.reduce((sum, holding) => {
            const holdingAmount =
                BigInt(holding.quantity) * holding.mean_price_krw;
            return sum + holdingAmount;
        }, BigInt(0));

        // 2. 총 평가금액 계산: 합산 (수량 * stocks 테이블의 현재가)
        const totalEvaluationBigInt = holdings.reduce((sum, holding) => {
            // 레포지토리에서 정렬해 가져온 0번째 배열(가장 최신 날짜) 기록을
            const latestHistory = holding.stocks?.stock_history?.[0];

            const currentPrice = latestHistory?.close_price
                ? BigInt(latestHistory.close_price)
                : holding.mean_price_krw; // 최신 주가 정보가 없을 땐 평단가로 방어

            const evaluationAmount = BigInt(holding.quantity) * currentPrice;
            return sum + evaluationAmount;
        }, BigInt(0));

        // 3. 총 평가손익 계산: 총 평가금액 - 총 투자금액
        const totalValuationProfitBigInt =
            totalEvaluationBigInt - totalInvestmentBigInt;

        // 4. 총 수익률 계산: (총 평가손익 / 총 투자금액) * 100
        let valuationReturnRate = 0;
        if (totalInvestmentBigInt > BigInt(0)) {
            const rateBonus =
                (totalValuationProfitBigInt * BigInt(10000)) /
                totalInvestmentBigInt;
            valuationReturnRate = Number(rateBonus) / 100;
        }

        return new AssetInfoResponseDto({
            available_cash: String(userData.balance ?? 0),
            total_investment: String(totalInvestmentBigInt),
            total_evaluation_amount: String(totalEvaluationBigInt),
            total_valuation_profit: String(totalValuationProfitBigInt),
            valuation_return_rate: valuationReturnRate,
            realized_profit: '0',
        });
    }
}

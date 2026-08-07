import { Injectable, NotFoundException } from '@nestjs/common';
import { AssetRepository } from './asset.repository';
import { AssetInfoResponseDto } from './dto/asset-info-response.dto';
import { PriceService } from '../../price/price.service';

@Injectable()
export class AssetService {
    constructor(
        private readonly assetRepository: AssetRepository,
        private readonly priceService: PriceService,
    ) {}

    async getMyAssetInfo(userId: string): Promise<AssetInfoResponseDto> {
        const userData = await this.assetRepository.findUserAssetData(userId);

        if (!userData) {
            throw new NotFoundException(
                '사용자의 자산 정보를 찾을 수 없습니다.',
            );
        }

        const holdings = userData.holdings || [];

        // 1. 보유한 주식 코드들을 모아서 캐시(Redis)에서 현재가 불러오기
        const codes: string[] = holdings.flatMap((h) =>
            h.stocks?.code ? [h.stocks.code] : [],
        );

        const cachedPrices = await this.priceService.readPrices(codes);

        // 2. 총 투자금액 (매입금액) 계산: 합산 (수량 * 평단가)
        const totalInvestmentBigInt = holdings.reduce((sum, holding) => {
            const holdingAmount =
                BigInt(holding.quantity) * holding.mean_price_krw;
            return sum + holdingAmount;
        }, BigInt(0));

        // 3. 총 평가금액 계산: 합산 (수량 * 캐시 현재가)
        const totalEvaluationBigInt = holdings.reduce((sum, holding) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const stockCode = holding.stocks?.code ?? '';
            const cachedStock = cachedPrices.get(stockCode);

            let currentPrice = holding.mean_price_krw; // 기본 방어선은 평단가

            if (cachedStock && cachedStock.current_price) {
                //  캐시에 최근 주가가 있다면 그걸 사용
                currentPrice = BigInt(cachedStock.current_price);
            } else {
                // 캐시에 없으면 DB 이력으로 방어
                const latestHistory = holding.stocks?.stock_history?.[0];
                if (latestHistory?.close_price) {
                    currentPrice = BigInt(latestHistory.close_price);
                }
            }

            const evaluationAmount = BigInt(holding.quantity) * currentPrice;
            return sum + evaluationAmount;
        }, BigInt(0));

        // 4. 총 평가손익 계산: 총 평가금액 - 총 투자금액
        const totalValuationProfitBigInt =
            totalEvaluationBigInt - totalInvestmentBigInt;

        // 5. 총 수익률 계산: (총 평가손익 / 총 투자금액) * 100
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
            selling_profit: '0',
        });
    }
}

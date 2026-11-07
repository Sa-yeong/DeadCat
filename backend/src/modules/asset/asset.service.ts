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
        // 유저 자산 정보 및 판매수익 합계 동시 조회
        const [userData, sellingProfitBigInt] = await Promise.all([
            this.assetRepository.findUserAssetData(userId),
            this.assetRepository.getSellingProfitSum(userId),
        ]);

        if (!userData) {
            throw new NotFoundException(
                '사용자의 자산 정보를 찾을 수 없습니다.',
            );
        }

        const holdings = userData.holdings || [];

        // 1. 보유 주식 코드 추출 및 현재 시세 조회
        const codes: string[] = holdings.flatMap((h) =>
            h.stocks?.code ? [h.stocks.code] : [],
        );
        const cachedPrices = await this.priceService.readPrices(codes);

        // 2. 총 투자금액 (매입금액) 계산
        const totalInvestmentBigInt = holdings.reduce((sum, holding) => {
            return sum + BigInt(holding.quantity) * holding.mean_price_krw;
        }, BigInt(0));

        // 3. 총 평가금액 계산
        const totalEvaluationBigInt = holdings.reduce((sum, holding) => {
            const stockCode = holding.stocks?.code ?? '';
            const cachedStock = cachedPrices.get(stockCode);

            let currentPrice = holding.mean_price_krw;

            if (cachedStock && cachedStock.current_price) {
                currentPrice = BigInt(cachedStock.current_price);
            } else {
                const latestHistory = holding.stocks?.stock_history?.[0];
                if (latestHistory?.close_price) {
                    currentPrice = BigInt(latestHistory.close_price);
                }
            }

            return sum + BigInt(holding.quantity) * currentPrice;
        }, BigInt(0));

        // 4. 총 평가손익
        const totalValuationProfitBigInt =
            totalEvaluationBigInt - totalInvestmentBigInt;

        // 5. 총 수익률
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
            total_valuation_profit: String(totalValuationProfitBigInt),
            valuation_return_rate: valuationReturnRate,
            selling_profit: String(sellingProfitBigInt),
        });
    }
}

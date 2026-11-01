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

        // 1. 원화 평가 현재가 조회 — 캐시 현재가, 없으면 DB 최신 종가. 해외(달러)는 환율로 원화 환산
        const valuationPrices = await this.priceService.readValuationPricesKrw(
            holdings.flatMap((h) =>
                h.stocks?.code
                    ? [
                          {
                              code: h.stocks.code,
                              stock_type: h.stocks.stock_type,
                              last_close:
                                  h.stocks.stock_history?.[0]?.close_price,
                          },
                      ]
                    : [],
            ),
        );

        // 2. 총 투자금액 (매입금액) 계산
        const totalInvestmentBigInt = holdings.reduce((sum, holding) => {
            return sum + BigInt(holding.quantity) * holding.mean_price_krw;
        }, BigInt(0));

        // 3. 총 평가금액 계산
        const totalEvaluationBigInt = holdings.reduce((sum, holding) => {
            const stockCode = holding.stocks?.code ?? '';
            const currentPrice =
                valuationPrices.get(stockCode) ?? holding.mean_price_krw;

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

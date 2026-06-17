import { Injectable } from '@nestjs/common';
import { HoldingRepository } from './holding.repository';
import { HoldingItemDto } from './dto/holding-list.response.dto';

@Injectable()
export class HoldingService {
    constructor(private readonly holdingRepository: HoldingRepository) {}

    async getMyHoldings(userId: string): Promise<HoldingItemDto[]> {
        const userHoldings =
            await this.holdingRepository.findUserHoldingsData(userId);

        return userHoldings.map((holding) => {
            const quantityBigInt = BigInt(holding.quantity);
            const meanPriceBigInt = holding.mean_price_krw;

            // 1. 최신 종가(현재가) 추출
            const latestHistory = holding.stocks?.stock_history?.[0];
            const currentPriceBigInt = latestHistory?.close_price
                ? BigInt(latestHistory.close_price)
                : meanPriceBigInt; // 최신가 없으면 평단가로 방어

            // 2. 평가손익 계산: (현재가 - 평단가) * 수량
            const valuationProfitBigInt =
                (currentPriceBigInt - meanPriceBigInt) * quantityBigInt;

            // 3. 개별 주식 수익률 계산: (평가손익 / 총 매입금액) * 100
            let returnRate = 0;
            const totalPurchaseAmount = meanPriceBigInt * quantityBigInt;
            if (totalPurchaseAmount > BigInt(0)) {
                const rateBonus =
                    (valuationProfitBigInt * BigInt(10000)) /
                    totalPurchaseAmount;
                returnRate = Number(rateBonus) / 100;
            }

            //  4. 캐릭터 이미지 주소 추출
            const stockImgUrl = holding.stocks?.characters?.img_url ?? '';

            // 5. DTO 규격에 맞춰 리턴
            return new HoldingItemDto({
                stock_code: holding.stocks?.code ?? '',
                stock_name: holding.stocks?.name ?? '',
                current_price: String(currentPriceBigInt),
                quantity: holding.quantity,
                return_rate: returnRate,
                valuation_profit: String(valuationProfitBigInt),
                purchase_price: String(meanPriceBigInt),
                stock_img: stockImgUrl,
            });
        });
    }
}

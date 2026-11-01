import { Injectable } from '@nestjs/common';
import { HoldingRepository } from './holding.repository';
import { HoldingItemDto } from './dto/holding-list.response.dto';
import { PriceService } from '../../price/price.service';

@Injectable()
export class HoldingService {
    constructor(
        private readonly holdingRepository: HoldingRepository,
        private readonly priceService: PriceService,
    ) {}

    async getMyHoldings(userId: string): Promise<HoldingItemDto[]> {
        const userHoldings =
            await this.holdingRepository.findUserHoldingsData(userId);
        if (userHoldings.length === 0) return [];

        // 1~2. 원화 평가 현재가 묶음 — 캐시(Redis) 현재가, 없으면 DB 최신 종가. 해외(달러)는 환율로 원화 환산
        //      (평단가 mean_price_krw가 원이라 같은 단위로 맞춘다. 응답 current_price도 원)
        const valuationPrices = await this.priceService.readValuationPricesKrw(
            userHoldings.flatMap((h) =>
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

        return userHoldings.map((holding) => {
            const quantityBigInt = BigInt(holding.quantity);
            const meanPriceBigInt = holding.mean_price_krw;
            const stockCode = holding.stocks?.code ?? '';

            // 3. 현재가가 없으면 평단가(기본 방어선)
            const currentPriceBigInt =
                valuationPrices.get(stockCode) ?? meanPriceBigInt;

            // 4. 평가손익 계산: (현재가 - 평단가) * 수량
            const valuationProfitBigInt =
                (currentPriceBigInt - meanPriceBigInt) * quantityBigInt;

            // 5. 개별 주식 수익률 계산
            let returnRate = 0;
            const totalPurchaseAmount = meanPriceBigInt * quantityBigInt;
            if (totalPurchaseAmount > BigInt(0)) {
                const rateBonus =
                    (valuationProfitBigInt * BigInt(10000)) /
                    totalPurchaseAmount;
                returnRate = Number(rateBonus) / 100;
            }

            // 6. 캐릭터 이미지 주소 추출
            const stockImgUrl = holding.stocks?.characters?.img_url ?? '';

            // 7. DTO 규격에 맞춰 리턴
            return new HoldingItemDto({
                stock_id: Number(holding.stock_id),
                stock_code: stockCode,
                stock_name: holding.stocks?.name ?? '',
                current_price: String(currentPriceBigInt),
                quantity: holding.quantity,
                return_rate: returnRate,
                valuation_profit: String(valuationProfitBigInt),
                purchase_price: String(meanPriceBigInt),
                stock_img: stockImgUrl,
                market: holding.stocks?.stock_type ?? 'DOMESTIC',
            });
        });
    }
}

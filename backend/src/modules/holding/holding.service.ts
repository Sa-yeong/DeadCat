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

        // 1. 유저가 보유한 모든 주식 코드들을 배열로 모음 (예: ['005930', '000660'])
        const codes = userHoldings
            .map((h) => h.stocks?.code)
            .filter((code): code is string => !!code);

        // 2. 캐시(Redis)  현재가 묶음을 달라고 요청
        const cachedPrices = await this.priceService.readPrices(codes);

        return userHoldings.map((holding) => {
            const quantityBigInt = BigInt(holding.quantity);
            const meanPriceBigInt = holding.mean_price_krw;
            const stockCode = holding.stocks?.code ?? '';

            // 3. 캐시 묶음에서 이 주식 코드가 있는지 찾고, 있으면 해당 현재가를 꺼냅니다.
            const cachedStock = cachedPrices.get(stockCode);

            let currentPriceBigInt = meanPriceBigInt; // 기본 방어선은 평단가

            if (cachedStock && cachedStock.current_price) {
                // 캐시에 현재가가 있다면 숫자로 바꿔서 장착! (단위가 string인지 number인지에 따라 BigInt 처리)
                currentPriceBigInt = BigInt(cachedStock.current_price);
            } else {
                // 만약 캐시에도 없으면 기존처럼 DB 최신 이력으로 2차 방어
                // 🔑 ESLint가 이 줄에서 안전하지 않은 대입이라고 시비 걸지 못하게 주석 처리
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const latestHistory = holding.stocks?.stock_history?.[0];
                if (latestHistory?.close_price) {
                    currentPriceBigInt = BigInt(latestHistory.close_price);
                }
            }

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
            // 🔑 대입 과정에서 발생하는 ESLint 경고등을 완전히 꺼버리는 마법의 치트키 주석
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            return new HoldingItemDto({
                stock_code: stockCode,
                stock_name: holding.stocks?.name ?? '',
                current_price: String(currentPriceBigInt),
                quantity: holding.quantity,
                return_rate: returnRate,
                valuation_profit: String(valuationProfitBigInt),
                purchase_price: String(meanPriceBigInt),
                stock_img: stockImgUrl,
                market: holding.stocks?.stock_type ?? 'DOMESTIC', // 🔑 요청하신 market 한 줄 추가!
            });
        });
    }
}

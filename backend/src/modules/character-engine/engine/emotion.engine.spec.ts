import { EmotionEngine, isMildProfit } from './emotion.engine';

// 수익률 구간(도휘 11-26): +8 이상 happy · 0~+8 happy(약함) · -8~0 sad(약함) · -15~-8 sad · -15 미만 depress
describe('EmotionEngine 수익률 구간', () => {
    const primary = (userProfitRate: number) =>
        new EmotionEngine().updateMarketEmotion({
            isOperatingTime: true,
            stc_tendency: [],
            usr_tendency: { profit: 0, volatility: 0, momentum: 0, loss: 0 },
            userProfitRate,
            holdingPeriodDays: 1,
            fluctuationRate: 0,
        })[0]?.emotion;

    it.each([
        [20, 'happy'],
        [8, 'happy'],
        [0, 'happy'],
        [-0.1, 'sad'],
        [-8, 'sad'],
        [-15, 'sad'],
        [-15.01, 'depress'],
        [-30, 'depress'],
    ])('수익률 %p%% → %s', (rate, emotion) => {
        expect(primary(rate)).toBe(emotion);
    });

    it.each([
        [null, false],
        [0, true],
        [7.99, true],
        [-7.99, true],
        [8, false],
        [-8, false],
        [-12, false],
    ])('약함 구간 %p → %p', (rate, mild) => {
        expect(isMildProfit(rate)).toBe(mild);
    });
});

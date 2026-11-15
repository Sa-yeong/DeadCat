/**
 * **데모 가짜 시세 시나리오 — 수정은 이 파일 하나에서.**
 *
 * 데모 계정(DEMO_USER_IDS)이 보는 NVDA · 035420 의 시세를 이 표대로 움직인다.
 *  · rate = 직전 종가 대비 등락률(%). at = 시나리오 시작부터 몇 초 뒤(배속 1 기준)
 *  · 키프레임 사이는 직선으로 잇고, 그 위에 jitter(%)만큼 잔떨림을 얹는다
 *  · 마지막 키프레임에 닿으면 처음부터 다시(마지막 rate = 첫 rate 로 두면 끊김 없이 이어진다)
 *  · 직전 종가는 시나리오를 (다시) 시작한 뒤 처음 읽은 실제 시세에서 한 번 정해 고정한다
 *
 * 배속 — speed 2 면 두 배 빠르게. 서버 환경변수 DEMO_SPEED 가 있으면 그 값이 우선(재배포 없이 pm2 restart 로 바꿈).
 * 처음부터 다시 틀기 — 데모 계정으로 POST /demo/restart (촬영 직전에).
 * 화면은 개별종목 2초 · 보유 3초 · 전체종목 3초(데모 계정)마다 받아서, 그 간격으로 움직여 보인다.
 */
export interface DemoKeyframe {
    at: number;
    rate: number;
}

export interface DemoScenario {
    speed: number;
    jitter: number;
    keyframes: DemoKeyframe[];
}

/** 종목마다 다르게 하려면 코드(대문자)로 따로 적는다. 없으면 default */
export const DEMO_SCENARIOS: Record<string, DemoScenario> & {
    default: DemoScenario;
} = {
    default: {
        speed: 1,
        jitter: 0.15,
        keyframes: [
            { at: 0, rate: 0.3 }, //  시작 — 보합 근처
            { at: 60, rate: 1.2 }, // 완만한 상승
            { at: 120, rate: 2.0 },
            { at: 140, rate: 4.8 }, // 급등
            { at: 200, rate: 4.2 },
            { at: 260, rate: 1.5 }, // 하락
            { at: 290, rate: -2.6 }, // 급락
            { at: 350, rate: -3.1 },
            { at: 420, rate: -0.8 }, // 회복
            { at: 480, rate: 0.3 }, //  처음 값으로 — 다시 반복
        ],
    },
    NVDA: {
        speed: 1,
        jitter: 0.2,
        keyframes: [
            { at: 0, rate: 0.8 },
            { at: 60, rate: 1.8 },
            { at: 120, rate: 2.6 },
            { at: 140, rate: 5.9 },
            { at: 200, rate: 5.1 },
            { at: 260, rate: 2.0 },
            { at: 290, rate: -2.2 },
            { at: 350, rate: -2.9 },
            { at: 420, rate: -0.4 },
            { at: 480, rate: 0.8 },
        ],
    },
};

import type { Prisma } from 'generated/prisma/client';

// 프리셋 자동 채움(M-1) — 체결(주문 쪽 applyTrade)과 같은 트랜잭션에서 불린다.
// 주문 모듈이 캐릭터 모듈을 물지 않게 `tx`만 받는 함수로 둔다(attendance/attendance-claim.ts 와 같은 꼴).

/** 사용자당 프리셋 개수 한도 — 사용자가 만드는 것(POST) · 자동으로 만드는 것 둘 다 */
export const MAX_PRESETS = 5;
/** 프리셋 한 개에 들어가는 종목(거실 캐릭터) 수 한도 */
export const MAX_PRESET_STOCKS = 5;

export const PRESET_LIMIT_MESSAGE = `프리셋은 ${MAX_PRESETS}개까지 만들 수 있어요.`;

/** 규칙 판단에 필요한 프리셋 한 개의 모습 */
export interface PresetSnapshot {
    id: bigint;
    name: string;
    isActive: boolean;
    /** 자동 = 서버가 만들고 사용자가 아직 수정 저장하지 않은 프리셋 */
    isAuto: boolean;
    stockIds: bigint[];
}

/** 새 자동 프리셋 이름 — 「프리셋 n」 중 안 쓰는 가장 작은 번호 */
export function nextAutoPresetName(names: readonly string[]): string {
    const used = new Set(names.map((n) => n.trim()));
    let n = 1;
    while (used.has(`프리셋 ${n}`)) n += 1;
    return `프리셋 ${n}`;
}

export type BuyPlan =
    | { kind: 'none' }
    /** 프리셋이 하나도 없음 → 자동 프리셋을 만들어 켜고 이 종목을 넣는다 */
    | { kind: 'create'; name: string }
    /** 켜진 자동 프리셋에 이 종목을 넣는다 */
    | { kind: 'add'; presetId: bigint };

/**
 * 매수가 체결됐을 때 할 일.
 * - 프리셋이 하나도 없으면 자동 프리셋을 만든다
 * - 켜진 프리셋이 자동이고 빈 칸이 있고 그 종목이 없으면 넣는다
 * - 그 밖(켜진 프리셋이 일반 · 칸이 참 · 켜진 프리셋 없음 · 이미 들어 있음)은 아무것도 안 한다
 */
export function planOnBuy(
    presets: readonly PresetSnapshot[],
    stockId: bigint,
): BuyPlan {
    if (presets.length === 0) {
        return { kind: 'create', name: nextAutoPresetName([]) };
    }
    const active = presets.find((p) => p.isActive);
    if (!active || !active.isAuto) return { kind: 'none' };
    if (active.stockIds.includes(stockId)) return { kind: 'none' };
    if (active.stockIds.length >= MAX_PRESET_STOCKS) return { kind: 'none' };
    return { kind: 'add', presetId: active.id };
}

export interface SoldOutPlan {
    /** 그 종목 줄을 지울 프리셋(일반 포함 — 그 종목이 든 것 전부) */
    removeFromPresetIds: bigint[];
    /** 보유가 하나도 안 남았을 때 새로 만들어 켤 자동 프리셋의 이름. 만들지 않으면 null */
    createName: string | null;
}

/**
 * 매도로 그 종목 보유가 0이 됐을 때 할 일.
 * @param remainingHoldings 그 종목을 뺀 뒤 남은 보유 종목 수
 */
export function planOnSoldOut(
    presets: readonly PresetSnapshot[],
    stockId: bigint,
    remainingHoldings: number,
): SoldOutPlan {
    const removeFromPresetIds = presets
        .filter((p) => p.stockIds.includes(stockId))
        .map((p) => p.id);

    let createName: string | null = null;
    if (remainingHoldings === 0) {
        const active = presets.find((p) => p.isActive);
        // 켜진 프리셋이 이미 자동이면 그대로(빈 자동 프리셋). 한도가 찼으면 만들지 않는다
        if (!active?.isAuto && presets.length < MAX_PRESETS) {
            createName = nextAutoPresetName(presets.map((p) => p.name));
        }
    }
    return { removeFromPresetIds, createName };
}

type Tx = Pick<
    Prisma.TransactionClient,
    'character_presets' | 'character_preset_items' | 'holdings'
>;

async function loadPresets(tx: Tx, userId: bigint): Promise<PresetSnapshot[]> {
    const rows = await tx.character_presets.findMany({
        where: { user_id: userId },
        orderBy: { id: 'asc' },
        select: {
            id: true,
            preset_name: true,
            is_active: true,
            is_auto: true,
            preset_items: { select: { stock_id: true } },
        },
    });
    return rows.map((r) => ({
        id: r.id,
        name: r.preset_name,
        isActive: r.is_active,
        isAuto: r.is_auto,
        stockIds: r.preset_items.map((i) => i.stock_id),
    }));
}

/**
 * 자동 프리셋을 만들어 켠다. 사용자당 켜진 프리셋은 하나(부분 유일 인덱스)라 **다른 것을 먼저 끈다**.
 * 거실에 세울 종목(holdings.is_placed)도 새 프리셋의 것으로 맞춘다.
 */
async function createActiveAutoPreset(
    tx: Tx,
    userId: bigint,
    name: string,
    stockIds: bigint[],
): Promise<void> {
    await tx.character_presets.updateMany({
        where: { user_id: userId, is_active: true },
        data: { is_active: false },
    });
    await tx.character_presets.create({
        data: {
            user_id: userId,
            preset_name: name,
            is_active: true,
            is_auto: true,
            preset_items: {
                create: stockIds.map((stock_id) => ({ stock_id })),
            },
        },
        select: { id: true },
    });
    await tx.holdings.updateMany({
        where: { user_id: userId, is_placed: true },
        data: { is_placed: false },
    });
    if (stockIds.length > 0) {
        await tx.holdings.updateMany({
            where: { user_id: userId, stock_id: { in: stockIds } },
            data: { is_placed: true },
        });
    }
}

/**
 * 매수 체결 뒤 — 보유(holdings) 줄을 만든/고친 **다음에** 부른다(is_placed 를 그 줄에 적으므로).
 * 사용자 줄이 잠긴 트랜잭션 안이어야 한다(체결은 잔고를 바꾸며 사용자 줄을 잡는다).
 */
export async function applyPresetAutoOnBuy(
    tx: Tx,
    userId: bigint,
    stockId: bigint,
): Promise<void> {
    const plan = planOnBuy(await loadPresets(tx, userId), stockId);
    if (plan.kind === 'none') return;
    if (plan.kind === 'create') {
        await createActiveAutoPreset(tx, userId, plan.name, [stockId]);
        return;
    }
    await tx.character_preset_items.createMany({
        data: [{ preset_id: plan.presetId, stock_id: stockId }],
        skipDuplicates: true,
    });
    await tx.holdings.updateMany({
        where: { user_id: userId, stock_id: stockId },
        data: { is_placed: true },
    });
}

/**
 * 매도 체결 뒤 — 그 종목 보유 줄이 **지워졌을 때만**(전량 매도) 부른다.
 * 모든 프리셋에서 그 종목을 지우고, 보유가 하나도 안 남았으면 새 자동 프리셋을 켠다.
 */
export async function applyPresetAutoOnSoldOut(
    tx: Tx,
    userId: bigint,
    stockId: bigint,
): Promise<void> {
    const presets = await loadPresets(tx, userId);
    const remainingHoldings = await tx.holdings.count({
        where: { user_id: userId },
    });
    const plan = planOnSoldOut(presets, stockId, remainingHoldings);
    if (plan.removeFromPresetIds.length > 0) {
        await tx.character_preset_items.deleteMany({
            where: {
                stock_id: stockId,
                preset_id: { in: plan.removeFromPresetIds },
            },
        });
    }
    if (plan.createName !== null) {
        await createActiveAutoPreset(tx, userId, plan.createName, []);
    }
}

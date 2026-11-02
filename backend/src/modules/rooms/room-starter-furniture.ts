import type { Prisma } from 'generated/prisma/client';

// 기본 지급 구성 — furnitures.id. 노말 팩 구성인데 특수 모션 자리에 슬롯머신
const STARTER_FIXED = [
    1n, // 책상 (노말)
    2n, // 소파 (노말)
    29n, // 슬롯머신
];
// 장식은 이 넷 중 무작위 2개
const STARTER_DECOR = [
    3n, // 화분 (노말)
    4n, // 스탠드 조명 (노말)
    5n, // 책장 (노말)
    6n, // 카펫 (노말)
];

export function pickStarterFurniture(random = Math.random): bigint[] {
    const decor = [...STARTER_DECOR];
    const picked = [0, 1].map(
        () => decor.splice(Math.floor(random() * decor.length), 1)[0],
    );
    return [...STARTER_FIXED, ...picked];
}

// 거실을 처음 열 때 기본 가구를 보관함으로 넣는다(위치 비움).
// 사용자 줄을 잠그고 다시 세므로 동시에 두 번 열려도 한 번만 들어간다.
// 전제: 가구를 버리거나 파는 기능이 없다 → 「0줄 = 아직 안 받음」. 그런 기능이 생기면 「받음」 표시 칸이 필요하다.
export async function grantStarterFurniture(
    tx: Pick<Prisma.TransactionClient, 'user_furniture' | '$queryRaw'>,
    userId: bigint,
    random = Math.random,
): Promise<void> {
    await tx.$queryRaw`SELECT 1 FROM users WHERE id = ${userId} FOR UPDATE`;
    const owned = await tx.user_furniture.count({
        where: { user_id: userId },
    });
    if (owned > 0) return;
    await tx.user_furniture.createMany({
        data: pickStarterFurniture(random).map((furniture_id) => ({
            user_id: userId,
            furniture_id,
        })),
    });
}

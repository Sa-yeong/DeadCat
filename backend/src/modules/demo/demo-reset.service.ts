import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

/**
 * **데모 계정 초기화(졸프 데모 영상)** — 가입 직후 상태로. 계정 · 닉네임 · 프로필 이미지 · 공개 설정만 남긴다.
 * 2026-11-16 도휘가 SQL Editor 로 돌려 검증한 초기화 SQL 과 같은 문장을 한 트랜잭션으로 실행한다.
 * placed · storage 는 DB 에는 있고 Prisma 스키마에는 없어 날 SQL 로 쓴다. 부르는 쪽(컨트롤러)이 데모 계정인지 먼저 본다.
 *  · 거래 — 거래내역(이별흔적도 같이) · 주문 · 보유(거실 캐릭터) · 투자 성향 태그 · 관심종목
 *  · 거실 — 가구 · placed · 아이템 · storage · 옷 · 호감도 · 프리셋 · 받은/남긴 반응 · 내 거실 방명록
 *  · 커뮤니티 — 내 글(댓글 · 좋아요 · 투표는 DB CASCADE) · 남의 글에 단 댓글 · 하트 · 투표 참여 · 팔로잉/팔로워 · 알림
 *  · 계정 값 — 잔고 1억 · 출석 0(오늘 다시 출석 가능) · 거실 썸네일 없음(자동 촬영)
 */
@Injectable()
export class DemoResetService {
    constructor(private readonly prisma: PrismaService) {}

    async reset(userId: bigint): Promise<void> {
        const p = this.prisma;
        await p.$transaction([
            p.$executeRaw`DELETE FROM transaction_history WHERE user_id = ${userId}`,
            p.$executeRaw`DELETE FROM orders WHERE user_id = ${userId}`,
            p.$executeRaw`DELETE FROM holdings WHERE user_id = ${userId}`,
            p.$executeRaw`DELETE FROM have_tags WHERE user_id = ${userId}`,
            p.$executeRaw`DELETE FROM interest WHERE user_id = ${userId}`,
            p.$executeRaw`DELETE FROM user_furniture WHERE user_id = ${userId}`,
            p.$executeRaw`DELETE FROM placed WHERE user_id = ${userId}`,
            p.$executeRaw`DELETE FROM inventory WHERE user_id = ${userId}`,
            p.$executeRaw`DELETE FROM storage WHERE user_id = ${userId}`,
            p.$executeRaw`DELETE FROM wardrobe WHERE user_id = ${userId}`,
            p.$executeRaw`DELETE FROM affinity WHERE user_id = ${userId}`,
            p.$executeRaw`DELETE FROM character_presets WHERE user_id = ${userId}`,
            p.$executeRaw`DELETE FROM room_reactions WHERE reactor_id = ${userId} OR receiver_id = ${userId}`,
            p.$executeRaw`DELETE FROM char_reactions WHERE reactor_id = ${userId} OR receiver_id = ${userId}`,
            p.$executeRaw`DELETE FROM posts WHERE target_user_id = ${userId}`,
            p.$executeRaw`DELETE FROM posts WHERE writer_id = ${userId}`,
            p.$executeRaw`DELETE FROM comments WHERE user_id = ${userId}`,
            p.$executeRaw`DELETE FROM like_posts WHERE user_id = ${userId}`,
            p.$executeRaw`DELETE FROM voting WHERE voter_id = ${userId}`,
            p.$executeRaw`DELETE FROM follow WHERE follower_id = ${userId} OR followee_id = ${userId}`,
            p.$executeRaw`DELETE FROM alarms WHERE user_id = ${userId}`,
            p.$executeRaw`UPDATE users SET balance = 100000000, attendance_count = 0, last_attendance_date = NULL, room_thumbnail_url = NULL, room_thumbnail_is_auto = TRUE WHERE id = ${userId}`,
        ]);
    }

    /** 데모 계정 목록(id · 로그인 id · 닉네임) — 데모 페이지의 초기화 버튼 */
    async accounts(
        ids: string[],
    ): Promise<{ id: string; login_id: string; nickname: string }[]> {
        if (ids.length === 0) return [];
        const rows = await this.prisma.users.findMany({
            where: { id: { in: ids.map((i) => BigInt(i)) } },
            select: { id: true, login_id: true, nickname: true },
            orderBy: { id: 'asc' },
        });
        return rows.map((r) => ({
            id: String(r.id),
            login_id: r.login_id,
            nickname: r.nickname,
        }));
    }
}

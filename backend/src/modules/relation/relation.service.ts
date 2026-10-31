import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { RelationRepository } from './relation.repository';
import { UserRelationResponseDto } from './dto/user-relation-response.dto';
import { parseUserIdParam } from 'src/common/rooms/room-access';

type RelatedUser = {
    id: bigint;
    nickname: string;
    profile_img_url: string | null;
};

@Injectable()
export class RelationService {
    constructor(private readonly relationRepository: RelationRepository) {}

    async getMyRelations(
        userIdStr: string,
        type: string,
    ): Promise<UserRelationResponseDto[]> {
        const userId = BigInt(userIdStr);

        let rawRelations: RelatedUser[];

        if (type === 'FOLLOWER') {
            const result = await this.relationRepository.findFollowers(userId);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            rawRelations = result.map((r) => r.users_follow_follower_idTousers);
        } else if (type === 'FOLLOWING') {
            const result = await this.relationRepository.findFollowings(userId);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            rawRelations = result.map((r) => r.users_follow_followee_idTousers);
        } else {
            throw new BadRequestException(
                'type은 FOLLOWER 또는 FOLLOWING 이어야 합니다.',
            );
        }

        return rawRelations.map(
            (user) =>
                new UserRelationResponseDto({
                    target_user_id: String(user.id),
                    nickname: user.nickname,
                    character_img_url: user.profile_img_url ?? '',
                }),
        );
    }

    // POST /users/:userId/follow — 팔로우 ↔ 취소 토글 (지시서 3-⑨). 자기 자신 불가
    async toggleFollow(
        followerId: bigint,
        targetUserIdParam: string,
    ): Promise<{ is_following: boolean }> {
        const followeeId = parseUserIdParam(targetUserIdParam);
        if (followeeId === followerId) {
            throw new BadRequestException('자기 자신은 팔로우할 수 없습니다.');
        }
        if (!(await this.relationRepository.userExists(followeeId))) {
            throw new NotFoundException('존재하지 않는 사용자입니다.');
        }
        const isFollowing = await this.relationRepository.toggleFollow(
            followerId,
            followeeId,
        );
        return { is_following: isFollowing };
    }
}

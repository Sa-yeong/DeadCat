import { Injectable, BadRequestException } from '@nestjs/common';
import { RelationRepository } from './relation.repository';
import { UserRelationResponseDto } from './dto/user-relation-response.dto';

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
}

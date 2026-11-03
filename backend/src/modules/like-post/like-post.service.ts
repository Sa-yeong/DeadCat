import { Injectable, NotFoundException } from '@nestjs/common';
import { LikePostRepository } from './like-post.repository';
import { LikedPostItemDto } from './dto/like-post-list.response.dto';
import { PostLikeResponseDto } from '../post/dto/post-like-response.dto';

@Injectable()
export class LikePostService {
    constructor(private readonly likePostRepository: LikePostRepository) {}

    async getLikedPostsByUserId(userId: string): Promise<LikedPostItemDto[]> {
        const likedRecords =
            await this.likePostRepository.findUserLikedPosts(userId);

        return likedRecords
            .map((record) => {
                const post = record.posts;
                if (!post) return null;

                const authorNickname =
                    post.users_posts_writer_idTousers?.nickname ||
                    '알 수 없는 사용자';

                const createdAtStr = post.write_time
                    ? post.write_time.toISOString().split('T')[0]
                    : '날짜 정보 없음';

                return new LikedPostItemDto({
                    post_id: String(post.id),
                    content: post.content ?? '내용 없음',
                    author_nickname: authorNickname,
                    comment_count: post._count?.comments ?? 0,
                    like_count: post._count?.like_posts ?? 0,
                    created_at: createdAtStr,
                    source_type: 'COMMUNITY',
                });
            })
            .filter((item): item is LikedPostItemDto => item !== null);
    }

    /**
     * 게시글 좋아요 토글
     */
    async toggleLike(
        postId: string,
        userId: string,
    ): Promise<PostLikeResponseDto> {
        // 문자열 ID를 BigInt로 변환
        const postIdBigInt = BigInt(postId);
        const userIdBigInt = BigInt(userId);

        // 게시글 존재 여부 확인
        const post = await this.likePostRepository.findPostById(postIdBigInt);

        if (!post) {
            throw new NotFoundException('게시글을 찾을 수 없습니다.');
        }

        // 기존 좋아요 조회
        const existingLike = await this.likePostRepository.findLike(
            postIdBigInt,
            userIdBigInt,
        );

        let isLiked: boolean;

        if (existingLike) {
            // 이미 좋아요를 눌렀다면 취소
            await this.likePostRepository.deleteLike(
                postIdBigInt,
                userIdBigInt,
            );

            isLiked = false;
        } else {
            // 좋아요가 없다면 등록
            await this.likePostRepository.createLike(
                postIdBigInt,
                userIdBigInt,
            );

            isLiked = true;
        }

        // 최신 좋아요 개수 조회
        const likeCount =
            await this.likePostRepository.countLikes(postIdBigInt);

        return new PostLikeResponseDto({
            is_liked: isLiked,
            like_count: likeCount,
        });
    }
}

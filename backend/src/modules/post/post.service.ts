import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PostRepository } from './post.repository';
import { MyPostItemDto } from './dto/my-posts-response.dto';
import {
    StockPostItemDto,
    StockPostsResponseDto,
    StockPostVoteDto,
    StockPostVoteOptionDto,
    StockPostWriterDto,
} from './dto/stock-post-response.dto';
import { PostLikeResponseDto } from './dto/post-like-response.dto';
import {
    CommentItemDto,
    CommentWriterDto,
    PostCommentsResponseDto,
} from './dto/post-comment-response.dto';
import { CreateCommentResponseDto } from './dto/create-comment-response.dto';
import { VoteOptionResultDto, VoteResponseDto } from './dto/vote-response.dto';

@Injectable()
export class PostService {
    constructor(private readonly postRepository: PostRepository) {}

    async getMyPosts(userId: string): Promise<MyPostItemDto[]> {
        const posts = await this.postRepository.findUserPosts(userId);

        return posts.map((post) => {
            const authorNickname =
                post.users_posts_writer_idTousers?.nickname ||
                '알 수 없는 사용자';

            const createdAtStr = post.write_time
                ? post.write_time.toISOString().split('T')[0]
                : '날짜 없음';

            return new MyPostItemDto({
                post_id: String(post.id),
                // title 대신 content 전달 (null/undefined 대응)
                content: post.content ?? '내용 없음',
                author_nickname: authorNickname,
                comment_count: post._count?.comments ?? 0,
                like_count: post._count?.like_posts ?? 0,
                created_at: createdAtStr,
                source_type: 'COMMUNITY', // 필요 시 지정
            });
        });
    }

    /**
     * 특정 종목의 커뮤니티 게시글 조회
     */
    async getStockPosts(
        stockCode: string,
        cursor?: string,
        limit = 20,
        userId?: string,
    ): Promise<StockPostsResponseDto> {
        // 1. 먼저 종목 자체가 존재하는지 확인
        const stock = await this.postRepository.findStockByCode(stockCode);

        if (!stock) {
            // 종목 자체가 없는 경우만 404
            throw new NotFoundException('종목을 찾을 수 없습니다.');
        }

        // 2. limit 방어
        const safeLimit = Math.min(Math.max(limit, 1), 50);

        // 3. cursor 변환
        const cursorId = cursor ? BigInt(cursor) : null;

        // 4. 로그인한 경우 좋아요 여부 확인
        const currentUserId = userId ? BigInt(userId) : undefined;

        // 5. 해당 종목의 게시글 조회
        const posts = await this.postRepository.findStockPosts(
            stockCode,
            cursorId,
            safeLimit,
            currentUserId,
        );

        // 6. 게시글이 없으면 정상적인 빈 목록 반환
        if (posts.length === 0) {
            return new StockPostsResponseDto({
                posts: [],
                next_cursor: null,
                has_more: false,
            });
        }

        // 7. limit + 1개 여부로 다음 페이지 존재 확인
        const hasMore = posts.length > safeLimit;

        const resultPosts = hasMore ? posts.slice(0, safeLimit) : posts;

        // 8. 다음 cursor
        const nextCursor =
            hasMore && resultPosts.length > 0
                ? String(resultPosts[resultPosts.length - 1].id)
                : null;

        // DTO 변환
        const mappedPosts = resultPosts.map((post) => {
            const writer = post.users_posts_writer_idTousers;

            /**
             * 현재 로그인 사용자가 좋아요를 눌렀는지 확인
             *
             * 비로그인이라면 false
             */
            const isLiked =
                currentUserId !== undefined
                    ? post.like_posts.some(
                          (like) => like.user_id === currentUserId,
                      )
                    : false;

            /**
             * 투표 데이터가 존재하는 경우 변환
             */
            let vote: StockPostVoteDto | null = null;

            if (post.vote) {
                const totalVoters = post.vote.voting.length;

                const options = post.vote.vote_options.map((option) => {
                    // 해당 선택지를 선택한 사람 수
                    const voteCount = post.vote!.voting.filter(
                        (voting) => voting.option_no === option.option_no,
                    ).length;

                    // 득표율 계산
                    const percentage =
                        totalVoters > 0
                            ? Math.round((voteCount / totalVoters) * 100)
                            : 0;

                    return new StockPostVoteOptionDto({
                        option_no: option.option_no,
                        option_text: option.content,
                        vote_count: voteCount,
                        percentage,
                    });
                });

                vote = new StockPostVoteDto({
                    vote_id: String(post.vote.post_id),

                    // 현재 vote 테이블에는 title 컬럼이 없으므로
                    // 게시글 title을 투표 제목으로 사용
                    title: post.title ?? '',

                    state: post.vote.state,

                    end_date: post.vote.end_date.toISOString(),

                    total_voters: totalVoters,

                    options,
                });
            }

            return new StockPostItemDto({
                post_id: String(post.id),

                title: post.title,

                content: post.content,

                write_time: post.write_time.toISOString(),

                type: post.type,

                writer: new StockPostWriterDto({
                    user_id: writer ? String(writer.id) : null,
                    nickname: writer?.nickname ?? '알 수 없는 사용자',
                    profile_img_url: writer?.profile_img_url ?? null,
                }),

                like_count: post.like_posts.length,

                comment_count: post._count.comments,

                is_liked: isLiked,

                vote,
            });
        });

        return new StockPostsResponseDto({
            posts: mappedPosts,
            next_cursor: nextCursor,
            has_more: hasMore,
        });
    }

    /**
     * 3. 댓글 목록 조회
     */
    async getComments(
        postId: string,
        cursor?: string,
        limit = 20,
    ): Promise<PostCommentsResponseDto> {
        // 1. 게시글 존재 여부 확인
        const post = await this.postRepository.findPostById(postId);

        if (!post) {
            throw new NotFoundException('게시글을 찾을 수 없습니다.');
        }

        // limit이 비정상적으로 들어오는 것을 방지
        const safeLimit =
            Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20;

        // 2. 댓글 조회
        const rows = await this.postRepository.findCommentsByPostId(
            postId,
            cursor,
            safeLimit,
        );

        // 3. 하나 더 가져왔기 때문에
        // 실제 응답에는 safeLimit개만 사용한다.
        const hasMore = rows.length > safeLimit;

        const comments = rows.slice(0, safeLimit);

        // 4. 다음 cursor 계산
        const lastComment =
            comments.length > 0 ? comments[comments.length - 1] : null;

        const nextCursor =
            hasMore && lastComment ? String(lastComment.id) : null;

        // 5. API 응답 DTO 변환
        return new PostCommentsResponseDto({
            comments: comments.map(
                (comment) =>
                    new CommentItemDto({
                        comment_id: String(comment.id),
                        content: comment.content,
                        write_time: comment.write_time.toISOString(),

                        writer: new CommentWriterDto({
                            // users가 없으면 탈퇴 회원으로 처리
                            user_id: comment.users
                                ? String(comment.users.id)
                                : null,

                            nickname:
                                comment.users?.nickname ?? '알 수 없는 사용자',

                            profile_img_url:
                                comment.users?.profile_img_url ?? null,
                        }),
                    }),
            ),

            next_cursor: nextCursor,
            has_more: hasMore,
        });
    }

    /**
     * 4. 댓글 작성
     */
    async createComment(
        postId: string,
        userId: string,
        content: string,
    ): Promise<CreateCommentResponseDto> {
        // 1. 게시글 존재 여부 확인
        const post = await this.postRepository.findPostById(postId);

        if (!post) {
            throw new NotFoundException('게시글을 찾을 수 없습니다.');
        }

        // 2. 댓글 생성
        const comment = await this.postRepository.createComment(
            postId,
            userId,
            content,
        );

        // 3. 댓글 생성 후 최신 댓글 수 조회
        const commentCount = await this.postRepository.countComments(postId);

        // 4. API 응답 형태로 변환
        return new CreateCommentResponseDto({
            comment_id: String(comment.id),
            content: comment.content,
            write_time: comment.write_time.toISOString(),

            writer: {
                user_id: String(comment.users.id),
                nickname: comment.users.nickname,
                profile_img_url: comment.users.profile_img_url ?? null,
            },

            comment_count: commentCount,
        });
    }

    /**
     * POST /posts/{postId}/vote/options/{optionNo}
     * 투표 참여
     */
    async votePost(
        postId: string,
        optionNo: number,
        userId: string,
    ): Promise<VoteResponseDto> {
        // ID를 BigInt로 변환
        const postIdBigInt = BigInt(postId);
        const voterIdBigInt = BigInt(userId);

        // 게시글의 투표 조회
        const vote = await this.postRepository.findVoteByPostId(postIdBigInt);

        if (!vote) {
            throw new NotFoundException(
                '해당 게시글에 투표가 존재하지 않습니다.',
            );
        }

        // 선택지 존재 여부 확인
        const selectedOption = vote.vote_options.find(
            (option) => option.option_no === optionNo,
        );

        if (!selectedOption) {
            throw new BadRequestException('존재하지 않는 투표 선택지입니다.');
        }

        // 종료된 투표인지 확인
        if (!vote.state) {
            throw new BadRequestException(
                '종료된 투표에는 참여할 수 없습니다.',
            );
        }

        // 중복 투표 확인
        const existingVoting = await this.postRepository.findVoting(
            vote.post_id,
            voterIdBigInt,
        );

        if (existingVoting) {
            throw new BadRequestException('이미 참여한 투표입니다.');
        }

        // 투표 등록
        await this.postRepository.createVoting(
            vote.post_id,
            voterIdBigInt,
            optionNo,
        );

        // 전체 투표자 수 조회
        const totalVoters = await this.postRepository.countVoters(vote.post_id);

        // 선택지별 득표수와 득표율 계산
        const options: VoteOptionResultDto[] = [];

        for (const option of vote.vote_options) {
            const voteCount = await this.postRepository.countVotesByOption(
                vote.post_id,
                option.option_no,
            );

            // 득표율 계산
            const percentage =
                totalVoters > 0
                    ? Math.round((voteCount / totalVoters) * 100)
                    : 0;

            options.push(
                new VoteOptionResultDto({
                    option_no: option.option_no,
                    option_text: option.content,
                    vote_count: voteCount,
                    percentage,
                }),
            );
        }

        // 투표 결과 반환
        return new VoteResponseDto({
            vote_id: String(vote.post_id),
            selected_option_no: optionNo,
            total_voters: totalVoters,
            state: vote.state,
            options,
        });
    }
}

import {
    Controller,
    Get,
    UseGuards,
    Request,
    Param,
    Query,
    Req,
    UnauthorizedException,
    Post,
    Body,
    BadRequestException,
} from '@nestjs/common';
import { PostService } from './post.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { MyPostItemDto } from './dto/my-posts-response.dto';
import { StockPostsResponseDto } from './dto/stock-post-response.dto';
import { CreateCommentRequestDto } from './dto/create-comment-request.dto';
import { CreateCommentResponseDto } from './dto/create-comment-response.dto';
import { PostCommentsResponseDto } from './dto/post-comment-response.dto';
import { VoteResponseDto } from './dto/vote-response.dto';
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt-auth.guard';

interface AuthenticatedRequest extends Request {
    user: { id: string };
}

@Controller()
export class PostController {
    constructor(private readonly postService: PostService) {}

    //작성 게시물 조회
    @UseGuards(JwtAuthGuard)
    @Get('users/me/posts')
    async getMyPosts(
        @Request() req: AuthenticatedRequest,
    ): Promise<MyPostItemDto[]> {
        const userId = String(req.user.id);

        return await this.postService.getMyPosts(userId);
    }

    /**
     * 특정 종목의 커뮤니티 게시글 목록 조회
     *
     * GET /stocks/{stock_code}/posts
     */
    /*@Get('stocks/:stock_code/posts')
    async getStockPosts(
        @Param('stock_code') stockCode: string,

        @Request() req: AuthenticatedRequest,

        // 첫 요청이면 cursor가 없다.
        @Query('cursor') cursor?: string,

        // 기본 20개
        @Query('limit') limit = '20',
    ): Promise<StockPostsResponseDto> {
        // 로그인한 경우에만 user ID가 존재한다.
        const userId = req.user?.id;

        return await this.postService.getStockPosts(
            stockCode,
            cursor,
            Number(limit),
            userId,
        );
    }*/

    // 특정 종목의 커뮤니티 게시글 조회
    // 비로그인 사용자도 조회 가능하며,로그인 사용자는 JWT를 통해 is_liked를 확인한다.
    @UseGuards(OptionalJwtAuthGuard)
    @Get('stocks/:stock_code/posts')
    async getStockPosts(
        @Param('stock_code') stockCode: string,
        @Request() req: AuthenticatedRequest,

        // 첫 요청이면 cursor가 없다.
        @Query('cursor') cursor?: string,

        // 기본 20개
        @Query('limit') limit = '20',
    ): Promise<StockPostsResponseDto> {
        // 로그인 상태라면 user.id가 들어있다. 비로그인 상태라면 undefined이다.
        const userId = req.user?.id ? String(req.user.id) : undefined;

        return await this.postService.getStockPosts(
            stockCode,
            cursor,
            Number(limit),
            userId,
        );
    }

    /**
     * 3. 댓글 목록 조회
     *
     * GET /posts/{postId}/comments
     *
     * Authorization: 선택사항
     */
    @Get('posts/:postId/comments')
    async getComments(
        @Param('postId') postId: string,

        // cursor가 없으면 첫 페이지
        @Query('cursor') cursor?: string,

        // 기본 20개
        @Query('limit') limit = '20',
    ): Promise<PostCommentsResponseDto> {
        return await this.postService.getComments(
            postId,
            cursor,
            Number(limit),
        );
    }

    /**
     * 4. 댓글 작성
     *
     * POST /posts/{postId}/comments
     *
     * 로그인 필수
     */
    @UseGuards(JwtAuthGuard)
    @Post('posts/:postId/comments')
    async createComment(
        @Param('postId') postId: string,

        @Body() body: CreateCommentRequestDto,

        @Request() req: AuthenticatedRequest,
    ): Promise<CreateCommentResponseDto> {
        const userId = String(req.user.id);

        return await this.postService.createComment(
            postId,
            userId,
            body.content,
        );
    }

    /**
     * POST /posts/{postId}/vote/options/{optionNo}
     *
     * 투표 참여
     */
    @UseGuards(JwtAuthGuard)
    @Post('posts/:postId/vote/options/:optionNo')
    async votePost(
        @Param('postId') postId: string,
        @Param('optionNo') optionNo: string,
        @Request() req: AuthenticatedRequest,
    ): Promise<VoteResponseDto> {
        // JWT에서 로그인한 사용자 ID 가져오기
        const userId = String(req.user.id);

        // optionNo는 URL에서 문자열로 들어오므로 숫자로 변환
        const selectedOptionNo = Number(optionNo);

        if (!Number.isInteger(selectedOptionNo)) {
            throw new BadRequestException('optionNo는 정수여야 합니다.');
        }

        return await this.postService.votePost(
            postId,
            selectedOptionNo,
            userId,
        );
    }
}

/**
 * 게시글 작성자 정보
 */
export class StockPostWriterDto {
    user_id: string | null | undefined;
    nickname: string | undefined;
    profile_img_url: string | null | undefined;

    constructor(partial: Partial<StockPostWriterDto>) {
        Object.assign(this, partial);
    }
}

/**
 * 투표 선택지
 */
export class StockPostVoteOptionDto {
    option_no: number;
    option_text: string;
    vote_count: number;
    percentage: number;

    constructor(partial: Partial<StockPostVoteOptionDto>) {
        Object.assign(this, partial);
    }
}

/**
 * 게시글에 포함된 투표 정보
 */
export class StockPostVoteDto {
    vote_id: string;
    title: string;
    state: boolean;
    end_date: string;
    total_voters: number;
    options: StockPostVoteOptionDto[];

    constructor(partial: Partial<StockPostVoteDto>) {
        Object.assign(this, partial);
    }
}

/**
 * 주식 상세 화면 게시글 1개
 */
export class StockPostItemDto {
    post_id: string;
    title: string | null;
    content: string;
    write_time: string;
    type: string;
    writer: StockPostWriterDto;
    like_count: number;
    comment_count: number;
    is_liked: boolean;

    vote: StockPostVoteDto | null;

    constructor(partial: Partial<StockPostItemDto>) {
        Object.assign(this, partial);
    }
}

/**
 * GET /stocks/{stock_code}/posts 응답
 */
export class StockPostsResponseDto {
    posts: StockPostItemDto[];
    next_cursor: string | null;
    has_more: boolean;

    constructor(partial: Partial<StockPostsResponseDto>) {
        Object.assign(this, partial);
    }
}

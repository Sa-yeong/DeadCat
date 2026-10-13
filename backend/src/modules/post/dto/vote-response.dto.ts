/**
 * 투표 선택지 하나의 응답 DTO
 */
export class VoteOptionResultDto {
    option_no: number;
    option_text: string;
    vote_count: number;
    percentage: number;

    constructor(data: {
        option_no: number;
        option_text: string;
        vote_count: number;
        percentage: number;
    }) {
        this.option_no = data.option_no;
        this.option_text = data.option_text;
        this.vote_count = data.vote_count;
        this.percentage = data.percentage;
    }
}

/**
 * 투표 참여 API 전체 응답 DTO
 */
export class VoteResponseDto {
    vote_id: string;
    selected_option_no: number;
    total_voters: number;
    state: boolean;
    options: VoteOptionResultDto[];

    constructor(data: {
        vote_id: string;
        selected_option_no: number;
        total_voters: number;
        state: boolean;
        options: VoteOptionResultDto[];
    }) {
        this.vote_id = data.vote_id;
        this.selected_option_no = data.selected_option_no;
        this.total_voters = data.total_voters;
        this.state = data.state;
        this.options = data.options;
    }
}

export class CreatePostDataDto {
    id: string;
    has_vote: boolean;
    content: string;
    created_at: string;
}

export class CreatePostResponseDto {
    code: string;
    description: string;
    data: CreatePostDataDto;
}

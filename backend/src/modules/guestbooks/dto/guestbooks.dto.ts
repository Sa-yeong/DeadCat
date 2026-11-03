export class CreateGuestbookDto {
    content!: string;
    is_secret!: boolean;
}

export class AnswerGuestbookDto {
    content!: string;
    isSecret!: boolean;
}

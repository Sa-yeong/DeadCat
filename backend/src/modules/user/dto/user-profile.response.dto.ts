export class UserProfileResponseDto {
    nickname: string;
    representative_character_code: string | null;

    constructor(partial: {
        nickname: string;
        representative_character_code: string | null;
    }) {
        this.nickname = partial.nickname;
        this.representative_character_code =
            partial.representative_character_code;
    }
}

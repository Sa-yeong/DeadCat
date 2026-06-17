export class UserProfileResponseDto {
    nickname: string;
    representative_character_code: string | null;
    representative_character_img: string | null;

    constructor(partial: {
        nickname: string;
        representative_character_code: string | null;
        representative_character_img: string | null;
    }) {
        this.nickname = partial.nickname;
        this.representative_character_code =
            partial.representative_character_code;
        this.representative_character_img =
            partial.representative_character_img;
    }
}

export class UserRelationResponseDto {
    target_user_id: string; // 상대방 유저 식별자
    nickname: string; // 상대방 닉네임
    character_img_url: string; // 상대방의 대표 캐릭터 이미지 URL

    constructor(partial: {
        target_user_id: string;
        nickname: string;
        character_img_url: string;
    }) {
        this.target_user_id = partial.target_user_id;
        this.nickname = partial.nickname;
        this.character_img_url = partial.character_img_url;
    }
}

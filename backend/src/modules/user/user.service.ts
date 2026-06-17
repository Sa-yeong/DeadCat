import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { UserProfileResponseDto } from './dto/user-profile.response.dto';

@Injectable()
export class UserService {
    constructor(private readonly userRepository: UserRepository) {}

    async getMyProfile(userId: string): Promise<UserProfileResponseDto> {
        const user = await this.userRepository.findById(userId);

        if (!user) {
            throw new NotFoundException('사용자를 찾을 수 없습니다.');
        }

        // 안전하게 캐릭터 이미지 URL 추출 (없으면 null)
        const characterImg = user.stocks?.characters?.img_url ?? null;

        // DTO 객체 반환
        return new UserProfileResponseDto({
            nickname: user.nickname,
            representative_character_code: user.represent_stock_id
                ? String(user.represent_stock_id)
                : null,
            representative_character_img: characterImg,
        });
    }
}

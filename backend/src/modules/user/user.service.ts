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

        // DTO 객체 반환
        return new UserProfileResponseDto({
            nickname: user.nickname,
            // represent_stock_id를 기반으로 문자열 매핑
            representative_character_code: user.represent_stock_id
                ? String(user.represent_stock_id)
                : null,
        });
    }
}

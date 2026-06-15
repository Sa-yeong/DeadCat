import { Injectable, ConflictException } from '@nestjs/common';
import { NicknameRepository } from './nickname.repository';
import {
    CheckNicknameResponseDto,
    UpdateNicknameResponseDto,
} from './dto/nickname.dto';
@Injectable()
export class NicknameService {
    constructor(private readonly nicknameRepository: NicknameRepository) {}

    // 12. 중복 확인 비즈니스 로직
    async checkNickname(nickname: string): Promise<CheckNicknameResponseDto> {
        const isExist =
            await this.nicknameRepository.existsByNickname(nickname);

        if (isExist) {
            return new CheckNicknameResponseDto(
                '200',
                false,
                '이미 사용 중인 닉네임입니다.',
            );
        }

        return new CheckNicknameResponseDto(
            '200',
            true,
            '사용 가능한 닉네임입니다.',
        );
    }

    // 13. 닉네임 변경 비즈니스 로직
    async updateNickname(
        userId: string,
        nickname: string,
    ): Promise<UpdateNicknameResponseDto> {
        const isExist =
            await this.nicknameRepository.existsByNickname(nickname);

        if (isExist) {
            throw new ConflictException('이미 사용 중인 닉네임입니다.');
        }

        await this.nicknameRepository.updateUserNickname(userId, nickname);

        return new UpdateNicknameResponseDto('200', '닉네임 변경 성공');
    }
}

import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class UpdateProfileImageDto {
    @IsString()
    @IsNotEmpty({ message: '프로필 이미지 URL은 필수입니다.' })
    @IsUrl({}, { message: '올바른 URL 형식이어야 합니다.' })
    profile_img_url: string;
}

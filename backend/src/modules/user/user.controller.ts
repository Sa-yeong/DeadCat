import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Query,
    Body,
    UseGuards,
    Request,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { UserService } from './user.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { UserProfileResponseDto } from './dto/user-profile-response.dto';
import {
    UpdateShareOptionDto,
    ShareOptionResponseDto,
} from './dto/update-share-option.dto';
import { ToggleFollowResponseDto } from './dto/toggle-follow-response.dto';
import { ProfileImageResponseDto } from './dto/profile-image-response.dto';
import { UserRelationResponseDto } from './dto/user-relation-response.dto';
import { SkipResponseTransform } from 'src/common/decorators/skip-response-transform.decorator';

interface AuthenticatedRequest extends Request {
    user: {
        id: string;
    };
}

@Controller()
export class UserController {
    constructor(private readonly userService: UserService) {}

    // 7. 유저 팔로우 / 팔로우 취소
    @UseGuards(JwtAuthGuard)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    @SkipResponseTransform() // 공통 응답 래핑 제외
    @Post('users/:userId/follow')
    async toggleFollow(
        @User() currentUserId: string,
        @Param('userId') targetUserId: string,
    ): Promise<ToggleFollowResponseDto> {
        return await this.userService.toggleFollow(currentUserId, targetUserId);
    }

    // 8. 내 정보 조회
    @UseGuards(JwtAuthGuard)
    @Get('users/me')
    async getMyProfile(
        @Request() req: AuthenticatedRequest,
    ): Promise<UserProfileResponseDto> {
        const userId = String(req.user.id);

        return await this.userService.getMyProfile(userId);
    }

    // 18. 팔로잉 & 팔로워 유저 리스트 조회
    @UseGuards(JwtAuthGuard)
    @Get('users/me/relations')
    async getUserRelations(
        @Request() req: AuthenticatedRequest,
        @Query('type') type: 'FOLLOWER' | 'FOLLOWING',
    ): Promise<UserRelationResponseDto> {
        // JWT에서 사용자 ID 추출
        const userId = String(req.user.id);

        return this.userService.getUserRelations(userId, type);
    }

    //19. 거실 공유여부 설정
    @UseGuards(JwtAuthGuard)
    @Patch('users/me/share-option')
    async updateShareOption(
        @User() userId: string,
        @Body() dto: UpdateShareOptionDto,
    ): Promise<ShareOptionResponseDto> {
        return await this.userService.updateShareOption(userId, dto);
    }

    // 20.프로필 이미지 업로드
    @UseGuards(JwtAuthGuard)
    @Patch('users/me/profile-image')
    @UseInterceptors(
        FileInterceptor('file', {
            // EC2 로컬 디스크가 아닌 메모리에 파일을 임시 저장
            storage: memoryStorage(),

            // 업로드 파일 크기 제한
            limits: {
                fileSize: 5 * 1024 * 1024, // 5MB
            },

            // 이미지 형식 검증
            fileFilter: (req, file, callback) => {
                if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
                    return callback(
                        new BadRequestException(
                            'jpg, jpeg, png 이미지 파일만 업로드 가능합니다.',
                        ),
                        false,
                    );
                }

                callback(null, true);
            },
        }),
    )
    async updateProfileImage(
        @User() userId: string,
        @UploadedFile() file: Express.Multer.File,
    ): Promise<ProfileImageResponseDto> {
        if (!file) {
            throw new BadRequestException(
                '업로드할 프로필 이미지 파일이 없습니다.',
            );
        }

        // 파일의 실제 경로가 아닌 buffer를 서비스로 전달
        return this.userService.updateProfileImage(userId, file);
    }

    // 20. 프로필 이미지 파일 업로드 및 DB 저장
    /* @UseGuards(JwtAuthGuard)
    @Patch('users/me/profile-image')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    @UseInterceptors(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        FileInterceptor('file', {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            storage: diskStorage({
                destination: (req, file, callback) => {
                    const uploadPath = './uploads/profiles';

                    // 폴더가 존재하지 않으면 상위 폴더까지 자동으로 생성
                    if (!existsSync(uploadPath)) {
                        mkdirSync(uploadPath, { recursive: true });
                    }

                    callback(null, uploadPath);
                },
                filename: (req: any, file, callback) => {
                    const uniqueSuffix =
                        Date.now() + '-' + Math.round(Math.random() * 1e9);
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    const ext = extname(file.originalname);
                    callback(
                        null,
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                        `profile_${req.user?.id}_${uniqueSuffix}${ext}`,
                    );
                },
            }),
            fileFilter: (req, file, callback) => {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                if (!file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                    return callback(
                        new BadRequestException(
                            'jpg, jpeg, png 이미지 파일만 업로드 가능합니다.',
                        ),
                        false,
                    );
                }
                callback(null, true);
            },
        }),
    )
    async updateProfileImage(
        @User() userId: string,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        @UploadedFile() file: Express.Multer.File,
    ): Promise<ProfileImageResponseDto> {
        if (!file) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            throw new BadRequestException(
                '업로드할 프로필 이미지 파일이 없습니다.',
            );
        }

        return await this.userService.updateProfileImage(userId, file.filename);
    }*/
}

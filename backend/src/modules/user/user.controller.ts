import {
    Controller,
    Get,
    UseGuards,
    Request,
    Patch,
    Body,
} from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { UserProfileResponseDto } from './dto/user-profile.response.dto';
import { User } from 'src/common/decorators/user.decorator';
import {
    ShareOptionResponseDto,
    UpdateShareOptionDto,
} from './dto/update-share-option.dto';

interface AuthenticatedRequest extends Request {
    user: {
        id: string;
    };
}

@Controller()
export class UserController {
    constructor(private readonly userService: UserService) {}

    // 8. 내 정보 조회
    @UseGuards(JwtAuthGuard)
    @Get('users/me')
    async getMyProfile(
        @Request() req: AuthenticatedRequest,
    ): Promise<UserProfileResponseDto> {
        const userId = String(req.user.id);

        return await this.userService.getMyProfile(userId);
    }

    //19. 거실 공유여부 설정
    @Patch('me/share-option')
    async updateShareOption(
        @User() userId: string,
        @Body() dto: UpdateShareOptionDto,
    ): Promise<ShareOptionResponseDto> {
        return await this.userService.updateShareOption(userId, dto);
    }
}

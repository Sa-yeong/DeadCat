import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { UserProfileResponseDto } from './dto/user-profile.response.dto';

//  1. JWT 가드를 통과한 인증된 Request 타입을 간단하게 정의
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
}

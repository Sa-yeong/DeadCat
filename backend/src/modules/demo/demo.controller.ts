import {
    Controller,
    ForbiddenException,
    Get,
    Post,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { User } from '../../common/decorators/user.decorator';
import { DEMO_STOCK_CODES, DemoService } from './demo.service';

@Controller('demo')
export class DemoController {
    constructor(private readonly demo: DemoService) {}

    /** GET /demo/me — 프론트가 데모 계정인지 확인한다. 비로그인 · 데모 아님은 { demo: false, codes: [] } */
    @Get('me')
    @UseGuards(OptionalJwtAuthGuard)
    me(@User() userId: bigint | undefined): { demo: boolean; codes: string[] } {
        const demo = this.demo.isDemoUser(userId);
        return { demo, codes: demo ? [...DEMO_STOCK_CODES] : [] };
    }

    /** POST /demo/restart — 가짜 시세 시나리오를 처음부터(촬영 직전). 데모 계정만 */
    @Post('restart')
    @UseGuards(JwtAuthGuard)
    restart(@User() userId: bigint): { restarted: true } {
        if (!this.demo.isDemoUser(userId)) {
            throw new ForbiddenException('데모 계정만 쓸 수 있습니다.');
        }
        this.demo.restart();
        return { restarted: true };
    }
}

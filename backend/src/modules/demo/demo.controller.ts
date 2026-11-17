import {
    BadRequestException,
    Body,
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
import { DemoResetService } from './demo-reset.service';

@Controller('demo')
export class DemoController {
    constructor(
        private readonly demo: DemoService,
        private readonly resetter: DemoResetService,
    ) {}

    /** 데모 계정만 — 아니면 403 */
    private requireDemo(userId: bigint | undefined): void {
        if (!this.demo.isDemoUser(userId)) {
            throw new ForbiddenException('데모 계정만 쓸 수 있습니다.');
        }
    }

    /** GET /demo/accounts — 초기화할 수 있는 데모 계정 목록. 데모 계정만 */
    @Get('accounts')
    @UseGuards(JwtAuthGuard)
    accounts(@User() userId: bigint) {
        this.requireDemo(userId);
        return this.resetter.accounts(this.demo.userIds);
    }

    /**
     * POST /demo/reset { user_id? } — 데모 계정을 가입 직후 상태로(DemoResetService). 데모 계정만.
     * user_id 를 빼면 내 계정. 다른 데모 계정도 지정할 수 있다(데모 계정이 아니면 400)
     */
    @Post('reset')
    @UseGuards(JwtAuthGuard)
    async reset(
        @User() userId: bigint,
        @Body('user_id') target?: string | number,
    ): Promise<{ reset: string }> {
        this.requireDemo(userId);
        const id =
            target == null || target === '' ? String(userId) : String(target);
        if (!/^\d+$/.test(id) || !this.demo.isDemoUser(id)) {
            throw new BadRequestException('데모 계정만 초기화할 수 있습니다.');
        }
        await this.resetter.reset(BigInt(id));
        return { reset: id };
    }

    /** GET /demo/me — 프론트가 데모 계정인지 확인한다. 비로그인 · 데모 아님은 { demo: false, codes: [] } */
    @Get('me')
    @UseGuards(OptionalJwtAuthGuard)
    me(@User() userId: bigint | undefined): {
        demo: boolean;
        codes: string[];
        room_user_ids: string[];
    } {
        const demo = this.demo.isDemoUser(userId);
        return {
            demo,
            codes: demo ? [...DEMO_STOCK_CODES] : [],
            // 거실 연출을 켤 거실 주인 — 데모 계정에게만 알려 준다
            room_user_ids: demo ? this.demo.roomUserIds : [],
        };
    }

    /** POST /demo/restart — 가짜 시세 시나리오를 처음부터(촬영 직전). 데모 계정만 */
    @Post('restart')
    @UseGuards(JwtAuthGuard)
    restart(@User() userId: bigint): { restarted: true } {
        this.requireDemo(userId);
        this.demo.restart();
        return { restarted: true };
    }
}

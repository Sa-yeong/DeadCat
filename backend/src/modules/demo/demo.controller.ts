import { Controller, Get, UseGuards } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { User } from '../../common/decorators/user.decorator';
import { DEMO_STOCK_CODES, DemoService } from './demo.service';

/** GET /demo/me — 프론트가 데모 계정인지 확인한다. 비로그인 · 데모 아님은 { demo: false, codes: [] } */
@Controller('demo')
export class DemoController {
    constructor(private readonly demo: DemoService) {}

    @Get('me')
    @UseGuards(OptionalJwtAuthGuard)
    me(@User() userId: bigint | undefined): { demo: boolean; codes: string[] } {
        const demo = this.demo.isDemoUser(userId);
        return { demo, codes: demo ? [...DEMO_STOCK_CODES] : [] };
    }
}

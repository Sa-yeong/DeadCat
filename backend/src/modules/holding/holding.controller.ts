import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { HoldingService } from './holding.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { HoldingItemDto } from './dto/holding-list.response.dto';

interface AuthenticatedRequest extends Request {
    user: { id: string };
}

@Controller('holdings') //  /holdings
export class HoldingController {
    constructor(private readonly holdingService: HoldingService) {}

    @UseGuards(JwtAuthGuard)
    @Get()
    async getMyHoldings(
        @Request() req: AuthenticatedRequest,
    ): Promise<HoldingItemDto[]> {
        const userId = String(req.user!.id);
        //const userId = '2';
        return await this.holdingService.getMyHoldings(userId);
    }
}

import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { AssetService } from './asset.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { AssetInfoResponseDto } from './dto/asset-info-response.dto';

interface AuthenticatedRequest extends Request {
    user: { id: string };
}

@Controller('assets')
export class AssetController {
    constructor(private readonly assetService: AssetService) {}

    @UseGuards(JwtAuthGuard)
    @Get()
    async getMyAsset(
        @Request() req: AuthenticatedRequest,
    ): Promise<AssetInfoResponseDto> {
        const userId = String(req.user!.id);

        return await this.assetService.getMyAssetInfo(userId);
    }
}

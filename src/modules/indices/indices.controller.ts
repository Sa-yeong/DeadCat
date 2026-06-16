import { Controller, Get } from '@nestjs/common';
import { IndicesService } from './indices.service';
import { IndexResponseDto } from './dto/index.response.dto';

// 상단 지수 슬라이드. 인증 불필요(공개 조회).
@Controller('indices')
export class IndicesController {
    constructor(private readonly indicesService: IndicesService) {}

    // GET /indices
    @Get()
    async getIndices(): Promise<IndexResponseDto[]> {
        return this.indicesService.getIndices();
    }
}

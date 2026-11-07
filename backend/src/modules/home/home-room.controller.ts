import {
    Controller,
    Get,
    Query,
    UseGuards,
    Request,
    Req,
} from '@nestjs/common';
import { HomeRoomsService } from './home-room.service';
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt-auth.guard';
import {
    OppositeRoomsQueryDto,
    SearchRoomsQueryDto,
    SimilarRoomsQueryDto,
} from './dto/room-explore.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('home/rooms')
export class HomeRoomsController {
    constructor(private readonly homeRoomsService: HomeRoomsService) {}

    // 10.1 필터용 시스템 태그 목록 조회 (비인증 허용)
    @UseGuards(OptionalJwtAuthGuard)
    @Get('tags')
    async getTags() {
        return await this.homeRoomsService.getTags();
    }

    // 10.2 거실 탐색 메인 피드 조회 (비인증 허용)
    @Get('explore')
    async getExploreRooms(@Req() req: any) {
        const userId = req.user?.id ? String(req.user.id) : undefined;
        return this.homeRoomsService.getExploreRooms(userId);
    }

    // 10.3 거실 검색 및 시스템 태그 필터링 조회 (비인증 허용, 전체 거실 목록 페이징 포함)
    @UseGuards(OptionalJwtAuthGuard)
    @Get('search')
    async searchRooms(@Query() query: SearchRoomsQueryDto) {
        return await this.homeRoomsService.searchRooms(query);
    }

    // 10.4 나와 유사한 거실 목록 조회
    @UseGuards(JwtAuthGuard)
    @Get('similar')
    async getSimilarRooms(
        @Request() req: any,
        @Query() query: SimilarRoomsQueryDto,
    ) {
        const userId = String(req.user.id || req.user.sub);

        // 정렬 조건을 Service로 전달
        return await this.homeRoomsService.getSimilarRooms(userId, query);
    }

    // 10.5 나와 정반대 거실 목록 조회
    @UseGuards(JwtAuthGuard)
    @Get('opposite')
    async getOppositeRooms(
        @Request() req: any,
        @Query() query: OppositeRoomsQueryDto,
    ) {
        const userId = String(req.user.id || req.user.sub);

        // 정렬 조건을 Service로 전달
        return await this.homeRoomsService.getOppositeRooms(userId, query);
    }
}

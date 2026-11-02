import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

// 10.1 응답 DTO
export class TagItemDto {
    tag_id!: number;
    name!: string;
}

export class GetTagsResponseDto {
    is_success!: boolean;
    code!: string;
    message!: string;
    data!: {
        tags: TagItemDto[];
    };
}

// 공통 거실 카드 DTO
export class RoomCardDto {
    user_id!: string;
    nickname!: string;
    room_img_url!: string;
    profit_rate!: number;
    tags!: string[];
}

export class SimilarRoomCardDto extends RoomCardDto {
    matched_tags!: string[];
}

export class OppositeRoomCardDto extends RoomCardDto {
    opposite_tags!: string[];
}

// 10.2 응답 DTO
export class GetExploreRoomsResponseDto {
    is_success!: boolean;
    code!: string;
    message!: string;
    data!: {
        soaring_rooms: RoomCardDto[];
        plummeting_rooms: RoomCardDto[];
    };
}

// 10.3 쿼리 파라미터 DTO
export class SearchRoomsQueryDto {
    @IsOptional()
    @IsString()
    tags?: string; // 쉼표 구분 (예: "단기투자,5억+")

    @IsOptional()
    @IsString()
    keyword?: string; // 닉네임 또는 종목명/코드

    @IsOptional()
    @IsString()
    sort?: 'DEFAULT' | 'PROFIT_HIGH' | 'PROFIT_LOW' = 'DEFAULT';

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    limit?: number = 10;
}

// 10.3 응답 DTO
export class SearchRoomsResponseDto {
    is_success!: boolean;
    code!: string;
    message!: string;
    data!: {
        total_count: number;
        current_page: number;
        total_pages: number;
        rooms: RoomCardDto[];
    };
}

// 10.4 유사 거실 조회 Query DTO
export class SimilarRoomsQueryDto {
    @IsOptional()
    @IsString()
    sort: 'SIMILARITY' | 'PROFIT_HIGH' | 'PROFIT_LOW' = 'SIMILARITY';
}

// 10.5 정반대 거실 조회 Query DTO
export class OppositeRoomsQueryDto {
    @IsOptional()
    @IsString()
    sort: 'OPPOSITION' | 'PROFIT_HIGH' | 'PROFIT_LOW' = 'OPPOSITION';
}

// 10.4 & 10.5 응답 DTO
/**
 * 유사 거실 조회 응답
 */
export class GetSimilarRoomsResponseDto {
    is_success: boolean;
    code: string;
    message: string;

    data: {
        // 유사 거실 탐색 기준 태그
        reference_tags: string[];

        // 유사 거실 목록
        rooms: any[];
    };
}

/**
 * 반대 거실 조회 응답
 */
export class GetOppositeRoomsResponseDto {
    is_success: boolean;
    code: string;
    message: string;

    data: {
        // 반대 거실 탐색 기준 태그
        reference_tags: string[];

        // 반대 거실 목록
        rooms: any[];
    };
}

import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { RepresentativeCharacterRepository } from './representative-character.repository';
import { RepresentCharacterResponseDto } from './dto/set-representative-character.dto';

@Injectable()
export class RepresentativeCharacterService {
    constructor(
        private readonly repository: RepresentativeCharacterRepository,
    ) {}

    async setRepresentativeCharacter(
        userId: string,
        stockCode: string,
    ): Promise<RepresentCharacterResponseDto> {
        //  존재하는 주식 종목인지 검증
        const stock = await this.repository.findStockByCode(stockCode);
        if (!stock) {
            throw new NotFoundException('존재하지 않는 주식 종목입니다.');
        }

        //  유저가 실제 보유 중인 주식인지 검증
        const holding = await this.repository.findUserHolding(userId, stock.id);
        if (!holding) {
            throw new BadRequestException(
                '보유하고 있는 주식만 대표 캐릭터로 설정할 수 있습니다.',
            );
        }

        // [실행] 유저 정보 업데이트
        await this.repository.updateRepresentStock(userId, stock.id);

        const response = new RepresentCharacterResponseDto();
        response.code = 'SUCCESS';
        response.message = '대표 캐릭터 설정 성공';
        response.represent_stock_id = String(stock.id);

        return response;
    }
}

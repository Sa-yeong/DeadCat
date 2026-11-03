import { IsArray, Matches } from 'class-validator';

// POST /notifications/read 요청. 주문 번호는 BigInt에 들어가는 숫자 문자열만
export class ReadNotificationsDto {
    @IsArray()
    @Matches(/^\d{1,18}$/, {
        each: true,
        message: '주문 번호가 올바르지 않습니다.',
    })
    order_ids: string[];
}

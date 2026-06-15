import { Injectable } from '@nestjs/common';
import { ExampleRepository } from './example.repository';
import { ExampleResponseDto } from './dto/example.response.dto';

// [예시] Service = 비즈니스 로직(두뇌). Controller와 Repository 사이.
// 이 예시는 골격이 살아있음을 확인하는 용도로 실제 동작한다.
@Injectable()
export class ExampleService {
    constructor(private readonly repo: ExampleRepository) {}

    ping(): ExampleResponseDto {
        return {
            message: 'example module is alive — replace this module with a real domain.',
            timestamp: new Date().toISOString(),
        };
    }
}

import { Controller, Get } from '@nestjs/common';
import { ExampleService } from './example.service';
import { ExampleResponseDto } from './dto/example.response.dto';

// [예시] Controller = HTTP 입구. 한 도메인 = modules/<도메인>/ 한 폴더, 내부는 C-S-R.
// 새 도메인을 만들 때 이 example 폴더를 복사해 이름만 바꾸면 된다.
@Controller('example')
export class ExampleController {
    constructor(private readonly exampleService: ExampleService) {}

    // GET /example/ping  → 골격 부팅 확인용
    @Get('ping')
    ping(): ExampleResponseDto {
        return this.exampleService.ping();
    }
}

import { Module } from '@nestjs/common';
import { ExampleController } from './example.controller';
import { ExampleService } from './example.service';
import { ExampleRepository } from './example.repository';

// [예시] 도메인 모듈의 표준 형태(Controller + Service + Repository).
// app.module.ts의 imports 배열에 등록되어야 활성화된다.
@Module({
    controllers: [ExampleController],
    providers: [ExampleService, ExampleRepository],
})
export class ExampleModule {}

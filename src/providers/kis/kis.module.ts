import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { KisProvider } from './kis.provider';

// KIS Open API 연결 provider 모듈. HttpModule(axios) 위에 KisProvider를 얹어 export.
// 시세가 필요한 모듈(price 계층)이 이 모듈을 import해서 KisProvider를 주입받는다.
@Module({
    imports: [HttpModule],
    providers: [KisProvider],
    exports: [KisProvider],
})
export class KisModule {}
